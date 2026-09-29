#!/usr/bin/env node
// 门禁执行记录「远程同步」欠账棘轮。
//
// 为什么需要它（2026-09-28 在 origin/main 上实测）：`.quality-gates.md` 里有 127 条
// `| 远程同步 |` 行，其中 95 条已按既有口径回填成「PR #NNNN 于 … squash 合并，merge SHA …，
// origin/main 已核验，远端分支已删除」，但仍有 32 条停在 PENDING / OPEN / 待 PR 合并后核验 …
// —— 而**没有任何东西检测这笔欠账**。已合并的记录顶着"未收口"字样，会被下一个会话读成
// "这活儿还没干完"，于是重复开工。本门禁把那批残留变成显式、只能缩小的清单。
//
// 三条被实测钉住的设计前提（不是想当然）：
//   1) 状态列是自由文本（实测 22 种写法）⇒ 判定用闭合词表，未知写法一律算未收口（fail closed）；
//      否则"换个新词写 PENDING"就能绕过。
//   2) 记录标题是唯一可用的键：从 `（…，slug，date）` 抽 slug 只覆盖 319 条里的 160 条且撞 4 次，
//      不能用；标题全文在 319 条里只有 1 组重复。
//   3) 该文件 blob 是 LF、工作区是 CRLF（`i/lf w/crlf attr/text=auto`）⇒ 键必须先去尾部 CR，
//      否则同一内容在两种检出下判成两回事。
//
// 用法：node scripts/check-gate-record-debt.js [--json]
// 回归：node --test scripts/check-gate-record-debt.test.js

const fs = require('fs')
const path = require('path')

const GATE_FILE = '.quality-gates.md'
const ROW_RE = /^\|\s*远程同步\s*\|/
const HEADING_RE = /^## /

// 第二源（change enforce-gate-record-presence D5）：每 PR 一篇记录文件，欠账登记写在文件自身的
// frontmatter 里。下划线开头的文件（_TEMPLATE.md 等）与 _exempt/ 子目录不参与记录计数——
// 模板自己就带一行 `| 远程同步 | PENDING |`，把它当记录扫就是一条永远的红。
const RECORDS_REL = path.join('openspec', 'records')
const RECORD_FIELD_REASON = 'sync_reason'
const RECORD_FIELD_OWNER = 'sync_backfill_owner'

// 已收口的写法。只允许这一侧扩张，新增未收口写法必须走 gate-record-debt-ledger.json。
const CLOSED_RE = /^(PASS|N\/A|✅|已)/

// 重复的同一条 ## 记录标题。置顶型文档最典型的自我损坏就是把同一条记录写两遍
// （实测踩过：一次补丁把 1MB 的 .quality-gates.md 写成内容翻倍，标题计数 1→2）。
// 判据本身是单向包含（"每行都还在"）抓不到重复，所以这里显式统计标题出现次数。
// 本清单只能缩小：清理掉历史那份重复时顺手删除对应条目；新增重复一律判红。
const DUPLICATE_HEADINGS_ALLOWED = new Set([
  '本次执行记录：Story2Video 历史失败提示脱敏与模型账号细化（error-message-fix，2026-08-19）',
])

// 登记清单落在 JSON 里（与 scripts/debt-baseline.json 同形，便于逐条带原因）。
// heading -> { reason }：为什么本 PR 不回填它。只能缩小——回填一条记录时必须顺手删掉它的条目，
// 否则 stale 判红；这条耦合保证清单单调收敛。
const LEDGER_FILE = path.join(__dirname, 'gate-record-debt-ledger.json')

function normalize(s) {
  return s.replace(/\r$/, '').trim()
}

function loadLedger(root) {
  // 必须认参数：测试一直按 `loadLedger(root)` 调用，而无参实现会永远读真实清单，
  // 于是"给了夹具目录却拿到生产 ledger"—— 静默读生产，属假绿通道。
  const file = root
    ? path.join(root, 'scripts', path.basename(LEDGER_FILE))
    : LEDGER_FILE
  if (!fs.existsSync(file)) return {}
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out = {}
  for (const [heading, entry] of Object.entries(raw)) {
    const reason = typeof entry === 'string' ? entry : entry && entry.reason
    if (!reason || !String(reason).trim()) {
      throw new Error(`登记项缺少原因（每个欠账必须写明为什么没回填）：${heading}`)
    }
    out[heading] = String(reason).trim()
  }
  return out
}

