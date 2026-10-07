// @ts-check
/**
 * Payment IPC handlers
 * payment:create-order → 创建订单
 * payment:list-orders → 列出所有订单
 * payment:get-order  → 查询订单状态
 * payment:complete   → 完成支付（由外部支付网关回调）
 * payment:simulate   → 开发模式模拟支付（生产环境禁用）
 * payment:cancel     → 取消订单
 *
 * 安全：所有 handler 通过 withSenderCheck 校验来源必须是本应用主窗口
 *       （防止恶意网页通过 DOM 注入调用）
 */

// eslint-disable-next-line no-unused-vars
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { app } = require('electron')
  const { withSenderCheck } = require('./helpers')
  const PaymentManager = require('../services/payment-manager')
  const pm = new PaymentManager()

  ipcMain.handle('payment:create-order', withSenderCheck(async function(event, options) {
    // 2026-10-07：与 `payment:simulate` 同口径的打包态拒收。
    // 付费通道未就绪，正式包不应创建真实订单——`withSenderCheck` 只验
    // senderFrame 是 app://，**不验调用意图**（应用自身有 XSS 时挡不住），
    // 这是补在 IPC 层的纵深防御。UI 层已由 UpgradeModal 的
    // `purchaseAvailable = import.meta.env.DEV` 关闭购买入口，此处不依赖它。
    // 环境变量不能覆盖打包事实，故只认 `app.isPackaged !== false`。
    if (!app || app.isPackaged !== false) {
      return { code: EC.REQUEST_ERROR, message: '付费通道筹备中，暂不支持创建订单' }
    }
    // M-6 修复：参数校验，options 为 undefined 时 options.plan 必崩
    if (!options || !options.plan) return { code: EC.VALIDATION_ERROR, message: '缺少 plan 参数' }
    try {
      const order = pm.createOrder(options.plan, { method: options.method })
      return { code: 0, data: { id: order.id, amount: order.amount, method: order.method, status: order.status } }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('payment:list-orders', withSenderCheck(async function(event) {
    try {
      return { code: 0, data: pm.listOrders() }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  }))

  ipcMain.handle('payment:get-order', withSenderCheck(async function(event, orderId) {
    try {
      const order = pm.getOrder(orderId)
      if (!order) return { code: EC.NOT_FOUND, message: '订单不存在' }
      return { code: 0, data: order }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('payment:complete', withSenderCheck(async function(event, options) {
    // M-6 修复：参数校验
    if (!options || !options.orderId) return { code: EC.VALIDATION_ERROR, message: '缺少 orderId 参数' }
    try {
      const ok = pm.completePayment(options.orderId, options.txnId)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok, message: ok ? '支付完成，Pro 已激活' : '订单不可用或已完成' }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('payment:simulate', withSenderCheck(async function(event, options) {
    // 安全：只有明确未打包的开发应用才能模拟支付，环境变量不能覆盖打包事实。
    if (!app || app.isPackaged !== false) {
      return { code: EC.REQUEST_ERROR, message: '模拟支付在生产环境禁用' }
    }
    // M-6 修复：参数校验
    if (!options || !options.orderId) return { code: EC.VALIDATION_ERROR, message: '缺少 orderId 参数' }
    try {
      const ok = pm.simulatePayment(options.orderId)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok, message: ok ? '模拟支付成功，Pro 已激活' : '模拟支付失败' }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('payment:cancel', withSenderCheck(async function(event, orderId) {
    try {
      const ok = pm.cancelPayment(orderId)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok, message: ok ? '订单已取消' : '订单不可取消' }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))
}

module.exports = registerHandlers
