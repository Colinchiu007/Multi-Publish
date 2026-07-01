/**
 * IPC handlers 单元测试
 * 验证 handler 文件能正确加载并注册
 */
const registerHandlers = require('../electron/ipc-handlers/index')

describe('IPC Handlers', () => {
  let mockIpcMain, handlers

  beforeEach(() => {
    handlers = {}
    mockIpcMain = { handle: (channel, fn) => { handlers[channel] = fn } }
    registerHandlers(mockIpcMain, {
      BrowserWindow: require('electron'),
      store: { listAccounts: () => [], getSetting: () => null },
      renderEngine: { render: async () => ({}), cancel: () => {}, getStatus: () => ({}) },
      taskQueue: { add: () => 'task-1', getStatus: () => ({}), getHistory: () => [], cancel: () => {} },
      proxyPool: {},
      analyticsService: {},
    })
  })

  it('registers store handlers', () => {
    expect(handlers['store:get-setting']).toBeDefined()
    expect(handlers['store:add-account']).toBeDefined()
    expect(handlers['store:list-accounts']).toBeDefined()
  })

  it('registers render handlers', () => {
    expect(handlers['render:start']).toBeDefined()
    expect(handlers['render:cancel']).toBeDefined()
    expect(handlers['render:status']).toBeDefined()
  })

  it('registers publish handlers', () => {
    expect(handlers['publish:wechat']).toBeDefined()
    expect(handlers['publish:batch']).toBeDefined()
    expect(handlers['queue:status']).toBeDefined()
  })

  it('registers account handlers', () => {
    expect(handlers['accounts:list']).toBeDefined()
  })

  it('renders module returns result', async () => {
    const result = await handlers['render:start']({ sender: { send: () => {} } }, { test: true })
    expect(result).toBeDefined()
  })
})
