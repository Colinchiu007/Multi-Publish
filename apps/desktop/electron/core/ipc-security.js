// @ts-check
/**
 * IPC 安全校验工具
 *
 * 只放与来源可信度判断有关的纯逻辑，避免 ipc-handlers 反向依赖 bootstrap。
 */
const fs = require('fs')
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
      const trustedDistPath = fs.realpathSync.native(path.resolve(appRoot, 'dist'))
      const senderPath = fs.realpathSync.native(path.resolve(fileURLToPath(senderUrl)))
      return isPathInside(trustedDistPath, senderPath)
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
    // worktree 独立端口（dev.js/start-desktop.ps1 通过 DEV_SERVER_PORT 精确注入）：
    // - 显式设置了 DEV_SERVER_PORT → 只精确匹配该端口，避免跨 worktree IPC 信任泄漏
    //   （派生端口可能落在 5174-5180，若保留容错带会让兄弟 worktree 的页面穿透信任）；
    // - 未设置（裸 `electron .` / CI 直启）→ 保留 QM-5 遗留的 5174-5180 漂移容错。
    const devServerPortEnv = process.env.DEV_SERVER_PORT
    const expectedPort = String(parseInt(devServerPortEnv || '5174', 10))
    const portNum = parseInt(senderUrl.port, 10)
    let isExpectedPort = senderUrl.port === expectedPort
    if (!devServerPortEnv && !Number.isNaN(portNum)) {
      isExpectedPort = isExpectedPort || (portNum >= 5174 && portNum <= 5180)
    }
    return (senderUrl.hostname === 'localhost' || senderUrl.hostname === '127.0.0.1') &&
      isExpectedPort
  }

  return false
}

module.exports = { isTrustedSender }
