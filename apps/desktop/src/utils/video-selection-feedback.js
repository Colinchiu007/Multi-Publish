// @ts-check
/**
 * video-selection-feedback.js — 视频文件选择反馈的纯逻辑（单一来源）
 *
 * 职责（PRD-VIDEO-SELECT-FEEDBACK-2026-09-28）：
 *   - 判定一次选择的反馈形态：首次选择 / 替换 / 同文件重选 / 超限拒绝
 *   - 提供 500MB 大小校验常量与判断
 *   - 提取展示用元信息（文件名、大小、格式）
 *
 * 设计约束：
 *   - 纯函数、无 Vue/i18n 依赖，便于单元测试与复用
 *   - i18n key 只在本模块定义一次，Publish.vue 直接消费
 */

/** 视频文件大小上限（字节），与 UI 提示「最大 500MB」对齐 */
export const VIDEO_MAX_BYTES = 500 * 1024 * 1024

/**
 * @param {number|null|undefined} sizeBytes
 * @returns {boolean} true 表示超限（含非法值按不超限处理，交给路径解析兜底）
 */
export function isVideoOversize (sizeBytes) {
  const size = Number(sizeBytes)
  return Number.isFinite(size) && size > VIDEO_MAX_BYTES
}

/**
 * @param {{path?: string, name?: string, type?: string, size?: number}} file
 * @returns {{name: string, sizeBytes: number|null, formatLabel: string}}
 */
export function describeVideoFile (file) {
  const name = String(file?.name || '').trim()
  const path = String(file?.path || '').trim()
  const displayName = name || (path ? path.split(/[\\/]/).pop() : '') || ''
  const sizeNum = Number(file?.size)
  const sizeBytes = Number.isFinite(sizeNum) && sizeNum >= 0 ? sizeNum : null
  const typeStr = String(file?.type || '')
  let format = ''
  if (typeStr.startsWith('video/')) format = typeStr.slice('video/'.length)
  if (!format && displayName.includes('.')) format = displayName.split('.').pop()
  return {
    name: displayName,
    sizeBytes,
    formatLabel: format ? format.toUpperCase() : '',
  }
}

/**
 * 判定一次视频选择的反馈形态。
 * @param {{ prevPath?: string, nextPath?: string, sizeBytes?: number|null }} input
 * @returns {'first'|'replaced'|'reselected'|'oversize'|'unresolved'}
 */
export function classifyVideoSelection ({ prevPath, nextPath, sizeBytes }) {
  if (isVideoOversize(sizeBytes)) return 'oversize'
  const next = String(nextPath || '').trim()
  if (!next) return 'unresolved'
  const prev = String(prevPath || '').trim()
  if (!prev) return 'first'
  return prev === next ? 'reselected' : 'replaced'
}
