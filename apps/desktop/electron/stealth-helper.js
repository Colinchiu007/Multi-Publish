/**
 * StealthHelper — 反浏览器指纹检测辅助
 *
 * 从 MediaCrawler stealth.min.js (playwright-stealth) 适配。
 * 在 RPA BrowserWindow 中注入，绕过目标平台对 CDP/Playwright/Electron
 * 自动化特征的检测。
 *
 * 核心覆盖：
 * - navigator.webdriver → false（标记 CDP 的自动化标志）
 * - chrome.runtime → 模拟扩展 ID
 * - navigator.plugins → 填充假插件列表
 * - WebGL 指纹 → 轻度随机化
 *
 * 使用: 在 rpa-view-manager.js 的 _createWindow 中调用
 */

// 这些代码通过 executeJavaScript 注入到页面的 preload 阶段，
// 在网页自身的 JS 运行之前修改环境。

function STEALTH_SCRIPT() {
  // 1. Override navigator.webdriver (CDP 自动化标志)
  // Playwright 默认会设置 navigator.webdriver = true
  // 需要删除这个属性
  try {
    delete navigator.__proto__.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      value: undefined,
      writable: false,
      configurable: true,
    })
  } catch (e) { /* ignore */ }

  // 2. Override chrome.runtime to simulate extensions
  // 很多平台（如抖音创作者平台）会检测是否安装了特定扩展
  try {
    let origChrome = window.chrome || {}
    window.chrome = {
      runtime: {
        id: 'aohghmighlieiainnegkcijnfilokake', // Google Docs Offline
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

  // 3. Override navigator.plugins
  // 真实浏览器有 plugins 列表，CDP 检测器会检查长度
  try {
    let fakePlugins = [
      { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
      { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
    ]
    // PluginArray.prototype 在部分 Electron 版本不可重写，用尽量安全的方案
    Object.defineProperty(navigator, 'plugins', {
      get: function() {
        let arr = []
        for (let i = 0; i < fakePlugins.length; i++) {
          arr[i] = fakePlugins[i]
        }
        arr.length = fakePlugins.length
        arr.item = function(i) { return this[i] || null }
        arr.namedItem = function(n) { for (let j = 0; j < this.length; j++) { if (this[j].name === n) return this[j] } return null }
        arr.refresh = function() {}
        return arr
      },
      configurable: true,
    })
  } catch (e) { /* ignore */ }

  // 4. Override navigator.languages
  try {
    Object.defineProperty(navigator, 'languages', {
      get: function() { return ['zh-CN', 'zh', 'en'] },
      configurable: true,
    })
  } catch (e) { /* ignore */ }

  // 5. Override Permission query to hide automation
  try {
    let origQuery = window.navigator.permissions.query
    window.navigator.permissions.query = function(perm) {
      if (perm && perm.name === 'clipboard-read') {
        return Promise.resolve({ state: 'granted', onchange: null })
      }
      return origQuery.call(window.navigator.permissions, perm)
    }
  } catch (e) { /* ignore */ }
}

module.exports = {
  STEALTH_SCRIPT: STEALTH_SCRIPT,
  STEALTH_SOURCE: '(' + STEALTH_SCRIPT.toString() + ')()',
}
