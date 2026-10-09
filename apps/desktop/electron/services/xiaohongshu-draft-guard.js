'use strict'
/**
 * 小红书「仅存草稿」硬约束的拒绝构造器（2026-10-10）
 *
 * 为什么独立成模块：`rpa-view-platforms.js` 在仓库「点名还账」清单内（零增长容差），
 * 而这段拒绝语义（错误码 / 文案 / URL 兜底）与轨内其它平台逻辑无关。
 * 独立后既不给受点名文件增行，也让「小红书视频必须 fail-closed」这条判据可被单测直击。
 */

/** 错误码：小红书视频形态被拒绝（绝不真实发布） */
const XHS_VIDEO_DRAFT_UNSUPPORTED = 'XHS_VIDEO_DRAFT_UNSUPPORTED'

/**
 * 拒绝原因文案（主进程直出，进发布失败原因）。
 * 刻意写明「已拒绝真实发布」与替代路径：静默降级成草稿会把「其实没发出去」伪装成成功。
 */
const XHS_VIDEO_REFUSAL_MESSAGE = '小红书仅允许保存到平台草稿箱（用户硬约束：不得真实发布）；视频草稿链尚未实现，已拒绝真实发布。请改用图文，或在手机 App 内手动发布视频。'

/**
 * 构造小红书视频形态的 fail-closed 结果。
 * @param {object} [win] RPA 窗口（可能已销毁 / 字段缺失，一律兜底为空 URL）
 * @returns {{success:false, platform:'xiaohongshu', error:string, errorCode:string, url:string}}
 */
function buildXhsVideoRefusal (win) {
  let url = ''
  try {
    const wc = win && win.webContents
    if (wc && typeof wc.isDestroyed === 'function' && !wc.isDestroyed() && typeof wc.getURL === 'function') {
      url = wc.getURL() || ''
    }
  } catch (_e) {
    // 窗口状态不可读时留空：拒绝结果的语义不依赖 URL
  }
  return {
    success: false,
    platform: 'xiaohongshu',
    error: XHS_VIDEO_REFUSAL_MESSAGE,
    errorCode: XHS_VIDEO_DRAFT_UNSUPPORTED,
    url,
  }
}

module.exports = { buildXhsVideoRefusal, XHS_VIDEO_REFUSAL_MESSAGE, XHS_VIDEO_DRAFT_UNSUPPORTED }
