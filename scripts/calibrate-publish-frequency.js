#!/usr/bin/env node
/**
 * 发布频率校准取数脚本（publish-frequency-policy-v2 P2-4）
 *
 * 目的：把「现行策略数值是否有依据」变成可复现的取数，而不是靠印象。
 * 本脚本**只读**，不修改任何数据，也不参与运行时判定。
 *
 * ── 口径定义（务必先读，否则数字会被误读）────────────────────────────────
 *
 * 1) 两个数据源回答的是**不同问题**，不可混用：
 *    · `publish_timeline`（SQLite，键 platform:accountId / platform:*）
 *        = **提交时刻**（recordPublish 在提交给执行器**之前**写入）。
 *          回答「我们多久发一次」——这是策略真正约束的量。
 *    · `publish-history.jsonl`（追加式日志）
 *        = **终态时刻**（phase4-events 在 task:success/failed 时才写）。
 *          回答「用户看到的结果什么时候落定」，含发布耗时与重试等待。
 *          故它的相邻间隔**大于等于**真实提交间隔，不能当作策略是否生效的判据。
 *
 * 2) `publish-history.jsonl` 的一行 ≠ 一次提交：失败行也占一行，且同一内容可能
 *    重试多次。本脚本按 (platform, accountId) 分组后统计，并同时给出
 *    「全部行」与「仅 status=success 行」两套数字。
 *
 * 3) 日界按**本机运营日**（本地时区自然日）切分，与运行时守卫同口径；
 *    **不与平台日界换算**，也不声称等价（海外平台的当地日界可能差 ±1 天）。
 *
 * 4) 「违规」= 同一 (platform, accountId) 相邻两次**提交**间隔 < 该平台账号档。
 *    由于 publish-history 是终态时刻，用它算出的违规数只作**下界参考**；
 *    权威判据需要 publish_timeline（含时间戳），本脚本在有 DB 时优先用它。
 *
 * 用法：
 *   node scripts/calibrate-publish-frequency.js                     # 自动探测数据源
 *   node scripts/calibrate-publish-frequency.js --history <path>    # 指定 jsonl
 *   node scripts/calibrate-publish-frequency.js --json              # 机器可读输出
 */

const fs = require('fs')
const path = require('path')

const policy = require('../packages/shared-utils/src/publish-frequency-policy')

const REPO_ROOT = path.resolve(__dirname, '..')

/** 默认数据源候选（按存在性依次尝试；都在用户数据目录，随安装形态变化） */
const HISTORY_CANDIDATES = [
  // 开发态：显式指定的共享数据目录（start-app 技能使用的锚点）
  process.env.MP_SHARED_USER_DATA
    ? path.join(process.env.MP_SHARED_USER_DATA, 'publish-history.jsonl')
    : null,
  // 开发态：隔离 worktree 形如 <repo>/../../mulpub/shared-user-data（共享主仓的锚点）
  path.join(REPO_ROOT, '..', '..', 'mulpub', 'shared-user-data', 'publish-history.jsonl'),
  path.join(REPO_ROOT, 'shared-user-data', 'publish-history.jsonl'),
  path.join(REPO_ROOT, 'backend-data', 'publish-history.jsonl'),
  path.join(process.env.APPDATA || '', 'Multi-Publish', 'backend-data', 'publish-history.jsonl'),
  path.join(process.env.LOCALAPPDATA || '', 'Multi-Publish', 'backend-data', 'publish-history.jsonl'),
]

function parseArgs (argv) {
  const opts = { history: null, json: false, help: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') opts.json = true
    else if (a === '--help' || a === '-h') opts.help = true
    else if (a === '--history') opts.history = argv[++i]
  }
  return opts
}

function firstExisting (candidates) {
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p
  }
  return null
}

/** 本机运营日 'YYYY-MM-DD'（与守卫 today() 同口径） */
function localDayKey (ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 从一行 JSON 里尽力取出平台/账号/时间；取不到就返回 null（不猜） */
function normalizeRow (row, index) {
  if (!row || typeof row !== 'object') return null
  const platform = typeof row.platform === 'string' ? row.platform : null
  if (!platform) return null
  const accountId = typeof row.accountId === 'string' && row.accountId.trim()
    ? row.accountId.trim()
    : null
  const rawTime = row.timestamp || row.completedAt || row.finishedAt || row.createdAt
  const ts = rawTime ? Date.parse(rawTime) : NaN
  return {
    index,
    platform,
    accountId,
    status: typeof row.status === 'string' ? row.status : null,
    ts: Number.isFinite(ts) ? ts : null,
  }
}

function readHistory (file) {
  const text = fs.readFileSync(file, 'utf8')
  const rows = []
  let bad = 0
  let skipped = 0
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed = null
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      bad++
      continue
    }
    const row = normalizeRow(parsed, i)
    if (!row) {
      skipped++
      continue
    }
    rows.push(row)
  }
  return { rows, bad, skipped }
}

