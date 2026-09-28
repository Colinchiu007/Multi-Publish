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

// ---- the real CI assertion: the repo's own file must be clean against its own ledger ----
test('真仓：每一条未收口的 远程同步 行都必须已登记，且登记清单里不得有已回填的陈旧项', () => {
  const root = path.resolve(__dirname, '..')
  const ledger = checker.loadLedger(root)
  const r = checker.collect({ root, ledger })
  assert.strictEqual(r.open.length, 0, `存在未登记的欠账：\n${r.open.map(o => `${o.line} [${o.status}] ${o.heading}`).join('\n')}`)
  assert.strictEqual(r.stale.length, 0, `欠账清单含陈旧项（回填后请删除对应条目）：\n${r.stale.join('\n')}`)
})
