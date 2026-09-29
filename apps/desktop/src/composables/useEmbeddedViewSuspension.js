/**
 * useEmbeddedViewSuspension — 应用级浮层与内嵌 WebContentsView 的互斥原语
 *
 * 根因（2026-09-23 Bug 修复）：浏览器/登录标签中的外部网页由主进程 WebContentsView
 * 承载，是压在渲染进程 DOM 之上的原生图层，CSS z-index 对其无效。活动标签为外部
 * 网页时，应用级模态浮层（设置弹窗 / 升级弹窗 / 关闭未保存标签确认框）打开后会被
 * 整块盖住——用户感知为「点设置后屏幕闪一下、弹窗没出现」。
 *
 * 契约：
 *   - owner 为浮层唯一标识（如 'settings-dialog'），suspend/release 必须成对调用；
 *   - 主进程侧 ref-count：多个浮层叠加挂起时，最后一个释放才恢复显示；
 *   - 非 Electron 环境（浏览器打开 Vite / 单测桩缺 API）静默降级返回 false，
 *     本模块保证任何路径都不抛错；
 *   - 释放必须走 releaseXxx 且 owner 匹配，未知 owner 释放无效（防计数漂移）。
 */
import { invokePageManager } from '@/api/electron-bridge'
import { isHomeShellSearch } from '@/utils/home-shell'

/** 本渲染实例当前持有挂起的 owner 集合（模块级，跨组件共享去重） */
const activeOwners = new Set()

/**
 * 当前渲染上下文是否为「+新标签」内嵌主页实例。
 *
 * 必须在每次调用时读取，不得在模块导入期求值 —— 同一 JS realm 里 URL 可变，
 * 冻结求值会让守卫在真实导航后失效。
 *
 * 为什么 home-shell 里必须 no-op：该实例本身就是一张 WebContentsView，而主进程
 * 任一时刻只让活动标签可见（`setVisible(true)` 全仓仅 layout.js 一处、且只作用于
 * activeView）。因此它内部的应用级模态不会被别的标签视图盖住，挂起是不必要的；
 * 更糟的是 `_hideAllTabs()` 会连它自己一起隐藏，用户表现为「打开弹窗后内容区整块空白」。
 * App.vue 对 setShellMode 早已有同源守卫（`if (isHomeShell) return`），此处补齐挂起路径。
 */
function isHomeShellRuntime () {
  if (typeof window === 'undefined' || !window.location) return false
  try {
    return isHomeShellSearch(window.location.search)
  } catch (_) {
    return false
  }
}

/**
 * 浮层打开：挂起全部内嵌视图（浏览器标签 + 登录视图 + 扫码视图）。
 * @param {string} owner 浮层标识
 * @returns {Promise<boolean>} 是否实际发起了挂起（重复调用/环境不可用/内嵌主页壳态返回 false）
 */
export async function suspendEmbeddedViewsForOverlay (owner) {
  if (!owner || activeOwners.has(owner)) return false
  if (isHomeShellRuntime()) return false
  activeOwners.add(owner)
  try {
    await invokePageManager('suspendEmbeddedViews', owner)
    return true
  } catch (error) {
    // 挂起失败不阻断浮层本身（workbench 壳态下本来就没有可见内嵌视图）
    console.warn('[embedded-view-suspension] suspend failed', owner, error)
    return false
  }
}

/**
 * 浮层关闭：释放挂起；主进程计数归零后恢复内嵌视图显示。
 * @param {string} owner 必须与 suspend 时一致
 * @returns {Promise<boolean>} 是否实际发起了释放
 */
export async function releaseEmbeddedViewsForOverlay (owner) {
  if (!owner || !activeOwners.has(owner)) return false
  activeOwners.delete(owner)
  try {
    await invokePageManager('resumeEmbeddedViews', owner)
    return true
  } catch (error) {
    console.warn('[embedded-view-suspension] release failed', owner, error)
    return false
  }
}
