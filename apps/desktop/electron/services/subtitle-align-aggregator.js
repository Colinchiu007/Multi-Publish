// @ts-check
/**
 * 字幕时间戳真实对齐聚合器（JS 镜像）— 对齐 story2video-engine/src/subtitle-aligner.ts（TS 权威版）。
 *
 * Electron 主进程为纯 JS 运行时，无法直接 require TS 引擎包；本文件为 self-contained JS 端口，
 * 行为由 parity 测试（subtitle-aligner-parity）与 TS 版逐字锁死（同一语料双实现输出一致）。
 * 规则：归一化去标点/小写 + Levenshtein 容差匹配（ratio>=0.55，窗口滑动 0..3 词）、区间连续 half-up、
 * 失败块回退估算 + warning、coverage/method。
 */
'use strict'

function normalizeForAlign (text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\s。！？；，、：“”‘’（）《》【】「」『』….,!?;:'"()\x5b\x5d<>\-—–_~@#$%^&*+=|/\\`]/g, '')
}

function round2HalfUp (x) {
  return Math.round(x * 100) / 100
}

function levenshtein (a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return prev[n]
}

/**
 * @param {{ displayOrder: number; text: string }[]} blocks
 * @param {{ text: string; start: number; end: number; probability?: number }[]} words
 * @param {number} [fallbackDuration]
 */
function alignSubtitleBlocks (blocks, words, fallbackDuration = 10) {
  const warnings = []
  const normBlocks = blocks.map((b) => ({ ...b, norm: normalizeForAlign(b.text) }))
  const normWords = (words || []).map((w) => ({ ...w, norm: normalizeForAlign(w.text) }))

  const aligned = []
  let cursor = 0
  let matchedChars = 0
  const totalChars = normBlocks.reduce((s, b) => s + b.norm.length, 0) || 1

  for (const block of normBlocks) {
    const target = block.norm
    if (!target) {
      aligned.push({ displayOrder: block.displayOrder, text: block.text, startTime: 0, endTime: 0, confidence: 0, source: 'estimate' })
      continue
    }
    const windowLimit = Math.ceil(target.length * 1.25) + 4
    let best = { accLen: 0, dist: Infinity, first: cursor, last: cursor - 1 }
    for (let slide = 0; slide <= 3 && cursor + slide <= normWords.length; slide++) {
      let a = ''
      let f = cursor + slide
      let l = f - 1
      for (let i = f; i < normWords.length; i++) {
        a += normWords[i].norm
        l = i
        if (a.length >= target.length || a.length >= windowLimit) break
      }
      if (!a) continue
      const dist = levenshtein(a, target)
      if (dist < best.dist) best = { accLen: a.length, dist, first: f, last: l }
    }
    const ratio = target.length > 0 ? 1 - best.dist / Math.max(target.length, best.accLen) : 0
    if (ratio >= 0.55 && best.last >= best.first) {
      aligned.push({
        displayOrder: block.displayOrder,
        text: block.text,
        startTime: round2HalfUp(normWords[best.first].start),
        endTime: round2HalfUp(normWords[best.last].end),
        confidence: Math.min(1, best.accLen / Math.max(1, target.length)),
        source: 'asr',
      })
      matchedChars += target.length
      cursor = Math.min(normWords.length, best.last + 1)
    } else {
      warnings.push(`块 ${block.displayOrder}（${block.text.slice(0, 12)}…）未匹配到 ASR 词，回退估算`)
      aligned.push({ displayOrder: block.displayOrder, text: block.text, startTime: 0, endTime: 0, confidence: 0, source: 'estimate' })
      if (best.last >= best.first) cursor = Math.min(normWords.length, best.last + 1)
    }
  }

  const estBlocks = aligned.filter((b) => b.source === 'estimate')
  if (estBlocks.length > 0) {
    const lastAsrEnd = aligned.filter((b) => b.source === 'asr').reduce((m, b) => Math.max(m, b.endTime), 0)
    const estTotalChars = estBlocks.reduce((s, b) => s + (normalizeForAlign(b.text).length || 1), 0)
    let t = lastAsrEnd
    for (const b of estBlocks) {
      const dur = estTotalChars > 0 ? ((normalizeForAlign(b.text).length || 1) / estTotalChars) * Math.max(0, fallbackDuration - lastAsrEnd) : 0
      b.startTime = round2HalfUp(t)
      b.endTime = round2HalfUp(t + dur)
      t += dur
    }
  }

  for (let i = 1; i < aligned.length; i++) {
    const prevEnd = aligned[i - 1].endTime
    if (aligned[i].startTime < prevEnd) aligned[i].startTime = prevEnd
    if (aligned[i].endTime < aligned[i].startTime) aligned[i].endTime = aligned[i].startTime
  }

  const method = matchedChars > 0 ? 'asr' : 'estimate'
  const totalDuration = aligned.length > 0 ? aligned[aligned.length - 1].endTime : 0
  return { aligned, method, totalDuration: round2HalfUp(totalDuration), coverage: matchedChars / totalChars, warnings }
}

module.exports = { alignSubtitleBlocks, normalizeForAlign, round2HalfUp, levenshtein }
