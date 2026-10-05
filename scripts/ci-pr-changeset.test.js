// Regression tests for scripts/ci-pr-changeset.js
//
// 这个文件存在的全部理由：取源决策原先写在 .github/workflows/quality-gate.yml 的 bash 里，
// 三条 workflow 结构锁只能证明"那行字还在"。实测把 `if git rev-parse -q --verify HEAD^2`
// 改成 `if false`（支路变死码）后，结构锁 29/25/31 全绿 —— 锁住了形状，没锁住语义。
// 所以判据搬到这里，用真 git 夹具逐形态跑。
//
//   node --test scripts/ci-pr-changeset.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const mod = require('./ci-pr-changeset.js')
const classifier = require('./classify-docs-only.js')

function initRepo () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changeset-'))
  const run = (args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  run(['init', '--quiet', '-b', 'main'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'test'])
  fs.writeFileSync(path.join(dir, 'README.md'), 'base\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'A'])
  // 夹具的自检：本文件全部结论都建立在"HEAD 确实有两个亲"上。
  // 真实 CI 检出的 refs/pull/N/merge 就是双亲提交，单亲的夹具会静默把双亲支路测成 payload 支路。
  run.assertMergeCommit = (spec) => {
    const n = run(['rev-list', '--parents', '-n', '1', spec]).split(/\s+/).length - 1
    assert.strictEqual(n, 2, `${spec} 必须恰好有两个亲（实得 ${n}），否则测的不是 CI 的合并提交形态`)
  }
  return { dir, run }
}

// 形态 A：PR 打开后 main 前进，分支没动（#2914 现场）
function fixtureStaleBase () {
  const { dir, run } = initRepo()
  const frozenBase = run(['rev-parse', 'HEAD'])
  run(['checkout', '--quiet', '-b', 'feature'])
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), 'my docs\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'pr: docs only'])
  const head = run(['rev-parse', 'HEAD'])
  run(['checkout', '--quiet', 'main'])
  fs.mkdirSync(path.join(dir, 'apps', 'desktop', 'electron'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'apps', 'desktop', 'electron', 'main.js'), 'other\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'other: code on main'])
  run(['checkout', '--quiet', '-b', 'ci-merge-ref', 'main'])
  run(['merge', '--quiet', '--no-ff', '-m', 'Merge PR for CI', 'feature'])
  run.assertMergeCommit('HEAD')
  return { dir, run, frozenBase, head, mergeSha: run(['rev-parse', 'HEAD']) }
}

// 形态 B：分支把新 main 合进自己（re-sync，本仓推 PR 前的常规动作）后再触发 CI
function fixtureResynced () {
  const { dir, run } = initRepo()
  const frozenBase = run(['rev-parse', 'HEAD'])
  run(['checkout', '--quiet', '-b', 'feature'])
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), 'my docs\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'pr: docs only'])
  run(['checkout', '--quiet', 'main'])
  fs.mkdirSync(path.join(dir, 'apps', 'desktop', 'electron'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'apps', 'desktop', 'electron', 'main.js'), 'other\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'other: code on main'])
  run(['checkout', '--quiet', 'feature'])
  run(['merge', '--quiet', '--no-ff', '-m', 're-sync main into branch', 'main'])
  const head = run(['rev-parse', 'HEAD'])
  run(['checkout', '--quiet', '-b', 'ci-merge-ref', 'main'])
  run(['merge', '--quiet', '--no-ff', '-m', 'Merge PR for CI', 'feature'])
  run.assertMergeCommit('HEAD')
  return { dir, run, frozenBase, head }
}

for (const [label, make] of [['未 re-sync', fixtureStaleBase], ['分支已 re-sync 新 main', fixtureResynced]]) {
  test(`${label} 形态：合并提交双亲取法必须只含本 PR 那一个文件`, () => {
    const f = make()
    const r = mod.decide({ repo: f.dir, evtName: 'pull_request' })
    assert.strictEqual(r.source, mod.PARENTS, '检出是合并提交时必须走双亲支路')
    assert.strictEqual(r.base, f.run(['rev-parse', 'HEAD^1']))
    assert.strictEqual(r.head, f.run(['rev-parse', 'HEAD^2']))
    const files = classifier.changedFiles({ repo: f.dir, base: r.base, head: r.head })
    assert.deepStrictEqual(files, ['CHANGELOG.md'], `${label} 形态下变更集必须恰好是本 PR 的文件，实得 ${JSON.stringify(files)}`)
    assert.strictEqual(classifier.isDocsOnly(files), true)
  })
}

// 两条负控分别钉住两种事件取法的失效面（方向不同，不能合成一条）：
// A) 只传 --base=<冻结 event base>、head 留给默认 HEAD（=CI 检出的合并提交）：
//    PR 打开后 main 前进的提交会整段落进变更集 —— 这是 #2914 的现场。
test('负控 A：冻结 base + 默认 HEAD(合并提交) 必然误算，所以 --head 不许省略', () => {
  const f = fixtureStaleBase()
  const files = classifier.changedFiles({ repo: f.dir, base: f.frozenBase, head: f.mergeSha })
  assert.ok(files.includes('apps/desktop/electron/main.js'),
    `夹具若不再能复现误算，本条就测不到 #2914 的动因，须同步改夹具：${JSON.stringify(files)}`)
  assert.strictEqual(classifier.isDocsOnly(files), false)
  // 同一条 PR 换用合并提交的双亲，就只剩自己的文件
  assert.deepStrictEqual(
    classifier.changedFiles({ repo: f.dir, base: f.run(['rev-parse', 'HEAD^1']), head: f.run(['rev-parse', 'HEAD^2']) }),
    ['CHANGELOG.md'])
})

// B) 冻结 base + 事件 head：分支一旦把新 main 合进自己（re-sync），那些 main 提交就在 head 的
//    历史里、却不在冻结 base 一侧 ⇒ 照样误算。这是外部评审实测逼出、我最初漏掉的那一半。
test('负控 B：分支 re-sync 过新 main 后，冻结 base + 事件 head 仍会误算', () => {
  const f = fixtureResynced()
  const files = classifier.changedFiles({ repo: f.dir, base: f.frozenBase, head: f.head })
  assert.ok(files.includes('apps/desktop/electron/main.js'),
    `夹具若不再能复现误算，本条就测不到"事件 head 不够"的动因，须同步改夹具：${JSON.stringify(files)}`)
  assert.strictEqual(classifier.isDocsOnly(files), false)
})

test('检出不是合并提交（分支顶直接检出）时落到 payload 支路，并用调用方给的事件值', () => {
  const { dir, run } = initRepo()
  run(['checkout', '--quiet', '-b', 'feature'])
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), 'x\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'c'])
  const head = run(['rev-parse', 'HEAD'])
  const r = mod.decide({ repo: dir, evtName: 'pull_request', evtBase: run(['rev-parse', 'main']), evtHead: head })
  assert.strictEqual(r.source, mod.PAYLOAD)
  assert.strictEqual(r.head, head)
})

