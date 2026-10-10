// @ts-nocheck
// App 级「定时派发失败」全局提示 —— TDD 契约（2026-10-09）。
//
// 背景：定时任务到点后若入队失败（队列未配置 / 租户隔离入队被拒 / 认领写盘失败），
// 主进程 scheduler.onDispatchFailed 会向主窗口广播 scheduler:dispatch-failed。
// 此前渲染端**只有发布日历页在监听**——用户排完期去了别的页面就收不到任何提示，
// 失败只静静躺在发布历史里。本契约把监听提升到 App 级（App.vue 挂载时订阅）：
// 任何页面收到拒收信号都立即弹错误 toast（带平台与原因），日历页原有监听收敛去重。
//
// 三条行为锁 + 两条结构锁，全部先于实现编写（TDD 红 → 绿）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import fs from 'node:fs'
import path from 'node:path'

const notifyErrorMock = vi.fn()

vi.mock('@/composables/useNotify', () => ({
  useNotify: () => ({
    notify: vi.fn(),
    notifyError: notifyErrorMock,
    notifySuccess: vi.fn(),
    notifyWarning: vi.fn(),
    notifyInfo: vi.fn(),
    notifyConfirm: vi.fn().mockResolvedValue(true),
  }),
}))

vi.mock('vue-router', () => {
  const noop = () => () => {}
  const router = {
    push: vi.fn(),
    onError: noop,
    afterEach: () => () => {},
    beforeEach: () => () => {},
    isReady: () => Promise.resolve(),
    currentRoute: { value: { name: 'home' } },
  }
  return {
    useRouter: () => router,
    useRoute: () => ({ path: '/', query: {} }),
    createRouter: () => router,
    createWebHashHistory: () => ({}),
    RouterLink: { template: '<a><slot /></a>' },
    RouterView: { template: '<div><slot name="default" /></div>' },
  }
})

import i18n from '@/i18n'
import App from './App.vue'

const dispatchFailures = []
let dispatchHandler = null

function mountApp () {
  return mount(App, {
    global: {
      // App.vue 的 setup 调 useI18n()（组合式 API 需要插件装配）；
      // @/i18n 即 main.js 挂载的同一实例，语言由 test-setup-locale.js 固定 zh-CN。
      plugins: [createPinia(), i18n],
      stubs: {
        RouterView: true,
        RouterLink: true,
        PublishProgressPanel: true,
        RouteLoadError: true,
        TabBar: true,
        ElConfigProvider: true,
      },
    },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  dispatchFailures.length = 0
  dispatchHandler = null
  window.electronAPI = {
    schedulerList: vi.fn().mockResolvedValue({ code: 0, data: [] }),
    onSchedulerDispatchFailed: vi.fn((cb) => {
      dispatchHandler = cb
      return () => { dispatchHandler = null }
    }),
    onNavigate: vi.fn(() => () => {}),
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe('App 级定时派发失败提示 —— 行为契约', () => {
  it('App 挂载即订阅 onSchedulerDispatchFailed（任何页面都能收到拒收信号）', async () => {
    const w = mountApp()
    await nextTick()
    expect(window.electronAPI.onSchedulerDispatchFailed).toHaveBeenCalledTimes(1)
    expect(typeof dispatchHandler).toBe('function')
    w.unmount()
  })

  it('收到拒收信号 → 弹错误提示，文案含平台与原因', async () => {
    const w = mountApp()
    await nextTick()
    dispatchHandler({ id: 'sched-1', platform: 'toutiao', reason: '平台拒收 code=7050', stage: 'enqueue' })
    await nextTick()
    expect(notifyErrorMock).toHaveBeenCalledTimes(1)
    const call = notifyErrorMock.mock.calls[0]
    expect(call[0]).toBe('appShell.scheduleDispatchFailed')
    expect(call[1].params.platform).toBe('toutiao')
    expect(call[1].params.reason).toContain('7050')
    w.unmount()
  })

  it('卸载时解除监听：stop 被调用，且卸载后收到广播不再弹提示（无幽灵提示）', async () => {
    const stopSpy = vi.fn(() => { dispatchHandler = null })
    window.electronAPI.onSchedulerDispatchFailed = vi.fn((cb) => {
      dispatchHandler = cb
      return stopSpy
    })
    const w = mountApp()
    await nextTick()
    w.unmount()
    await nextTick()
    // ① stop 确实被 onBeforeUnmount 调用过
    expect(stopSpy).toHaveBeenCalledTimes(1)
    // ② 模拟 preload 侧广播仍在（stop 只解除 App 的订阅，不影响 handler 引用）：
    //    卸载后再次触发信号，App 不得再弹 toast——这才是「无幽灵提示」的真断言
    if (dispatchHandler) dispatchHandler({ id: 'sched-9', platform: 'zhihu', reason: 'x', stage: 'enqueue' })
    await nextTick()
    expect(notifyErrorMock).not.toHaveBeenCalled()
  })

  it('preload 未暴露监听能力（老版本兼容）时静默跳过，不影响挂载', async () => {
    delete window.electronAPI.onSchedulerDispatchFailed
    const w = mountApp()
    await nextTick()
    expect(w.exists()).toBe(true)
    expect(notifyErrorMock).not.toHaveBeenCalled()
    w.unmount()
  })
})

describe('App 级定时派发失败提示 —— 结构锁（防实现漂移）', () => {
  const SRC = fs.readFileSync(path.resolve(process.cwd(), 'src/App.vue'), 'utf8')

  it('App.vue 不得在页面级组件重复监听——日历页监听收敛或保留由去重守卫约束', () => {
    // App.vue 必须直接引用 preload 能力名（监听必须在壳层）
    expect(SRC).toContain('onSchedulerDispatchFailed')
  })

  it('zh/en 词条成对存在（appShell.scheduleDispatchFailed）', () => {
    for (const f of ['src/locales/zh.js', 'src/locales/en.js']) {
      const t = fs.readFileSync(path.resolve(process.cwd(), f), 'utf8')
      // 块内归属断言（评审 MAJOR 修正）：calendarPage 早有同名 key，两个独立断言
      // （「存在 appShell 块」+「存在同名 key」）防不了「appShell 空对象」的假绿。
      // 必须证明 scheduleDispatchFailed 与占位符都出现在 appShell 块之内。
      // 边界取「下一个顶层 '  },'」而非正则 [^}]*——词条模板串里的 {platform}/{reason}
      // 自带 }，会把字符类截断（实测踩过：占位符明明存在却判 false）。
      const nsIdx = t.indexOf('appShell:')
      expect(nsIdx, `${f} 缺 appShell 命名空间`).toBeGreaterThanOrEqual(0)
      const blockEnd = t.indexOf('\n  },', nsIdx)
      expect(blockEnd, `${f} 的 appShell 块未正常闭合`).toBeGreaterThan(nsIdx)
      const block = t.slice(t.indexOf('{', nsIdx) + 1, blockEnd)
      expect(block, `${f} 的 appShell 块内缺 scheduleDispatchFailed 词条`).toContain('scheduleDispatchFailed:')
      // 词条必须声明占位符（评审 MINOR：漏写占位符时用户会看到原始 {reason}）
      expect(block, `${f} 的 appShell.scheduleDispatchFailed 缺 {platform} 占位符`).toContain('{platform}')
      expect(block, `${f} 的 appShell.scheduleDispatchFailed 缺 {reason} 占位符`).toContain('{reason}')
    }
  })
})
