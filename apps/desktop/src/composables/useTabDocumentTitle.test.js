import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

const invokePageManagerMock = vi.hoisted(() => vi.fn())

vi.mock('@/api/electron-bridge', async (importOriginal) => {
  const mod = await importOriginal()
  return {
    ...mod,
    invokePageManager: invokePageManagerMock,
  }
})

vi.mock('vue-router', () => ({
  useRoute: vi.fn(),
}))

import { ROUTE_TAB_TITLES, resolveRouteTabTitle, useTabDocumentTitle } from './useTabDocumentTitle'
import { useRoute } from 'vue-router'

/** 搭一个响应式 route mock（watch 依赖 route.fullPath，必须经 reactivity 触发） */
function setupRoute (initialPath = '/') {
  const route = reactive({ fullPath: initialPath })
  useRoute.mockReturnValue(route)
  return {
    push (v) { route.fullPath = v },
    route,
  }
}

beforeEach(() => {
  invokePageManagerMock.mockReset()
  invokePageManagerMock.mockResolvedValue({ code: 0 })
  document.title = '社媒管家'
})

describe('resolveRouteTabTitle（纯函数判定表）', () => {
  it('精确 path 命中：/rewrite → sidebar.nav.rewrite（文案改写）', () => {
    expect(resolveRouteTabTitle('/rewrite')).toBe('文案改写')
  })

  it('参数路由前缀命中：/board/p-123 → 素材看板', () => {
    expect(resolveRouteTabTitle('/board/p-123')).toBe('素材看板')
    expect(resolveRouteTabTitle('/board/p-123/contact-sheet')).toBe('场景审批')
    expect(resolveRouteTabTitle('/replay/p-123')).toBe('生产回放')
  })

  it('query 路由：/create?view=history 按 path 部分命中 → 视频创作', () => {
    expect(resolveRouteTabTitle('/create?view=history')).toBe('视频创作')
  })

  it('未知路径回退品牌名「社媒管家」', () => {
    expect(resolveRouteTabTitle('/no-such-page')).toBe('社媒管家')
  })

  it('空/null 回退品牌名', () => {
    expect(resolveRouteTabTitle('')).toBe('社媒管家')
    expect(resolveRouteTabTitle(null)).toBe('社媒管家')
  })

  it('映射表覆盖登记过的全部内部路由 path（规模下界防解析退化）', () => {
    resolveRouteTabTitle('/') // 触发表填充
    // 精确表 25 条 + 前缀表 3 条 = 28（前缀表里 /board/ 有两条：普通页 + contact-sheet 子路由）
    expect(ROUTE_TAB_TITLES.size).toBeGreaterThanOrEqual(27)
  })
})

describe('useTabDocumentTitle（行为）', () => {
  it('初始挂载即上报当前路由标题', async () => {
    setupRoute('/rewrite')
    const { start, stop } = useTabDocumentTitle()
    start()
    await Promise.resolve()
    expect(document.title).toBe('文案改写')
    expect(invokePageManagerMock).toHaveBeenCalledWith('reportTabTitle', '文案改写')
    stop()
  })

  it('路由切换 → document.title 与主进程上报同步更新（文案改写 → 发布）', async () => {
    const routeCtl = setupRoute('/rewrite')
    const { start, stop } = useTabDocumentTitle()
    start()
    await nextTick()
    expect(document.title).toBe('文案改写')

    routeCtl.push('/publish/history')
    await nextTick()
    await nextTick()
    expect(document.title).toBe('发布记录')
    expect(invokePageManagerMock).toHaveBeenLastCalledWith('reportTabTitle', '发布记录')
    stop()
  }, 10000)

  it('未知路由 → 回退品牌名并上报', async () => {
    const routeCtl = setupRoute('/')
    const { start, stop } = useTabDocumentTitle()
    start()
    routeCtl.push('/unknown-page')
    await nextTick()
    await nextTick()
    expect(document.title).toBe('社媒管家')
    expect(invokePageManagerMock).toHaveBeenLastCalledWith('reportTabTitle', '社媒管家')
    stop()
  })

  it('IPC 上报失败静默降级：document.title 仍更新，不抛错', async () => {
    invokePageManagerMock.mockRejectedValue(new Error('ipc down'))
    setupRoute('/rewrite')
    const { start, stop } = useTabDocumentTitle()
    start()
    await Promise.resolve()
    expect(document.title).toBe('文案改写')
    stop()
  })

  it('stop 后路由变化不再上报', async () => {
    const routeCtl = setupRoute('/rewrite')
    const { start, stop } = useTabDocumentTitle()
    start()
    await Promise.resolve()
    invokePageManagerMock.mockClear()
    stop()
    routeCtl.push('/publish')
    await Promise.resolve()
    expect(invokePageManagerMock).not.toHaveBeenCalled()
  })

  it('Electron 环境外（非 home-shell 实例）不上报 IPC，但 document.title 仍同步', async () => {
    // 模拟无 pageManager API（invokePageManager 返回 undefined）
    invokePageManagerMock.mockReturnValue(undefined)
    setupRoute('/rewrite')
    const { start, stop } = useTabDocumentTitle()
    start()
    await Promise.resolve()
    expect(document.title).toBe('文案改写')
    stop()
  })
})
