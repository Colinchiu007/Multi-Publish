import { beforeEach, describe, expect, it, vi } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

__enableElectronMock()

const log = require('../services/logger')
const { EC, wrapIpcHandler, wrapIpcHandlerRaw, withSenderCheck } = require('./helpers')
const errorSpy = vi.spyOn(log, 'error').mockImplementation(() => {})
const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {})

function restoreNodeEnv(value) {
  if (value === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = value
}

describe('ipc-handlers/helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('wrapIpcHandler 包装成功结果并透传参数', async () => {
    const inner = vi.fn(async (_, args) => args.value * 2)

    await expect(wrapIpcHandler(inner)({}, { value: 3 })).resolves.toEqual({
      code: EC.SUCCESS,
      data: 6,
    })
    expect(inner).toHaveBeenCalledWith({}, { value: 3 })
  })

  it.each([undefined, null, '', 1])('wrapIpcHandler 拒绝非对象参数 %#', async (args) => {
    const inner = vi.fn()

    await expect(wrapIpcHandler(inner, { requireArgs: true })({}, args)).resolves.toEqual({
      code: EC.VALIDATION_ERROR,
      message: '缺少参数对象',
    })
    expect(inner).not.toHaveBeenCalled()
  })

  it('wrapIpcHandler 将 Error 转为稳定错误 envelope', async () => {
    const handler = wrapIpcHandler(async () => { throw new Error('服务不可用') }, { label: 'demo' })

    await expect(handler({}, {})).resolves.toEqual({ code: EC.REQUEST_ERROR, message: '服务不可用' })
    expect(errorSpy).toHaveBeenCalledWith('[IPC] demo', '服务不可用')
  })

  it('wrapIpcHandler 兼容非 Error 抛出值', async () => {
    const handler = wrapIpcHandler(async () => { throw '字符串错误' })

    await expect(handler({}, {})).resolves.toEqual({ code: EC.REQUEST_ERROR, message: '字符串错误' })
  })

  it('wrapIpcHandlerRaw 保留原始成功响应', async () => {
    const response = { code: 0, data: ['a'] }

    await expect(wrapIpcHandlerRaw(async () => response)({}, {})).resolves.toBe(response)
  })

  it('wrapIpcHandlerRaw 在异常时按配置附加独立的兜底 data', async () => {
    const fallback = []
    const handler = wrapIpcHandlerRaw(async () => { throw new Error('读取失败') }, {
      label: 'list',
      catchData: fallback,
    })

    await expect(handler({}, {})).resolves.toEqual({
      code: EC.REQUEST_ERROR,
      message: '读取失败',
      data: fallback,
    })
  })

  it('withSenderCheck 放行可信协议并拒绝外部来源', async () => {
    const inner = vi.fn(async (_, args) => ({ code: 0, data: args }))
    const handler = withSenderCheck(inner)

    await expect(handler({ senderFrame: { url: 'app://localhost/index.html' } }, { id: 1 }))
      .resolves.toEqual({ code: 0, data: { id: 1 } })
    await expect(handler({ senderFrame: { url: 'https://evil.example/' } }, { id: 2 }))
      .resolves.toEqual({ code: EC.AUTH_ERROR, message: '未授权的调用来源' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('withSenderCheck 在未设置 NODE_ENV 的未打包应用中放行开发服务器', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalIsPackaged = __electronMock.app.isPackaged
    delete process.env.NODE_ENV
    __electronMock.app.isPackaged = false
    const inner = vi.fn(async () => ({ code: EC.SUCCESS }))

    try {
      await expect(withSenderCheck(inner)({
        senderFrame: { url: 'http://localhost:5174/#/accounts' },
      }, {})).resolves.toEqual({ code: EC.SUCCESS })
      expect(inner).toHaveBeenCalledTimes(1)
    } finally {
      restoreNodeEnv(originalNodeEnv)
      __electronMock.app.isPackaged = originalIsPackaged
    }
  })

  it('withSenderCheck 在已打包应用中仍拒绝 localhost 来源', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalIsPackaged = __electronMock.app.isPackaged
    process.env.NODE_ENV = 'production'
    __electronMock.app.isPackaged = true
    const inner = vi.fn(async () => ({ code: EC.SUCCESS }))

    try {
      await expect(withSenderCheck(inner)({
        senderFrame: { url: 'http://localhost:5174/' },
      }, {})).resolves.toEqual({ code: EC.AUTH_ERROR, message: '未授权的调用来源' })
      expect(inner).not.toHaveBeenCalled()
    } finally {
      restoreNodeEnv(originalNodeEnv)
      __electronMock.app.isPackaged = originalIsPackaged
    }
  })

  it('withSenderCheck 在测试环境也拒绝前缀绕过和任意 file URL', async () => {
    const inner = vi.fn(async () => ({ code: 0 }))
    const handler = withSenderCheck(inner)

    await expect(handler({
      senderFrame: { url: 'http://localhost.evil.example:5174/' },
    }, {})).resolves.toEqual({ code: EC.AUTH_ERROR, message: '未授权的调用来源' })
    await expect(handler({
      senderFrame: { url: pathToFileURL(path.resolve('outside/index.html')).href },
    }, {})).resolves.toEqual({ code: EC.AUTH_ERROR, message: '未授权的调用来源' })
    expect(inner).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('withSenderCheck 仅在测试环境兼容没有 senderFrame 的旧 mock', async () => {
    const inner = vi.fn(async () => ({ code: 0 }))

    await expect(withSenderCheck(inner)({}, {})).resolves.toEqual({ code: 0 })
    expect(inner).toHaveBeenCalledTimes(1)
  })
})
