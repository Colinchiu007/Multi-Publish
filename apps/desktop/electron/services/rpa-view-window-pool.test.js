// @ts-check
/**
 * rpa-view-window-pool.test.js — C 方案（publish-throughput-optimization）窗口池回归
 *
 * 契约（openspec/changes/publish-throughput-optimization/specs/publish-queue-scheduling/spec.md）：
 * - 成功归池：发布成功的窗口导航 about:blank 后入池，不销毁
 * - 失败销毁：失败/抛错的窗口立即 destroy，不入池
 * - 复用热窗口：同键（platform+accountId）复用池内窗口，跳过 cookie 三段恢复
 * - 池上限：超限销毁最旧窗口；TTL 清理定时器 unref（不阻止进程退出）
 *
 * electron mock 走本仓 test-setup.js 的 __enableElectronMock() 全局机制（vi.mock 对 CJS require 无效）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

__enableElectronMock()

describe('rpa-view-window-pool — C 方案窗口池（publish-throughput-optimization）', () => {
  let RpaViewManager

  beforeEach(async () => {
    __resetElectronMock()
    vi.resetModules()
    ;({ default: RpaViewManager } = await import('./rpa-view-manager'))
  })

  function createdWindows () {
    return __electronMock.BrowserWindow._instances
  }

  function makeManager () {
    const m = new RpaViewManager()
    m.setMainWindow({ webContents: { send: vi.fn() }, isDestroyed: () => true })
    // 发布逻辑全部 mock：平台链返回成功
    m._publish_douyin = vi.fn().mockResolvedValue({ success: true, platform: 'douyin' })
    m._publish_wechat_mp = vi.fn().mockResolvedValue({ success: true, platform: 'wechat_mp' })
    return m
  }

  it('发布成功后窗口不销毁而是入池（未销毁，已导航 about:blank）', async () => {
    const m = makeManager()
    await m.publish('douyin', { title: 'T', accountId: 'acc-1' }, { cookies: [] }, 60000)
    const wins = createdWindows()
    expect(wins).toHaveLength(1)
    expect(wins[0]._destroyed).toBe(false)
    // 归池前必须导航 about:blank 释放页面状态
    expect(wins[0].loadURL).toHaveBeenCalledWith('about:blank')
  })

  it('同键第二次发布复用池内窗口（不新建 BrowserWindow）', async () => {
    const m = makeManager()
    const cookies = [{ name: 'sid', value: 'v', secure: true }]
    await m.publish('douyin', { title: '1', accountId: 'acc-1' }, { cookies }, 60000)
    await m.publish('douyin', { title: '2', accountId: 'acc-1' }, { cookies }, 60000)
    expect(createdWindows()).toHaveLength(1) // 复用
  })

  it('不同账号键不共用池窗口', async () => {
    const m = makeManager()
    await m.publish('douyin', { title: '1', accountId: 'acc-1' }, { cookies: [] }, 60000)
    await m.publish('douyin', { title: '2', accountId: 'acc-2' }, { cookies: [] }, 60000)
    expect(createdWindows()).toHaveLength(2)
  })

  it('发布失败的窗口立即销毁不入池', async () => {
    const m = makeManager()
    m._publish_douyin = vi.fn().mockResolvedValue({ success: false, error: 'boom', platform: 'douyin' })
    await m.publish('douyin', { title: 'T', accountId: 'acc-1' }, { cookies: [] }, 60000)
    const wins = createdWindows()
    expect(wins).toHaveLength(1)
    expect(wins[0]._destroyed).toBe(true)
  })

  it('发布抛错（如超时）的窗口立即销毁不入池', async () => {
    const m = makeManager()
    m._publish_douyin = vi.fn().mockRejectedValue(new Error('timeout (60s)'))
    await m.publish('douyin', { title: 'T', accountId: 'acc-1' }, { cookies: [] }, 60000)
    const wins = createdWindows()
    expect(wins).toHaveLength(1)
    expect(wins[0]._destroyed).toBe(true)
  })

  it('复用路径跳过 cookie 恢复（第二次发布不重复 _restoreCookies）', async () => {
    const m = makeManager()
    const cookies = [{ name: 'sid', value: 'v', secure: true }]
    const restoreSpy = vi.spyOn(m, '_restoreCookies')
    await m.publish('douyin', { title: '1', accountId: 'acc-1' }, { cookies }, 60000)
    await m.publish('douyin', { title: '2', accountId: 'acc-1' }, { cookies }, 60000)
    expect(restoreSpy).toHaveBeenCalledTimes(1) // 只在新建时恢复
  })

  it('池上限（默认 6）超限时销毁最旧窗口', async () => {
    const m = makeManager()
    for (let i = 0; i < 8; i++) {
      await m.publish('douyin', { title: 'T' + i, accountId: 'acc-' + i }, { cookies: [] }, 60000)
    }
    // 8 次发布、池上限 6：前 2 个窗口应在后续归池时被挤出销毁
    const destroyed = createdWindows().filter(w => w._destroyed)
    expect(destroyed.length).toBeGreaterThanOrEqual(2)
  })

  it('MP_RPA_POOL_SIZE 环境变量覆盖池上限（合法值 2）', async () => {
    const env = process.env.MP_RPA_POOL_SIZE
    process.env.MP_RPA_POOL_SIZE = '2'
    try {
      __resetElectronMock()
      vi.resetModules()
      ;({ default: RpaViewManager } = await import('./rpa-view-manager'))
      const m = makeManager()
      for (let i = 0; i < 4; i++) {
        await m.publish('douyin', { title: 'T' + i, accountId: 'acc-' + i }, { cookies: [] }, 60000)
      }
      const destroyed = createdWindows().filter(w => w._destroyed)
      expect(destroyed.length).toBeGreaterThanOrEqual(2) // 上限 2 → 至少挤掉 2 个
    } finally {
      if (env === undefined) delete process.env.MP_RPA_POOL_SIZE
      else process.env.MP_RPA_POOL_SIZE = env
    }
  })

  it('MP_RPA_POOL_SIZE 非法值回落默认 6 并出声告警', async () => {
    const env = process.env.MP_RPA_POOL_SIZE
    process.env.MP_RPA_POOL_SIZE = 'abc'
    const warnings = []
    const origWarn = console.warn
    console.warn = (...a) => warnings.push(a.join(' '))
    try {
      __resetElectronMock()
      vi.resetModules()
      ;({ default: RpaViewManager } = await import('./rpa-view-manager'))
      expect(RpaViewManager.resolvePoolSize()).toBe(6)
      expect(warnings.join('\n')).toContain('MP_RPA_POOL_SIZE')
    } finally {
      console.warn = origWarn
      if (env === undefined) delete process.env.MP_RPA_POOL_SIZE
      else process.env.MP_RPA_POOL_SIZE = env
    }
  })

  it('cleanup() 清空池（销毁所有池内窗口）', async () => {
    const m = makeManager()
    await m.publish('douyin', { title: 'T', accountId: 'acc-1' }, { cookies: [] }, 60000)
    await m.publish('douyin', { title: 'T', accountId: 'acc-2' }, { cookies: [] }, 60000)
    m.cleanup()
    const destroyed = createdWindows().filter(w => w._destroyed)
    expect(destroyed.length).toBe(2)
  })

  it('TTL 清理定时器带 unref（结构锁：session 源码含 unref 调用）', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const src = fs.readFileSync(path.join(process.cwd(), 'electron/services/rpa-view-session.js'), 'utf-8')
    expect(src).toMatch(/unref\(\)/)
  })
})