test('非 PR 事件：不报错、产出空对（调用方据此走全量档）', () => {
  const { dir } = initRepo()
  const r = mod.decide({ repo: dir, evtName: 'push', evtBase: '', evtHead: '' })
  assert.strictEqual(r.source, mod.NON_PR)
  assert.strictEqual(r.base, '')
  assert.strictEqual(r.head, '')
})

test('双亲取不到且事件值也缺 ⇒ 抛错（不得静默退回 HEAD=合并提交）', () => {
  const { dir } = initRepo()
  assert.throws(() => mod.decide({ repo: dir, evtName: 'pull_request', evtBase: '', evtHead: '' }),
    /取不到本 PR 的 base\/head/)
})

// 外部评审（nemotron 第 1 条）点名的形态：git 故障曾被 try/catch 当成"没有第二亲"，
// 于是"仓库损坏 / git 不可用 / 权限受限"会静默落回**已知会误算**的 payload 支路。
test('git 自身故障必须原样上抛，不得被读成"这个提交没有第二亲"', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changeset-nogit-'))
  let thrown = null
  try {
    mod.decide({ repo: dir, evtName: 'pull_request', evtBase: 'a'.repeat(40), evtHead: 'b'.repeat(40) })
  } catch (e) { thrown = e }
  assert.ok(thrown, '非仓库目录下必须抛错；静默返回意味着落到了 payload 支路')
  assert.match(String(thrown.message), /not a git repository|rev-list/,
    `抛出的必须是 git 的真故障而不是判据文案，实得：${thrown && thrown.message}`)
})

test('双亲字段形状异常（rev-list 返回被污染）也必须抛错，不得拼出一个假 sha', () => {
  assert.throws(() => mod.decide({
    repo: 'x',
    evtName: 'pull_request',
    git: () => 'deadbeef not-a-sha another\n',
  }), /形状异常/)
})

test('CLI：stdout 是 KEY=VAL，且 GITHUB_OUTPUT 存在时追加 pr-base/pr-head', () => {
  const f = fixtureStaleBase()
  const out = path.join(f.dir, 'github-output.txt')
  const r = spawnSync('node', [path.join(__dirname, 'ci-pr-changeset.js'), `--repo=${f.dir}`,
    '--evt-name=pull_request', '--evt-base=', '--evt-head='],
  { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } })
  assert.strictEqual(r.status, 0, r.stderr)
  const kv = Object.fromEntries(String(r.stdout).trim().split('\n').map((l) => l.split('=')))
  assert.strictEqual(kv.source, mod.PARENTS)
  const written = fs.readFileSync(out, 'utf8')
  assert.match(written, new RegExp('^pr-base=' + kv.base + '$', 'm'))
  assert.match(written, new RegExp('^pr-head=' + kv.head + '$', 'm'))
})

test('CLI：取值不全时 rc=1（CI 步骤据此乐红，而不是拿着错集合继续判）', () => {
  const { dir } = initRepo()
  const r = spawnSync('node', [path.join(__dirname, 'ci-pr-changeset.js'), `--repo=${dir}`,
    '--evt-name=pull_request', '--evt-base=', '--evt-head='], { encoding: 'utf8' })
  assert.notStrictEqual(r.status, 0)
  assert.match(String(r.stderr), /取不到本 PR 的 base\/head/)
})
