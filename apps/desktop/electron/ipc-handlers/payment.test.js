import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const { ERROR } = require('../core/error-codes')

const TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }

describe('payment IPC 打包安全合同', () => {
  let dataDir
  let handlers
  let originalGetPath
  let originalPackaged
  let originalNodeEnv
  let originalElectronIsDev

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-payment-ipc-'))
    handlers = {}
    originalGetPath = __electronMock.app.getPath
    originalPackaged = __electronMock.app.isPackaged
    originalNodeEnv = process.env.NODE_ENV
    originalElectronIsDev = process.env.ELECTRON_IS_DEV

    __enableElectronMock()
    __electronMock.app.getPath = () => dataDir
    delete require.cache[require.resolve('../services/payment-manager')]
    delete require.cache[require.resolve('./payment')]
    require('./payment')({
      handle(channel, handler) {
        handlers[channel] = handler
      },
    }, {})
  })

  afterEach(() => {
    __electronMock.app.getPath = originalGetPath
    __electronMock.app.isPackaged = originalPackaged
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalElectronIsDev === undefined) delete process.env.ELECTRON_IS_DEV
    else process.env.ELECTRON_IS_DEV = originalElectronIsDev
    __disableElectronMock()
    fs.rmSync(dataDir, { recursive: true, force: true })
    delete require.cache[require.resolve('../services/payment-manager')]
    delete require.cache[require.resolve('./payment')]
  })

  it.each([
    ['未设置环境变量', () => {
      delete process.env.NODE_ENV
      delete process.env.ELECTRON_IS_DEV
    }],
    ['残留开发环境变量', () => {
      process.env.NODE_ENV = 'development'
      process.env.ELECTRON_IS_DEV = '1'
    }],
  ])('打包应用在%s时仍拒绝模拟支付', async (_, configureEnvironment) => {
    __electronMock.app.isPackaged = true
    configureEnvironment()

    await expect(handlers['payment:simulate'](TRUSTED_EVENT, { orderId: 'missing-order' }))
      .resolves.toEqual({ code: ERROR.REQUEST_ERROR, message: '模拟支付在生产环境禁用' })
  })

  it('未打包应用不依赖 NODE_ENV 启用模拟支付入口', async () => {
    __electronMock.app.isPackaged = false
    process.env.NODE_ENV = 'production'

    await expect(handlers['payment:simulate'](TRUSTED_EVENT, { orderId: 'missing-order' }))
      .resolves.toEqual({ code: ERROR.REQUEST_ERROR, data: false, message: '模拟支付失败' })
  })
})
