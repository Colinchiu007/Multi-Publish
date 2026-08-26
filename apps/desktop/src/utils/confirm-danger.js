import { ElMessageBox } from 'element-plus'

/**
 * 危险操作统一确认原语（desktop-ui-consistency：危险操作确认门禁）
 *
 * 约定：
 * - 所有删除类/不可逆操作必须经由此函数确认后执行，禁止 window.confirm（CI Gate 10 拦截）
 * - message 必填且须说明后果（影响条数/不可恢复性），由调用方传入已本地化文案
 *
 * @param {{ message: string, title?: string, confirmText?: string, cancelText?: string }} options
 * @returns {Promise<boolean>} true=用户确认执行；false=取消
 */
export async function confirmDanger (options) {
  const { message, title, confirmText, cancelText } = options || {}
  if (!message || typeof message !== 'string') {
    throw new Error('confirmDanger: a consequence-explaining message is required')
  }
  try {
    await ElMessageBox.confirm(message, title || '', {
      type: 'warning',
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      autofocus: false,
    })
    return true
  } catch {
    // 用户取消 / ESC / 点遮罩 —— 统一视为不执行
    return false
  }
}
