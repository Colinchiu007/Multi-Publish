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
      options: { replicationLevel: 'L1', mode: 'structure', rewriteScript: false },
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
})
