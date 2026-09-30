// Regression tests for scripts/check-pr-exec-record.js
//
// Why (change enforce-gate-record-presence): on origin/main, 47 of 132 non-docs-only PRs in a
// 3-day window never touched `.quality-gates.md`, and 32 of those DID record gate reasoning in the
// PR body — but only 2 ever mentioned the `远程同步` row, i.e. the single thing the existing gate
// can actually check. The old checker presupposes a record exists, so "no record at all" is
// invisible to it by design (recorded as an unclosed hole in #2570's own 遗留).
//
// Facts locked here, each measured before being relied on:
//   * this repo lands PRs as SQUASH commits => the landing commit is SINGLE-PARENT. An earlier
//     probe used `git rev-list --merges` and found almost nothing; the window is walked with
//     `--first-parent` instead.
//   * `docs-only` classification must come from the SAME whitelist object as the CI changes job
//     (exported by classify-docs-only.js) — a second whitelist is the documented failure mode.
//   * the change-set is acquired once (changedFileStatuses) and this script MUST NOT shell out to
//     `git diff` itself; otherwise two predicates can disagree about "which files did this PR touch"
//     and produce an unattributable red.
//
//   node --test scripts/check-pr-exec-record.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const mod = require('./check-pr-exec-record.js')

const st = (list) => list.map(([status, file]) => ({ status, file }))

test('新增一篇记录文件即通过（判据只看本 PR 的变更集）', () => {
  const r = mod.evaluate({
    statuses: st([['A', 'openspec/records/my-task.md'], ['M', 'apps/desktop/src/a.js']]),
    headBranch: 'my-task',
    exemptOnDisk: [],
    remoteBranches: new Set(['main', 'my-task']),
  })
  assert.strictEqual(r.ok, true, JSON.stringify(r))
  assert.deepStrictEqual(r.addedRecords, ['openspec/records/my-task.md'])
})

