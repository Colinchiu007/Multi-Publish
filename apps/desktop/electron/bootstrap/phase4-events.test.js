// @vitest-environment node
const { EventEmitter } = require('events')
const { wireTaskQueueEvents } = require('./phase4-events')

describe('phase4-events', () => {
  it('把任务固化的 owner_subject 写入发布历史', () => {
    const taskQueue = new EventEmitter()
    const history = { addRecord: vi.fn() }
    wireTaskQueueEvents({
      taskQueue,
      history,
      publishMonitor: { createMonitorTask: vi.fn() },
      publishImpactTracker: { addTracking: vi.fn() },
      getMainWin: () => null,
    })

    taskQueue.emit('task:success', {
      id: 'task-a',
      owner_subject: 'user-a',
      platform: 'wechat_mp',
      article: { title: '隔离发布' },
      result: {},
    })

    expect(history.addRecord).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-a', title: '隔离发布' }),
      'user-a',
    )
  })
})
