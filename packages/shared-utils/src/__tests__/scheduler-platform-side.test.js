// @ts-nocheck
// TDD —— 先红：平台侧定时的调度语义契约
//
// 语义变更（2026-10-07）：定时发布从「本地定时器到点触发一次立即发布」
// 改为「创建时把排期提交给平台，由平台服务器到点发布」。
//
// 对调度器而言，三个语义随之改变：
//   1. create() 时**不再武装本地定时器**（平台自己会到点发，应用关着也能发）
//   2. 派发载荷必须**携带 publishTime**，否则 publisher 无法组装平台的定时字段
//   3. 不支持平台侧定时的平台**在 create 阶段就被阻断**，绝不创建后到点再发
//
// 第 3 条是安全底线：参考产品的 7 个不支持平台正是「prePubTime 守卫不成立
// 就跳过赋值 ⇒ 内容立即发布」，用户以为排了期、实际已发出。我们明令禁止。

const fs = require('fs')
const os = require('os')
const path = require('path')
const { createScheduler } = require('../scheduler')
const { isPlatformSideScheduleSupported } = require('../platform-schedule-capability')

const BASE_TIME = new Date('2026-10-07T12:00:00.000Z')

describe('Scheduler 平台侧定时语义', () => {
  let tempDir
  let filePath
  let app
  let logger
  let scheduler

  // 头条 minLeadMinutes=5：所有夹具必须 ≥5 分钟，否则会被平台窗口校验拦下
  const futureTime = (offset = 30 * 60 * 1000) => new Date(BASE_TIME.getTime() + offset).toISOString()
  const readEntries = () => fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(BASE_TIME)
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-sched-platform-'))
    filePath = path.join(tempDir, 'scheduled-tasks.jsonl')
    app = { getPath: vi.fn(() => tempDir) }
    logger = { error: vi.fn(), warn: vi.fn() }
    scheduler = createScheduler({ app, logger })
  })

  afterEach(() => {
    scheduler.stopAll()
    vi.useRealTimers()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('① 创建后不武装本地定时器', () => {
    it('支持平台侧定时的平台：create 后不产生任何 setTimeout', () => {
      scheduler.create({ platform: 'toutiao', article: { title: 'A' }, publishTime: futureTime() })
      expect(vi.getTimerCount()).toBe(0)
    })

    it('任务状态标记为 submitted（已提交平台），而不是 pending', () => {
      const entry = scheduler.create({ platform: 'toutiao', article: { title: 'A' }, publishTime: futureTime() })
      expect(entry.status).toBe('submitted')
    })
  })

  describe('② 派发载荷携带 publishTime', () => {
    it('提交给平台的任务带上 publishTime，供 publisher 组装定时字段', async () => {
      const taskQueue = { add: vi.fn(() => new Promise(() => {})) }
      scheduler.setTaskQueue(taskQueue)
      const publishTime = futureTime(2 * 60 * 60 * 1000)
      scheduler.create({ platform: 'toutiao', article: { title: 'A' }, publishTime })

      // 入队发生在 create 内部的异步派发里，让微任务跑完再断言
      await Promise.resolve()
      await Promise.resolve()

      expect(taskQueue.add).toHaveBeenCalledWith(expect.objectContaining({
        platform: 'toutiao',
        publishTime,
        publishMode: 'scheduled'
      }))
    })
  })

  describe('③ 不支持的平台在 create 阶段阻断', () => {
    it('create 抛错，且不落盘任何记录', () => {
      expect(() => scheduler.create({
        platform: 'zhihu', article: { title: 'A' }, publishTime: futureTime()
      })).toThrow()
      expect(fs.existsSync(filePath)).toBe(false)
    })

    it('错误信息带上平台标识，便于渲染层提示', () => {
      try {
        scheduler.create({ platform: 'zhihu', article: {}, publishTime: futureTime() })
        throw new Error('should have thrown')
      } catch (error) {
        expect(error.message).toContain('zhihu')
      }
    })

    it('未知平台同样阻断（fail-closed，绝不默认支持）', () => {
      expect(isPlatformSideScheduleSupported('totally-unknown')).toBe(false)
      expect(() => scheduler.create({
        platform: 'totally-unknown', article: {}, publishTime: futureTime()
      })).toThrow()
    })
  })

  describe('④ 恢复语义：已提交的任务不重放', () => {
    it('restore 不重新提交已 submitted 的任务（平台自己会发）', () => {
      scheduler.create({ platform: 'toutiao', article: { title: 'A' }, publishTime: futureTime() })
      const restored = createScheduler({ app, logger })
      expect(restored.restore()).toBe(0)
    })
  })

  describe('⑤ 取消：平台侧任务的取消边界（重要语义）', () => {
    // 平台侧定时的根本差异：内容在 create() 的瞬间就已连同时间一起提交给平台，
    // 平台服务器持有该排期。本地既没有定时器可杀，也没有平台的撤销接口
    // （参考产品 4.0 逆向实测：不提供）。因此「取消」只能是本地记录作废，
    // 绝不能让用户以为内容不会发 —— 那正是本仓明令禁止的静默失败形态。
    it('已提交平台的任务无法真正取消（cancel 返回 false）', async () => {
      scheduler.setTaskQueue({ add: vi.fn(() => Promise.resolve()) })
      const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })
      await Promise.resolve()
      await Promise.resolve()

      // 磁盘状态已是 executed（平台已受理）
      expect(scheduler.list().find(t => t.id === entry.id).status).toBe('executed')
      expect(scheduler.cancel(entry.id)).toBe(false)
    })

    it('正在提交中的任务不可取消（D2：防本地/平台状态分裂）', async () => {
      scheduler.setTaskQueue({ add: vi.fn(() => new Promise(() => {})) })
      const entry = scheduler.create({ platform: 'toutiao', article: {}, publishTime: futureTime() })
      await Promise.resolve()

      expect(scheduler.cancel(entry.id)).toBe(false)
      expect(scheduler.list().find(t => t.id === entry.id).status).not.toBe('cancelled')
    })

    it('legacy pending 记录仍可取消（迁移前遗留数据的清理路径）', () => {
      fs.appendFileSync(filePath, JSON.stringify({
        id: 'legacy-1', platform: 'toutiao', article: {}, accountId: null,
        status: 'pending', publishTime: futureTime(), createdAt: new Date().toISOString()
      }) + '\n', 'utf-8')

      expect(scheduler.cancel('legacy-1')).toBe(true)
      expect(scheduler.list().find(t => t.id === 'legacy-1').status).toBe('cancelled')
    })
  })
})