test('既无记录也无豁免必须变红，且输出两条可执行出路（不能只说"不合规"）', () => {
  const r = mod.evaluate({
    statuses: st([['M', 'apps/desktop/electron/main.js']]),
    headBranch: 'x',
    exemptOnDisk: [],
    remoteBranches: new Set(['main']),
  })
  assert.strictEqual(r.ok, false)
  const msg = r.reasons.join('\n')
  assert.match(msg, /openspec\/records\//, '必须给出"新增一篇记录文件"这条出路')
  assert.match(msg, /_exempt/, '必须给出"新增一篇带原因的豁免文件"这条出路')
})

test('豁免文件是合法出路，但原因必须非空（空原因等于静默绕过）', () => {
  const dir = mod.writeFixtureRepo ? null : null
  const good = mod.evaluate({
    statuses: st([['A', 'openspec/records/_exempt/bot-maint.md']]),
    headBranch: 'bot-maint',
    exemptOnDisk: [{ branch: 'bot-maint', reason: '纯依赖版本 bump，无可验证行为变化' }],
    remoteBranches: new Set(['main', 'bot-maint']),
  })
  assert.strictEqual(good.ok, true, JSON.stringify(good.reasons))
  const empty = mod.evaluate({
    statuses: st([['A', 'openspec/records/_exempt/lazy.md']]),
    headBranch: 'lazy',
    exemptOnDisk: [{ branch: 'lazy', reason: '   ' }],
    remoteBranches: new Set(['main', 'lazy']),
  })
  assert.strictEqual(empty.ok, false, '空白原因必须拒')
  assert.match(empty.reasons.join('\n'), /原因/)
})

test('变更集为空 ⇒ fail-closed 判红（"没取到文件"不等于"没改文件"）', () => {
  const r = mod.evaluate({ statuses: [], headBranch: 'x', exemptOnDisk: [], remoteBranches: new Set(['main']) })
  assert.strictEqual(r.ok, false)
  assert.match(r.reasons.join('\n'), /变更集为空|取证失败/)
})

test('只有 M/D 没有 A 不算新增记录（改别人的记录不等于自己写了记录）', () => {
  const r = mod.evaluate({
    statuses: st([['M', 'openspec/records/other.md'], ['D', 'openspec/records/stale.md']]),
    headBranch: 'x',
    exemptOnDisk: [],
    remoteBranches: new Set(['main']),
  })
  assert.strictEqual(r.ok, false, JSON.stringify(r))
  assert.deepStrictEqual(r.addedRecords, [])
})

test('模板与豁免模板自身不得算作记录（它们带 PENDING 行，算进去就是恒红/恒绿）', () => {
  const r = mod.evaluate({
    statuses: st([['A', 'openspec/records/_TEMPLATE.md'], ['A', 'openspec/records/_exempt/_TEMPLATE.md']]),
    headBranch: 'x',
    exemptOnDisk: [],
    remoteBranches: new Set(['main']),
  })
  assert.deepStrictEqual(r.addedRecords, [], '模板不得计入记录')
  assert.strictEqual(r.ok, false, '只交模板等于什么都没交')
})

test('同一分支同时交记录与豁免是矛盾，必须红（豁免只能在没有记录时用）', () => {
  const r = mod.evaluate({
    statuses: st([['A', 'openspec/records/twin.md'], ['A', 'openspec/records/_exempt/twin.md']]),
    headBranch: 'twin',
    exemptOnDisk: [{ branch: 'twin', reason: '两个都交了' }],
    remoteBranches: new Set(['main', 'twin']),
  })
  assert.strictEqual(r.ok, false)
  assert.match(r.reasons.join('\n'), /矛盾|同时/)
})

test('已消费的豁免（分支已不在远端）先计入可见待清理数，未达阈值不拦', () => {
  const r = mod.evaluate({
    statuses: st([['A', 'openspec/records/ok.md']]),
    headBranch: 'ok',
    exemptOnDisk: [
      { branch: 'gone-a', reason: '已合并的历史豁免' },
      { branch: 'gone-b', reason: '已关闭的历史豁免' },
    ],
    remoteBranches: new Set(['main', 'ok']),
    threshold: 3,
  })
  assert.strictEqual(r.consumedExempts.length, 2, JSON.stringify(r.consumedExempts))
  assert.strictEqual(r.ok, true, '2 < 3 不该拦：' + r.reasons.join('\n'))
  assert.match(r.summary(), /待清理豁免 2 条/)
})

test('待清理豁免达到阈值必须拦，且点名文件（删除是删自己那个文件，零同行竞争）', () => {
  const r = mod.evaluate({
    statuses: st([['A', 'openspec/records/ok.md']]),
    headBranch: 'ok',
    exemptOnDisk: [
      { branch: 'g1', reason: 'a' }, { branch: 'g2', reason: 'b' }, { branch: 'g3', reason: 'c' },
    ],
    remoteBranches: new Set(['main', 'ok']),
    threshold: 3,
  })
  assert.strictEqual(r.ok, false)
  assert.match(r.reasons.join('\n'), /g1|g2|g3/, '必须点名待清理项')
})

test('远端分支清单取不到时，消费判定降级为 unknown 且必须出声（不得静默当 0）', () => {
  const r = mod.evaluate({
    statuses: st([['A', 'openspec/records/ok.md']]),
    headBranch: 'ok',
    exemptOnDisk: [{ branch: 'maybe-gone', reason: 'x' }],
    remoteBranches: null, // 模拟 ls-remote 失败
    threshold: 3,
  })
  assert.strictEqual(r.consumedKnown, false, '必须标明"这一维没测到"')
  assert.match(r.summary(), /consumed=unknown/)
  assert.strictEqual(r.ok, true, '取不到远端不该判红，但必须留痕')
})

// ── 与真实 git 的接缝：证明"取变更集"这条链在真仓库里真的通 ──
test('真接缝：从真实 git 夹具取到的 statuses 能被判据正确处理（夹具不得替实现剥壳）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-record-'))
  const run = (a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  run(['init', '--quiet', '-b', 'main'])
  run(['config', 'user.email', 't@e.com']); run(['config', 'user.name', 't'])
  fs.mkdirSync(path.join(dir, 'openspec/records'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'a.js'), '1')
  run(['add', '.']); run(['commit', '--quiet', '-m', 'base'])
  run(['checkout', '--quiet', '-b', 'feat'])
  fs.writeFileSync(path.join(dir, 'a.js'), '2')
  fs.writeFileSync(path.join(dir, 'openspec/records', 'feat.md'), 'x')
  run(['add', '-A']); run(['commit', '--quiet', '-m', 'c'])

  const statuses = require('./classify-docs-only.js').changedFileStatuses({ repo: dir, base: 'main', head: 'feat' })
  const r = mod.evaluate({ statuses, headBranch: 'feat', exemptOnDisk: [], remoteBranches: new Set(['main', 'feat']) })
  assert.deepStrictEqual(r.addedRecords, ['openspec/records/feat.md'], JSON.stringify(statuses))
  assert.strictEqual(r.ok, true)
})

