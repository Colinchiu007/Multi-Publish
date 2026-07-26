// @vitest-environment node
'use strict'

const { EventEmitter } = require('events')

__enableElectronMock()

const updaterRuntime = new EventEmitter()
updaterRuntime.checkForUpdates = vi.fn()
updaterRuntime.downloadUpdate = vi.fn()
updaterRuntime.quitAndInstall = vi.fn()
updaterRuntime.logger = console

__registerMock('electron-updater', { autoUpdater: updaterRuntime })

const updaterService = require('./auto-updater')

describe('auto-updater 静默更新合同', () => {
  let originalNodeEnv

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    updaterRuntime.removeAllListeners()
    updaterRuntime.checkForUpdates.mockReset()
    updaterRuntime.downloadUpdate.mockReset()
    updaterRuntime.quitAndInstall.mockReset()
    updaterRuntime.logger = console
    updaterRuntime.autoDownload = undefined
    updaterRuntime.autoInstallOnAppQuit = undefined
    originalNodeEnv = process.env.NODE_ENV
  })

  afterEach(() => {
    __electronMock.app.isPackaged = false
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
  })

  function initService () {
    const win = new __electronMock.BrowserWindow()
    win.webContents.send = vi.fn()
    const onStatus = vi.fn()
    updaterService.init(win, onStatus)
    return { win, onStatus }
  }

  it('打包应用不能被 development 环境变量重新启用 console logger', () => {
    __electronMock.app.isPackaged = true
    process.env.NODE_ENV = 'development'

    initService()

    expect(updaterRuntime.logger).toBeNull()
  })

  it('latest.yml 404 error 事件静默归类为无可用更新', () => {
    __electronMock.app.isPackaged = true
    const { win, onStatus } = initService()

    updaterRuntime.emit('error', new Error('Cannot find latest.yml in release artifacts: HttpError: 404'))

    expect(onStatus).toHaveBeenLastCalledWith({
      type: 'not-available',
      data: '当前已是最新版本',
    })
    expect(win.webContents.send).toHaveBeenLastCalledWith('update:status', {
      type: 'not-available',
      data: '当前已是最新版本',
    })
  })

  it('检查更新遇到结构化 latest.yml 404 时静默归类', async () => {
    __electronMock.app.isPackaged = true
    const { onStatus } = initService()
    const error = Object.assign(new Error('Cannot find latest.yml in release artifacts'), { statusCode: 404 })
    updaterRuntime.checkForUpdates.mockRejectedValue(error)

    updaterService.check()
    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenLastCalledWith({
        type: 'not-available',
        data: '当前已是最新版本',
      })
    })
  })

  it('非网络、非元数据缺失错误仍向界面报告', () => {
    const { onStatus } = initService()

    updaterRuntime.emit('error', new Error('签名校验失败'))

    expect(onStatus).toHaveBeenLastCalledWith({ type: 'error', data: '签名校验失败' })
  })

  it('包含 latest.yml 和 404 字样的签名错误仍按真实错误上报', () => {
    const { onStatus } = initService()
    const error = new Error('signature verification failed for latest.yml after HttpError: 404')

    updaterRuntime.emit('error', error)

    expect(onStatus).toHaveBeenLastCalledWith({ type: 'error', data: error.message })
  })

  it('同一个检查错误经事件和 Promise 双通道到达时只通知一次', async () => {
    const { onStatus } = initService()
    const error = new Error('Cannot find latest.yml in release artifacts: HttpError: 404')
    updaterRuntime.checkForUpdates.mockImplementation(() => {
      updaterRuntime.emit('error', error)
      return Promise.reject(error)
    })

    updaterService.check()
    await new Promise(resolve => setImmediate(resolve))
    expect(onStatus).toHaveBeenCalledTimes(1)
    expect(onStatus).toHaveBeenCalledWith({
      type: 'not-available',
      data: '当前已是最新版本',
    })
  })
})
