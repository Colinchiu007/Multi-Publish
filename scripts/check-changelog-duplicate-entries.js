#!/usr/bin/env node
'use strict'
/*
 * check-changelog-duplicate-entries.js — CHANGELOG 置顶条目重复的检测与修复
 *
 * 为什么需要它（2026-10-07 实测）：main 上 `CHANGELOG.md` 被 re-sync 型解冲突反复放大——
 * 每次「以陈旧 base 算出我的整块，再 prepend 到别人的全文上」都会把**别人的整份文件**
 * 当成"我新增的部分"再插一遍。实测 1dd05b12（PR #2792）把 277 条目 / 1.86MB 变成
 * 1097 条目 / 7.37MB；#2844 去重到 278 后，到 2ceceb1eb 又涨回 1157 条目 / 828 份冗余、
 * 最坏同一标题重复 16 次。所以这不是"修一次就完"的事故，而是没有东西在检测的循环。
 *
 * 为什么这个门禁必须待在 quality-gate.yml 的 `changes` job（而不是 static-gates）：
 * `CHANGELOG.md` 命中 docs-only 白名单（CI_IGNORED_PATHS 里的根级 `*.md`），
 * 而 static-gates 整个 job 被 `docs-only != 'true'` 门控 ⇒ 放那边的话，
 * 「只改 CHANGELOG 的 PR」恰恰在它最该管的那一轮不会被检测（AGENTS.md 的进白名单前提锁）。
 *
 * 判据（fail-closed）：一个条目 = 以 `# [未发布]` 开头的标题行到下一个标题行之前的整段原文。
 * 同一标题出现 >1 次即判重复；文件缺失/读不动一律判失败，不静默通过。
 *
 * CLI：
 *   node scripts/check-changelog-duplicate-entries.js [--root=<dir>] [--path=CHANGELOG.md] [--json]
 *   node scripts/check-changelog-duplicate-entries.js --dedup [--apply] [--path=...]
 * 退出码：0 干净；1 发现重复或取不到文件；2 用法错误。
 */

const fs = require('node:fs')
const path = require('node:path')

const HEADING = '# [未发布]'

/** 把原文切成 [preamble, entry1, entry2, ...]，逐字节保留（含各自行尾与孤立 CR）。 */
function splitEntries (text) {
  const starts = []
  // 逐行扫偏移，避免依赖 \r\n / \n / \r 哪一种行尾
  let pos = 0
  while (pos <= text.length) {
    const nl = text.indexOf('\n', pos)
    const end = nl === -1 ? text.length : nl + 1
    const line = text.slice(pos, end)
    if (line.replace(/\r+$/, '').startsWith(HEADING)) starts.push(pos)
    if (nl === -1) break
    pos = end
  }
  if (!starts.length) return { preamble: text, blocks: [], starts: [] }
  const preamble = text.slice(0, starts[0])
  const blocks = []
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i]
    const to = i + 1 < starts.length ? starts[i + 1] : text.length
    blocks.push(text.slice(from, to))
  }
  return { preamble, blocks, starts }
}

function titleOf (block) {
  return block.split('\n')[0].replace(/\r+$/, '').trim()
}

/** 同题多份时保留正文最长的那一份；等长则保留首次出现（顺序稳定，可重跑）。
 * 这一条规则 MUST 只有一份实现：analyze 报的 kept 与 dedupe 实际保留的那一份必须是同一个，
 * 否则「门禁说会留哪份」和「修复真留了哪份」就是两套口径（2026-10-07 反证 M3 抓到的正是这种分裂）。 */
function pickKeeper (occurrences) {
  return occurrences.reduce((best, cur) => (cur.bytes > best.bytes ? cur : best), occurrences[0])
}

/** 标题 -> 出现列表（index + bytes），analyze 与 dedupe 共用；顺序即首次出现顺序。 */
function groupByTitle (blocks) {
  const groups = new Map()
  blocks.forEach((b, i) => {
    const t = titleOf(b)
    if (!groups.has(t)) groups.set(t, [])
    groups.get(t).push({ index: i, bytes: Buffer.byteLength(b) })
  })
  return groups
}

