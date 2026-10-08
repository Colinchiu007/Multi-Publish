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

/**
 * 本地模拟订单的档位表（**不是定价权威源**）。
 *
 * ⚠️ 这里只认 `pro` 且是一次性 ¥99，与真正的定价体系脱节：
 *   - 权威源 `packages/api-publish-engine/src/auth/plan-matrix.js` 是
 *     free ¥0 / standard ¥59月 ¥499年 / **pro ¥79月 ¥699年**（三档订阅，`PLAN_MATRIX_VERSION=2026-10-08`）
 *   - `license-manager.activate()` 落库时写 `expiresAt = null`，即**买断**，
 *     全文件零订阅/续期概念
 *
 * PR #3003 只统一了 `plan-matrix.js` 与对外文档，这条下单→授权链未动。
 * 2026-10-07 起 `UpgradeModal.vue` 的购买入口在正式构建下不再渲染
 * （`purchaseAvailable = import.meta.env.DEV`），正式包用户创建不了订单；
 * 本表仅在开发态可达。
 *
 * **待办（需另立项）**：让本表与 `license-manager` 接入 `plan-matrix` 的
 * 订阅制——涉及金额来源、授权有效期校验与续期逻辑，不能顺手改。
 */
const PLANS = {
  pro: { amount: 99, licenseType: 'pro', features: 'all' },
}

const PAYMENT_METHODS = ['alipay', 'wechat']

function PaymentManager() {
  this._orders = []
  this._dataPath = null
  try {
    // 优先使用 Electron userData 目录（跨平台、用户隔离）
    this._dataPath = path.join(require('electron').app.getPath('userData'), 'payment-orders.json')
  // eslint-disable-next-line no-unused-vars
  } catch(e) {
    // 非 Electron 环境（如测试）：使用 os.homedir() 而非全局可读的 /tmp
    const os = require('os')
    const home = process.env.USERPROFILE || process.env.HOME || os.homedir()
    this._dataPath = path.join(home, '.multi-publish', 'payment-orders.json')
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
    // 安全：原子写（写临时文件后 rename），防止崩溃中断损坏订单文件
    const tmpPath = this._dataPath + '.tmp.' + process.pid
    fs.writeFileSync(tmpPath, JSON.stringify(this._orders, null, 2), 'utf-8')
    fs.renameSync(tmpPath, this._dataPath)
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
