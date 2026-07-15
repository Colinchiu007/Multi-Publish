// @ts-check
/**
 * AuthView Session — 登录 Session / Cookie 管理
 *
 * 处理 Electron session 分区、Cookie 设置、localStorage 恢复。
 */

const _path = require('path')

/**
 * 创建隔离的 Session 分区
 * @param {string} accountId - 账号 ID
 * @param {{ fromPartition: Function }} sessionModule
 * @returns {import("electron").Session}
 */
function createSession(accountId, sessionModule) {
  const partition = `persist:auth-${accountId}`
  return sessionModule.fromPartition(partition, { cache: true })
}

/**
 * 设置 Cookie（支持单个或数组）
 * @param {import("electron").Session} session
 * @param {any} cookies
 */
async function setCookies(session, cookies) {
  if (!cookies || cookies.length === 0) return
  try {
    // 尝试批量设置
    await session.cookies.set(cookies)
  } catch (_e) {
    // 数组格式，逐个设置
    for (const c of cookies) {
      try { await session.cookies.set(c) } catch (_e2) { /* ignore invalid cookie */ }
    }
  }
}

/**
 * 在页面加载完成后恢复 localStorage
 * @param {import('electron').WebContentsView} view
 * @param {Record<string, string>} localStorage
 * @returns {Promise<void>}
 */
async function restoreLocalStorage(view, localStorage) {
  if (!localStorage || Object.keys(localStorage).length === 0) return
  /** @type {Promise<void>} */
  var p = new Promise((resolve) => {
    // R14 修复：增加 10s 超时，防止 did-finish-load 永不触发时 Promise 永久 pending
    var done = false
    var timer = setTimeout(() => {
      if (!done) { done = true; resolve() }
    }, 10000)
    if (timer && timer.unref) timer.unref()
    view.webContents.once('did-finish-load', async () => {
      if (done) return
      clearTimeout(timer)
      try {
        await view.webContents.executeJavaScript(`
          (function() {
            let data = ${JSON.stringify(localStorage)};
            Object.keys(data).forEach(function(k) {
              try { localStorage.setItem(k, data[k]); } catch (_e) { /* ignore */ }
            });
          })()
        `)
      } catch (_e) { /* ignore */ }
      done = true
      resolve()
    })
  })
  return p
}

/**
 * 创建并配置 WebContentsView
 * @param {string} accountId
 * @param {string} preloadPath
 * @param {import('electron').Session} sessionInstance
 */
function createAuthView(accountId, preloadPath, sessionInstance) {
  const { WebContentsView } = require('electron')
  return new WebContentsView({
    webPreferences: {
      session: sessionInstance,
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  })
}

module.exports = { createSession, setCookies, restoreLocalStorage, createAuthView }

