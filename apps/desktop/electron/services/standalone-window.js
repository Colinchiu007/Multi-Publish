// @ts-check
/**
 * 独立窗口公共工厂 —— 用独立 BrowserWindow 承载 WebContentsView（通用，不限于认证）。
 *
 * 背景：原先「打开应用外的网页」一律把 WebContentsView 内嵌到主窗口 contentView
 * （webview-manager 的 openTab / createNewTabPage、auth-view-manager、oauth-manager、
 * qrcode-login 皆是如此）。内嵌模式坐标依赖 AUTH_VIEW_TOP(76)、侧边栏宽度等硬编码
 * 常量，与真实页面布局不符，导致平台页面顶栏与应用 TabBar/NavBar/页面 header 多层
 * 挤压重叠（采集页点知乎图标即为此类，见 PR #1557 及其专项文档
 * 01-docs/PRD-ACCOUNT-LOGIN-WINDOW.md）。
 *
 * 统一改为独立 BrowserWindow 承载后：视图拥有独立坐标系（铺满客户区、从 (0,0)
 * 起算），从根本上消除与主窗口 DOM 的重叠；session 隔离与凭证提取能力不受影响，
 * 仅更换承载容器。
 *
 * 适用范围：用户主动打开应用外 URL（平台创作者中心 / 评论页 / 登录页等）。
 * 不适用：分屏监控（webview-manager.openTab 需在主窗口内分屏布局）。
 */
const { BrowserWindow } = require('electron')

const DEFAULT_WIDTH = 1180
const DEFAULT_HEIGHT = 820
const DEFAULT_MIN_WIDTH = 900
const DEFAULT_MIN_HEIGHT = 640

/**
 * @typedef {Object} StandaloneWindowHandle
 * @property {import('electron').BrowserWindow} win 承载视图的独立窗口
 * @property {(view: import('electron').WebContentsView) => void} attach 挂载视图并铺满客户区
 * @property {() => void} syncBounds 同步视图铺满当前客户区
 * @property {() => void} dispose 解除挂载并销毁窗口（幂等，可安全重复调用）
 */

/**
 * 创建承载 WebContentsView 的独立窗口。
 *
 * @param {{
 *   parent?: import('electron').BrowserWindow | null,
 *   title?: string,
 *   width?: number,
 *   height?: number,
 *   minWidth?: number,
 *   minHeight?: number,
 *   onClosed?: () => void,
 * }} [options]
 * @returns {StandaloneWindowHandle}
 */
function createStandaloneWindow(options = {}) {
  /** @type {import('electron').WebContentsView | null} */
  let attachedView = null
  let disposed = false

  const win = new BrowserWindow({
    width: options.width || DEFAULT_WIDTH,
    height: options.height || DEFAULT_HEIGHT,
    minWidth: options.minWidth || DEFAULT_MIN_WIDTH,
    minHeight: options.minHeight || DEFAULT_MIN_HEIGHT,
    // 与主窗口建立父子关系（主窗口关闭时一并回收），但不设 modal：
    // 用户仍可切回主窗口查看账号列表与操作指引。
    parent: options.parent || undefined,
    modal: false,
    show: true,
    autoHideMenuBar: true,
    title: options.title || '',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  /** 视图始终铺满窗口客户区，从 (0,0) 起算，避免任何硬编码偏移。 */
  const syncBounds = () => {
    if (!attachedView || win.isDestroyed()) return
    try {
      const bounds = win.getContentBounds()
      attachedView.setBounds({
        x: 0,
        y: 0,
        width: Math.max(0, bounds.width || 0),
        height: Math.max(0, bounds.height || 0),
      })
    } catch (_e) { /* 窗口正在销毁，忽略 */ }
  }
  win.on('resize', syncBounds)

  win.once('closed', () => {
    disposed = true
    attachedView = null
    if (typeof options.onClosed === 'function') options.onClosed()
  })

  return {
    win,
    /** 同步视图铺满当前客户区（attach 时自动调用；暴露供调用方在窗口尺寸变化外手动触发） */
    syncBounds,
    /**
     * @param {import('electron').WebContentsView} view
     */
    attach(view) {
      if (disposed || !view) return
      attachedView = view
      // 防御：低版本 Electron 或异常环境下 contentView 可能不可用。
      // 此时不阻断流程（loadURL 仍会执行），避免主进程抛错。
      if (win.contentView && typeof win.contentView.addChildView === 'function') {
        win.contentView.addChildView(view)
      }
      try { view.setVisible(true) } catch (_e) { /* ignore */ }
      syncBounds()
    },
    dispose() {
      if (disposed) return
      disposed = true
      try {
        if (attachedView && win.contentView && typeof win.contentView.removeChildView === 'function') {
          win.contentView.removeChildView(attachedView)
        }
      } catch (_e) { /* ignore */ }
      attachedView = null
      try { if (!win.isDestroyed()) win.destroy() } catch (_e) { /* ignore */ }
    },
  }
}

module.exports = { createStandaloneWindow }
