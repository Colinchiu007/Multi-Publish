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
 * 判据（fail-closed）：一个条目 = 一条一级标题（排除节标题 `# CHANGELOG`）到下一个一级标题之前的整段原文。
 * 该口径与 `check-changelog-growth.js` 共用同一份实现（`scripts/changelog-entries.js`），
 * 不再各自定义 —— 否则两把锁对"什么是一条条目"会长期口径分裂（2026-10-07 实测 1,158 vs 1,184）。
 * 同一标题出现 >1 次即判重复；文件缺失/读不动一律判失败，不静默通过。
 *
 * CLI：
 *   node scripts/check-changelog-duplicate-entries.js --base=<ref> [--head=HEAD]   # CI 判据：本 PR 是否增加了副本数
 *   node scripts/check-changelog-duplicate-entries.js [--root=<dir>] [--path=CHANGELOG.md] [--json]   # 绝对态：现在有多少重复
 *   node scripts/check-changelog-duplicate-entries.js --dedup [--apply] [--path=...]                    # 修复子命令
 * 退出码：0 通过；1 判红（副本变多 / --strict 下存在重复 / 取不到文件）；2 用法错误。
 *
 * ⚠️ 为什么 CI 判据是"副本数不得变多"而不是"存在重复即红"（2026-10-07 与并发门禁的实测冲突）：
 *   main 上的 `scripts/check-changelog-growth.js` 刻意用**标题多重集包含**判"条目不许丢"
 *   （动因是 #2884 把 1133 条整份删空），而 main 的历史里本就存在数百份重复副本（实测 base 冗余 828 份）。
 *   ⇒「存在重复即红」会要求删副本，而 growth 要求保留每一份副本，两把锁在现有历史上**互斥**：
 *   谁都不可能同时绿，去重因此落不了地。本门禁只守自己那份不变量——**一次 PR 不得把任何标题的副本数变大**
 *   （这正是 re-sync 乘法型污染的形状），并允许变好；把绝对态判据留给 `--strict`/`--dedup` 自行核对。
 *   历史副本的清理需要同时改 growth 的口径（加"允许把同题副本削到 1 份，且保留的那份必须逐字节等于 base 的某一份"
 *   这一条例外），属另一次改动，见对应 issue。
 */

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

/*
 * 条目模型不在本文件里定义 —— 单一实现是 ./changelog-entries.js。
 * 本文件原先自带一份 `HEADING = '# [未发布]'` 的切块口径，而 growth 用
 * `HEADING_RE`（一级标题排除节标题），实测同一份 origin/main blob 上两者数出 1,158 vs 1,184 条，
 * ⇒ 本 PR 里做的清理与检测都可能落在对方的盲区。现在两把锁共用同一份切块 / 取标题 / 分组 / 选保留份 / 去重。
 */
const entries = require('./changelog-entries.js')

const HEADING_RE = entries.HEADING_RE
const splitEntries = entries.splitEntries
const titleOf = entries.titleOf
const pickKeeper = entries.pickKeeper
const groupByTitle = entries.groupByTitle
const analyze = entries.analyze
const dedupe = entries.dedupe

/** 比较两版的重复度：返回每个标题副本数的变化（只关心"变多"）。 */
function compareByTitle (baseText, headText) {
  const bc = countByTitle(baseText)
  const hc = countByTitle(headText)
  const grew = []
  // 遍历两侧标题的并集：只遍历 base 会漏掉"本 PR 自己新增的条目被插了两遍"（base 里根本没这标题）。
  // 容许量：base 已有的标题一份都不许多（n>0 ⇒ 上限 n）；base 没有的新标题允许出现 1 次（正常加条目的形状）。
  for (const t of new Set([...bc.keys(), ...hc.keys()])) {
    const n = bc.get(t) || 0
    const m = hc.get(t) || 0
    const allowed = n === 0 ? 1 : n
    if (m > allowed) grew.push({ title: t, from: n, to: m })
  }
  grew.sort((a, b) => (b.to - b.from) - (a.to - a.from) || a.title.localeCompare(b.title))
  return {
    grew,
    baseRedundant: [...bc.values()].reduce((s, n) => s + (n - 1), 0),
    headRedundant: [...hc.values()].reduce((s, n) => s + (n - 1), 0),
  }
}

function countByTitle (text) { return entries.countByTitle(text) }

/** 读某个 ref 上的 CHANGELOG 文本；读不到一律抛，不返回空串（空串会被下游读成"零条目"）。
 * 用 cat-file blob 取**原始 blob**，避免任何 checkout 期的行尾转换干扰两侧比较（与 growth 门禁同法）。 */
function readRef (ref, rel, root) {
  const out = tryGit(['-C', root, 'cat-file', 'blob', `${ref}:${rel}`])
  if (out === null) throw new Error(`读不到 ${ref}:${rel}（ref 或文件不存在，不得判为"没有重复"）`)
  return out.toString('utf8')
}

function tryGit (args) {
  try { return execFileSync('git', args, { maxBuffer: 1 << 28 }) } catch (e) { return null }
}
/** 读工作区目标文件；缺失/空/无条目一律抛错（fail-closed，不把"取不到"读成"没问题"） */
function collect (opts = {}) {
  const root = opts.root || process.cwd()
  const rel = opts.path || 'CHANGELOG.md'
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel)
  if (!fs.existsSync(abs)) throw new Error(`找不到目标文件：${abs}`)
  const text = fs.readFileSync(abs, 'utf8')
  if (!text.trim()) throw new Error(`目标文件为空：${abs}（空文件不是"没有重复"，是取数失败）`)
  const { blocks } = splitEntries(text)
  if (!blocks.length) throw new Error(`目标文件里一条条目都没有（判据口径：一级标题排除节标题 \`# CHANGELOG\`）：${abs}（判据前提已失效）`)
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
  const root = get('root') || process.cwd()
  const rel = get('path') || 'CHANGELOG.md'
  const baseRef = get('base')

  // ── CI 判据（棘轮）：本 PR 不得把任何标题的副本数变大 ──
  if (baseRef && !wantDedup) {
    let cmp
    try {
      cmp = compareByTitle(readRef(baseRef, rel, root), readRef(get('head') || 'HEAD', rel, root))
    } catch (e) {
      console.error(`FAIL: ${e.message}`)
      return 1
    }
    const grewTotal = cmp.grew.reduce((s, g) => s + (g.to - g.from), 0)
    console.log(`[changelog-dup-ratchet] base=${baseRef} head=${get('head') || 'HEAD'}`)
    console.log(`  冗余份数 ${cmp.baseRedundant} -> ${cmp.headRedundant}；本 PR 新增副本=${grewTotal}`)
    for (const g of cmp.grew.slice(0, 15)) console.log(`  ${g.from}x -> ${g.to}x  ${g.title.slice(0, 78)}`)
    if (cmp.grew.length > 15) console.log(`  …另有 ${cmp.grew.length - 15} 个标题副本变多`)
    if (grewTotal > 0) {
      console.error(`FAIL: 本 PR 新增了 ${grewTotal} 份重复副本（${cmp.grew.length} 个标题被复制）。`
        + '正解：只在文件顶部插入你自己那一条；不要用「我的块 = mine − base」整段 prepend——base 滞后时那会把上游已有内容当新增再插一遍。')
      return 1
    }
    console.log('OK: 本 PR 未增加任何标题的副本数')
    return 0
  }

  let loaded
  try {
    loaded = collect({ root, path: rel })
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

module.exports = { splitEntries, analyze, dedupe, collect, countByTitle, compareByTitle, titleOf, readRef, HEADING_RE, pickKeeper, main }