// ── 3.7 结构锁：不得出现第二份"本 PR 改了哪些文件"的口径 ──
test('本脚本必须复用 classify-docs-only 的取源，自己不得拼 git diff', () => {
  const src = fs.readFileSync(path.join(__dirname, 'check-pr-exec-record.js'), 'utf8')
  const body = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.match(body, /require\(['"]\.\/classify-docs-only\.js['"]\)/, '必须引用共享取源模块')
  assert.match(body, /changedFileStatuses/, '必须调用 changedFileStatuses 而不是自取 diff')
  assert.doesNotMatch(body, /\[\s*['"]diff['"]/, '本脚本内不得出现自己的 git diff 调用')
  assert.doesNotMatch(body, /--name-only|--name-status/, '不得自带 diff flag（那是第二份口径）')
})

// ── D8：非阻断状态自身必须可被检测 ──
test('advisory 模式必须打印 MODE=advisory 且退出码为 0；enforce 模式下同一场景必须红', () => {
  const cli = (args) => {
    try {
      return { code: 0, out: execFileSync('node', [path.join(__dirname, 'check-pr-exec-record.js'), ...args], { encoding: 'utf8' }) }
    } catch (e) {
      return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') }
    }
  }
  const root = path.resolve(__dirname, '..')
  // 用 --statuses 注入一个"无记录"的变更集，避免依赖真实分支状态
  const adv = cli([`--repo=${root}`, '--base=HEAD', '--head=HEAD', '--statuses=[]', '--mode=advisory'])
  assert.strictEqual(adv.code, 0, adv.out)
  assert.match(adv.out, /MODE=advisory/, 'advisory 模式必须自报身份，否则没人知道它没在拦')
  const enf = cli([`--repo=${root}`, '--base=HEAD', '--head=HEAD', '--statuses=[]', '--mode=enforce'])
  assert.notStrictEqual(enf.code, 0, 'enforce 模式下同一输入必须红')
  assert.doesNotMatch(enf.out, /MODE=advisory/)
})

test('取证失败（base 不可解析）在 advisory 阶段不得判红，在 enforce 阶段必须判红', () => {
  const cli = (args) => {
    try {
      return { code: 0, out: execFileSync('node', [path.join(__dirname, 'check-pr-exec-record.js'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
    } catch (e) { return { code: e.status ?? 1, out: String(e.stdout || '') + String(e.stderr || '') } }
  }
  const root = path.resolve(__dirname, '..')
  const bad = `--base=no-such-ref-xyz-${process.pid}`
  const adv = cli([`--repo=${root}`, bad, '--head=HEAD', '--mode=advisory'])
  assert.strictEqual(adv.code, 0, '浅克隆/坏 base 不该在 advisory 阶段红：\n' + adv.out)
  assert.match(adv.out, /MODE=advisory/)
  const enf = cli([`--repo=${root}`, bad, '--head=HEAD', '--mode=enforce'])
  assert.notStrictEqual(enf.code, 0, 'enforce 阶段取不到证据必须红（fail-closed）')
})
