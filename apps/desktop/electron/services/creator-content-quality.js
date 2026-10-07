/**
 * creator-content-quality.js — 正文质量分级
 *
 * 分级决定 UI 徽章与「是否推荐送入 AI 写作」。判错的后果是双向的：
 * 把 stub 当成 full，用户会拿到一段只有标题的文字却以为有完整正文；
 * 反之把 full 当成 stub，会让真正可用的正文被无谓地降级提示。
 *
 * 三档：
 *   full    —— 字幕正文，质量高
 *   partial —— 描述正文，质量有限
 *   stub    —— 仅标题与简介
 */

'use strict'

const QUALITY = { FULL: 'full', PARTIAL: 'partial', STUB: 'stub' }

/** full 阈值：字幕正文低于此长度多半只抓到片段，不足以喂 AI 写作 */
const MIN_FULL_CHARS = 500
/** partial 阈值：描述正文达到此长度才有参考价值 */
const MIN_PARTIAL_CHARS = 200

/** playlistItems 单页上限 50，再大需翻页（额外消耗配额） */
const DEFAULT_COLLECT_PAGE_SIZE = 50

const TRANSCRIPT_SOURCES = new Set(['subtitle', 'auto', 'translated'])

/**
 * @param {string|null|undefined} transcriptSource 字幕来源标记
 * @param {string|null|undefined} body             正文
 * @returns {'full'|'partial'|'stub'}
 */
function classifyContentQuality (transcriptSource, body) {
  const text = typeof body === 'string' ? body.trim() : ''
  const len = text.length
  if (len === 0) return QUALITY.STUB

  const isTranscript = typeof transcriptSource === 'string' &&
    TRANSCRIPT_SOURCES.has(transcriptSource.toLowerCase())

  // 字幕来源但长度不足：可能是只抓到一句/一段，宁可降级也不要谎报 full
  if (isTranscript) return len >= MIN_FULL_CHARS ? QUALITY.FULL : QUALITY.PARTIAL

  // 非字幕来源（描述或未知来源）按长度给 partial/stub
  return len >= MIN_PARTIAL_CHARS ? QUALITY.PARTIAL : QUALITY.STUB
}

module.exports = {
  QUALITY,
  MIN_FULL_CHARS,
  MIN_PARTIAL_CHARS,
  DEFAULT_COLLECT_PAGE_SIZE,
  classifyContentQuality,
}