// @ts-check
/**
 * draft-fingerprint — 草稿内容指纹（publish-fail-draft-guard，PRD §4.1）
 *
 * 职责：为 draftSave 幂等去重提供「内容身份」单一真源。
 * 指纹只含内容字段（白名单）；id / createdAt / updatedAt / publishTime /
 * platforms / accounts / platformOverrides 等发布指向性或易变元数据一律不参与——
 * 同一份内容改平台再保存、或失败自动回存后用户再手动保存，都视为同一份内容。
 *
 * 规范化：
 * - 字符串字段原样参与（不 trim——首尾空格是用户内容的一部分），null/undefined → ''
 * - 数组字段保持顺序（图片/视频顺序即内容顺序），非数组 → []
 * - 序列化键递归排序，键序无关
 * - 非对象输入返回确定性空内容指纹（不抛错，调用方安全）
 */
const crypto = require('crypto')

// 内容字段白名单：与 usePublishDrafts ARTICLE_FIELDS 的内容子集一致（排除 publishTime）
const CONTENT_FIELDS = [
  'title',
  'content',
  'author',
  'cover_url',
  'cover_path',
  'cover_file',
  'video_path',
  'images',
  'image_files',
  'tags',
  'topics',
  'mentions',
]

const ARRAY_CONTENT_FIELDS = new Set(['images', 'image_files', 'tags', 'topics', 'mentions'])

/** 非对象输入的确定性空内容指纹 */
const EMPTY_FINGERPRINT = crypto.createHash('sha256').update('draft:empty').digest('hex')

/**
 * 规范化任意值为稳定 JSON 可序列化结构：对象键递归排序，数组保序。
 * @param {unknown} value
 * @returns {unknown}
 */
function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      out[key] = stableNormalize(value[key])
    }
    return out
  }
  return value === undefined || value === null ? '' : value
}

/**
 * 计算草稿内容指纹（64 位 hex sha256）
 * @param {unknown} draft - 任意输入；仅对象类型会产出内容指纹
 * @returns {string}
 */
function computeDraftFingerprint(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return EMPTY_FINGERPRINT
  const canonical = {}
  let hasContent = false
  for (const field of CONTENT_FIELDS) {
    const raw = draft[field]
    if (ARRAY_CONTENT_FIELDS.has(field)) {
      const arr = Array.isArray(raw) ? stableNormalize(raw) : []
      if (arr.length > 0) hasContent = true
      canonical[field] = arr
    } else {
      const normalized = stableNormalize(raw === undefined || raw === null ? '' : raw)
      if (normalized !== '') hasContent = true
      canonical[field] = normalized
    }
  }
  // 空内容统一指纹：null / {} / 全字段空默认值视为同一份「空内容」
  if (!hasContent) return EMPTY_FINGERPRINT
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

module.exports = { computeDraftFingerprint, CONTENT_FIELDS, EMPTY_FINGERPRINT }
