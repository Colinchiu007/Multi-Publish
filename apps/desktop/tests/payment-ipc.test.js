/**
 * Payment IPC handlers tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 * 修正：原 vi.mock 路径 '../electron/payment-manager' 错误，payment.js 实际 require 的是 '../services/payment-manager'。
 */
var mockCreateOrder = vi.fn()
var mockGetOrder = vi.fn()
var mockCompletePayment = vi.fn()
var mockSimulatePayment = vi.fn()
var mockListOrders = vi.fn()
var TRUSTED_EVENT = { senderFrame: { url: 'app://localhost/index.html' } }
var UNTRUSTED_EVENT = { senderFrame: { url: 'https://evil.example/' } }

__registerMock('../services/payment-manager', vi.fn().mockImplementation(function() {
  return {
    createOrder: mockCreateOrder,
    getOrder: mockGetOrder,
    completePayment: mockCompletePayment,
    simulatePayment: mockSimulatePayment,
    listOrders: mockListOrders,
    getOrderStatus: vi.fn(),
    cancelPayment: vi.fn(),
  }
}))

__registerMock('./logger', { info: vi.fn(), error: vi.fn(), warn: vi.fn() })

var mockIpcMain = { handle: vi.fn() }
var registerHandlers = require('../electron/ipc-handlers/payment')

describe('Payment IPC handlers', function() {
  var originalPackaged

  beforeEach(function() {
    vi.clearAllMocks()
    originalPackaged = __electronMock.app.isPackaged
    __enableElectronMock()
    __electronMock.app.isPackaged = false
    registerHandlers(mockIpcMain, {})
  })

  afterEach(function() {
    __electronMock.app.isPackaged = originalPackaged
    __disableElectronMock()
  })

  test('registers all payment handlers', function() {
    var handlerNames = mockIpcMain.handle.mock.calls.map(function(c) { return c[0] })
    expect(handlerNames).toContain('payment:create-order')
    expect(handlerNames).toContain('payment:list-orders')
    expect(handlerNames).toContain('payment:get-order')
    expect(handlerNames).toContain('payment:complete')
    expect(handlerNames).toContain('payment:simulate')
    expect(handlerNames).toContain('payment:cancel')
  })

  test('payment:create-order handler creates order', async function() {
    var handler = mockIpcMain.handle.mock.calls.find(function(c) { return c[0] === 'payment:create-order' })[1]
    mockCreateOrder.mockReturnValue({ id: 'order-1', plan: 'pro', amount: 99, method: 'alipay', status: 'pending' })
    var result = await handler(TRUSTED_EVENT, { plan: 'pro', method: 'alipay' })
    expect(mockCreateOrder).toHaveBeenCalledWith('pro', { method: 'alipay' })
    expect(result.code).toBe(0)
    expect(result.data.id).toBe('order-1')
  })

  test('payment:simulate handler completes payment', async function() {
    var handler = mockIpcMain.handle.mock.calls.find(function(c) { return c[0] === 'payment:simulate' })[1]
    mockSimulatePayment.mockReturnValue(true)
    var result = await handler(TRUSTED_EVENT, { orderId: 'order-1' })
    expect(mockSimulatePayment).toHaveBeenCalledWith('order-1')
    expect(result.code).toBe(0)
  })

  test('payment:create-order rejects untrusted senders without creating an order', async function() {
    var handler = mockIpcMain.handle.mock.calls.find(function(c) { return c[0] === 'payment:create-order' })[1]
    var result = await handler(UNTRUSTED_EVENT, { plan: 'pro', method: 'alipay' })
    expect(result).toEqual({ code: -3, message: '未授权的调用来源' })
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })

  // 2026-10-07 新增：上面那个 beforeEach 把 app.isPackaged 钉死为 false，
  // 于是 payment.js 里 `if (!app || app.isPackaged !== false)` 这条
  // **生产拦截分支从未被任何测试执行过**——删掉它本文件依然全绿。
  // 这一块锁住该分支。app.isPackaged 在 handler 调用时求值（不是注册时），
  // 所以改属性即可生效，无需重新 registerHandlers。
  describe('payment:simulate 生产拦截', function() {
    var simulateHandler

    beforeEach(function() {
      simulateHandler = mockIpcMain.handle.mock.calls.find(function(c) {
        return c[0] === 'payment:simulate'
      })[1]
      mockSimulatePayment.mockReturnValue(true)
    })

    test('打包态（isPackaged=true）拒收，且不触碰支付服务', async function() {
      __electronMock.app.isPackaged = true
      var result = await simulateHandler(TRUSTED_EVENT, { orderId: 'order-1' })
      expect(result.code).not.toBe(0)
      expect(result.message).toBe('模拟支付在生产环境禁用')
      expect(mockSimulatePayment).not.toHaveBeenCalled()
    })

    test('只有明确 false 才放行——undefined 同样拒收', async function() {
      // `app.isPackaged !== false` 是严格不等：undefined 不等于 false，
      // 属于「非明确开发态」，必须拒收。写成 `if (app.isPackaged)` 会漏掉这一档。
      __electronMock.app.isPackaged = undefined
      var result = await simulateHandler(TRUSTED_EVENT, { orderId: 'order-1' })
      expect(result.code).not.toBe(0)
      expect(mockSimulatePayment).not.toHaveBeenCalled()
    })

    test('生产拦截优先于参数校验：orderId 合法也照样拒收', async function() {
      // 若把参数校验挪到拦截之前，非法 orderId 会先返回「缺少 orderId」，
      // 生产态反而暴露了参数校验的存在。锁定顺序。
      __electronMock.app.isPackaged = true
      var result = await simulateHandler(TRUSTED_EVENT, { orderId: 'order-1' })
      expect(result.message).toBe('模拟支付在生产环境禁用')
      expect(result.message).not.toContain('orderId')
    })

    test('开发态（isPackaged=false）仍然放行——确认拦截不是恒真', async function() {
      // 防「恒绿」：把拦截写成永远 return，测试也必须能靠这一条变红。
      __electronMock.app.isPackaged = false
      var result = await simulateHandler(TRUSTED_EVENT, { orderId: 'order-1' })
      expect(mockSimulatePayment).toHaveBeenCalledWith('order-1')
      expect(result.code).toBe(0)
    })
  })
})
