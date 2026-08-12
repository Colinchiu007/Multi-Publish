// @ts-check
/**
 * 字幕时间戳真实对齐服务（Tier2 ASR）— 编排 AlignerBridge + subtitle-align-aggregator。
 *
 * 输入 scenes（TTS 后：含 audioPath + duration + subtitleBlocks）→ 每场景：
 *   - /align 取词级时间（initial_prompt = 块文本拼接，提升中文识别）
 *   - 聚合到分句块（真实 start/end）→ 生成 subtitleTimeline（含 charTimings）
 *   - 附加 subtitleAlign = { aligned, method, coverage, reason }（持久化到 scene）
 * fail-open：任何失败（服务不可用/超时/音频缺失）保留原场景并记录 reason，不中断流水线。
 * 并发：ASR 为 CPU 密集，默认 2 路并发（可通过 opts.concurrency 调整）。
 */
'use strict'

const AlignerBridge = require('./aligner-bridge')
const { isAlignerAvailable } = require('./aligner-bridge')
const { alignSubtitleBlocks } = require('./subtitle-align-aggregator')

function buildTimelineItem (block, totalDuration) {
  const charCount = block.text.length
  const charDuration = charCount > 0 ? (block.endTime - block.startTime) / charCount : 0
  const charTimings = []
  for (let c = 0; c < charCount; c++) {
    charTimings.push(Math.round((block.startTime + (c + 1) * charDuration) * 100) / 100)
  }
  return {
    text: block.text,
    startTime: block.startTime,
    endTime: block.endTime,
    charTimings,
  }
}

/**
 * @param {object[]} scenes - TTS 后的场景（含 audioPath/duration/subtitleBlocks）
 * @param {{ log?: any, alignerBridge?: any, concurrency?: number }} [opts]
 * @returns {Promise<object[]>} 附加 subtitleTimeline/subtitleAlign 的场景（原数组原地增强）
 */
async function alignScenes (scenes, opts = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) return scenes
  const log = opts.log || require('./logger')
  const bridge = opts.alignerBridge || new AlignerBridge({ log })
  const concurrency = Math.max(1, opts.concurrency || 2)

  const candidates = scenes.map((scene, idx) => ({ scene, idx })).filter(
    ({ scene }) => typeof scene.audioPath === 'string' && scene.audioPath &&
      Array.isArray(scene.subtitleBlocks) && scene.subtitleBlocks.length > 0,
  )
  if (candidates.length === 0) return scenes
  if (!isAlignerAvailable()) {
    // fail-fast：aligner 未部署/未配置时跳过（不 spawn、不超时），记录原因
    for (const { scene } of candidates) {
      scene.subtitleAlign = { aligned: false, method: 'estimate', coverage: 0, reason: 'aligner_unavailable' }
    }
    return scenes
  }

  let cursor = 0
  const worker = async () => {
    while (cursor < candidates.length) {
      const { scene } = candidates[cursor++]
      const blocks = scene.subtitleBlocks.map((b, i) => ({
        displayOrder: typeof b.displayOrder === 'number' ? b.displayOrder : i,
        text: typeof b === 'string' ? b : b.text || '',
      }))
      const initialPrompt = blocks.map((b) => b.text).join('')
      try {
        const started = Date.now()
        const result = await bridge.transcribeAudio(scene.audioPath, {
          model: 'base',
          language: 'zh',
          initialPrompt,
        })
        const words = Array.isArray(result?.words) ? result.words : []
        if (words.length === 0) {
          scene.subtitleAlign = { aligned: false, method: 'estimate', coverage: 0, reason: 'asr_no_words', elapsedMs: Date.now() - started }
          continue
        }
        const alignedResult = alignSubtitleBlocks(blocks, words, scene.duration || 10)
        scene.subtitleTimeline = alignedResult.aligned.map((b) => buildTimelineItem(b, alignedResult.totalDuration))
        scene.subtitleAlign = {
          aligned: alignedResult.method === 'asr' && alignedResult.coverage >= 0.5,
          method: alignedResult.method,
          coverage: Math.round(alignedResult.coverage * 1000) / 1000,
          reason: alignedResult.warnings.length > 0 ? `partial:${alignedResult.warnings.length}` : 'ok',
          elapsedMs: Date.now() - started,
        }
      } catch (error) {
        const reason = error && error.code ? String(error.code) : (error && error.message ? String(error.message) : 'align_failed')
        log.warn('SubtitleAlignService', `场景 ${scene.index} 对齐失败（fail-open 保留估算）：${reason}`)
        scene.subtitleAlign = { aligned: false, method: 'estimate', coverage: 0, reason: reason.slice(0, 80) }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, candidates.length) }, worker))
  return scenes
}

module.exports = { alignScenes, buildTimelineItem }