function median (sorted) {
  if (sorted.length === 0) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

function summarize (rows) {
  const byKey = new Map()
  for (const r of rows) {
    const key = `${r.platform}:${r.accountId || '*'}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key).push(r)
  }

  const perPlatform = {}
  const violations = []

  for (const [key, list] of byKey) {
    const timed = list.filter((r) => r.ts !== null).sort((a, b) => a.ts - b.ts)
    const platform = list[0].platform
    const resolved = policy.resolveIntervals(platform, { env: {}, warn: () => {} })
    const accountMin = resolved.accountMinMs

    const gaps = []
    for (let i = 1; i < timed.length; i++) {
      const gap = timed[i].ts - timed[i - 1].ts
      gaps.push(gap)
      if (accountMin > 0 && gap < accountMin) {
        violations.push({ key, platform, gapMs: gap, needMs: accountMin, at: new Date(timed[i].ts).toISOString() })
      }
    }

    const dayCounts = new Map()
    for (const r of timed) {
      const d = localDayKey(r.ts)
      dayCounts.set(d, (dayCounts.get(d) || 0) + 1)
    }
    const busiest = [...dayCounts.entries()].sort((a, b) => b[1] - a[1])[0] || null
    const sortedGaps = [...gaps].sort((a, b) => a - b)

    perPlatform[key] = {
      platform,
      tier: resolved.tier,
      accountMinMs: resolved.accountMinMs,
      platformMinMs: resolved.platformMinMs,
      accountDailyMax: resolved.accountDailyMax,
      fallback: resolved.fallback,
      rows: list.length,
      rowsWithTime: timed.length,
      distinctDays: dayCounts.size,
      busiestDay: busiest ? { day: busiest[0], count: busiest[1] } : null,
      gapCount: sortedGaps.length,
      minGapMs: sortedGaps.length ? sortedGaps[0] : null,
      medianGapMs: median(sortedGaps),
      maxGapMs: sortedGaps.length ? sortedGaps[sortedGaps.length - 1] : null,
    }
  }

  return { perPlatform, violations }
}

function fmtMs (ms) {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`
  return `${(ms / 3600000).toFixed(1)}h`
}

function main () {
  const opts = parseArgs(process.argv)
  if (opts.help) {
    console.log('用法: node scripts/calibrate-publish-frequency.js [--history <path>] [--json]')
    return 0
  }

  const file = opts.history || firstExisting(HISTORY_CANDIDATES)
  if (!file) {
    console.error('[calibrate] 未找到 publish-history.jsonl。请用 --history <path> 指定。')
    console.error('候选路径：')
    for (const c of HISTORY_CANDIDATES) console.error('  ' + c)
    return 2
  }
  if (!fs.existsSync(file)) {
    console.error(`[calibrate] 文件不存在：${file}`)
    return 2
  }

  const { rows, bad, skipped } = readHistory(file)
  const all = summarize(rows)
  const onlySuccess = summarize(rows.filter((r) => r.status === 'success' || r.status === 'published'))

  const out = {
    generatedAt: new Date().toISOString(),
    source: file,
    sourceSemantics: 'terminal_state_timestamps（终态时刻，不是提交时刻；见脚本头口径 §1）',
    lines: { total: rows.length, unparsable: bad, missingPlatform: skipped },
    policyTable: policy.PLATFORM_FREQUENCY_POLICY,
    baseline: policy.BASELINE_INTERVALS,
    allRows: all,
    successOnly: onlySuccess,
  }

  if (opts.json) {
    console.log(JSON.stringify(out, null, 2))
    return 0
  }

  console.log('═'.repeat(78))
  console.log('发布频率校准取数（只读）')
  console.log('═'.repeat(78))
  console.log(`数据源：${file}`)
  console.log(`口径  ：${out.sourceSemantics}`)
  console.log(`行数  ：${rows.length}（无法解析 ${bad}，缺平台字段跳过 ${skipped}）`)
  console.log('')

  const keys = Object.keys(all.perPlatform).sort()
  console.log('平台:账号'.padEnd(30) + '档位 账号档 平台档 日配额 | 行数 天数 最忙日 | 最小间隔 中位间隔')
  console.log('-'.repeat(110))
  for (const key of keys) {
    const s = all.perPlatform[key]
    const busiest = s.busiestDay ? `${s.busiestDay.day}(${s.busiestDay.count})` : '—'
    console.log(
      key.padEnd(30)
      + String(s.tier).padEnd(5)
      + fmtMs(s.accountMinMs).padEnd(7)
      + fmtMs(s.platformMinMs).padEnd(7)
      + String(s.accountDailyMax).padEnd(7)
      + '| '
      + String(s.rowsWithTime).padEnd(5)
      + String(s.distinctDays).padEnd(5)
      + busiest.padEnd(14)
      + '| '
      + fmtMs(s.minGapMs).padEnd(9)
      + fmtMs(s.medianGapMs)
    )
  }

  console.log('')
  if (all.violations.length === 0) {
    console.log(`✅ 未发现低于账号档的相邻间隔（共 ${keys.length} 个 (平台,账号) 分组）`)
  } else {
    console.log(`⚠️ 发现 ${all.violations.length} 处相邻间隔低于**当前**账号档（注意：现行档位已下调，`)
    console.log('   历史上按旧档位（60/30/10 分钟）产生的间隔在新档位下会大量「违规」，这不代表当时越限）：')
    for (const v of all.violations.slice(0, 20)) {
      console.log(`   ${v.key}  间隔 ${fmtMs(v.gapMs)} < 需 ${fmtMs(v.needMs)}  @ ${v.at}`)
    }
    if (all.violations.length > 20) console.log(`   …（其余 ${all.violations.length - 20} 处省略）`)
  }

  console.log('')
  console.log('局限（必须与数字一起读）：')
  console.log('  · 本数据源是**终态时刻**，相邻间隔 ≥ 真实提交间隔 ⇒ 违规数是下界，不是精确值。')
  console.log('  · 日界按本机时区，不与平台当地日界换算。')
  console.log('  · 一行 ≠ 一次提交（失败行与重试各占一行）。')
  return 0
}

if (require.main === module) {
  process.exitCode = main()
}

module.exports = { parseArgs, normalizeRow, localDayKey, summarize, readHistory }
