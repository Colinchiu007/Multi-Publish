// resume-guard.test.js — 不 require('vitest')，使用 test-setup.js 注入的全局 describe/it/expect/vi
const { createResumeGuard } = require('./resume-guard')

function makePowerMonitor () {
  const handlers = new Map()
  return {
    on: vi.fn((event, handler) => { handlers.set(event, handler) }),
    removeListener: vi.fn((event, handler) => {
      if (handlers.get(event) === handler) handlers.delete(event)
    }),
    emit: (event) => handlers.get(event)?.(),
    hasHandler: (event) => handlers.has(event)
  }
}

describe('createResumeGuard — 休眠唤醒重算', () => {
  let powerMonitor
  let scheduler
  let logger

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-06T08:00:00.000Z'))
    powerMonitor = makePowerMonitor()
    scheduler = { rearm: vi.fn(() => 2) }
    logger = { notify: vi.fn() }
  })

  it('resume 后调用 rearm 按当前墙钟重算', () => {
    const guard = createResumeGuard({ powerMonitor, scheduler, logger })
    expect(guard.attach()).toBe(true)

    powerMonitor.emit('resume')

    expect(scheduler.rearm).toHaveBeenCalledTimes(1)
    expect(logger.notify).toHaveBeenCalledWith(
      'Scheduler', 'pending-tasks-rearmed-after-resume', { params: { count: 2 } }
    )
  })

  it('把当前身份态透传给 rearm（租户隔离不被绕过）', () => {
    const guard = createResumeGuard({
      powerMonitor, scheduler, logger,
      getOwnerState: () => ({ user: { sub: 'user-a' } })
    })
    guard.attach()

    powerMonitor.emit('resume')

    expect(scheduler.rearm).toHaveBeenCalledWith({ user: { sub: 'user-a' } })
  })

  it('短暂唤醒（<minSleepGapMs）不触发重算，避免每次唤醒全量重写文件', () => {
    const guard = createResumeGuard({ powerMonitor, scheduler, logger, minSleepGapMs: 60_000 })
    guard.attach()

    powerMonitor.emit('resume')
    vi.advanceTimersByTime(5_000)
    powerMonitor.emit('resume')

    expect(scheduler.rearm).toHaveBeenCalledTimes(1)
  })

  it('超过间隔的再次唤醒会再次重算', () => {
    const guard = createResumeGuard({ powerMonitor, scheduler, logger, minSleepGapMs: 60_000 })
    guard.attach()

    powerMonitor.emit('resume')
    vi.advanceTimersByTime(120_000)
    powerMonitor.emit('resume')

    expect(scheduler.rearm).toHaveBeenCalledTimes(2)
  })

  it('rearm 抛错只记 WARN，不向外抛出（旁路容错）', () => {
    scheduler.rearm.mockImplementation(() => { throw new Error('磁盘只读') })
    const guard = createResumeGuard({ powerMonitor, scheduler, logger })
    guard.attach()

    expect(() => powerMonitor.emit('resume')).not.toThrow()
    expect(logger.notify).toHaveBeenCalledWith(
      'Scheduler', 'resume-rearm-failed', { level: 'WARN', error: '磁盘只读' }
    )
  })

  it('幂等 attach：重复调用只注册一个监听', () => {
    const guard = createResumeGuard({ powerMonitor, scheduler, logger })
    expect(guard.attach()).toBe(true)
    expect(guard.attach()).toBe(false)
    expect(powerMonitor.on).toHaveBeenCalledTimes(1)
    expect(guard.isAttached()).toBe(true)
  })

  it('detach 真正摘除监听', () => {
    const guard = createResumeGuard({ powerMonitor, scheduler, logger })
    guard.attach()
    expect(guard.detach()).toBe(true)
    expect(powerMonitor.hasHandler('resume')).toBe(false)
    powerMonitor.emit('resume')
    expect(scheduler.rearm).not.toHaveBeenCalled()
  })

  it('缺少 powerMonitor 或 scheduler 时 attach 返回 false（fail-safe 不崩启动）', () => {
    expect(createResumeGuard({ scheduler, logger }).attach()).toBe(false)
    expect(createResumeGuard({ powerMonitor, scheduler: null, logger }).attach()).toBe(false)
    expect(createResumeGuard({ powerMonitor, scheduler: {}, logger }).attach()).toBe(false)
  })
})