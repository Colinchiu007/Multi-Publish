// @ts-check
/**
 * login-view-fit — 登录视图宽度自适应（zoom-to-fit）
 *
 * ── 背景与根因（2026-09-28 Bug：非全屏窗口登录页显示不全）──────────────
 * 内嵌登录视图（AuthViewManager / QrCodeLogin）定位本身是正确的：
 * x=侧边栏宽（200 DIP）、y=76（TabBar+NavBar）、宽=窗口客户区-侧边栏。
 * 问题在页面自身：快手 cp.kuaishou.com 登录页是固定内容宽布局（≈1335 DIP，
 * 像素取证自用户截图），非响应式。当视图宽度 < 页面内容宽时页面横向溢出：
 * 居中容器边距塌缩为 0（内容贴左）、右侧插画被裁、出现横向滚动条。
 *
 * 实测样本（1920x1200 @125% 屏幕，客户区 1536 DIP）：
 *   - 非全屏窗口 1267 DIP → 视图 1051 DIP < 1335 → 页面被裁（用户报的 Bug）
 *   - 全屏 1536 DIP → 视图 1336 DIP ≈ 1335 → 恰好容纳（用户看到"全屏正常"）
 * 该屏幕上**任何**非全屏窗口都装不下此页面，放大窗口无法解决 —— 唯一就地
 * 解法是按需缩小 zoomFactor 让整页可见（等同浏览器手动缩小，QR 码仍可扫）。
 *
 * 契约：
 *   - computeLoginFitZoom(viewWidth, scrollWidth, currentZoom) 纯计算，非法输入一律
 *     no-op（返回归一后的当前缩放）；目标 < MIN_FIT_ZOOM（0.5）时保持当前值
 *     （半信纸不可读，宁可保留原生滚动）。
 *   - fitLoginViewZoom(view) 探针页面 scrollWidth 并应用目标缩放；同一 view 并发
 *     调用以最后一次为准（WeakMap 世代号，过期探针不生效）。
 *   - 恢复到 1 只在**视图宽度发生变化**时尝试（窗口 resize / 侧栏宽度变化）：
 *     宽度未变的复测（如加载后 500ms 延迟复测）即使页面在当前缩放下恰好容纳，
 *     也不做 1↔fit 往返 —— 那只是把已收敛的状态打回原点再弹回来，视觉上就是抖动。
 *     恢复后必须复测一次（页面可能只在旧缩放下"看起来容纳"），复测仍溢出则单次回缩。
 */
const log = require('./logger')

/** 缩放下限：低于该值文字不可读，放弃缩放保留原生滚动 */
const MIN_FIT_ZOOM = 0.5
/** 容差（CSS px）：页面比视口宽 2px 以内视为容纳，避免亚像素抖动反复调缩放 */
const FIT_TOLERANCE_PX = 2

/** 只读探针：页面主文档的 scrollWidth（CSS px）。任何异常返回 0（= no-op） */
const PROBE_SCRIPT = '(function(){try{var d=document.documentElement,b=document.body;' +
  'return Math.max(d?d.scrollWidth:0,b?b.scrollWidth:0)||0}catch(e){return 0}})()'

/** 并发防护：view → 世代号。WeakMap 不持有 view 引用，视图销毁后自动回收 */
const fitGenerations = new WeakMap()
/** 恢复门槛：view → 上次适配时的视图宽度。宽度未变则不尝试恢复 1（防复测抖动） */
const fitWidths = new WeakMap()

