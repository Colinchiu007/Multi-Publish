import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

let createStandaloneAuthWindow

beforeEach(async () => {
  vi.resetModules()
  __resetElectronMock()
  const module = await import('./auth-window.js')
  createStandaloneAuthWindow = module.createStandaloneAuthWindow
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createView () {
  return { setBounds: vi.fn(), setVisible: vi.fn() }
}

describe('auth-window 独立认证窗口工厂', () => {
  it('创建独立窗口（父子关系、非模态），attach 后视图铺满客户区且从 (0,0) 起算', () => {
    const parent = { isDestroyed: () => false }
    const handle = createStandaloneAuthWindow({ parent, title: '扫码登录 - kuaishou' })

    expect(handle.win).toBeTruthy()
    expect(handle.win._opts.title).toBe('扫码登录 - kuaishou')
    expect(handle.win._opts.parent).toBe(parent)
    expect(handle.win._opts.modal).toBe(false)

    const view = createView()
    handle.attach(view)

    // 视图挂到独立窗口的客户区容器
    expect(handle.win.contentView.addChildView).toHaveBeenCalledWith(view)
    expect(view.setVisible).toHaveBeenCalledWith(true)
    // 回归点：铺满 mock 的 800×600 客户区，零硬编码偏移
    // （内嵌模式曾依赖 LOGIN_VIEW_TOP=76 / 侧边栏宽度，导致顶部多层内容重叠）
    expect(view.setBounds).toHaveBeenCalledWith({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('窗口 resize 时同步视图铺满新客户区', () => {
    const handle = createStandaloneAuthWindow({})
    const view = createView()
    handle.attach(view)

    // 手动触发 mock 记录的 resize 回调
    handle.win._handlers.resize?.()
    expect(view.setBounds).toHaveBeenLastCalledWith({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('dispose 解除挂载并销毁窗口（幂等）', () => {
    const handle = createStandaloneAuthWindow({})
    const view = createView()
    handle.attach(view)

    handle.dispose()
    expect(handle.win.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(handle.win.isDestroyed()).toBe(true)

    // 幂等：重复 dispose / attach 不抛异常、不重复挂载
    expect(() => handle.dispose()).not.toThrow()
    const before = handle.win.contentView.addChildView.mock.calls.length
    handle.attach(createView())
    expect(handle.win.contentView.addChildView.mock.calls.length).toBe(before)
  })

  it('窗口 closed 事件触发 onClosed 回调（供调用方按取消结算）', () => {
    const onClosed = vi.fn()
    const handle = createStandaloneAuthWindow({ onClosed })

    handle.win._handlers.closed?.()
    expect(onClosed).toHaveBeenCalledTimes(1)
  })
})
