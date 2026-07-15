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
 * 安全：所有 handler 校验来源必须是本应用主窗口（防止恶意网页通过 DOM 注入调用）
 */

// eslint-disable-next-line no-unused-vars
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const PaymentManager = require('../services/payment-manager')
  const pm = new PaymentManager()

  // 安全：校验 IPC 调用来源是本应用渲染进程（非外部网页/iframe）
  // deps.BrowserWindow 可能为空（测试环境），此时跳过校验
  function _assertTrustedSender(event) {
    if (!deps || !deps.BrowserWindow) return true // 测试环境放行
    try {
      const allWindows = deps.BrowserWindow.getAllWindows()
      const senderWin = event && event.sender ? event.sender : null
      if (!senderWin) return false
      // 调用方必须是本应用某个 BrowserWindow
      return allWindows.some(function(w) { return w === senderWin || w.webContents === senderWin })
    } catch (e) {
      return false
    }
  }

  function _untrusted() {
    return { code: EC.AUTH_ERROR, message: '未授权的调用来源' }
  }

  ipcMain.handle('payment:create-order', async function(event, options) {
    if (!_assertTrustedSender(event)) return _untrusted()
    // M-6 修复：参数校验，options 为 undefined 时 options.plan 必崩
    if (!options || !options.plan) return { code: EC.VALIDATION_ERROR, message: '缺少 plan 参数' }
    try {
      const order = pm.createOrder(options.plan, { method: options.method })
      return { code: 0, data: { id: order.id, amount: order.amount, method: order.method, status: order.status } }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('payment:list-orders', async function(event) {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      return { code: 0, data: pm.listOrders() }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  ipcMain.handle('payment:get-order', async function(event, orderId) {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      const order = pm.getOrder(orderId)
      if (!order) return { code: EC.NOT_FOUND, message: '订单不存在' }
      return { code: 0, data: order }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })

  ipcMain.handle('payment:complete', withSenderCheck(async function(event, options) {
    if (!_assertTrustedSender(event)) return _untrusted()
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
    if (!_assertTrustedSender(event)) return _untrusted()
    // 安全：生产环境禁用模拟支付（可绕过支付直接激活 Pro）
    if (process.env.NODE_ENV === 'production') {
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

  ipcMain.handle('payment:cancel', async function(event, orderId) {
    if (!_assertTrustedSender(event)) return _untrusted()
    try {
      const ok = pm.cancelPayment(orderId)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok, message: ok ? '订单已取消' : '订单不可取消' }
    } catch(e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  })
}

module.exports = registerHandlers
