// Regression tests for scripts/check-gate-record-debt.js
//
// Why this gate exists (measured on origin/main 2026-09-28): `.quality-gates.md` carries 127
// "远程同步" rows; 95 of them were backfilled into the established PASS wording, but 32 still say
// PENDING / OPEN / 待 PR 合并后核验 … and NOTHING anywhere detects that a backfill is owed. A row
// whose PR is already merged reads to the next agent as "this work is unfinished", which is how
// duplicate work starts. This gate makes that residue explicit and shrink-only.
//
// Design facts this file locks, each measured before being relied on:
//   * the status column is FREE TEXT (22 distinct spellings) => classify by a closed vocabulary,
//     anything unknown counts as OPEN (fail-closed), otherwise the drift reintroduces itself
//   * record headings are the only stable key available: slug extraction from `（…，slug，date）`
//     covers just 160/319 records and collides 4 times, so it cannot be the key
//   * the file is LF in the blob but CRLF in the working copy (`i/lf w/crlf attr/text=auto`), so
//     the checker must normalise trailing CR or every ledger key would differ per checkout
//
//   node --test scripts/check-gate-record-debt.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const checker = require('./check-gate-record-debt.js')

function fixture(rows, opt = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-debt-'))
  const lines = []
  for (const r of rows) {
    lines.push(`## ${r.head}`)
    lines.push('')
    lines.push('| 门禁 | 状态 | Fresh 证据 |')
    lines.push('|------|------|-----------|')
    lines.push(`| 远程同步 | ${r.status} | ${r.evidence || '—'} |`)
    lines.push('')
  }
  const body = lines.join('\n')
  const text = opt.crlf ? body.replace(/\n/g, '\r\n') : body
  fs.writeFileSync(path.join(dir, '.quality-gates.md'), text, 'utf8')
  return dir
}

test('全 PASS 的记录不产生欠账，也不报陈旧登记', () => {
  const dir = fixture([
    { head: '记录甲（alpha，2026-09-28）', status: 'PASS', evidence: 'PR #9001 squash 合并' },
    { head: '记录乙（beta，2026-09-28）', status: 'PASS（例外已记录）', evidence: 'x' },
    { head: '记录丙（gamma，2026-09-28）', status: 'N/A', evidence: '无远端动作' },
  ])
  const r = checker.collect({ root: dir, ledger: {} })
  assert.strictEqual(r.open.length, 0, JSON.stringify(r.open))
  assert.deepStrictEqual(r.stale, [])
})

test('未登记的 PENDING 行必须被报为欠账，且带上所属记录标题', () => {
  const dir = fixture([{ head: '记录甲（alpha，2026-09-28）', status: 'PENDING', evidence: '待 runner 留痕' }])
  const r = checker.collect({ root: dir, ledger: {} })
  assert.strictEqual(r.open.length, 1)
  assert.match(r.open[0].heading, /记录甲/)
  assert.strictEqual(r.open[0].status, 'PENDING')
  assert.match(checker.format(r), /未登记/)
})

test('按标题登记后转绿；登记里的标题写错不得放行（防"随手登记个不存在的键"把锁变成 no-op）', () => {
  const rows = [{ head: '记录甲（alpha，2026-09-28）', status: 'PENDING', evidence: 'x' }]
  const dir = fixture(rows)
  const good = checker.collect({ root: dir, ledger: { '记录甲（alpha，2026-09-28）': '等 #9001 合并' } })
  assert.strictEqual(good.open.length, 0, JSON.stringify(good.open))
  const typo = checker.collect({ root: dir, ledger: { '记录甲（alpha，2026-09-27）': '日期抄错' } })
  assert.strictEqual(typo.open.length, 1, '错键不得吃掉真欠账')
  assert.strictEqual(typo.stale.length, 1, '错键自身要作为陈旧登记报出来')
})

test('回填完成后必须同步删除登记项，否则判红（这一步保证清单只会缩小）', () => {
  const dir = fixture([{ head: '记录甲（alpha，2026-09-28）', status: 'PASS', evidence: 'PR #9001 合并 SHA abc' }])
  const r = checker.collect({ root: dir, ledger: { '记录甲（alpha，2026-09-28）': '曾经欠账' } })
  assert.strictEqual(r.open.length, 0)
  assert.strictEqual(r.stale.length, 1)
  assert.match(checker.format(r), /陈旧登记/)
})

