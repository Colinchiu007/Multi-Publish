// @ts-check
/**
 * 认证窗口公共工厂 —— 独立 BrowserWindow 承载认证类 WebContentsView。
 *
 * 背景：QrCodeLogin / OAuthManager（以及已迁移的 AuthViewManager）原先把认证页
 * 以内嵌 WebContentsView 挂到主窗口 contentView，坐标依赖 AUTH_VIEW_TOP(76)、
 * 侧边栏宽度等硬编码常量，与真实页面布局不符，导致平台页面顶栏与应用
 * TabBar/NavBar/页面 header 多层内容挤压重叠（见 PR #1557 及其专项文档
 * 01-docs/PRD-ACCOUNT-LOGIN-WINDOW.md）。
 *
 * 统一改为独立 BrowserWindow 承载后：认证视图拥有独立坐标系（铺满客户区、
 * 从 (0,0) 起算），从根本上消除与主窗口 DOM 的重叠；隔离 session 与凭证
 * 提取等能力不受影响，仅更换承载容器。
 *
 * 待办：AuthViewManager 目前内置了自己的同模式实现（_createLoginWindow），
 * 后续小 PR 可切换到本工厂以消除重复代码（其回归测试已覆盖该行为）。
 */
const { BrowserWindow } = require('electron')

const DEFAULT_WIDTH = 1180
const DEFAULT_HEIGHT = 820
const DEFAULT_MIN_WIDTH = 900
const DEFAULT_MIN_HEIGHT = 640

/**
 * @typedef {Object} AuthWindowHandle
 * @property {import('electron').BrowserWindow} win 承载认证视图的独立窗口
 * @property {(view: import('electron').WebContentsView) => void} attach 挂载视图并铺满客户区
 * @property {() => void} dispose 解除挂载并销毁窗口（幂等，可安全重复调用）
 */

/**
 * 创建承载认证视图的独立窗口。
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
 * @returns {AuthWindowHandle}
 */
function createStandaloneAuthWindow(options = {}) {
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
    title: options.title || '账号登录',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  /** 认证视图始终铺满窗口客户区，从 (0,0) 起算，避免任何硬编码偏移。 */
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
    /**
     * @param {import('electron').WebContentsView} view
     */
    attach(view) {
      if (disposed || !view) return
      attachedView = view
      // 防御：低版本 Electron 或异常环境下 contentView 可能不可用。
      // 此时不阻断登录流程（loadURL 仍会执行），避免主进程抛错。
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

module.exports = { createStandaloneAuthWindow }