/** 检测结果：entries / distinct / redundant（多出来的份数）/ worst / 重复标题明细 */
function analyze (text) {
  const { blocks } = splitEntries(text)
  const groups = groupByTitle(blocks)
  const dups = [...groups.entries()].filter(([, g]) => g.length > 1)
    .map(([t, g]) => ({ title: t, count: g.length, kept: pickKeeper(g).index }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
  return {
    entries: blocks.length,
    distinct: groups.size,
    redundant: blocks.length - groups.size,
    worst: dups.length ? dups[0].count : 1,
    duplicateTitles: dups,
    ok: dups.length === 0,
  }
}

/** 去重：每个标题只留一份（按 pickKeeper），顺序按"首次出现的标题顺序"；preamble 原样在最前。幂等。 */
function dedupe (text) {
  const { preamble, blocks } = splitEntries(text)
  const groups = groupByTitle(blocks)
  const order = []
  const keepIndexByTitle = new Map()
  for (const [t, occurrences] of groups) {
    order.push(t)
    keepIndexByTitle.set(t, pickKeeper(occurrences).index)
  }
  const out = [preamble]
  for (const t of order) out.push(blocks[keepIndexByTitle.get(t)])
  const repaired = out.join('')
  return { text: repaired, removed: blocks.length - order.length, entriesBefore: blocks.length, entriesAfter: order.length }
}

/** 读目标文件；缺失或空内容一律抛错（fail-closed，不把"取不到"读成"没问题"） */
function collect (opts = {}) {
  const root = opts.root || process.cwd()
  const rel = opts.path || 'CHANGELOG.md'
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel)
  if (!fs.existsSync(abs)) throw new Error(`找不到目标文件：${abs}`)
  const text = fs.readFileSync(abs, 'utf8')
  if (!text.trim()) throw new Error(`目标文件为空：${abs}（空文件不是"没有重复"，是取数失败）`)
  const { blocks } = splitEntries(text)
  if (!blocks.length) throw new Error(`目标文件里一条 \`${HEADING}\` 条目都没有：${abs}（判据前提已失效）`)
  return { abs, text, blocks: blocks.length }
}

function main (argv) {
  const get = (name) => {
    const hit = argv.find((a) => a.startsWith(`--${name}=`))
    return hit ? hit.slice(name.length + 3) : null
  }
  const wantDedup = argv.includes('--dedup')
  const apply = argv.includes('--apply')
  const asJson = argv.includes('--json')
  let loaded
  try {
    loaded = collect({ root: get('root') || process.cwd(), path: get('path') || undefined })
  } catch (e) {
    console.error(`FAIL: ${e.message}`)
    return 1
  }
  const a = analyze(loaded.text)
  if (wantDedup) {
    const d = dedupe(loaded.text)
    const after = analyze(d.text)
    const line = `[changelog-dedup] entries=${d.entriesBefore} -> ${d.entriesAfter} removed=${d.removed} | 复核 distinct=${after.distinct} redundant=${after.redundant} ok=${after.ok}`
    if (!after.ok) {
      console.error(`${line} —— 去重后仍有重复，判失败（不落盘）`)
      return 1
    }
    if (apply) {
      if (d.removed === 0) {
        console.log(`${line}（无改动，不写盘）`)
        return 0
      }
      fs.writeFileSync(loaded.abs, d.text, 'utf8')
      const back = analyze(fs.readFileSync(loaded.abs, 'utf8'))
      console.log(`${line} | 写盘后独立回读 redundant=${back.redundant}`)
      return back.redundant === 0 ? 0 : 1
    }
    console.log(`${line}（dry-run：未写盘）`)
    return 0
  }
  if (asJson) {
    console.log(JSON.stringify({ file: loaded.rel || loaded.abs, entries: a.entries, distinct: a.distinct, redundant: a.redundant, worst: a.worst, duplicateTitles: a.duplicateTitles.slice(0, 15) }))
  } else {
    console.log(`[changelog-duplicate-entries] ${loaded.abs}`)
    console.log(`  条目=${a.entries} 去重后应为=${a.distinct} 冗余份数=${a.redundant} 最坏重复=${a.worst}x`)
    for (const d of a.duplicateTitles.slice(0, 15)) console.log(`  ${d.count}x  ${d.title.slice(0, 80)}`)
    if (a.duplicateTitles.length > 15) console.log(`  …另有 ${a.duplicateTitles.length - 15} 个标题重复`)
  }
  if (!a.ok) {
    console.error(`FAIL: CHANGELOG 存在 ${a.redundant} 份重复条目（${a.duplicateTitles.length} 个标题被复制）。` +
      `成因通常是 re-sync 时以陈旧 base 算"我的块"，把别人的整份文件当新增再插一遍。` +
      `修复：node scripts/check-changelog-duplicate-entries.js --dedup --apply`)
    return 1
  }
  console.log('OK: 无重复条目')
  return 0
}

if (require.main === module) process.exit(main(process.argv.slice(2)))

module.exports = { splitEntries, analyze, dedupe, collect, titleOf, HEADING, main }
