// @ts-check
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useVideoClone } from './useVideoClone'

function installMockApi({ ok = true } = {}) {
  const state = { progressCb: null }
  const api = {
    run: vi.fn(async () => ({
      code: 0,
      data: ok
        ? { ok: true, runId: 'vc-1', report: { script: { fullText: 'x' }, meta: { durationSec: 10 }, platformParams: { aspect: '9:16' } }, similarity: null, publishResult: null }
        : { ok: false, error: { code: 'VIDEOCLONE_ANALYZE_FAILED', phase: 'analyze', userMessageKey: 'videoClone.error.analyzeFailed' } },
    })),
    cancel: vi.fn(async () => ({ code: 0, data: true })),
    editReport: vi.fn(async (report, patch) => ({ code: 0, data: { ...report, script: { ...report.script, fullText: patch.value } } })),
    onProgress: vi.fn((cb) => { state.progressCb = cb; return () => {} }),
  }
  return { api, state }
}

function installProfileApi (api, profiles = []) {
  api.story2videoConfigProfileList = vi.fn(async () => ({ code: 0, data: profiles }))
  api.story2videoConfigProfileCreate = vi.fn(async (request) => ({ code: 0, data: { id: 'profile-000000000001', ...request } }))
  api.story2videoConfigProfileRename = vi.fn(async (id, name) => ({ code: 0, data: { id, name } }))
  api.story2videoConfigProfileDelete = vi.fn(async (id) => ({ code: 0, data: { deleted: true, id } }))
  return api
}

