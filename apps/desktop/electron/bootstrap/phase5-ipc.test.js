// @ts-check
/**
 * Phase5-IPC P1-B 回归测试：IPC sender 来源验证
 *
 * 验证：
 *   - 可信来源（app://, file://, dev localhost）正常处理
 *   - 不可信来源（https://evil.com）返回默认值不处理
 *   - event.senderFrame 缺失时返回 false（防呆）
 */
__enableElectronMock()

// Mock logger
__registerMock('../services/logger', {
  info: () => {},
  warn: () => {},
  error: () => {},
})

// Mock ipc-handlers/index（registerAllHandlers 不实际执行）
__registerMock('../ipc-handlers', () => {})

const { isTrustedSender } = require('./phase5-ipc')

describe('P1-B: isTrustedSender', () => {
  const mockApp = { isPackaged: false }
  const mockAppPackaged = { isPackaged: true }

  function makeEvent(url) {
    return { senderFrame: { url } }
  }

  it('accepts app:// protocol (production)', () => {
    expect(isTrustedSender(makeEvent('app://localhost/index.html'), mockAppPackaged)).toBe(true)
  })

  it('accepts file:// protocol', () => {
    expect(isTrustedSender(makeEvent('file:///C:/app/index.html'), mockAppPackaged)).toBe(true)
  })

  it('accepts http://localhost in dev mode', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockApp)).toBe(true)
  })

  it('accepts http://127.0.0.1 in dev mode', () => {
    expect(isTrustedSender(makeEvent('http://127.0.0.1:5173/'), mockApp)).toBe(true)
  })

  it('rejects http://localhost in production (app.isPackaged=true)', () => {
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), mockAppPackaged)).toBe(false)
  })

  it('rejects https://evil.com (untrusted origin)', () => {
    expect(isTrustedSender(makeEvent('https://evil.com/'), mockApp)).toBe(false)
  })

  it('rejects https://evil.com in production', () => {
    expect(isTrustedSender(makeEvent('https://evil.com/'), mockAppPackaged)).toBe(false)
  })

  it('rejects when event is null/undefined', () => {
    expect(isTrustedSender(null, mockApp)).toBe(false)
    expect(isTrustedSender(undefined, mockApp)).toBe(false)
  })

  it('rejects when senderFrame is missing', () => {
    expect(isTrustedSender({}, mockApp)).toBe(false)
    expect(isTrustedSender({ senderFrame: null }, mockApp)).toBe(false)
  })

  it('rejects when url is empty', () => {
    expect(isTrustedSender({ senderFrame: { url: '' } }, mockApp)).toBe(false)
    expect(isTrustedSender({ senderFrame: { url: null } }, mockApp)).toBe(false)
  })

  it('rejects when app is null (defensive)', () => {
    // 即使 app 为 null，app:// 和 file:// 仍应通过（不依赖 app.isPackaged）
    expect(isTrustedSender(makeEvent('app://localhost/'), null)).toBe(true)
    expect(isTrustedSender(makeEvent('file:///app/'), null)).toBe(true)
    // 但 dev localhost 需要 app，app 为 null 时不应通过
    expect(isTrustedSender(makeEvent('http://localhost:5173/'), null)).toBe(false)
  })
})
