/**
 * PaymentManager unit tests
 *
 * 注意：用 __registerMock 替代 vi.mock，因为 vitest 4 下 vi.mock 的 factory
 * 对 CJS require 不生效。__registerMock 拦截 Module.prototype.require，与 CJS 完全兼容。
 */
var mockActivate = vi.fn().mockReturnValue(true)
var mockGetInfo = vi.fn().mockReturnValue({ type: 'free', isPro: false })

__enableElectronMock()

__registerMock('fs', {
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
})

__registerMock('../electron/logger', {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
})

var PaymentManager = require('../electron/payment-manager')

describe('PaymentManager', function() {
  var pm

  beforeEach(function() {
    vi.clearAllMocks()
    pm = new PaymentManager()
  })

  test('creates order with correct fields', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    expect(order.id).toBeDefined()
    expect(order.plan).toBe('pro')
    expect(order.method).toBe('alipay')
    expect(order.amount).toBe(99)
    expect(order.status).toBe('pending')
    expect(order.createdAt).toBeDefined()
  })

  test('creates order with wechat method', function() {
    var order = pm.createOrder('pro', { method: 'wechat' })
    expect(order.method).toBe('wechat')
    expect(order.amount).toBe(99)
  })

  test('lists all orders', function() {
    pm.createOrder('pro', { method: 'alipay' })
    pm.createOrder('pro', { method: 'wechat' })
    var orders = pm.listOrders()
    expect(orders.length).toBe(2)
  })

  test('getOrder returns order by id', function() {
    var created = pm.createOrder('pro', { method: 'alipay' })
    var found = pm.getOrder(created.id)
    expect(found).toBeDefined()
    expect(found.id).toBe(created.id)
  })

  test('getOrder returns null for unknown id', function() {
    expect(pm.getOrder('nonexistent')).toBeNull()
  })

  test('completePayment marks order as paid and activates license', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    var result = pm.completePayment(order.id, 'txn_alipay_001')
    expect(result).toBe(true)
    var updated = pm.getOrder(order.id)
    expect(updated.status).toBe('paid')
    expect(updated.txnId).toBe('txn_alipay_001')
    expect(updated.completedAt).toBeDefined()
  })

  test('completePayment returns false for unknown order', function() {
    expect(pm.completePayment('nonexistent', 'txn')).toBe(false)
  })

  test('completePayment returns false for already completed order', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    pm.completePayment(order.id, 'txn1')
    expect(pm.completePayment(order.id, 'txn2')).toBe(false)
  })

  test('failPayment marks order as failed', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    pm.failPayment(order.id, '余额不足')
    var updated = pm.getOrder(order.id)
    expect(updated.status).toBe('failed')
    expect(updated.error).toBe('余额不足')
  })

  test('cancelPayment cancels a pending order', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    pm.cancelPayment(order.id)
    var updated = pm.getOrder(order.id)
    expect(updated.status).toBe('cancelled')
  })

  test('cancelPayment returns false for non-pending orders', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    pm.completePayment(order.id, 'txn')
    expect(pm.cancelPayment(order.id)).toBe(false)
  })

  test('getOrderStatus returns status string', function() {
    var order = pm.createOrder('pro', { method: 'alipay' })
    expect(pm.getOrderStatus(order.id)).toBe('pending')
    pm.completePayment(order.id, 'txn')
    expect(pm.getOrderStatus(order.id)).toBe('paid')
  })

  test('getOrderStatus returns null for unknown order', function() {
    expect(pm.getOrderStatus('nonexistent')).toBeNull()
  })

  test('simulatePayment completes a pending order', function() {
    var order = pm.createOrder('pro', { method: 'wechat' })
    expect(pm.getOrderStatus(order.id)).toBe('pending')
    var result = pm.simulatePayment(order.id)
    expect(result).toBe(true)
    expect(pm.getOrderStatus(order.id)).toBe('paid')
  })
})