function normalizeZoom (value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 计算登录视图的目标缩放。
 * @param {number} viewWidth 视图宽度（DIP，来自 view.getBounds().width）
 * @param {number} scrollWidth 页面 scrollWidth（CSS px，当前缩放下测得）
 * @param {number} currentZoom 当前缩放（非法值按 1 归一）
 * @returns {number} 目标缩放；与当前相同 = 无需调整
 */
function computeLoginFitZoom (viewWidth, scrollWidth, currentZoom) {
  const zoom = normalizeZoom(currentZoom, 1)
  if (typeof viewWidth !== 'number' || !Number.isFinite(viewWidth) || viewWidth <= 0) return zoom
  if (typeof scrollWidth !== 'number' || !Number.isFinite(scrollWidth) || scrollWidth <= 0) return zoom

  const viewportCss = viewWidth / zoom
  if (scrollWidth > viewportCss + FIT_TOLERANCE_PX) {
    const target = viewWidth / scrollWidth
    // 下限保护：目标不可读时不缩放（保留原生横向滚动），由调用方记 warn
    if (target < MIN_FIT_ZOOM) return zoom
    return target
  }
  // 当前缩放下已容纳：若此前缩放过则恢复原尺寸（调用方复测一次防"假容纳"）
  if (zoom < 1) return 1
  return zoom
}

/**
 * 探针并应用 zoom-to-fit。所有失败路径（视图销毁 / 探针异常 / 尺寸不可读）
 * 一律静默返回 —— 自适应是体验增强，不得成为登录链路的新故障点。
 * @param {{ webContents: import('electron').WebContents, getBounds: Function }} view
 * @param {{ log?: { info: Function, warn: Function } }} [options]
 * @returns {Promise<void>}
 */
async function fitLoginViewZoom (view, options = {}) {
  const logger = options.log || log
  const wc = view && view.webContents
  if (!wc || typeof wc.executeJavaScript !== 'function') return
  if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return

  let bounds
  try { bounds = view.getBounds() } catch (_e) { return }
  const viewWidth = bounds && bounds.width
  if (typeof viewWidth !== 'number' || !Number.isFinite(viewWidth) || viewWidth <= 0) return

  const gen = (fitGenerations.get(view) || 0) + 1
  fitGenerations.set(view, gen)
  const isCurrent = () => fitGenerations.get(view) === gen

  let scrollWidth
  try {
    scrollWidth = await wc.executeJavaScript(PROBE_SCRIPT)
  } catch (_e) { return } // 页面导航中上下文销毁等，属正常竞态
  if (!isCurrent()) return // 已被更新的 fit 调用接管

  // 宽度记账：恢复 1 的门槛是"视图宽度发生了变化"（resize / 侧栏宽度变化）。
  // 宽度未变的复测（如加载后延迟复测）即使页面恰好容纳也不做 1↔fit 往返。
  const widthChanged = fitWidths.get(view) !== viewWidth
  fitWidths.set(view, viewWidth)

  const currentZoom = typeof wc.getZoomFactor === 'function' ? normalizeZoom(wc.getZoomFactor(), 1) : 1
  // 下限拒绝必须留下证据（与 computeLoginFitZoom 同一判定式；纯函数保持无副作用，
  // 日志职责在应用层）：目标缩放不可读时放弃缩放，保留原生横向滚动。
  const viewportCss = viewWidth / currentZoom
  if (scrollWidth > viewportCss + FIT_TOLERANCE_PX && viewWidth / scrollWidth < MIN_FIT_ZOOM) {
    logger.warn('LoginViewFit', 'page too wide to fit readably, keep zoom ' + currentZoom +
      ': viewWidth=' + Math.round(viewWidth) + ' pageWidth=' + Math.round(scrollWidth) +
      ' target=' + Number((viewWidth / scrollWidth).toFixed(3)) + ' floor=' + MIN_FIT_ZOOM)
    return
  }
  const target = computeLoginFitZoom(viewWidth, scrollWidth, currentZoom)
  if (target === currentZoom) return
  if (typeof wc.setZoomFactor !== 'function') return
  // 恢复（target===1）只在视图宽度变化后尝试；宽度未变的复测即使恰好容纳
  // 也不做 1↔fit 往返 —— 那只是把已收敛的状态打回原点再弹回来（视觉抖动）。
  if (target === 1 && !widthChanged) return

  wc.setZoomFactor(target)
  if (target < 1) {
    logger.info('LoginViewFit', 'zoom-to-fit: viewWidth=' + Math.round(viewWidth) +
      ' pageWidth=' + Math.round(scrollWidth) + ' zoom=' + Number(target.toFixed(3)))
    return
  }

  // target === 1（恢复原尺寸）：恢复后必须复测一次 —— 页面可能只在旧缩放下
  // "看起来容纳"，复测仍溢出则单次回缩（有界，不与恢复逻辑互相震荡）。
  let recheckWidth
  try {
    recheckWidth = await wc.executeJavaScript(PROBE_SCRIPT)
  } catch (_e) { return }
  if (!isCurrent()) return
  const zoomAfterRestore = typeof wc.getZoomFactor === 'function' ? normalizeZoom(wc.getZoomFactor(), 1) : 1
  const recheckTarget = computeLoginFitZoom(viewWidth, recheckWidth, zoomAfterRestore)
  if (recheckTarget !== zoomAfterRestore) {
    if (typeof wc.setZoomFactor !== 'function') return
    wc.setZoomFactor(recheckTarget)
    if (recheckTarget < 1) {
      logger.info('LoginViewFit', 'zoom-to-fit after restore recheck: viewWidth=' + Math.round(viewWidth) +
        ' pageWidth=' + Math.round(recheckWidth) + ' zoom=' + Number(recheckTarget.toFixed(3)))
    }
  }
}

/**
 * 带旁路防护的适配入口：自适应是体验增强，任何失败（含实现缺陷导致的意外抛错）
 * 只落 warn，不得影响登录链路。供 AuthViewManager / QrCodeLogin 直接调用。
 * @param {{ webContents: import('electron').WebContents, getBounds: Function }} view
 * @param {{ log?: { info: Function, warn: Function }, tag?: string }} [options]
 * @returns {Promise<void>}
 */
function fitLoginViewZoomSafe (view, options = {}) {
  const logger = options.log || log
  const tag = options.tag || 'LoginViewFit'
  const report = function (e) {
    logger.warn(tag, 'login view fit failed: ' + ((e && e.message) || e))
  }
  try {
    const pending = fitLoginViewZoom(view, options)
    if (pending && typeof pending.catch === 'function') pending.catch(report)
    return pending
  } catch (e) {
    report(e)
    return Promise.resolve()
  }
}

module.exports = {
  MIN_FIT_ZOOM,
  FIT_TOLERANCE_PX,
  computeLoginFitZoom,
  fitLoginViewZoom,
  fitLoginViewZoomSafe,
}
