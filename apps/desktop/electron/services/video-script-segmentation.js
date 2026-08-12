// @ts-check
/**
 * video-script-segmentation — 长文案段落化（video-content-fidelity S2）。
 *
 * 把用户输入的完整文案切分为有序段落（空行优先、句号次之），作为
 * fidelity/hybrid 分镜的 source_paras 绑定基准与全文注入来源。
 * 纯函数、无副作用，独立于流水线可单测。
 *
 * 契约（对齐 openspec video-content-fidelity）：
 *   - 段落化输出 [{index, text, sentences[]}]，index 与输入顺序一致
 *   - 空输入/全空白 → 空数组（由调用方按业务失败处理）
 *   - 段落数 > maxParagraphs 或全文 > maxFullTextChars → 截断并标记 truncated + truncatedAt
 *   - 无空行且句数 ≤ 7 → 退化单段 [{index:0, text: 全文}]
 */
'use strict'

const DEFAULT_OPTIONS = Object.freeze({
  maxFullTextChars: 6000,
  maxParagraphs: 20,
})

const SENTENCE_ENDINGS = /[。！？!?；;]/

function _clampInt (value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/**
 * 段内按句号切句；无句号时整段作为一句。
 * @param {string} block
 * @returns {string[]}
 */
function splitSentences (block) {
  const text = String(block || '').trim()
  if (!text) return []
  const parts = text.split(SENTENCE_ENDINGS).map(s => s.trim()).filter(Boolean)
  return parts.length > 0 ? parts : [text]
}

/**
 * 长文案段落化。
 * @param {unknown} text
 * @param {object} [options]
 * @param {number} [options.maxFullTextChars]
 * @param {number} [options.maxParagraphs]
 * @returns {{ paragraphs: Array<{index:number, text:string, sentences:string[]}>, truncated: boolean, truncatedAt: number[] }}
 */
function segmentScript (text, options = {}) {
  const maxFullTextChars = _clampInt(
    options.maxFullTextChars,
    500,
    20000,
    DEFAULT_OPTIONS.maxFullTextChars,
  )
  const maxParagraphs = _clampInt(options.maxParagraphs, 1, 50, DEFAULT_OPTIONS.maxParagraphs)

  const source = typeof text === 'string' ? text : ''
  const trimmed = source.trim()
  if (!trimmed) return { paragraphs: [], truncated: false, truncatedAt: [] }

  // 空行/换行切段
  const blocks = trimmed
    .split(/\n\s*\n|\n+/)
    .map(block => block.trim())
    .filter(Boolean)

  let paragraphs = blocks.map((block, index) => ({
    index,
    text: block,
    sentences: splitSentences(block),
  }))

  const truncatedAt = []
  let truncated = false

  // 段落上限
  if (paragraphs.length > maxParagraphs) {
    truncated = true
    for (let i = maxParagraphs; i < paragraphs.length; i++) truncatedAt.push(paragraphs[i].index)
    paragraphs = paragraphs.slice(0, maxParagraphs)
  }

  // 全文长度上限（累计段落字符）
  let total = 0
  for (let i = 0; i < paragraphs.length; i++) {
    total += paragraphs[i].text.length
    if (total > maxFullTextChars) {
      truncated = true
      for (let j = i; j < paragraphs.length; j++) truncatedAt.push(paragraphs[j].index)
      paragraphs = paragraphs.slice(0, i)
      break
    }
  }

  return { paragraphs, truncated, truncatedAt }
}

module.exports = {
  DEFAULT_OPTIONS,
  splitSentences,
  segmentScript,
}