describe('useVideoClone', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { electronAPI: { videoClone: installMockApi().api } })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('默认来源为链接（url）：run 请求映射为 url source（真实数据路径）', async () => {
    const { api } = installMockApi()
    vi.stubGlobal('window', { electronAPI: { videoClone: api } })
    const c = useVideoClone()
    expect(c.sourceType.value).toBe('url')
    c.linkUrl.value = 'https://example.com/v.mp4'
    await c.start()
    expect(api.run).toHaveBeenCalledWith({
      source: { type: 'url', url: 'https://example.com/v.mp4' },
      options: { mode: 'structure', rewriteScript: false },
    })
  })

  it('切换到本地文件后 run 请求映射为 local source', async () => {
    const { api } = installMockApi()
    vi.stubGlobal('window', { electronAPI: { videoClone: api } })
    const c = useVideoClone()
    c.sourceType.value = 'local'
    c.filePath.value = 'C:/tmp/demo.mp4'
    await c.start()
    expect(api.run).toHaveBeenCalledWith(expect.objectContaining({
      source: { type: 'local', path: 'C:/tmp/demo.mp4' },
    }))
  })

  it('run 成功：状态流转 + 报告写入（真实数据路径）', async () => {
    const c = useVideoClone()
    c.filePath.value = 'C:/tmp/demo.mp4'
    await c.start()
    expect(c.running.value).toBe(false)
    expect(c.report.value.script.fullText).toBe('x')
    expect(c.runId.value).toBe('vc-1')
  })

  it('run 失败：错误码写入 error', async () => {
    vi.stubGlobal('window', { electronAPI: { videoClone: installMockApi({ ok: false }).api } })
    const c = useVideoClone()
    c.filePath.value = 'C:/tmp/demo.mp4'
    await c.start()
    expect(c.error.value).not.toBeNull()
    expect(c.error.value.code).toBe('VIDEOCLONE_ANALYZE_FAILED')
  })

  it('进度事件驱动阶段状态', async () => {
    const { api, state } = installMockApi()
    vi.stubGlobal('window', { electronAPI: { videoClone: api } })
    const c = useVideoClone()
    c.filePath.value = 'C:/tmp/demo.mp4'
    const p = c.start()
    state.progressCb({ type: 'stage:started', stage: 'analyze' })
    expect(c.stageStatus.analyze).toBe('running')
    state.progressCb({ type: 'stage:succeeded', stage: 'analyze' })
    expect(c.stageStatus.analyze).toBe('success')
    await p
  })

  it('editReport：IPC 编辑往返写回 report', async () => {
    const c = useVideoClone()
    c.filePath.value = 'C:/tmp/demo.mp4'
    await c.start()
    const out = await c.editReport('script.fullText', '新文案')
    expect(out.script.fullText).toBe('新文案')
    expect(c.report.value.script.fullText).toBe('新文案')
  })

  it('cancel：运行中可中止', async () => {
    const c = useVideoClone()
    c.filePath.value = 'C:/tmp/demo.mp4'
    c.runId.value = 'vc-9'
    await c.cancel()
    expect(c.running.value).toBe(false)
  })

  it('buildConfigProfileSnapshot 只保存可复用选项，不保存链接、本地路径或运行态', () => {
    const c = useVideoClone()
    c.sourceType.value = 'local'
    c.linkUrl.value = 'https://private.example/video'
    c.filePath.value = 'C:/Users/demo/secret.mp4'
    c.mode.value = 'style'
    c.rewriteScript.value = true
    c.runId.value = 'run-secret'
    c.report.value = { secret: 'runtime' }
    const snapshot = c.buildConfigProfileSnapshot()
    expect(snapshot).toMatchObject({ schemaVersion: 1, kind: 'video-clone', videoClone: { sourceType: 'local', mode: 'style', rewriteScript: true } })
    expect(snapshot.videoClone).not.toHaveProperty('linkUrl')
    expect(snapshot.videoClone).not.toHaveProperty('filePath')
    expect(snapshot).not.toHaveProperty('runId')
    expect(() => structuredClone(snapshot)).not.toThrow()
  })

  it('applyConfigProfileSnapshot 只回填白名单并拒绝非法枚举，不覆盖当前素材输入', () => {
    const c = useVideoClone()
    c.sourceType.value = 'url'
    c.linkUrl.value = 'https://keep.example/video'
    c.filePath.value = 'C:/keep.mp4'
    expect(c.applyConfigProfileSnapshot({ kind: 'video-clone', videoClone: { sourceType: 'local', mode: 'style', rewriteScript: true, linkUrl: 'https://overwrite.example' } })).toBe(true)
    expect(c.sourceType.value).toBe('local')
    expect(c.mode.value).toBe('style')
    expect(c.rewriteScript.value).toBe(true)
    expect(c.linkUrl.value).toBe('https://keep.example/video')
    expect(c.filePath.value).toBe('C:/keep.mp4')
    expect(c.applyConfigProfileSnapshot({ kind: 'video-clone', videoClone: { mode: 'invalid', rewriteScript: 'yes' } })).toBe(false)
    expect(c.mode.value).toBe('style')
    expect(c.rewriteScript.value).toBe(true)
  })

  it('config profile CRUD 使用独立 publisher API，并固定 video-clone pipelineId', async () => {
    const api = installProfileApi(installMockApi(), [
      { id: 'p1', name: 'clone', pipelineId: 'video-clone', updatedAt: 2 },
      { id: 'p2', name: 'other', pipelineId: 'film-engineering', updatedAt: 3 },
    ])
    vi.stubGlobal('window', { electronAPI: api })
    const c = useVideoClone()
    c.mode.value = 'inspiration'
    const list = await c.loadConfigProfiles()
    expect(list).toHaveLength(2)
    expect(list.find((item) => item.pipelineId === 'video-clone')).toBeTruthy()
    expect(list.find((item) => item.pipelineId === 'film-engineering')).toBeTruthy()
    await c.saveConfigProfile('复刻配置', { overwrite: true })
    expect(api.story2videoConfigProfileCreate).toHaveBeenCalledWith(expect.objectContaining({ pipelineId: 'video-clone', name: '复刻配置', overwrite: true }))
    await c.renameConfigProfile('p1', '新名')
    await c.deleteConfigProfile('p1')
    expect(api.story2videoConfigProfileRename).toHaveBeenCalledWith('p1', '新名')
    expect(api.story2videoConfigProfileDelete).toHaveBeenCalledWith('p1')
  })
})
