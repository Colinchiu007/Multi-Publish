// @ts-check
/**
 * IPC 安全校验工具
 *
 * 只放与来源可信度判断有关的纯逻辑，避免 ipc-handlers 反向依赖 bootstrap。
 */

/**
 * 验证 IPC 调用来源是否可信。
 * 白名单：app:// 协议、file:// 协议、开发模式 localhost。
 *
 * @param {object | null | undefined} event - Electron IPC event
 * @param {{ isPackaged?: boolean } | null | undefined} [app] - Electron app 实例
 * @returns {boolean} 来源可信返回 true
 */
function isTrustedSender(event, app) {
  if (!event || !event.senderFrame) return false
  const url = event.senderFrame.url
  if (!url) return false

  if (url.startsWith('app://')) return true
  if (url.startsWith('file://')) return true

  if (process.env.NODE_ENV === 'development' || (app && !app.isPackaged)) {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) return true
  }

  return false
}

module.exports = { isTrustedSender }
