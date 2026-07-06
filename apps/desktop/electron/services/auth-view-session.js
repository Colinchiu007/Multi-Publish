// @ts-check
/**
 * AuthView Session — 登录 Session / Cookie 管理
 *
 * 处理 Electron session 分区、Cookie 设置、localStorage 恢复。
 */

const path = require('path')

/**
 * 创建隔离的 Session 分区
 * @param {string} accountId - 账号 ID
 * @returns {import("electron").Session}
 */
function createSession(accountId, sessionModule) {
  const partition = `persist:auth-${accountId}`
  return sessionModule.fromPartition(partition, { cache: true })
}

/**
 * 设置 Cookie（支持单个或数组）
 */
async function setCookies(session, cookies) {
  if (!cookies || cookies.length === 0) return
  try {
    // 尝试批量设置
    await session.cookies.set(cookies)
  } catch (e) {
    // 数组格式，逐个设置
    for (const c of cookies) {
      try { await session.cookies.set(c) } catch (e2) { /* ignore invalid cookie */ }
    }
  }
}

/**
 * 在页面加载完成后恢复 localStorage
 */
async function restoreLocalStorage(view, localStorage) {
  if (!localStorage || Object.keys(localStorage).length === 0) return
  return new Promise((resolve) => {
    view.webContents.on('did-finish-load', async () => {
      try {
        await view.webContents.executeJavaScript(`
          (function() {
            let data = ${JSON.stringify(localStorage)};
            Object.keys(data).forEach(function(k) {
              try { localStorage.setItem(k, data[k]); } catch (e) { /* ignore */ }
            });
          })()
        `)
      } catch (e) { /* ignore */ }
      resolve()
    }, { once: true })
  })
}

/**
 * 创建并配置 WebContentsView
 */
function createAuthView(accountId, preloadPath, sessionInstance) {
  const { WebContentsView } = require('electron')
  return new WebContentsView({
    webPreferences: {
      session: sessionInstance,
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    }
  })
}

module.exports = { createSession, setCookies, restoreLocalStorage, createAuthView }