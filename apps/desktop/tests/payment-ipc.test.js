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

__registerMock('../electron/logger', { info: vi.fn(), error: vi.fn(), warn: vi.fn() })

var mockIpcMain = { handle: vi.fn() }
var registerHandlers = require('../electron/ipc-handlers/payment')

describe('Payment IPC handlers', function() {
  beforeEach(function() {
    vi.clearAllMocks()
    registerHandlers(mockIpcMain, {})
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
    var result = await handler(null, { plan: 'pro', method: 'alipay' })
    expect(mockCreateOrder).toHaveBeenCalledWith('pro', { method: 'alipay' })
    expect(result.code).toBe(0)
    expect(result.data.id).toBe('order-1')
  })

  test('payment:simulate handler completes payment', async function() {
    var handler = mockIpcMain.handle.mock.calls.find(function(c) { return c[0] === 'payment:simulate' })[1]
    mockSimulatePayment.mockReturnValue(true)
    var result = await handler(null, { orderId: 'order-1' })
    expect(mockSimulatePayment).toHaveBeenCalledWith('order-1')
    expect(result.code).toBe(0)
  })
})
