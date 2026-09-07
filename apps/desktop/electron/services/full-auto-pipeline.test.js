/**
 * FullAutoPipeline 编排引擎合同测试
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../services/logger', () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }))

const { FullAutoPipeline, RUN_STATUS, STAGE_STATUS } = await import('../services/full-auto-pipeline')

function makeDeps(overrides = {}) {
  return {
    pythonBridge: { requestBackend: vi.fn() },
    pipelineEngine: { startOrchestrated: vi.fn(), getRunContext: vi.fn() },
    publisherRouter: { createPublisher: vi.fn() },
    accountManager: { listAccounts: vi.fn() },
    runStateStore: { saveRunning: vi.fn(), saveFailed: vi.fn(), load: vi.fn() },
    rpaViewManager: {},
    store: {},
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

function makeConfig(overrides = {}) {
  return {
    contentType: 'article',
    sourceType: 'url',
    urls: ['https://example.com/a'],
    rewriteStyle: '轻松易懂',
    rewriteLength: 'keep',
    videoConfig: {},
    publishAllAccounts: true,
    platforms: [],
    ...overrides,
  }
}

// 等待引擎异步执行完成的小工具
function waitForStatus(pipeline, runId, status, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const timer = setInterval(() => {
      const snap = pipeline.getRunSnapshot(runId)
      if (snap && snap.status === status) {
        clearInterval(timer)
        resolve(snap)
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer)
        reject(new Error('timeout waiting for status ' + status + ', current=' + (snap && snap.status)))
      }
    }, 20)
  })
}

describe('FullAutoPipeline 编排引擎', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('startRun 校验参数缺失', async () => {
    const deps = makeDeps()
    const p = new FullAutoPipeline(deps)
    const r1 = await p.startRun({ contentType: 'video' })
    expect(r1.success).toBe(false)
    expect(r1.error).toContain('contentType')
  })

  it('startRun 单篇采集校验 urls 非空', async () => {
    const deps = makeDeps()
    const p = new FullAutoPipeline(deps)
    const r = await p.startRun({ contentType: 'video', sourceType: 'url', urls: [] })
    expect(r.success).toBe(false)
    expect(r.error).toContain('urls')
  })

  it('startRun 返回 runId', async () => {
    const deps = makeDeps()
    const p = new FullAutoPipeline(deps)
    const r = await p.startRun(makeConfig())
    expect(r.success).toBe(true)
    expect(r.runId).toMatch(/^auto_/)
  })

  it('图文分支：跳过创作阶段，直通发布', async () => {
    const deps = makeDeps()
    // 采集返回一篇
    deps.pythonBridge.requestBackend.mockImplementation((method, path) => {
      if (path === '/aggregation/collect') {
        return Promise.resolve({ code: 0, data: { title: '标题', content: '正文内容' } })
      }
      if (path === '/aggregation/rewrite') {
        return Promise.resolve({ code: 0, data: { content: '改写后内容' } })
      }
      return Promise.resolve({ code: 0, data: [] })
    })
    deps.accountManager.listAccounts.mockResolvedValue([
      { id: 'a1', platform: 'wechat', owner_subject: 'u1' },
    ])
    const publisher = { publish: vi.fn().mockResolvedValue({ success: true, url: 'https://p/1' }) }
    deps.publisherRouter.createPublisher.mockReturnValue(publisher)

    const p = new FullAutoPipeline(deps)
    const r = await p.startRun(makeConfig({ contentType: 'article' }))
    const snap = await waitForStatus(p, r.runId, RUN_STATUS.COMPLETED)

    expect(snap.stages[2].status).toBe(STAGE_STATUS.SKIPPED)
    expect(deps.pipelineEngine.startOrchestrated).not.toHaveBeenCalled()
    expect(deps.publisherRouter.createPublisher).toHaveBeenCalledWith('wechat', expect.any(Object))
    expect(publisher.publish).toHaveBeenCalledTimes(1)
  })

  it('视频分支：调用 story2video-compose 创作', async () => {
    const deps = makeDeps()
    deps.pythonBridge.requestBackend.mockImplementation((method, path) => {
      if (path === '/aggregation/collect') return Promise.resolve({ code: 0, data: { title: '标题', content: '正文' } })
      if (path === '/aggregation/rewrite') return Promise.resolve({ code: 0, data: { content: '改写后' } })
      return Promise.resolve({ code: 0, data: [] })
    })
    deps.pipelineEngine.startOrchestrated.mockResolvedValue({ success: true, runId: 'p1' })
    deps.pipelineEngine.getRunContext.mockResolvedValue({ status: 'completed', output: { videoPath: '/tmp/v.mp4' } })
    deps.accountManager.listAccounts.mockResolvedValue([{ id: 'a1', platform: 'wechat' }])
    const publisher = { publish: vi.fn().mockResolvedValue({ success: true }) }
    deps.publisherRouter.createPublisher.mockReturnValue(publisher)

    const p = new FullAutoPipeline(deps)
    const r = await p.startRun(makeConfig({ contentType: 'video' }))
    const snap = await waitForStatus(p, r.runId, RUN_STATUS.COMPLETED)

    expect(deps.pipelineEngine.startOrchestrated).toHaveBeenCalledWith('story2video-compose', expect.objectContaining({ text: '改写后' }))
    expect(snap.stages[2].status).toBe(STAGE_STATUS.COMPLETED)
    expect(publisher.publish).toHaveBeenCalledTimes(1)
  })

  it('发布 fail-open：单个平台失败不阻断其他平台', async () => {
    const deps = makeDeps()
    deps.pythonBridge.requestBackend.mockImplementation((method, path) => {
      if (path === '/aggregation/collect') return Promise.resolve({ code: 0, data: { title: 't', content: 'c' } })
      if (path === '/aggregation/rewrite') return Promise.resolve({ code: 0, data: { content: 'r' } })
      return Promise.resolve({ code: 0, data: [] })
    })
    deps.accountManager.listAccounts.mockResolvedValue([
      { id: 'a1', platform: 'wechat' },
      { id: 'a2', platform: 'zhihu' },
    ])
    const failPublisher = { publish: vi.fn().mockRejectedValue(new Error('publish boom')) }
    const okPublisher = { publish: vi.fn().mockResolvedValue({ success: true }) }
    deps.publisherRouter.createPublisher.mockImplementation((platform) => platform === 'wechat' ? failPublisher : okPublisher)

    const p = new FullAutoPipeline(deps)
    // 缩短发布间隔避免测试慢
    p._sleep = (ms) => Promise.resolve()
    const r = await p.startRun(makeConfig({ contentType: 'article' }))
    const snap = await waitForStatus(p, r.runId, RUN_STATUS.COMPLETED)

    expect(okPublisher.publish).toHaveBeenCalledTimes(1)
    expect(failPublisher.publish).toHaveBeenCalledTimes(1)
    expect(snap.stages[3].status).toBe(STAGE_STATUS.COMPLETED)
  })

  it('采集失败：单篇 fail-open 保留占位', async () => {
    const deps = makeDeps()
    deps.pythonBridge.requestBackend.mockImplementation((method, path) => {
      if (path === '/aggregation/collect') return Promise.reject(new Error('ECONNREFUSED'))
      if (path === '/aggregation/rewrite') return Promise.resolve({ code: 0, data: { content: 'r' } })
      return Promise.resolve({ code: 0, data: [] })
    })
    deps.accountManager.listAccounts.mockResolvedValue([{ id: 'a1', platform: 'wechat' }])
    const publisher = { publish: vi.fn().mockResolvedValue({ success: true }) }
    deps.publisherRouter.createPublisher.mockReturnValue(publisher)

    const p = new FullAutoPipeline(deps)
    const r = await p.startRun(makeConfig())
    const snap = await waitForStatus(p, r.runId, RUN_STATUS.COMPLETED)

    expect(snap.stages[0].summary).toContain('1')
    expect(publisher.publish).toHaveBeenCalled()
  })

  it('cancelRun 设置 cancelled 状态', async () => {
    const deps = makeDeps()
    // 让采集卡住
    deps.pythonBridge.requestBackend.mockImplementation(() => new Promise(() => {}))
    const p = new FullAutoPipeline(deps)
    const r = await p.startRun(makeConfig())
    await new Promise((res) => setTimeout(res, 50))
    const cr = p.cancelRun(r.runId)
    expect(cr.success).toBe(true)
    const snap = p.getRunSnapshot(r.runId)
    expect(snap.status).toBe(RUN_STATUS.CANCELLED)
  })

  it('getRunSnapshot 不存在返回 null', () => {
    const p = new FullAutoPipeline(makeDeps())
    expect(p.getRunSnapshot('nonexistent')).toBeNull()
  })

  it('listRuns 返回活跃运行', async () => {
    const deps = makeDeps()
    deps.pythonBridge.requestBackend.mockImplementation(() => new Promise(() => {}))
    const p = new FullAutoPipeline(deps)
    const r = await p.startRun(makeConfig())
    await new Promise((res) => setTimeout(res, 20))
    const runs = p.listRuns()
    expect(runs.length).toBe(1)
    expect(runs[0].runId).toBe(r.runId)
  })

  it('resumeRun 从失败阶段继续（恢复已完成阶段）', async () => {
    const deps = makeDeps()
    deps.runStateStore.load.mockReturnValue({
      runId: 'auto_saved',
      params: makeConfig({ contentType: 'article' }),
      status: 'failed',
      currentStage: 1,
      stages: [
        { id: 'collect', status: 'completed', progress: 100, summary: '采集完成（1 篇）' },
        { id: 'rewrite', status: 'failed', progress: 0, summary: '', error: '改写失败' },
        { id: 'create', status: 'pending', progress: 0 },
        { id: 'publish', status: 'pending', progress: 0 },
      ],
      context: { collect: { items: [{ title: 't', content: 'c' }] }, rewrite: { items: [] }, create: { items: [] }, publish: { results: [] } },
    })
    deps.pythonBridge.requestBackend.mockImplementation((method, path) => {
      if (path === '/aggregation/rewrite') return Promise.resolve({ code: 0, data: { content: 'r2' } })
      return Promise.resolve({ code: 0, data: [] })
    })
    deps.accountManager.listAccounts.mockResolvedValue([{ id: 'a1', platform: 'wechat' }])
    const publisher = { publish: vi.fn().mockResolvedValue({ success: true }) }
    deps.publisherRouter.createPublisher.mockReturnValue(publisher)

    const p = new FullAutoPipeline(deps)
    const r = await p.resumeRun('auto_saved')
    expect(r.success).toBe(true)
    const snap = await waitForStatus(p, 'auto_saved', RUN_STATUS.COMPLETED)
    expect(publisher.publish).toHaveBeenCalled()
  })
})
