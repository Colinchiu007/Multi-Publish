// @ts-check
/**
 * IPC 来源校验核心模块测试
 *
 * 目标：sender 来源判断不依赖 bootstrap 或 ipc-handlers，避免安全工具层形成循环依赖。
 */
import { describe, it, expect } from 'vitest'

const { isTrustedSender } = require('./ipc-security')

function makeEvent (url) {
  return { senderFrame: { url } }
}

const mockApp = { isPackaged: false }
const mockAppPackaged = { isPackaged: true }

describe('ipc-security — isTrustedSender', () => {
  it('信任 app:// 协议', () => {
    expect(isTrustedSender(makeEvent('app://localhost/index.html'), mockAppPackaged)).toBe(true)
  })

  it('信任 file:// 协议', () => {
    expect(isTrustedSender(makeEvent('file:///C:/app/index.html'), mockAppPackaged)).toBe(true)
  })

  it('开发环境信任 localhost / 127.0.0.1', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockApp)).toBe(true)
    expect(isTrustedSender(makeEvent('http://127.0.0.1:5173/'), mockApp)).toBe(true)
  })

  it('打包环境不信任 localhost', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockAppPackaged)).toBe(false)
  })

  it('拒绝外部站点与无效 event', () => {
    expect(isTrustedSender(makeEvent('https://evil.com/'), mockApp)).toBe(false)
    expect(isTrustedSender(null, mockApp)).toBe(false)
    expect(isTrustedSender({}, mockApp)).toBe(false)
    expect(isTrustedSender({ senderFrame: { url: '' } }, mockApp)).toBe(false)
  })
})