// ── 第二源：openspec/records/*.md ────────────────────────────────────────────
// 缺席与读不动都必须抛错：一个不完整的遍历判出来是"零条违规"，那是假绿（与 worktree
// 链接扫描 R3 同形）。允许"目录存在但没有记录文件"——那是载体迁移的起点状态，不是扫描失败。
function listRecordFiles(recordsRoot) {
  if (!fs.existsSync(recordsRoot)) {
    throw new Error(`记录目录不存在：${recordsRoot}（openspec/records/ 缺失即 enforce-gate-record-presence tasks 1.1 未落地，不得当成"零条记录"通过）`)
  }
  let dirents
  try {
    dirents = fs.readdirSync(recordsRoot, { withFileTypes: true })
  } catch (e) {
    throw new Error(`无法枚举记录目录 ${recordsRoot}：${e.message}`)
  }
  return dirents
    .filter(d => d.isFile() && d.name.endsWith('.md') && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort()
}

// frontmatter 只取 `---` 与 `---` 之间的 `key: value`；`#` 开头的注释行忽略（模板里要写说明）。
function readFrontmatter(text) {
  const out = {}
  const lines = text.split('\n')
  if ((lines[0] || '').replace(/\r$/, '') !== '---') return { fm: out, hasFm: false }
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].replace(/\r$/, '')
    if (raw === '---') break
    if (/^\s*#/.test(raw) || !raw.trim()) continue
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw)
    if (m) out[m[1]] = m[2].trim()
  }
  return { fm: out, hasFm: true }
}

function readRecord(recordsRoot, fileName) {
  const text = fs.readFileSync(path.join(recordsRoot, fileName), 'utf8')
  const name = fileName.replace(/\.md$/, '')
  const { fm } = readFrontmatter(text)
  const rowLine = text.split('\n').find(l => ROW_RE.test(l))
  const status = rowLine ? (rowLine.split('|').map(normalize)[2] || '') : null
  const reason = fm[RECORD_FIELD_REASON]
  const owner = fm[RECORD_FIELD_OWNER]
  const hasAnyRegistration = Object.prototype.hasOwnProperty.call(fm, RECORD_FIELD_REASON)
    || Object.prototype.hasOwnProperty.call(fm, RECORD_FIELD_OWNER)
  return {
    name,
    fileName,
    rowPresent: !!rowLine,
    status,
    closed: !!rowLine && CLOSED_RE.test(status),
    hasRegistration: hasAnyRegistration,
    reasonMissing: !reason || !String(reason).trim(),
    ownerMissing: !owner || !String(owner).trim(),
  }
}

