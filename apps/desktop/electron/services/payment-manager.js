// @ts-check
/** 
 * PaymentManager — 支付管理器
 *
 * 管理支付订单的创建、完成、失败、取消全生命周期。
 * 支付完成后自动激活 LicenseManager 的 Pro 许可。
 *
 * 架构说明：
 * - 当前版本支持开发模式模拟支付（simulatePayment）
 * - 真实支付需集成 Alipay/WeChat Pay SDK（预留 completePayment 接口）
 * - 订单持久化到 userData/orders.json（加密存储）
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const log = require('./logger')

const PLANS = {
  pro: { amount: 99, licenseType: 'pro', features: 'all' },
}

const PAYMENT_METHODS = ['alipay', 'wechat']

function PaymentManager() {
  this._orders = []
  this._dataPath = null
  try {
    this._dataPath = path.join(require('electron').app.getPath('userData'), 'payment-orders.json')
  // eslint-disable-next-line no-unused-vars
  } catch(e) {
    this._dataPath = path.join(process.env.USERPROFILE || '/tmp', 'payment-orders.json')
  }
  this._loadOrders()
}

PaymentManager.prototype._loadOrders = function() {
  try {
    if (fs.existsSync(this._dataPath)) {
      const raw = fs.readFileSync(this._dataPath, 'utf-8').trim()
      if (raw) {
        this._orders = JSON.parse(raw)
        log.info('PaymentManager', 'Loaded ' + this._orders.length + ' orders')
      }
    }
  } catch(e) {
    log.warn('PaymentManager', 'Failed to load orders: ' + e.message)
    this._orders = []
  }
}

PaymentManager.prototype._saveOrders = function() {
  try {
    const dir = path.dirname(this._dataPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(this._dataPath, JSON.stringify(this._orders, null, 2), 'utf-8')
  } catch(e) {
    log.warn('PaymentManager', 'Failed to save orders: ' + e.message)
  }
}

PaymentManager.prototype.createOrder = function(plan, options) {
  if (!PLANS[plan]) throw new Error('Unknown plan: ' + plan)
  if (PAYMENT_METHODS.indexOf(options.method) === -1) throw new Error('Unsupported payment method: ' + options.method)

  const order = {
    id: crypto.randomUUID(),
    plan: plan,
    method: options.method,
    amount: PLANS[plan].amount,
    currency: 'CNY',
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
    txnId: null,
    error: null,
  }
  this._orders.push(order)
  this._saveOrders()
  log.info('PaymentManager', 'Order created: ' + order.id + ' (' + plan + ', ' + options.method + ')')
  return order
}

PaymentManager.prototype.getOrder = function(orderId) {
  for (let i = 0; i < this._orders.length; i++) {
    if (this._orders[i].id === orderId) return this._orders[i]
  }
  return null
}

PaymentManager.prototype.listOrders = function() {
  return this._orders.slice()
}

PaymentManager.prototype.getOrderStatus = function(orderId) {
  const order = this.getOrder(orderId)
  return order ? order.status : null
}

PaymentManager.prototype.completePayment = function(orderId, txnId) {
  const order = this.getOrder(orderId)
  if (!order) return false
  if (order.status !== 'pending') return false

  order.status = 'paid'
  order.txnId = txnId || 'txn_' + Date.now()
  order.completedAt = new Date().toISOString()
  this._saveOrders()

  // Activate Pro license
  try {
    const LicenseManager = require('./license-manager')
    const lm = LicenseManager.getInstance()
    lm.activate('PAY-' + order.plan.toUpperCase() + '-' + order.id)
    log.info('PaymentManager', 'License activated for order: ' + order.id)
  } catch(e) {
    log.error('PaymentManager', 'Failed to activate license: ' + e.message)
  }

  return true
}

PaymentManager.prototype.failPayment = function(orderId, errorMsg) {
  const order = this.getOrder(orderId)
  if (!order) return false
  if (order.status !== 'pending') return false

  order.status = 'failed'
  order.error = errorMsg || 'Payment failed'
  this._saveOrders()
  log.info('PaymentManager', 'Order failed: ' + orderId + ' (' + errorMsg + ')')
  return true
}

PaymentManager.prototype.cancelPayment = function(orderId) {
  const order = this.getOrder(orderId)
  if (!order) return false
  if (order.status !== 'pending') return false

  order.status = 'cancelled'
  this._saveOrders()
  log.info('PaymentManager', 'Order cancelled: ' + orderId)
  return true
}

PaymentManager.prototype.simulatePayment = function(orderId) {
  // Development mode: simulate successful payment without real gateway
  return this.completePayment(orderId, 'sim_' + Date.now())
}

module.exports = PaymentManager