test('自由文本状态按闭合词表判：未知写法一律算未收口（fail closed）', () => {
  const dir = fixture([
    { head: 'A（a，2026-09-28）', status: '待 PR 合并后核验' },
    { head: 'B（b，2026-09-28）', status: '进行中' },
    { head: 'C（c，2026-09-28）', status: 'PASS（合并例外已记录）' },
    { head: 'D（d，2026-09-28）', status: '✅' },
    { head: 'E（e，2026-09-28）', status: '已闭环（2026-09-28 经用户授权提权）' },
  ])
  const ledger = { 'A（a，2026-09-28）': 'x', 'B（b，2026-09-28）': 'y' }
  const r = checker.collect({ root: dir, ledger })
  assert.deepStrictEqual(r.open.map(o => o.heading), [])
  const r2 = checker.collect({ root: dir, ledger: {} })
  assert.deepStrictEqual(r2.open.map(o => o.status), ['待 PR 合并后核验', '进行中'])
})

test('CRLF 工作区与 LF blob 必须给出同一判定（该文件 i/lf w/crlf，键不能随行尾漂）', () => {
  const rows = [{ head: '记录甲（alpha，2026-09-28）', status: 'PENDING', evidence: 'x' }]
  const lf = fixture(rows, { crlf: false })
  const cr = fixture(rows, { crlf: true })
  const a = checker.collect({ root: lf, ledger: { '记录甲（alpha，2026-09-28）': 'ok' } })
  const b = checker.collect({ root: cr, ledger: { '记录甲（alpha，2026-09-28）': 'ok' } })
  assert.deepStrictEqual(b.open, a.open, '同一内容不得因行尾判成不同结果')
  assert.strictEqual(b.open.length, 0)
})

test('没有 远程同步 行的文件判红而不是判绿（空遍历不等于零欠账）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-debt-empty-'))
  fs.writeFileSync(path.join(dir, '.quality-gates.md'), '## 只有标题没有表格\n', 'utf8')
  assert.throws(() => checker.collect({ root: dir, ledger: {} }), /未找到任何 远程同步 行/)
})

test('文件缺失必须抛错而不是静默通过', () => {
  assert.throws(() => checker.collect({ root: path.join(os.tmpdir(), 'definitely-not-here-9x7'), ledger: {} }), /不存在/)
})

// ---- 覆盖检测：整块缺 远程同步行 的历史缺口只做可见，最新一篇必须带行 ----
//
// 加这一段的原因（实测，非推断）：原实现只审计「已存在的行是否收口」，对「记录根本没有这一行」
// 完全失明。origin/main 2026-09-28 上 316 篇执行记录里 192 篇没有这一行，而门禁 RC=0 报 OK。
// 缺席比说谎更糟：说谎的记录下一个人看得见，缺席的记录连怀疑的对象都没有。
//
// 强制面刻意收窄成「最顶部一篇记录必须有行」：记录按惯例插在文件顶部 ⇒ "最新一篇" 定义良好，
// 无需基线、无需清单维护、也不会一上线就红 192 条。
// 已知漏洞（如实记录，不假装已闭合）：新记录若被插在非顶部位置，本条拦不住。

function mixFixture(blocks, opt = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-cov-'))
  const lines = []
  for (const b of blocks) {
    lines.push(`## ${b.head}`)
    lines.push('')
    if (b.row !== null) {
      lines.push('| 门禁 | 状态 | Fresh 证据 |')
      lines.push('|------|------|-----------|')
      lines.push(`| 远程同步 | ${b.row} | ${b.evidence || '—'} |`)
      lines.push('')
    }
    if (b.body) lines.push(b.body, '')
  }
  const text = opt.crlf ? lines.join('\r\n') : lines.join('\n')
  fs.writeFileSync(path.join(dir, '.quality-gates.md'), text, 'utf8')
  return dir
}

test('最顶部执行记录缺 远程同步 行 ⇒ 判红，且点名该记录标题与两种合法写法', () => {
  const dir = mixFixture([
    { head: '本次执行记录：新功能甲（feat-a，2026-09-28）', row: null },
    { head: '本次执行记录：旧功能乙（feat-b，2026-09-27）', row: 'PASS', evidence: 'PR #9002 合并' },
  ])
  const r = checker.collect({ root: dir, ledger: {} })
  assert.strictEqual(r.topRecordMissingRow, true)
  assert.match(r.topRecord.text, /新功能甲/)
  assert.strictEqual(r.recordsWithoutRow.length, 1)
  const msg = checker.format(r)
  assert.match(msg, /最顶部的执行记录缺 远程同步 行/)
  assert.match(msg, /gate-record-debt-ledger\.json/, '提示必须指向登记路径，否则作者只能猜')
  assert.match(msg, /PENDING/)
})

