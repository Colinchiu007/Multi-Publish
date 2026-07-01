/**
 * Auth Preload — WebContentsView 内嵌浏览器的预加载脚本
 * 用于在第三方页面安全执行凭证提取
 */
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('__auth_helper__', {
  getLocalStorage: () => {
    const result = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key.startsWith('__') || key === 'devtools') continue
      try { result[key] = localStorage.getItem(key) } catch (e) { /* ignore */ }
    }
    return result
  },
  getPageInfo: () => ({
    title: document.title,
    url: window.location.href,
    cookies: document.cookie,
  }),
})