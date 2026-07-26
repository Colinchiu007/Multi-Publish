// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  let listeners = new Map()
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
  const updater = {
    logger: console,
    autoDownload: true,
    autoInstallOnAppQuit: false,
    on: vi.fn((event, listener) => {
      const eventListeners = listeners.get(event) || []
      eventListeners.push(listener)
      listeners.set(event, eventListeners)
      return updater
    }),
    emit(event, ...args) {
      for (const listener of listeners.get(event) || []) listener(...args)
    },
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
  }

  function reset() {
    listeners = new Map()
    updater.logger = console
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = false
    updater.on.mockClear()
    updater.checkForUpdates.mockReset()
    updater.downloadUpdate.mockReset()
    updater.quitAndInstall.mockReset()
    Object.values(logger).forEach(mock => mock.mockReset())

    updater.on('error', error => {
      updater.logger.error(`Error: ${error.stack || error.message}`)
    })
  }

  return { logger, reset, updater }
})

describe('AutoUpdater 生产错误降级', () => {
  let autoUpdaterService
  let mainWindow
  let statuses
  let originalNodeEnv

  beforeEach(async () => {
    vi.resetModules()
    mocks.reset()
    __enableElectronMock()
    __registerMock('electron-updater', { autoUpdater: mocks.updater })
    __registerMock('./logger', mocks.logger)
    statuses = []
    originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'

    const imported = await import('./auto-updater')
    autoUpdaterService = imported.default || imported
    mainWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }
    autoUpdaterService.init(mainWindow, status => statuses.push(status))
  })

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    vi.restoreAllMocks()
  })

  it('latest.yml 404 事件静默降级且不写入 stderr', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Cannot find latest.yml in the latest release artifacts: HttpError: 404')

    mocks.updater.emit('error', error)

    expect(statuses.at(-1)).toEqual({ type: 'not-available', data: '当前已是最新版本' })
    expect(stderr).not.toHaveBeenCalled()
    expect(mocks.logger.error).not.toHaveBeenCalled()
  })

  it('检查更新的 latest.yml 404 Promise 也静默降级', async () => {
    mocks.updater.checkForUpdates.mockRejectedValue(
      new Error('Cannot find latest.yml in the latest release artifacts: HttpError: 404'),
    )

    autoUpdaterService.check()

    await vi.waitFor(() => {
      expect(statuses.at(-1)).toEqual({ type: 'not-available', data: '当前已是最新版本' })
    })
  })

  it('下载更新的网络阻断 Promise 静默降级', async () => {
    mocks.updater.downloadUpdate.mockRejectedValue(new Error('net::ERR_NAME_NOT_RESOLVED'))

    autoUpdaterService.download()

    await vi.waitFor(() => {
      expect(statuses.at(-1)).toEqual({ type: 'not-available', data: '当前已是最新版本' })
    })
  })

  it('非预期更新错误仍上报 UI 和应用日志', () => {
    const error = new Error('签名校验失败')

    mocks.updater.emit('error', error)

    expect(statuses.at(-1)).toEqual({ type: 'error', data: '签名校验失败' })
    expect(mocks.logger.error).toHaveBeenCalledWith(expect.stringContaining('签名校验失败'))
  })

  it('主窗口重建时复用全局监听器并将状态切换到新窗口', () => {
    const nextStatuses = []
    const nextWindow = {
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
    }

    autoUpdaterService.init(nextWindow, status => nextStatuses.push(status))
    mocks.updater.emit('checking-for-update')

    expect(mocks.updater.on).toHaveBeenCalledTimes(7)
    expect(mainWindow.webContents.send).not.toHaveBeenCalled()
    expect(statuses).toEqual([])
    expect(nextWindow.webContents.send).toHaveBeenCalledTimes(1)
    expect(nextWindow.webContents.send).toHaveBeenCalledWith(
      'update:status',
      { type: 'checking', data: '正在检查更新...' },
    )
    expect(nextStatuses).toEqual([{ type: 'checking', data: '正在检查更新...' }])
  })
})
