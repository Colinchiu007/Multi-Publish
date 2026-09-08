// @ts-check
/**
 * OAuthManager IPC 安全合同测试
 *
 * @vitest-environment node
 */
__enableElectronMock()

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
__registerMock('./logger', mockLog)
__registerMock('../services/logger', mockLog)
__registerMock('./store', function MockStore () {})

const OAuthManager = require('./oauth-manager')

const TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }

describe('OAuthManager IPC 安全合同', () => {
  let manager
  let closeHandler

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    manager = new OAuthManager({})
    manager.close = vi.fn()
    manager.registerIpcHandlers()
    closeHandler = __electronMock.ipcMain._handlers['oauth:close']
  })

  it('oauth:close 拒绝不可信来源且不关闭授权流程', async () => {
    const result = await closeHandler(UNTRUSTED_EVENT)

    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(manager.close).not.toHaveBeenCalled()
  })

  it('oauth:close 放行可信来源并保持成功返回合同', async () => {
    const result = await closeHandler(TRUSTED_EVENT)

    expect(result).toEqual({ code: 0 })
    expect(manager.close).toHaveBeenCalledTimes(1)
  })

  it('oauth:close 捕获关闭异常并返回稳定错误合同', async () => {
    manager.close.mockImplementation(() => { throw new Error('close failed') })

    await expect(closeHandler(TRUSTED_EVENT)).resolves.toEqual({
      code: -1,
      message: 'close failed',
    })
  })

  it('close 会销毁独立授权窗口（幂等 dispose，不再内嵌主窗口）', () => {
    const oauthManager = new OAuthManager({})
    // 模拟存在独立授权窗口（由 auth-window.js 工厂创建）
    const dispose = vi.fn()
    oauthManager.currentWindow = { dispose }
    oauthManager.currentView = { webContents: { close: vi.fn(), destroy: vi.fn() } }
    oauthManager.mainWindow = null

    oauthManager.close()

    // 回归点：授权窗口被销毁（原实现是 mainWindow.contentView.removeChildView 内嵌挂载）
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(oauthManager.currentWindow).toBeNull()
    expect(oauthManager.currentView).toBeNull()
  })
})
