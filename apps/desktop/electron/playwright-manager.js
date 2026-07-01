/**
 * Playwright 兼容层（Electron 原生替代）
 *
 * 提供 Playwright 兼容的 getContext() 接口，底层使用 Electron BrowserWindow。
 * 仅用于维持 account-manager 向后兼容，新代码请使用 AuthViewManager。
 *
 * 文件位置: apps/desktop/electron/playwright-manager.js
 * 状态: 已废弃（P2-E 迁移过渡留底）
 */

const { BrowserWindow } = require('electron')
const log = require('./logger')

/**
 * 创建一个与 Playwright Page 兼容的包装对象
 * @param {number} timeout 默认超时 (ms)
 * @returns {object} page-like wrapper
 */
function createPage () {
  const win = new BrowserWindow({
    show: true,
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: true,
    }
  })

  // 捕获 closed 状态
  let _closed = false
  win.on('closed', () => { _closed = true })

  // 存储待注入的 Cookie
  let _pendingCookies = []

  const page = {
    _win: win,

    /**
     * 导航到 URL
     * @param {string} url
     * @param {{ waitUntil?: string, timeout?: number }} [options]
     */
    async goto (url, options = {}) {
      const { timeout = 30000 } = options
      if (_closed) throw new Error('Page already closed')
      await win.loadURL(url)
    },

    /**
     * 等待 DOM 选择器出现
     * @param {string} selector CSS 选择器
     * @param {{ timeout?: number }} [options]
     */
    async waitForSelector (selector, options = {}) {
      const { timeout = 30000 } = options
      const start = Date.now()
      while (Date.now() - start < timeout) {
        if (_closed) throw new Error('Page closed while waiting')
        try {
          const found = await win.webContents.executeJavaScript(
            `document.querySelector(${JSON.stringify(selector)}) !== null`
          )
          if (found) return true
        } catch (e) {
          // 页面可能还在加载，重试
        }
        await new Promise(r => setTimeout(r, 500))
      }
      throw new Error(`Timeout waiting for selector: ${selector}`)
    },

    /**
     * 注入初始化脚本
     * @param {Function|string} fn
     */
    async addInitScript (fn) {
      if (_closed) return
      const code = typeof fn === 'function' ? `(${fn.toString()})()` : fn
      try {
        await win.webContents.executeJavaScript(code)
      } catch (e) {
        log.warn('playwright-manager', `addInitScript failed: ${e.message}`)
      }
    },

    /** 当前页面 URL */
    url () {
      if (_closed) return ''
      return win.webContents.getURL()
    },

    /**
     * 返回 Cookie 上下文兼容对象
     */
    context () {
      return {
        addCookies: async (cookies) => {
          _pendingCookies = cookies || []
          for (const c of _pendingCookies) {
            try {
              const cookie = {
                url: (c.domain ? (c.secure ? 'https://' : 'http://') + c.domain : win.webContents.getURL()),
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path || '/',
                secure: c.secure || false,
                httpOnly: c.httpOnly || false,
                sameSite: c.sameSite || 'lax',
              }
              if (c.expires) cookie.expirationDate = Math.floor(new Date(c.expires).getTime() / 1000)
              await win.webContents.session.cookies.set(cookie)
            } catch (e) {
              log.warn('playwright-manager', `setCookie failed for ${c.name}: ${e.message}`)
            }
          }
        }
      }
    },

    /** 关闭页面 */
    async close () {
      if (!_closed && !win.isDestroyed()) {
        win.close()
      }
    }
  }

  return page
}

/**
 * 获取浏览器上下文（与 Playwright 兼容）
 * @returns {Promise<{ newPage: Function }>}
 */
async function getContext () {
  return {
    newPage: () => createPage()
  }
}

module.exports = {
  getContext,
  // ── 已废弃方法（仅占位防崩溃） ──
  launchBrowser: async () => {
    log.warn('playwright-manager', 'launchBrowser 已废弃（P2-E），请使用 getContext')
    return { newPage: createPage }
  },
  closeBrowser: async () => {
    log.warn('playwright-manager', 'closeBrowser 已废弃（P2-E）')
  },
  newPage: () => createPage(),
}
