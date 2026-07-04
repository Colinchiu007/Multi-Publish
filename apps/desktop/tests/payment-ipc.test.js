/** 
 * Payment IPC handlers tests
 */
jest.mock('../electron/payment-manager')

var mockCreateOrder = jest.fn()
var mockGetOrder = jest.fn()
var mockCompletePayment = jest.fn()
var mockSimulatePayment = jest.fn()
var mockListOrders = jest.fn()

jest.mock('../electron/payment-manager', function() {
  return jest.fn().mockImplementation(function() {
    return {
      createOrder: mockCreateOrder,
      getOrder: mockGetOrder,
      completePayment: mockCompletePayment,
      simulatePayment: mockSimulatePayment,
      listOrders: mockListOrders,
      getOrderStatus: jest.fn(),
      cancelPayment: jest.fn(),
    }
  })
})

jest.mock('../electron/logger', function() {
  return { info: jest.fn(), error: jest.fn(), warn: jest.fn() }
})

var mockIpcMain = { handle: jest.fn() }
var registerHandlers = require('../electron/ipc-handlers/payment')

describe('Payment IPC handlers', function() {
  beforeEach(function() {
    jest.clearAllMocks()
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
