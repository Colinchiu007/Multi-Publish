// @ts-check
/**
 * SystemTray IPC 安全合同测试
 *
 * @vitest-environment node
 */
__enableElectronMock()

const trayInstances = []
__electronMock.Tray = function MockTray () {
  this.setToolTip = vi.fn()
  this.setContextMenu = vi.fn()
  this.setImage = vi.fn()
  this.on = vi.fn(() => this)
  this.destroy = vi.fn()
  trayInstances.push(this)
}

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
__registerMock('./logger', mockLog)

const systemTray = require('./system-tray')

const TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }
const UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }

function createMainWindow () {
  return {
    on: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    isMinimized: vi.fn(() => false),
    webContents: { send: vi.fn() },
  }
}

describe('SystemTray IPC 安全合同', () => {
  let flashHandler
  let setIntervalSpy

  beforeEach(() => {
    vi.clearAllMocks()
    __resetElectronMock()
    trayInstances.length = 0
    systemTray.destroy()
    setIntervalSpy = vi.spyOn(global, 'setInterval').mockReturnValue({ unref: vi.fn() })
    systemTray.init(createMainWindow())
    systemTray.registerIpcHandlers()
    flashHandler = __electronMock.ipcMain._handlers['tray:flash']
  })

  afterEach(() => {
    systemTray.destroy()
    setIntervalSpy.mockRestore()
  })

  it('不可信来源携带 null payload 时先拒绝且不抛异常', () => {
    expect(() => flashHandler(UNTRUSTED_EVENT, null)).not.toThrow()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('不可信来源携带合法 payload 时也不得触发闪烁', () => {
    flashHandler(UNTRUSTED_EVENT, { times: 2 })

    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it.each([null, 42, '3', true, []])(
    '可信来源携带非法 payload %j 时不产生闪烁副作用',
    (payload) => {
      expect(() => flashHandler(TRUSTED_EVENT, payload)).not.toThrow()
      expect(setIntervalSpy).not.toHaveBeenCalled()
    },
  )

  it.each([0, -1, 1.5, Number.NaN, '3'])(
    '可信来源携带非法 times %j 时不产生闪烁副作用',
    (times) => {
      expect(() => flashHandler(TRUSTED_EVENT, { times })).not.toThrow()
      expect(setIntervalSpy).not.toHaveBeenCalled()
    },
  )

  it('可信来源携带过大的 times 时不产生闪烁副作用', () => {
    expect(() => flashHandler(TRUSTED_EVENT, { times: 21 })).not.toThrow()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it.each([{}, { times: 1 }, { times: 20 }])(
    '可信来源携带合法次数 %j 时保持闪烁合同',
    (payload) => {
      flashHandler(TRUSTED_EVENT, payload)

      expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    },
  )

  it('可信来源省略 payload 时保持默认闪烁 3 次合同', () => {
    flashHandler(TRUSTED_EVENT)

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })

  it('不可信来源设置托盘提示时不抛异常', () => {
    const tooltipHandler = __electronMock.ipcMain._handlers['tray:set-tooltip']
    const trayInstance = trayInstances[0]
    trayInstance.setToolTip.mockClear()

    expect(() => tooltipHandler(UNTRUSTED_EVENT, 'blocked')).not.toThrow()
    expect(trayInstance.setToolTip).not.toHaveBeenCalled()
  })

  it.each([null, 42, 'x'.repeat(257)])(
    '可信来源携带非法 tooltip %j 时不产生副作用',
    (text) => {
      const tooltipHandler = __electronMock.ipcMain._handlers['tray:set-tooltip']
      const trayInstance = trayInstances[0]
      trayInstance.setToolTip.mockClear()

      tooltipHandler(TRUSTED_EVENT, text)

      expect(trayInstance.setToolTip).not.toHaveBeenCalled()
    },
  )

  it('可信来源携带合法 tooltip 时保持设置合同', () => {
    const tooltipHandler = __electronMock.ipcMain._handlers['tray:set-tooltip']
    const trayInstance = trayInstances[0]
    trayInstance.setToolTip.mockClear()

    tooltipHandler(TRUSTED_EVENT, '发布失败')

    expect(trayInstance.setToolTip).toHaveBeenCalledWith('发布失败')
  })

  it('可信来源携带 256 字符 tooltip 时保持边界合同', () => {
    const tooltipHandler = __electronMock.ipcMain._handlers['tray:set-tooltip']
    const trayInstance = trayInstances[0]
    const text = 'x'.repeat(256)
    trayInstance.setToolTip.mockClear()

    tooltipHandler(TRUSTED_EVENT, text)

    expect(trayInstance.setToolTip).toHaveBeenCalledWith(text)
  })

  it('可信来源携带合法 payload 时保持原闪烁合同', () => {
    flashHandler(TRUSTED_EVENT, { times: 2 })

    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
  })
})
