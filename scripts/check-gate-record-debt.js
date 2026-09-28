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

// 已收口的写法。只允许这一侧扩张，新增未收口写法必须走 gate-record-debt-ledger.json。
const CLOSED_RE = /^(PASS|N\/A|✅|已)/

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

function collect({ root = process.cwd(), ledger = loadLedger() } = {}) {
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
      open.push({ line: i + 1, status, heading, evidence: cells[3] || '' })
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

  const stale = Object.keys(ledger).filter(h => !seen.has(h))
  const registered = Object.keys(ledger).filter(h => seen.has(h))
  return {
    rowCount,
    headingCount: headings.length,
    recordCount: records.length,
    recordsWithoutRow,
    topRecord,
    topRecordMissingRow,
    open,
    stale,
    registered,
  }
}

function format(r) {
  const out = []
  out.push(`远程同步行 ${r.rowCount} 条 / 执行记录 ${r.recordCount} 篇（全部 ## 标题 ${r.headingCount} 个）/ 已登记欠账 ${r.registered.length} 条`)
  out.push(`（可见项，不拦截：其中 ${r.recordsWithoutRow.length} 篇执行记录整块没有 远程同步 行，属历史缺口）`)
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
  if (!r.open.length && !r.stale.length && !r.topRecordMissingRow) out.push('OK: 顶部记录带行，所有未收口的 远程同步 行均已登记，且清单无陈旧项')
  return out.join('\n')
}

function main() {
  const root = path.resolve(__dirname, '..')
  const r = collect({ root })
  console.log(format(r))
  if (r.open.length || r.stale.length || r.topRecordMissingRow) process.exit(1)
}

module.exports = { collect, format, loadLedger, normalize, GATE_FILE, LEDGER_FILE }

if (require.main === module) main()
