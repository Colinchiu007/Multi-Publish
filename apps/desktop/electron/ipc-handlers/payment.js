/** 
 * Payment IPC handlers
 * payment:create-order → 创建订单
 * payment:list-orders → 列出所有订单
 * payment:get-order  → 查询订单状态
 * payment:complete   → 完成支付（由外部支付网关回调）
 * payment:simulate   → 开发模式模拟支付
 * payment:cancel     → 取消订单
 */

function registerHandlers(ipcMain, deps) {
  let EC = require('../core/error-codes').ERROR
  let PaymentManager = require('../services/payment-manager')
  let pm = new PaymentManager()

  ipcMain.handle('payment:create-order', async function(event, options) {
    try {
      let order = pm.createOrder(options.plan, { method: options.method })
      return { code: 0, data: { id: order.id, amount: order.amount, method: order.method, status: order.status } }
    } catch(e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('payment:list-orders', async function() {
    try {
      return { code: 0, data: pm.listOrders() }
    } catch(e) {
      return { code: -1, message: e.message, data: [] }
    }
  })

  ipcMain.handle('payment:get-order', async function(event, orderId) {
    try {
      let order = pm.getOrder(orderId)
      if (!order) return { code: -1, message: '订单不存在' }
      return { code: 0, data: order }
    } catch(e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('payment:complete', async function(event, options) {
    try {
      let ok = pm.completePayment(options.orderId, options.txnId)
      return { code: ok ? 0 : -1, message: ok ? '支付完成，Pro 已激活' : '订单不可用或已完成' }
    } catch(e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('payment:simulate', async function(event, options) {
    try {
      let ok = pm.simulatePayment(options.orderId)
      return { code: ok ? 0 : -1, message: ok ? '模拟支付成功，Pro 已激活' : '模拟支付失败' }
    } catch(e) {
      return { code: -1, message: e.message }
    }
  })

  ipcMain.handle('payment:cancel', async function(event, orderId) {
    try {
      let ok = pm.cancelPayment(orderId)
      return { code: ok ? 0 : -1, message: ok ? '订单已取消' : '订单不可取消' }
    } catch(e) {
      return { code: -1, message: e.message }
    }
  })
}

module.exports = registerHandlers
