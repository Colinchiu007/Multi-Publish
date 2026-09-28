import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockOnProgress = vi.hoisted(() => vi.fn())
const mockOnBatchProgress = vi.hoisted(() => vi.fn())
const mockGetQueueStatus = vi.hoisted(() => vi.fn())
const mockRetryTask = vi.hoisted(() => vi.fn())

vi.mock('@/api/publisher', () => ({
  onProgress: (...args) => mockOnProgress(...args),
  onBatchProgress: (...args) => mockOnBatchProgress(...args),
  getQueueStatus: (...args) => mockGetQueueStatus(...args),
  retryTask: (...args) => mockRetryTask(...args),
}))

const STORAGE_KEY = 'mp-publish-first-hide-toast-shown'

function progressEvent(overrides = {}) {
  return {
    platform: 'douyin',
    taskId: 'task-1',
    stage: 'uploading video...',
    phase: 'progress',
    stageKey: 'upload',
    percent: 20,
    batchId: null,
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('publishProgress store — 全局承载（publish-progress-ux）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockOnProgress.mockReset()
    mockOnBatchProgress.mockReset()
    mockGetQueueStatus.mockReset()
    mockRetryTask.mockReset()
    mockOnProgress.mockReturnValue(() => {})
    mockOnBatchProgress.mockReturnValue(() => {})
    mockGetQueueStatus.mockResolvedValue({ code: 0, data: { running: [], queue: [] } })
    window.localStorage.clear()
  })

  async function makeStore() {
    const { usePublishProgressStore } = await import('./publishProgress')
    return usePublishProgressStore()
  }

  it('init() 绑定全局订阅一次（幂等），不随组件卸载注销', async () => {
    const store = await makeStore()
    store.init()
    store.init()
    expect(mockOnProgress).toHaveBeenCalledTimes(1)
    expect(mockOnBatchProgress).toHaveBeenCalledTimes(1)
  })

  it('registerSession(taskIds) 创建排队任务并自动展开面板', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-a', 't-b'], title: '测试文章' })
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].tasks['t-a'].phase).toBe('queued')
    expect(store.sessions[0].tasks['t-b'].phase).toBe('queued')
    expect(store.panelVisible).toBe(true)
    expect(store.panelMinimized).toBe(false)
    expect(store.hasRunning).toBe(true)
  })

  it('空 taskIds 且无 batchId → 不创建会话', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: [], title: 'x' })
    store.registerSession({ title: 'x' })
    expect(store.sessions).toHaveLength(0)
  })

  it('handleProgressEvent 按 taskId 路由并更新相位/阶段/百分比', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1'], title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'start', stage: '准备发布...', stageKey: 'prepare', percent: 0 }))
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'progress', stage: 'uploading video...', stageKey: 'upload', percent: 20 }))
    const task = store.sessions[0].tasks['t-1']
    expect(task.phase).toBe('progress')
    expect(task.stageKey).toBe('upload')
    expect(task.percent).toBe(20)
    expect(task.startedAt).toBeGreaterThan(0)
  })

  it('终态吸收：success 后迟到的 progress 不回退状态', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1'], title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'success', stage: '✓ 发布成功', stageKey: 'done', percent: 100, result: { url: 'u' } }))
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'progress', stage: 'verifying...', stageKey: 'verify', percent: 95 }))
    const task = store.sessions[0].tasks['t-1']
    expect(task.phase).toBe('success')
    expect(task.endedAt).toBeGreaterThan(0)
  })

  it('会话内全部任务终态 → session done + aggregate 汇总', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1', 't-2'], title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', platform: 'weibo', phase: 'success', stage: '✓ 发布成功', stageKey: 'done' }))
    expect(store.sessions[0].status).toBe('running')
    store.handleProgressEvent(progressEvent({ taskId: 't-2', platform: 'zhihu', phase: 'failed', stage: '✗ 发布失败: 超时', stageKey: 'failed', error: '超时' }))
    expect(store.sessions[0].status).toBe('done')
    expect(store.aggregate).toMatchObject({ total: 2, done: 2, succeeded: 1, failed: 1 })
  })

  it('未知 taskId + 已登记 batchId → 事件归入批量会话并动态建任务', async () => {
    const store = await makeStore()
    store.registerSession({ batchId: 'batch-1', title: '批量' })
    store.handleProgressEvent(progressEvent({ taskId: 'bt-9', batchId: 'batch-1', platform: 'kuaishou' }))
    expect(store.sessions[0].tasks['bt-9']).toBeTruthy()
    expect(store.sessions[0].tasks['bt-9'].platform).toBe('kuaishou')
  })

  it('未知 taskId 且无归属 → 自动创建孤儿会话收纳（R3）', async () => {
    const store = await makeStore()
    store.handleProgressEvent(progressEvent({ taskId: 'orphan-1', platform: 'weibo' }))
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].tasks['orphan-1']).toBeTruthy()
    expect(store.sessions[0].batchId).toBe(null)
  })

  it('非法事件（缺 taskId/platform）丢弃不建会话（R9）', async () => {
    const store = await makeStore()
    store.handleProgressEvent({ platform: 'weibo', stage: 'x' })
    store.handleProgressEvent({ taskId: 't', stage: 'x' })
    store.handleProgressEvent(null)
    expect(store.sessions).toHaveLength(0)
  })

  it('非法 phase/stageKey 归一（progress/detail），非法 percent 归 null', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1'], title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'bogus', stageKey: 'bogus', percent: 999 }))
    const task = store.sessions[0].tasks['t-1']
    expect(task.phase).toBe('progress')
    expect(task.stageKey).toBe('detail')
    expect(task.percent).toBe(null)
  })

  it('retryFailed：逐任务调 queue:retry 并以新 taskId 替换、会话回 running', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1', 't-2'], title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'success', stageKey: 'done' }))
    store.handleProgressEvent(progressEvent({ taskId: 't-2', platform: 'zhihu', phase: 'failed', stageKey: 'failed', error: 'x' }))
    expect(store.sessions[0].status).toBe('done')

    mockRetryTask.mockResolvedValueOnce({ code: 0, data: { taskId: 't-2-new', retryOf: 't-2' } })
    const result = await store.retryFailed(store.sessions[0].id)

    expect(mockRetryTask).toHaveBeenCalledWith('t-2')
    expect(result).toMatchObject({ ok: 1, fail: 0 })
    const session = store.sessions[0]
    expect(session.status).toBe('running')
    expect(session.tasks['t-2']).toBeUndefined()
    expect(session.tasks['t-2-new'].phase).toBe('queued')
  })

  it('retryFailed：IPC 失败的任务保持 failed 并计入 fail', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1'], title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'failed', stageKey: 'failed', error: 'x' }))
    mockRetryTask.mockResolvedValueOnce({ code: -1, message: '任务不存在或状态不可重试' })
    const result = await store.retryFailed(store.sessions[0].id)
    expect(result).toMatchObject({ ok: 0, fail: 1 })
    expect(store.sessions[0].tasks['t-1'].phase).toBe('failed')
  })

  it('minimize/expand 切换；consumeFirstHideToast 首次 true 并持久化（仅一次）', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1'], title: 'x' })
    store.minimizePanel()
    expect(store.panelMinimized).toBe(true)
    expect(store.panelVisible).toBe(false)
    expect(store.consumeFirstHideToast()).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1')
    expect(store.consumeFirstHideToast()).toBe(false)

    store.expandPanel()
    expect(store.panelVisible).toBe(true)
    expect(store.panelMinimized).toBe(false)
  })

  it('init() 从 localStorage 恢复首次提示标志', async () => {
    window.localStorage.setItem(STORAGE_KEY, '1')
    const store = await makeStore()
    store.init()
    expect(store.consumeFirstHideToast()).toBe(false)
  })

  it('init() 经 queue:status 领养孤儿任务建恢复会话（R2，状态级映射）', async () => {
    mockGetQueueStatus.mockResolvedValueOnce({
      code: 0,
      data: {
        running: [{ id: 'q-1', platform: 'douyin', status: 'running' }],
        queue: [{ id: 'q-2', platform: 'weibo', status: 'pending' }],
      },
    })
    const store = await makeStore()
    await store.init()
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].tasks['q-1'].phase).toBe('progress')
    expect(store.sessions[0].tasks['q-2'].phase).toBe('queued')
  })

  it('queue:status IPC 失败 → 领养降级跳过，订阅不受影响（R7）', async () => {
    mockGetQueueStatus.mockRejectedValueOnce(new Error('ipc down'))
    const store = await makeStore()
    await expect(store.init()).resolves.toBeUndefined()
    expect(mockOnProgress).toHaveBeenCalledTimes(1)
    expect(store.sessions).toHaveLength(0)
  })

  it('会话上限 5：超出裁剪最旧已完成会话；全 running 不裁剪（R12）', async () => {
    const store = await makeStore()
    for (let i = 0; i < 6; i++) {
      store.registerSession({ taskIds: ['t-' + i], title: 's' + i })
      store.handleProgressEvent(progressEvent({ taskId: 't-' + i, phase: 'success', stageKey: 'done' }))
    }
    expect(store.sessions).toHaveLength(5)
    expect(store.sessions[0].title).toBe('s1') // s0 被裁剪
    // 全 running：不裁剪
    for (let i = 0; i < 7; i++) {
      store.registerSession({ taskIds: ['r-' + i], title: 'run' + i })
    }
    expect(store.sessions.length).toBeGreaterThan(5)
  })

  it('handleBatchEvent(batch-complete) 对应会话兜底终态（不覆盖已有任务终态）', async () => {
    const store = await makeStore()
    store.registerSession({ batchId: 'b-1', title: 'x' })
    store.handleProgressEvent(progressEvent({ taskId: 'bt-1', batchId: 'b-1', phase: 'success', stageKey: 'done' }))
    store.handleBatchEvent({ batchId: 'b-1', kind: 'batch-complete', total: 2, succeeded: 1, failed: 1 })
    expect(store.sessions[0].status).toBe('done')
    expect(store.sessions[0].tasks['bt-1'].phase).toBe('success')
  })

  it('dismissSession 移除会话；clearFinished 清除全部已完成', async () => {
    const store = await makeStore()
    store.registerSession({ taskIds: ['t-1'], title: 'a' })
    store.registerSession({ taskIds: ['t-2'], title: 'b' })
    store.handleProgressEvent(progressEvent({ taskId: 't-1', phase: 'success', stageKey: 'done' }))
    store.clearFinished()
    expect(store.sessions).toHaveLength(1)
    expect(store.sessions[0].title).toBe('b')
    store.dismissSession(store.sessions[0].id)
    expect(store.sessions).toHaveLength(0)
  })
})
