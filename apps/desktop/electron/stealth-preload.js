/**
 * Stealth Preload — 在页面 JS 执行前注入反检测脚本
 *
 * 等价于 Playwright 的 context.addInitScript()。
 * 在 BrowserWindow 的 webPreferences.preload 中指定，
 * 确保在页面任何脚本运行之前修改浏览器指纹。
 *
 * 适配自 MediaTrace stealth.min.js (MIT) + Multi-Publish StealthHelper
 */
try {
  // 1. Override navigator.webdriver
  delete navigator.__proto__.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    value: undefined,
    writable: false,
    configurable: true,
  })
} catch (e) { /* ignore */ }

try {
  // 2. Simulate chrome.runtime
  const origChrome = window.chrome || {}
  window.chrome = {
    runtime: {
      id: 'aohghmighlieiainnegkcijnfilokake',
      connect: function() { return { onMessage: { addListener: function() {} }, onDisconnect: { addListener: function() {} } } },
      sendMessage: function() {},
      onMessage: { addListener: function() {} },
      onConnect: { addListener: function() {} },
      lastError: undefined,
    },
    loadTimes: function() { return {} },
    csi: function() { return {} },
    app: origChrome.app || { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
    webstore: origChrome.webstore || { onInstallStage: { addListener: function() {} } },
  }
} catch (e) { /* ignore */ }

try {
  // 3. Override navigator.plugins
  const fakePlugins = [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
  ]
  Object.defineProperty(navigator, 'plugins', {
    get: function() {
      const arr = []
      for (let i = 0; i < fakePlugins.length; i++) arr[i] = fakePlugins[i]
      arr.length = fakePlugins.length
      arr.item = function(i) { return this[i] || null }
      arr.namedItem = function(n) { for (let j = 0; j < this.length; j++) { if (this[j].name === n) return this[j] } return null }
      arr.refresh = function() {}
      return arr
    },
    configurable: true,
  })
} catch (e) { /* ignore */ }

try {
  // 4. Override navigator.languages
  Object.defineProperty(navigator, 'languages', {
    get: function() { return ['zh-CN', 'zh', 'en'] },
    configurable: true,
  })
} catch (e) { /* ignore */ }

try {
  // 5. Permission query fix
  const origQuery = window.navigator.permissions.query
  window.navigator.permissions.query = function(perm) {
    if (perm && perm.name === 'clipboard-read') {
      return Promise.resolve({ state: 'granted', onchange: null })
    }
    return origQuery.call(window.navigator.permissions, perm)
  }
} catch (e) { /* ignore */ }
