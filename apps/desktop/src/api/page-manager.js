/**
 * page-manager — 分屏页面（WebContentsView）布局桥接层
 *
 * 渲染层禁止直调 window.electronAPI（desktop-ui-consistency spec：IPC 访问单轨制），
 * 一切经 src/api/** 白名单桥接层。本模块承接 pageManager 命名空间能力。
 */

function getPageManager () {
  if (typeof window === 'undefined') return null
  return window.electronAPI && window.electronAPI.pageManager ? window.electronAPI.pageManager : null
}

/**
 * 同步左侧导航栏宽度到主进程（避免 WebContentsView 遮挡侧边栏）
 * @param {number} width 侧边栏实际渲染宽度（px）
 */
export function setSidebarWidth (width) {
  const pm = getPageManager()
  if (pm && typeof pm.setSidebarWidth === 'function') {
    return pm.setSidebarWidth(Math.round(width))
  }
  return undefined
}

export default { setSidebarWidth }
