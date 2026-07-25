// @ts-check
/**
 * IPC 安全校验工具
 *
 * 只放与来源可信度判断有关的纯逻辑，避免 ipc-handlers 反向依赖 bootstrap。
 */
const path = require('path')
const { fileURLToPath } = require('url')

/**
 * @param {string} parentPath
 * @param {string} candidatePath
 * @returns {boolean}
 */
function isPathInside(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath)
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
}

/**
 * 验证 IPC 调用来源是否可信。
 * 白名单：app:// 协议、file:// 协议、开发模式 localhost。
 *
 * @param {{senderFrame?: {url?: string}} | null | undefined} event - Electron IPC event
 * @param {{isPackaged?: boolean, getAppPath?: () => string} | null | undefined} [app] - Electron app 实例
 * @returns {boolean} 来源可信返回 true
 */
function isTrustedSender(event, app) {
  if (!event || !event.senderFrame) return false
  const rawUrl = event.senderFrame.url
  if (!rawUrl) return false

  let senderUrl
  try {
    senderUrl = new URL(rawUrl)
  } catch {
    return false
  }

  if (senderUrl.username || senderUrl.password) return false

  if (senderUrl.protocol === 'app:') {
    return senderUrl.hostname === 'localhost' && senderUrl.port === ''
  }

  if (senderUrl.protocol === 'file:') {
    try {
      const appRoot = app && typeof app.getAppPath === 'function'
        ? app.getAppPath()
        : path.resolve(__dirname, '../..')
      return isPathInside(path.resolve(appRoot, 'dist'), path.resolve(fileURLToPath(senderUrl)))
    } catch {
      return false
    }
  }

  const isPackaged = Boolean(app && app.isPackaged === true)
  const isExplicitlyUnpackaged = Boolean(app && app.isPackaged === false)
  const isDevelopment = !isPackaged && (
    process.env.NODE_ENV === 'development' || isExplicitlyUnpackaged
  )
  if (isDevelopment && senderUrl.protocol === 'http:') {
    // Bug fix (QM-5): Vite 端口漂移容错。
    // 当 5174 被占用时 Vite 会自动切到 5175/5176 等，严格端口匹配会导致开发环境 IPC 来源校验失败。
    // 防御性策略：优先匹配 DEV_SERVER_PORT，其次允许 5174-5180 范围内的 localhost。
    const expectedPort = String(parseInt(process.env.DEV_SERVER_PORT || '5174', 10))
    const portNum = parseInt(senderUrl.port, 10)
    const isExpectedPort = senderUrl.port === expectedPort ||
      (Number.isNaN(portNum) ? false : portNum >= 5174 && portNum <= 5180)
    return (senderUrl.hostname === 'localhost' || senderUrl.hostname === '127.0.0.1') &&
      isExpectedPort
  }

  return false
}

module.exports = { isTrustedSender }