function collect({ root = process.cwd(), ledger = loadLedger(), duplicatesAllowed = DUPLICATE_HEADINGS_ALLOWED, recordsRoot = path.join(root, RECORDS_REL) } = {}) {
  const file = path.join(root, GATE_FILE)
  if (!fs.existsSync(file)) throw new Error(`${GATE_FILE} 不存在：${file}`)
  const lines = fs.readFileSync(file, 'utf8').split('\n')

  const headings = []
  lines.forEach((l, i) => {
    if (HEADING_RE.test(l)) headings.push({ line: i, text: normalize(l.slice(3)) })
  })

  const open = []
  const seen = new Set()
  let rowCount = 0
  for (let i = 0; i < lines.length; i++) {
    if (!ROW_RE.test(lines[i])) continue
    rowCount++
    const cells = lines[i].split('|').map(normalize)
    const status = cells[2] || ''
    if (CLOSED_RE.test(status)) continue
    let heading = null
    for (const h of headings) {
      if (h.line < i) heading = h.text
      else break
    }
    if (!heading) heading = '(文件首个 ## 之前，无法归属)'
    seen.add(heading)
    if (!Object.prototype.hasOwnProperty.call(ledger, heading)) {
      open.push({ line: i + 1, status, heading, evidence: cells[3] || '', source: 'legacy' })
    }
  }

  if (rowCount === 0) throw new Error(`未找到任何 远程同步 行（${file}）——空遍历不得判为"零欠账"`)

  // ── 覆盖检测：本文件原有机制只管「已存在的行是否收口」，对「整条记录根本没有这一行」
  //    完全失明。实测 origin/main 2026-09-28：316 篇形如执行记录的 `## ` 标题里有 **192 篇**
  //    没有 远程同步行，而门禁照样 RC=0 报 OK —— 缺席比说谎更糟，说谎至少下一个人看得见。
  //
  // 「执行记录」的判据（不是所有 ## 都是记录）：`^本次执行记录` 或标题含日期。
  // 实测 321 个 ## 标题里 316 个符合，剩下 5 个是结构性章节（固定强制门禁 / 提交前自检清单 /
  // 强制卡点规则 / 违规处理 / 质量节拍阶段对照），它们永远不该有这一行，必须排除。
  const blocks = headings.map((h, k) => ({
    ...h,
    end: k + 1 < headings.length ? headings[k + 1].line : lines.length,
  }))
  const isRecordHeading = (t) => /^本次执行记录/.test(t) || /20\d\d-\d\d-\d\d/.test(t)
  const records = blocks.filter(b => isRecordHeading(b.text))
  const recordsWithoutRow = records.filter(b => !lines.slice(b.line, b.end).some(l => ROW_RE.test(l)))
  // 强制项只有一条：**最顶部**那篇执行记录必须带这一行。记录按惯例插在文件顶部，所以"最新一篇"
  // 定义良好、无需基线、无需清单维护。已知漏洞如实记下：若某会话把新记录插在了非顶部位置，
  // 本条拦不住；历史 192 篇也不追溯（只做可见，不拦截），否则一上线就红成不可用。
  const topRecord = records[0] || null
  const topRecordMissingRow = !!topRecord && !lines.slice(topRecord.line, topRecord.end).some(l => ROW_RE.test(l))

  // 标题计数：同一 ## 标题出现两次即"同一条记录被写了两遍"，除明确登记的历史重复外一律判红
  const headingCounts = new Map()
  for (const h of headings) headingCounts.set(h.text, (headingCounts.get(h.text) || 0) + 1)
  const duplicates = [...headingCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([text, count]) => ({ text, count }))
    .filter(d => !duplicatesAllowed.has(d.text))

  const stale = Object.keys(ledger).filter(h => !seen.has(h))
  const registered = Object.keys(ledger).filter(h => seen.has(h))

  // ── 文件源扫描 ──
  const fileNames = listRecordFiles(recordsRoot)
  // 键形态重叠检查：文件名键与历史标题键共处一套语义会互相误伤（一把清单喂两套判据），
  // 任一文件名与历史 ledger 键全等即当场报错，不允许静默二选一。
  for (const fn of fileNames) {
    const key = fn.replace(/\.md$/, '')
    if (Object.prototype.hasOwnProperty.call(ledger, key)) {
      throw new Error(`两源键形态重叠：「${key}」既是记录文件名又是历史标题登记键，必须改名消除歧义`)
    }
  }
  const missingRecordRows = []
  const staleRecordFields = []
  let recordsFromFiles = 0
  for (const fn of fileNames) {
    const rec = readRecord(recordsRoot, fn)
    recordsFromFiles++
    if (!rec.rowPresent) {
      missingRecordRows.push({ file: rec.fileName, reason: '整块缺 远程同步 行' })
      continue
    }
    if (rec.closed) {
      // 回填后必须删掉登记字段：允许两者共存就等于把"记得删登记项"这条人工耦合原样搬进新载体
      if (rec.hasRegistration) staleRecordFields.push(`${rec.fileName}（已 ${rec.status} 却仍留 ${RECORD_FIELD_REASON}/${RECORD_FIELD_OWNER}）`)
      continue
    }
    // 未收口：登记随文件走，两个字段都必须非空，否则就是没登记
    if (rec.reasonMissing || rec.ownerMissing) {
      const why = rec.reasonMissing && rec.ownerMissing ? '缺登记字段'
        : rec.reasonMissing ? `缺非空 ${RECORD_FIELD_REASON}` : `缺非空 ${RECORD_FIELD_OWNER}`
      open.push({ line: 0, status: rec.status, heading: `${rec.fileName}（${why}）`, evidence: '', source: 'records' })
    }
  }

  const rowCountAll = rowCount + fileNames.length
  if (rowCountAll === 0) throw new Error(`两源都读到 0 条 远程同步 记录（${file} + ${recordsRoot}）——空遍历不得判为"零欠账"`)

  return {
    rowCount,
    headingCount: headings.length,
    recordCount: records.length,
    recordsWithoutRow,
    topRecord,
    topRecordMissingRow,
    recordsFromFiles,
    missingRecordRows,
    staleRecordFields,
    open,
    stale,
    registered,
    duplicates,
  }
}

