// @ts-check
/**
 * standalone-window 测试 —— 通用独立 BrowserWindow 承载 WebContentsView。
 *
 * 背景：认证类视图（AuthViewManager / OAuthManager / QrCodeLogin）原先内嵌主窗口
 * contentView，坐标依赖硬编码常量导致与页面 DOM 重叠（PR #1557）。该模式推广到
 * 所有「打开应用外 URL」入口（采集页平台图标 / 评论页 / 创作者中心）后抽为通用工厂。
 */
__enableElectronMock()

let createStandaloneWindow

beforeEach(async () => {
  vi.resetModules()
  __resetElectronMock()
  const mod = await import('./standalone-window.js')
  createStandaloneWindow = mod.createStandaloneWindow
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createView() {
  return {
    setVisible: vi.fn(),
    setBounds: vi.fn(),
    webContents: { close: vi.fn() },
  }
}

describe('createStandaloneWindow', () => {
  it('创建独立 BrowserWindow 并返回 attach/dispose 句柄', () => {
    const handle = createStandaloneWindow({ title: '知乎' })
    const { BrowserWindow } = require('electron')

    expect(BrowserWindow).toHaveBeenCalled()
    expect(handle.win).toBeTruthy()
    expect(typeof handle.attach).toBe('function')
    expect(typeof handle.dispose).toBe('function')
    expect(typeof handle.syncBounds).toBe('function')
  })

  it('默认非 modal 且建立父子关系，用户仍可切回主窗口', () => {
    const parent = { isDestroyed: () => false }
    createStandaloneWindow({ parent, title: '知乎' })
    const { BrowserWindow } = require('electron')
    const opts = BrowserWindow.mock.calls[0][0]

    expect(opts.modal).toBe(false)
    expect(opts.parent).toBe(parent)
  })

  it('attach 把视图挂到独立窗口而非主窗口，并从 (0,0) 铺满客户区', () => {
    const mainWindow = { contentView: { addChildView: vi.fn() } }
    const handle = createStandaloneWindow({ title: '知乎' })
    const view = createView()

    handle.attach(view)

    // 关键断言：绝不挂到主窗口 contentView（浮层根因）
    expect(mainWindow.contentView.addChildView).not.toHaveBeenCalled()
    expect(handle.win.contentView.addChildView).toHaveBeenCalledWith(view)
    expect(view.setBounds).toHaveBeenCalledWith(
      expect.objectContaining({ x: 0, y: 0 })
    )
    expect(view.setVisible).toHaveBeenCalledWith(true)
  })

  it('窗口 resize 时同步视图铺满客户区', () => {
    const handle = createStandaloneWindow({ title: '知乎' })
    const view = createView()
    handle.attach(view)
    view.setBounds.mockClear()

    // Electron mock 的 on/once 把 handler 记在 _handlers 上，手动触发
    handle.win._handlers.resize()

    expect(view.setBounds).toHaveBeenCalledWith(expect.objectContaining({ x: 0, y: 0 }))
  })

  it('dispose 解除挂载并销毁窗口，且幂等', () => {
    const handle = createStandaloneWindow({ title: '知乎' })
    const view = createView()
    handle.attach(view)
    const destroySpy = vi.spyOn(handle.win, 'destroy')

    handle.dispose()
    handle.dispose()

    expect(handle.win.contentView.removeChildView).toHaveBeenCalledWith(view)
    expect(destroySpy).toHaveBeenCalledTimes(1)
  })

  it('窗口关闭时触发 onClosed 回调', () => {
    const onClosed = vi.fn()
    const handle = createStandaloneWindow({ title: '知乎', onClosed })

    handle.win._handlers.closed()

    expect(onClosed).toHaveBeenCalledTimes(1)
  })

  it('支持自定义尺寸与最小尺寸', () => {
    createStandaloneWindow({ title: '知乎', width: 800, height: 600, minWidth: 400, minHeight: 300 })
    const { BrowserWindow } = require('electron')
    const opts = BrowserWindow.mock.calls[0][0]

    expect(opts.width).toBe(800)
    expect(opts.height).toBe(600)
    expect(opts.minWidth).toBe(400)
    expect(opts.minHeight).toBe(300)
  })

  it('contentView 不可用时降级不抛错（loadURL 仍可继续）', () => {
    const handle = createStandaloneWindow({ title: '知乎' })
    delete handle.win.contentView
    const view = createView()

    expect(() => handle.attach(view)).not.toThrow()
  })
})
