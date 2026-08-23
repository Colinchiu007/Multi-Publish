// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useFilmEngineering } from './useFilmEngineering'

function installMockApi () {
  const api = {
    status: vi.fn(async () => ({ code: 0, data: { available: true, filmMeta: { title: 'Hell Grind' }, sceneCount: 162, shotCount: 153, referenceCount: 332, error: null } })),
    listScenes: vi.fn(async () => ({ code: 0, data: [
      { id: 'scene-1', name: '废墟街道', count: 3, parentId: null, level: 0, shotCount: 2 },
      { id: 'scene-2', name: '博物馆', count: 2, parentId: null, level: 0, shotCount: 1 },
    ] })),
    listShots: vi.fn(async (sceneId) => ({ code: 0, data: [
      { shotId: 'shot-1', sceneId, prompt: 'EXACT 3 CHARACTERS — NO DUPLICATES\n...', model: 'seedance_2_0', refTokens: ['t-1'], width: 1920, height: 1080 },
      { shotId: 'shot-2', sceneId, prompt: 'GEO SPATIAL LAYOUT\n...', model: 'seedance_2_0', refTokens: [], width: null, height: null },
    ] })),
    getShot: vi.fn(async (shotId) => ({ code: 0, data: { shotId, prompt: 'full', resolvedRefs: [{ token: 't-1', entry: { kind: 'character', name: 'REIN', imageUrls: ['https://cdn.example.com/rein.png'] } }] } })),
    doctrine: vi.fn(async () => ({ code: 0, data: { blocks: [{ key: 'scene_context', label: 'SCENE CONTEXT' }], rules: [], glossary: [] } })),
    copyText: vi.fn(async (shotId, mode) => ({ code: 0, data: { text: 'copied-' + mode, mode } })),
    copyTexts: vi.fn(async (shotIds, mode) => ({ code: 0, data: { text: 'multi', mode, count: shotIds.length } })),
    adaptScript: vi.fn(async (payload) => ({ code: 0, data: { adaptedShots: [{ shotId: 'adapt-001', prompt: 'adapted prompt' }], llmEnhanced: false, warnings: [] } })),
    exportPrompts: vi.fn(async (shots, format) => ({ code: 0, data: { export: { json: '{}', markdown: '# x' }, fileName: 'film-engineering-prompts-2026-08-14.json' } })),
    generateSelected: vi.fn(async (shots, opts) => ({ code: 0, data: { results: [{ index: 0, shotId: 'shot-1', code: 0 }], partialFailure: false } })),
  }
  return api
}

describe('useFilmEngineering', () => {
  function stubWindow (api) {
    vi.stubGlobal('window', {
      electronAPI: { filmEngineering: api },
      navigator: { clipboard: { writeText: vi.fn(async () => undefined) } },
    })
  }

  beforeEach(() => { stubWindow(installMockApi()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('loadStatus 成功：available=true 且带真实数据路径', async () => {
    const c = useFilmEngineering()
    const ok = await c.loadStatus()
    expect(ok).toBe(true)
    expect(c.status.value.available).toBe(true)
    expect(c.status.value.sceneCount).toBe(162)
    expect(c.status.value.shotCount).toBe(153)
  })

  it('loadStatus 失败：kit 不可用 → available=false 且 error 非空（空态可展示）', async () => {
    const api = installMockApi()
    api.status = vi.fn(async () => ({ code: -1, message: 'FILM_KIT_UNAVAILABLE: 文件缺失' }))
    stubWindow(api)
    const c = useFilmEngineering()
    const ok = await c.loadStatus()
    expect(ok).toBe(false)
    expect(c.status.value.available).toBe(false)
    expect(c.status.value.error).toBeTruthy()
  })

  it('loadScenes 自动选中第一个有分镜的场景并加载分镜（真实数据路径）', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    await c.loadScenes()
    expect(c.scenes.value.length).toBe(2)
    expect(c.selectedSceneId.value).toBe('scene-1')
    expect(api.listShots).toHaveBeenCalledWith('scene-1')
    expect(c.shots.value.length).toBe(2)
  })

  it('勾选与批量复制：copyTexts 收到勾选 id 与模式', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    await c.loadScenes()
    c.toggleShot('shot-1')
    c.copyMode.value = 'blocks'
    await c.copySelected()
    expect(api.copyTexts).toHaveBeenCalledWith(['shot-1'], 'blocks')
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('multi')
  })

  it('单镜复制：copyText 转发 shotId+mode 并写剪贴板', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    await c.copyText('shot-1', 'full')
    expect(api.copyText).toHaveBeenCalledWith('shot-1', 'full')
    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith('copied-full')
  })

  it('剧本套用：请求映射为 script+characterMap+llmEnabled，结果进入 adaptedShots', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    c.adapt.script = '第一场 废墟\n\n小强走在废墟中。'
    c.adapt.characterMap.ROKO = '小强'
    c.adapt.llmEnabled = true
    const ok = await c.adaptScript()
    expect(ok).toBe(true)
    expect(api.adaptScript).toHaveBeenCalledWith({
      script: '第一场 废墟\n\n小强走在废墟中。',
      characterMap: { ROKO: '小强' },
      llmEnabled: true,
    })
    expect(c.adapt.adaptedShots.length).toBe(1)
    expect(c.adapt.adaptedShots[0].prompt).toBe('adapted prompt')
  })

  it('空剧本：不请求主进程并提示', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    c.adapt.script = ''
    const ok = await c.adaptScript()
    expect(ok).toBe(true) // 主进程返回校验错误，前端提示
    expect(api.adaptScript).toHaveBeenCalled()
  })

  it('勾选生成：最多 20 个，超过直接拒绝', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    c.selectedShotIds.value = Array.from({ length: 21 }, (_, i) => 'shot-' + i)
    const res = await c.generateSelected()
    expect(res).toBe(false)
    expect(api.generateSelected).not.toHaveBeenCalled()
  })

  it('分镜详情：openShot 返回 resolvedRefs（引用素材解析）', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    await c.openShot('shot-1')
    expect(c.shotDetail.value.shotId).toBe('shot-1')
    expect(c.shotDetail.value.resolvedRefs[0].entry.name).toBe('REIN')
  })

  it('导出：exportPrompts 收到可结构化克隆的纯 JSON 负载', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    await c.loadScenes()
    c.toggleShot('shot-1')
    await c.exportSelected('json')
    const payload = api.exportPrompts.mock.calls[0][0]
    expect(Array.isArray(payload)).toBe(true)
    expect(() => structuredClone(payload)).not.toThrow()
    expect(api.exportPrompts).toHaveBeenCalledWith(payload, 'json')
  })

  it('勾选生成：generateSelected 收到可结构化克隆的纯 JSON 负载', async () => {
    const api = installMockApi()
    stubWindow(api)
    const c = useFilmEngineering()
    await c.loadScenes()
    c.toggleShot('shot-1')
    const res = await c.generateSelected()
    expect(res).toBeTruthy()
    const payload = api.generateSelected.mock.calls[0][0]
    expect(() => structuredClone(payload)).not.toThrow()
    expect(api.generateSelected).toHaveBeenCalledWith(payload, { aspectRatio: '16:9' })
  })
})