function format(r) {
  const out = []
  out.push(`远程同步行 ${r.rowCount} 条 / 执行记录 ${r.recordCount} 篇（全部 ## 标题 ${r.headingCount} 个）/ 已登记欠账 ${r.registered.length} 条 / 记录文件 ${r.recordsFromFiles} 篇（两源分列，不可合并成一个趋势数）`)
  out.push(`（可见项，不拦截：其中 ${r.recordsWithoutRow.length} 篇执行记录整块没有 远程同步 行，属历史缺口）`)
  if (r.missingRecordRows.length) {
    out.push(`❌ 记录文件整块缺 远程同步 行 ${r.missingRecordRows.length} 篇（每篇都必须独立可查，不再只查最顶部一篇）：`)
    for (const m of r.missingRecordRows) out.push(`  ${m.file} —— ${m.reason}`)
  }
  if (r.staleRecordFields.length) {
    out.push(`❌ 已回填却仍留登记字段的记录 ${r.staleRecordFields.length} 篇（回填后请删除这两个字段）：`)
    for (const s of r.staleRecordFields) out.push(`  ${s}`)
  }
  if (r.topRecordMissingRow) {
    out.push(`❌ 最顶部的执行记录缺 远程同步 行：「${r.topRecord.text}」`)
    out.push('   新记录必须带这一行。两种合法写法：① 已合并 ⇒ 按既有 PASS 口径回填 merge SHA 与时间；'
      + '② 尚未合并 ⇒ 写 PENDING，并**同一条 PR 里**往 gate-record-debt-ledger.json 按本篇标题登记原因'
      + '（回填时顺手删除该登记项，否则报陈旧）。')
  }
  if (r.open.length) {
    out.push(`❌ 未登记的欠账 ${r.open.length} 条（新增未收口行必须带原因进 ${path.basename(LEDGER_FILE)}）：`)
    for (const o of r.open) out.push(`  L${o.line} [${o.status}] ${o.heading}`)
  }
  if (r.stale.length) {
    out.push(`❌ 欠账清单里的陈旧登记 ${r.stale.length} 条（该行已回填或标题已改，请删除对应条目）：`)
    for (const s of r.stale) out.push(`  ${s}`)
  }
  if (r.duplicates.length) {
    out.push(`❌ 同一条执行记录被写了两遍（${r.duplicates.length} 条标题重复；置顶型文档的自我损坏形态）：`)
    for (const d of r.duplicates) out.push(`  x${d.count} ${d.text}`)
    out.push('  处理：删掉多余那半（逐字节切除、不得整文件统一行尾），并把清理结果写进本次记录')
  }
  if (!r.open.length && !r.stale.length && !r.duplicates.length && !r.topRecordMissingRow
    && !r.missingRecordRows.length && !r.staleRecordFields.length) {
    out.push('OK: 顶部记录带行，两源所有未收口的 远程同步 行均已登记，清单无陈旧项、记录标题无重复、记录文件登记字段无残留')
  }
  return out.join('\n')
}

function main() {
  const root = path.resolve(__dirname, '..')
  const r = collect({ root })
  console.log(format(r))
  if (r.open.length || r.stale.length || r.duplicates.length || r.topRecordMissingRow
    || r.missingRecordRows.length || r.staleRecordFields.length) process.exit(1)
}

module.exports = {
  collect, format, loadLedger, normalize,
  listRecordFiles, readRecord, readFrontmatter,
  RECORDS_REL, RECORD_FIELD_REASON, RECORD_FIELD_OWNER,
  GATE_FILE, LEDGER_FILE, DUPLICATE_HEADINGS_ALLOWED,
}

if (require.main === module) main()
