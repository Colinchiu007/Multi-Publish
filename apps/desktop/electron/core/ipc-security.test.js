// @ts-check
/**
 * IPC 来源校验核心模块测试
 *
 * 目标：sender 来源判断不依赖 bootstrap 或 ipc-handlers，避免安全工具层形成循环依赖。
 */
import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const { isTrustedSender } = require('./ipc-security')

function makeEvent (url) {
  return { senderFrame: { url } }
}

const mockApp = { isPackaged: false }
const appRoot = path.resolve(__dirname, '../..')
const mockAppPackaged = { isPackaged: true, getAppPath: () => appRoot }
const allowedEntryUrl = pathToFileURL(path.join(appRoot, 'dist/index.html')).href
const allowedAssetUrl = pathToFileURL(path.join(appRoot, 'dist/assets/app.js')).href

let previousDevServerPort

beforeEach(() => {
  previousDevServerPort = process.env.DEV_SERVER_PORT
  process.env.DEV_SERVER_PORT = '5174'
})

afterEach(() => {
  if (previousDevServerPort === undefined) delete process.env.DEV_SERVER_PORT
  else process.env.DEV_SERVER_PORT = previousDevServerPort
})

describe('ipc-security — isTrustedSender', () => {
  it('信任 app:// 协议', () => {
    expect(isTrustedSender(makeEvent('app://localhost/index.html'), mockAppPackaged)).toBe(true)
  })

  it('仅信任应用 dist 目录内的 file URL', () => {
    expect(isTrustedSender(makeEvent(allowedEntryUrl), mockAppPackaged)).toBe(true)
    expect(isTrustedSender(makeEvent(allowedAssetUrl), mockAppPackaged)).toBe(true)
    expect(isTrustedSender(makeEvent('file:///C:/app/index.html'), mockAppPackaged)).toBe(false)
    expect(isTrustedSender(
      makeEvent(pathToFileURL(path.join(appRoot, 'dist-evil/index.html')).href),
      mockAppPackaged,
    )).toBe(false)
  })

  it('开发环境仅信任 localhost / 127.0.0.1 的配置端口', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5174/'), mockApp)).toBe(true)
    expect(isTrustedSender(makeEvent('http://127.0.0.1:5174/'), mockApp)).toBe(true)
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockApp)).toBe(false)
    expect(isTrustedSender(makeEvent('http://localhost/'), mockApp)).toBe(false)
  })

  it('拒绝 localhost 前缀绕过和 app 协议伪造', () => {
    expect(isTrustedSender(makeEvent('http://localhost.evil.example:5174/'), mockApp)).toBe(false)
    expect(isTrustedSender(makeEvent('http://127.0.0.1.evil.example:5174/'), mockApp)).toBe(false)
    expect(isTrustedSender(makeEvent('app://localhost.evil.example/index.html'), mockAppPackaged)).toBe(false)
    expect(isTrustedSender(makeEvent('app://localhost:5174/index.html'), mockAppPackaged)).toBe(false)
  })

  it('打包环境不信任 localhost', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockAppPackaged)).toBe(false)
  })

  it('打包状态优先于异常的 development 环境变量', () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      expect(isTrustedSender(makeEvent('http://localhost:5174/'), mockAppPackaged)).toBe(false)
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  })

  it('app 未明确声明未打包时不能隐式信任开发服务器', () => {
    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      expect(isTrustedSender(makeEvent('http://localhost:5174/'), {})).toBe(false)
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNodeEnv
    }
  })

  it('拒绝外部站点与无效 event', () => {
    expect(isTrustedSender(makeEvent('https://evil.com/'), mockApp)).toBe(false)
    expect(isTrustedSender(makeEvent('not a valid url'), mockApp)).toBe(false)
    expect(isTrustedSender(null, mockApp)).toBe(false)
    expect(isTrustedSender({}, mockApp)).toBe(false)
    expect(isTrustedSender({ senderFrame: { url: '' } }, mockApp)).toBe(false)
  })
})