test('顶部记录带行时，历史缺行的记录只报可见、不判红（否则一上线就红 192 条而不可用）', () => {
  const dir = mixFixture([
    { head: '本次执行记录：最新（newest，2026-09-28）', row: 'PENDING', evidence: '待合并' },
    { head: '本次执行记录：历史一（h1，2026-09-01）', row: null },
    { head: '本次执行记录：历史二（h2，2026-08-01）', row: null },
  ])
  const ledger = { '本次执行记录：最新（newest，2026-09-28）': '本 PR 合并后由后续 docs PR 回填并删除本条' }
  const r = checker.collect({ root: dir, ledger })
  assert.strictEqual(r.topRecordMissingRow, false)
  assert.strictEqual(r.recordsWithoutRow.length, 2, '历史缺口必须被数出来')
  assert.match(checker.format(r), /2 篇执行记录整块没有 远程同步 行/)
  assert.strictEqual(r.open.length + r.stale.length, 0)
  assert.match(checker.format(r), /^OK/m, '历史缺行不得让门禁判红')
})

test('结构性章节（无日期、非「本次执行记录」前缀）不计入执行记录，缺行不误报', () => {
  // 实测 origin/main：321 个 ## 标题里 5 个是 固定强制门禁 / 提交前自检清单 / 强制卡点规则 /
  // 违规处理 / 质量节拍阶段对照 —— 它们永远不会有这一行，若计入则判据恒红。
  const dir = mixFixture([
    { head: '本次执行记录：真记录（real，2026-09-28）', row: 'PASS', evidence: 'PR #9003' },
    { head: '违规处理', row: null, body: '违反强制检查视为流程违规。' },
    { head: '提交前自检清单（必须全部勾选）', row: null },
  ])
  const r = checker.collect({ root: dir, ledger: {} })
  assert.strictEqual(r.recordCount, 1, '结构章节不得算执行记录')
  assert.strictEqual(r.headingCount, 3)
  assert.strictEqual(r.topRecordMissingRow, false)
  assert.strictEqual(r.recordsWithoutRow.length, 0)
})

test('覆盖判据不得随行尾漂（同一内容 CRLF 检出与 LF blob 必须同结论）', () => {
  const blocks = [
    { head: '本次执行记录：甲（a，2026-09-28）', row: null },
    { head: '本次执行记录：乙（b，2026-09-27）', row: 'PASS' },
  ]
  const a = checker.collect({ root: mixFixture(blocks, { crlf: false }), ledger: {} })
  const b = checker.collect({ root: mixFixture(blocks, { crlf: true }), ledger: {} })
  assert.strictEqual(a.topRecordMissingRow, true)
  assert.strictEqual(b.topRecordMissingRow, a.topRecordMissingRow)
  assert.strictEqual(b.recordsWithoutRow.length, a.recordsWithoutRow.length)
})

test('loadLedger 必须认参数：传夹具目录时不得静默读真实清单', () => {
  // 该测试文件一直按 loadLedger(root) 调用，而旧实现签名是无参 —— 于是永远读生产 ledger，
  // 夹具里的 ledger 形同不存在（"给了路径却拿到真仓状态"，属假绿通道）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ledger-arg-'))
  fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'scripts', 'gate-record-debt-ledger.json'),
    JSON.stringify({ '记录甲': '夹具里的原因' }),
    'utf8',
  )
  assert.deepStrictEqual(checker.loadLedger(dir), { 记录甲: '夹具里的原因' })
  assert.deepStrictEqual(checker.loadLedger(path.join(dir, 'nowhere')), {})
  assert.notDeepStrictEqual(checker.loadLedger(dir), checker.loadLedger(),
    '夹具 ledger 与真实 ledger 必须能被区分开，否则参数是装饰')
})

test('真仓：顶部执行记录必须带 远程同步 行（这条是本增强的落地自检）', () => {
  const root = path.resolve(__dirname, '..')
  const r = checker.collect({ root, ledger: checker.loadLedger() })
  assert.ok(r.topRecord, '一篇执行记录都识别不到 ⇒ 分类判据坏了，不是通过')
  assert.ok(r.recordCount > 50, `识别到的执行记录数异常小：${r.recordCount}`)
  assert.strictEqual(r.topRecordMissingRow, false,
    `最新记录「${r.topRecord && r.topRecord.text}」缺 远程同步 行`)
})


test('真仓：每一条未收口的 远程同步 行都必须已登记，且登记清单里不得有已回填的陈旧项', () => {
  const root = path.resolve(__dirname, '..')
  const ledger = checker.loadLedger(root)
  const r = checker.collect({ root, ledger })
  assert.strictEqual(r.open.length, 0, `存在未登记的欠账：\n${r.open.map(o => `${o.line} [${o.status}] ${o.heading}`).join('\n')}`)
  assert.strictEqual(r.stale.length, 0, `欠账清单含陈旧项（回填后请删除对应条目）：\n${r.stale.join('\n')}`)
})
