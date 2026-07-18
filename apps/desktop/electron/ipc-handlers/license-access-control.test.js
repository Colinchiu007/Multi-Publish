/**
 * 许可证动态权限回归测试
 *
 * 验证同一个已注册 IPC handler 不依赖窗口重载，始终读取最新许可证状态。
 */
import { afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const {
  createAccessControlledIpcMain,
  getAccessLevel,
  requiredLevelForChannel,
} = require('./license-access-control')

const trustedEvent = { senderFrame: { url: 'app://localhost/index.html' } }

function createIpcMainHarness() {
  const handlers = {}
  return {
    handlers,
    ipcMain: {
      handle(channel, handler) {
        handlers[channel] = handler
      },
    },
  }
}

describe('主进程许可证动态鉴权', () => {
  afterEach(() => {
    __disableElectronMock()
  })

  it('受限 IPC 在升级后立即放行，降级后立即拒绝', async () => {
    let isPro = false
    const licenseManager = { isPro: vi.fn(() => isPro) }
    const { ipcMain, handlers } = createIpcMainHarness()
    const controlledIpcMain = createAccessControlledIpcMain(
      ipcMain,
      licenseManager,
      { NODE_ENV: 'production' },
    )
    const publish = vi.fn(async () => ({ code: 0, data: '已发布' }))

    controlledIpcMain.handle('publish:wechat', publish)

    await expect(handlers['publish:wechat'](trustedEvent, { title: '免费版' }))
      .resolves.toMatchObject({ code: -3 })
    expect(publish).not.toHaveBeenCalled()

    isPro = true
    await expect(handlers['publish:wechat'](trustedEvent, { title: '专业版' }))
      .resolves.toEqual({ code: 0, data: '已发布' })
    expect(publish).toHaveBeenCalledTimes(1)

    isPro = false
    await expect(handlers['publish:wechat'](trustedEvent, { title: '已降级' }))
      .resolves.toMatchObject({ code: -3 })
    expect(publish).toHaveBeenCalledTimes(1)
    expect(licenseManager.isPro).toHaveBeenCalledTimes(3)
  })

  it('公开 IPC 不要求专业许可证', async () => {
    const licenseManager = { isPro: vi.fn(() => false) }
    const { ipcMain, handlers } = createIpcMainHarness()
    const controlledIpcMain = createAccessControlledIpcMain(
      ipcMain,
      licenseManager,
      { NODE_ENV: 'production' },
    )
    const getVersion = vi.fn(async () => '1.0.0')

    controlledIpcMain.handle('app:get-version', getVersion)

    await expect(handlers['app:get-version'](trustedEvent)).resolves.toBe('1.0.0')
    expect(getVersion).toHaveBeenCalledTimes(1)
    expect(licenseManager.isPro).not.toHaveBeenCalled()
  })

  it('访问级别每次查询都读取当前许可证状态', () => {
    let isPro = false
    const licenseManager = { isPro: vi.fn(() => isPro) }

    expect(getAccessLevel(licenseManager, { NODE_ENV: 'production' })).toBe('public')
    isPro = true
    expect(getAccessLevel(licenseManager, { NODE_ENV: 'production' })).toBe('authenticated')
    isPro = false
    expect(getAccessLevel(licenseManager, { NODE_ENV: 'production' })).toBe('public')
  })

  it('IPC 参数不能伪造许可证或访问级别', async () => {
    const licenseManager = { isPro: vi.fn(() => false) }
    const { ipcMain, handlers } = createIpcMainHarness()
    const controlledIpcMain = createAccessControlledIpcMain(
      ipcMain,
      licenseManager,
      { NODE_ENV: 'production' },
    )
    const publish = vi.fn(async () => ({ code: 0 }))

    controlledIpcMain.handle('publish:wechat', publish)

    await expect(handlers['publish:wechat'](trustedEvent, {
      accessLevel: 'admin',
      isPro: true,
      license: { isPro: true },
    })).resolves.toMatchObject({ code: -3 })
    expect(publish).not.toHaveBeenCalled()
  })

  it('专业许可证不能伪装成开发管理员权限', async () => {
    const licenseManager = { isPro: vi.fn(() => true) }
    const { ipcMain, handlers } = createIpcMainHarness()
    const controlledIpcMain = createAccessControlledIpcMain(
      ipcMain,
      licenseManager,
      { NODE_ENV: 'production' },
    )
    const completePayment = vi.fn(async () => ({ code: 0 }))

    controlledIpcMain.handle('payment:complete', completePayment)

    await expect(handlers['payment:complete'](trustedEvent, {
      accessLevel: 'admin',
    })).resolves.toMatchObject({ code: -3 })
    expect(completePayment).not.toHaveBeenCalled()
  })

  it.each([
    'payment:create-order',
    'payment:list-orders',
    'payment:get-order',
    'payment:cancel',
  ])('免费用户可调用升级订单通道 %s', (channel) => {
    expect(requiredLevelForChannel(channel)).toBe('public')
  })

  it.each([
    'payment:complete',
    'payment:simulate',
  ])('完成支付能力 %s 仍仅限管理员', (channel) => {
    expect(requiredLevelForChannel(channel)).toBe('admin')
  })

  it.each([
    { NODE_ENV: 'development' },
    { ELECTRON_IS_DEV: '1' },
  ])('打包应用不能通过环境变量获得管理员权限：%j', (env) => {
    const app = { isPackaged: true }
    const licenseManager = { isPro: vi.fn(() => false) }

    expect(getAccessLevel(licenseManager, env, app)).toBe('public')
  })

  it('打包应用中的专业许可证也只能获得 authenticated 权限', () => {
    const app = { isPackaged: true }
    const licenseManager = { isPro: vi.fn(() => true) }

    expect(getAccessLevel(licenseManager, { ELECTRON_IS_DEV: '1' }, app))
      .toBe('authenticated')
  })

  it('回装受控 handle 后不递归且仍动态读取许可证权限', async () => {
    let isPro = false
    const handlers = {}
    const ipcMain = {
      handle(channel, handler) {
        handlers[channel] = handler
      },
    }
    const controlledIpcMain = createAccessControlledIpcMain(
      ipcMain,
      { isPro: () => isPro },
      { NODE_ENV: 'production' },
      { isPackaged: true },
    )

    ipcMain.handle = controlledIpcMain.handle
    const publish = vi.fn(async () => ({ code: 0 }))
    expect(() => ipcMain.handle('publish:recursion-contract', publish)).not.toThrow()

    await expect(handlers['publish:recursion-contract'](trustedEvent))
      .resolves.toMatchObject({ code: -3 })
    isPro = true
    await expect(handlers['publish:recursion-contract'](trustedEvent))
      .resolves.toEqual({ code: 0 })
    isPro = false
    await expect(handlers['publish:recursion-contract'](trustedEvent))
      .resolves.toMatchObject({ code: -3 })
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('免费用户可通过真实支付依赖创建、查询并取消升级订单', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-payment-'))
    const originalGetPath = __electronMock.app.getPath
    __electronMock.app.getPath = () => dataDir
    __enableElectronMock()

    try {
      delete require.cache[require.resolve('../services/payment-manager')]
      delete require.cache[require.resolve('./payment')]

      const { ipcMain, handlers } = createIpcMainHarness()
      const controlledIpcMain = createAccessControlledIpcMain(
        ipcMain,
        { isPro: () => false },
        { NODE_ENV: 'production' },
        { isPackaged: true },
      )
      require('./payment')(controlledIpcMain, {})

      const created = await handlers['payment:create-order'](trustedEvent, {
        plan: 'pro',
        method: 'alipay',
      })
      expect(created).toMatchObject({
        code: 0,
        data: { amount: 99, method: 'alipay', status: 'pending' },
      })

      await expect(handlers['payment:list-orders'](trustedEvent))
        .resolves.toMatchObject({ code: 0, data: [{ id: created.data.id }] })
      await expect(handlers['payment:get-order'](trustedEvent, created.data.id))
        .resolves.toMatchObject({ code: 0, data: { status: 'pending' } })
      await expect(handlers['payment:cancel'](trustedEvent, created.data.id))
        .resolves.toMatchObject({ code: 0, data: true })
      await expect(handlers['payment:get-order'](trustedEvent, created.data.id))
        .resolves.toMatchObject({ code: 0, data: { status: 'cancelled' } })

      await expect(handlers['payment:complete'](trustedEvent, {
        orderId: created.data.id,
        txnId: 'forged',
      })).resolves.toMatchObject({ code: -3 })
      await expect(handlers['payment:simulate'](trustedEvent, {
        orderId: created.data.id,
      })).resolves.toMatchObject({ code: -3 })
    } finally {
      __electronMock.app.getPath = originalGetPath
      __disableElectronMock()
      fs.rmSync(dataDir, { recursive: true, force: true })
      delete require.cache[require.resolve('../services/payment-manager')]
      delete require.cache[require.resolve('./payment')]
    }
  })

  it('拒绝不可信来源，即使许可证有效或通道公开', async () => {
    const licenseManager = { isPro: vi.fn(() => true) }
    const { ipcMain, handlers } = createIpcMainHarness()
    const controlledIpcMain = createAccessControlledIpcMain(
      ipcMain,
      licenseManager,
      { NODE_ENV: 'production' },
    )
    const publish = vi.fn(async () => ({ code: 0 }))
    const getVersion = vi.fn(async () => '1.0.0')

    controlledIpcMain.handle('publish:wechat', publish)
    controlledIpcMain.handle('app:get-version', getVersion)

    const untrustedEvent = { senderFrame: { url: 'https://evil.example/' } }
    await expect(handlers['publish:wechat'](untrustedEvent, {}))
      .resolves.toMatchObject({ code: -3, message: '未授权的调用来源' })
    await expect(handlers['app:get-version'](untrustedEvent))
      .resolves.toMatchObject({ code: -3, message: '未授权的调用来源' })
    expect(publish).not.toHaveBeenCalled()
    expect(getVersion).not.toHaveBeenCalled()
  })

  it.each([
    'auth:open-qrcode-login',
    'auth:qrcode-close',
    'oauth:start',
    'oauth:close',
    'oauth:get-configs',
    'webview:set-layout',
    'webview:open-tab',
    'webview:close-tab',
    'webview:close-all',
    'webview:list-tabs',
  ])('preload 公开方法对应的 %s 通道也必须公开', (channel) => {
    expect(requiredLevelForChannel(channel)).toBe('public')
  })
})
