// Regression tests for scripts/classify-docs-only.js
//
// Why this gate exists: pure-docs PRs must land via PR (layering rule) but pay a full
// 10-runner CI bill. The short-circuit introduced by change `docs-only-ci-shortcircuit`
// lets heavy jobs skip ONLY when every changed file is on the docs whitelist. The whole
// safety of that short-circuit rests on this classifier being fail-closed:
//   * empty input (or non-array) => false  (never skip tests on "no evidence")
//   * any file outside the whitelist => false (mixed PRs run full CI)
//   * the whitelist itself must stay identical to the push paths-ignore list
//     (single source: CI_IGNORED_PATHS exported here, imported by workflow-contract.test.js)
//
// Matching semantics locked by this file (deliberate, fail-closed):
//   * `dir/**`  => any path under dir/ (any depth)
//   * `*.md`    => ROOT-LEVEL .md only (mirrors GitHub docs: '*.{js,py}' matches root files);
//                 sub-directory .md must be covered by an explicit `dir/**` entry
//   * literal   => exact path match
//
//   node --test scripts/classify-docs-only.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const classifier = require('./classify-docs-only.js')

// ---------------------------------------------------------------------------
// Whitelist content (ratchet: identical to the push paths-ignore list)
// ---------------------------------------------------------------------------

test('CI_IGNORED_PATHS 清单内容被钉死（与 push paths-ignore 同源同值）', () => {
  assert.deepStrictEqual(classifier.CI_IGNORED_PATHS, [
    '01-docs/**',
    'docs/**',
    '*.md',
    'LICENSE',
    '.gitignore',
    '.editorconfig',
    '.ccg/**',
    '.claude/**',
    '.hermes/**',
    '.agents/**',
    'openspec/**',
  ])
})

test('白名单不得混入代码/依赖/CI 路径（混入即漏跑全量测试）', () => {
  const forbidden = ['apps/**', 'packages/**', '.github/**', 'pnpm-lock.yaml', 'package.json', 'config/**', 'ops-center/**']
  for (const f of forbidden) {
    assert.ok(
      !classifier.CI_IGNORED_PATHS.includes(f),
      `白名单不得包含 ${f}：这会让代码变更被误判为 docs-only`,
    )
  }
})

// ---------------------------------------------------------------------------
// isDocsOnly(files)
// ---------------------------------------------------------------------------

test('全部文件命中白名单 => true', () => {
  assert.strictEqual(
    classifier.isDocsOnly([
      'CHANGELOG.md',
      'README.md',
      'AGENTS.md',
      '.quality-gates.md',
      'LICENSE',
      '.gitignore',
      '.editorconfig',
      '01-docs/PRD.md',
      '01-docs/rpa-api-publish/evidence/live-acceptance-pass-20260928.md',
      'docs/adr/0002.md',
      'openspec/changes/docs-only-ci-shortcircuit/proposal.md',
      'openspec/specs/ci-path-gating/spec.md',
      '.ccg/commands/frontend_task_id.md',
      '.claude/settings.json',
      '.hermes/plans/x.md',
      '.agents/skills/y/SKILL.md',
    ]),
    true,
  )
})

test('混入任一运行时代码文件 => false', () => {
  assert.strictEqual(
    classifier.isDocsOnly(['CHANGELOG.md', 'apps/desktop/electron/main.js']),
    false,
  )
})

test('混入 CI workflow 文件 => false（本 change 自身的 PR 也必须全量）', () => {
  assert.strictEqual(
    classifier.isDocsOnly(['openspec/changes/x/proposal.md', '.github/workflows/quality-gate.yml']),
    false,
  )
})

test('混入锁文件或 package.json => false', () => {
  assert.strictEqual(classifier.isDocsOnly(['CHANGELOG.md', 'pnpm-lock.yaml']), false)
  assert.strictEqual(classifier.isDocsOnly(['CHANGELOG.md', 'package.json']), false)
})

test('空清单 => false（fail-closed：无证据不得跳过测试）', () => {
  assert.strictEqual(classifier.isDocsOnly([]), false)
})

test('非数组输入 => false（fail-closed）', () => {
  assert.strictEqual(classifier.isDocsOnly(null), false)
  assert.strictEqual(classifier.isDocsOnly(undefined), false)
  assert.strictEqual(classifier.isDocsOnly('CHANGELOG.md'), false)
})

test('`*.md` 只匹配根目录：子目录 .md 不命中（除非有显式 dir/** 条目）', () => {
  // apps/desktop/README.md 不在任何 dir/** 白名单内 => 混合 => false
  assert.strictEqual(classifier.isDocsOnly(['apps/desktop/README.md']), false)
  // scripts/foo.md 同理（scripts/ 不在白名单）
  assert.strictEqual(classifier.isDocsOnly(['scripts/foo.md']), false)
  // 根目录 .md 命中
  assert.strictEqual(classifier.isDocsOnly(['README.md']), true)
})

// ---------------------------------------------------------------------------
// CLI (merge-base diff mode)
// ---------------------------------------------------------------------------

function gitRepoFixture(changes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-only-cli-'))
  const run = (args, opts = {}) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', ...opts })
  run(['init', '--quiet', '-b', 'main'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'test'])
  fs.writeFileSync(path.join(dir, 'base-code.js'), 'module.exports = 1\n', 'utf8')
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'base'])
  run(['checkout', '--quiet', '-b', 'feature'])
  for (const [file, content] of Object.entries(changes)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
    fs.writeFileSync(path.join(dir, file), content, 'utf8')
  }
  run(['add', '.'])
  run(['commit', '--quiet', '-m', 'changes', '--allow-empty'])
  return { dir, run }
}

function runCli(args, env = {}) {
  try {
    const stdout = execFileSync('node', [path.join(__dirname, 'classify-docs-only.js'), ...args], {
      cwd: __dirname,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
    return { code: 0, stdout }
  } catch (e) {
    return { code: e.status ?? 1, stdout: String(e.stdout ?? '') }
  }
}

test('CLI：纯文档变更 => docs-only=true，且输出文件清单证据', () => {
  const { dir } = gitRepoFixture({
    'CHANGELOG.md': 'x\n',
    'openspec/changes/x/proposal.md': 'y\n',
  })
  const r = runCli(['--base=main', `--head=feature`, `--repo=${dir}`])
  assert.strictEqual(r.code, 0, r.stdout)
  assert.match(r.stdout, /docs-only=true/)
  assert.match(r.stdout, /files=2/)
  assert.match(r.stdout, /CHANGELOG\.md/)
  assert.match(r.stdout, /openspec\/changes\/x\/proposal\.md/)
})

test('CLI：混合变更 => docs-only=false', () => {
  const { dir } = gitRepoFixture({
    'CHANGELOG.md': 'x\n',
    'apps/desktop/electron/main.js': 'z\n',
  })
  const r = runCli(['--base=main', '--head=feature', `--repo=${dir}`])
  assert.strictEqual(r.code, 0, r.stdout)
  assert.match(r.stdout, /docs-only=false/)
})

test('CLI：无差异（head == base）=> docs-only=false（fail-closed）', () => {
  const { dir } = gitRepoFixture({})
  const r = runCli(['--base=main', '--head=feature', `--repo=${dir}`])
  assert.strictEqual(r.code, 0, r.stdout)
  assert.match(r.stdout, /docs-only=false/)
})

test('CLI：git 失败（不存在的 ref）=> 非零退出（让 changes job 红、gate-result 拦）', () => {
  const { dir } = gitRepoFixture({ 'CHANGELOG.md': 'x\n' })
  const r = runCli(['--base=nonexistent-ref', '--head=feature', `--repo=${dir}`])
  assert.notStrictEqual(r.code, 0)
})

test('CLI：GITHUB_OUTPUT 存在时追加 docs-only=<bool>（CI changes job 消费）', () => {
  const { dir } = gitRepoFixture({ 'CHANGELOG.md': 'x\n' })
  const out = path.join(dir, 'github-output.txt')
  const r = runCli(['--base=main', '--head=feature', `--repo=${dir}`], { GITHUB_OUTPUT: out })
  assert.strictEqual(r.code, 0, r.stdout)
  const written = fs.readFileSync(out, 'utf8')
  assert.match(written, /^docs-only=true\n?$/m)
})

// ── 变更集取源必须只有一份实现（change enforce-gate-record-presence D1 / tasks 3.1）──
// 为什么要锁：本仓有过"同一个三态映射被抄成三份"的事故（login-state）。"本 PR 改了哪些文件"
// 一旦被第二个判据自行重实现，两份对 base 的取法就会漂移，出现"同一 PR 在 A 判 docs-only、
// 在 B 判缺记录"这种不可归因的红。所以取源提为导出，并由下面的锁钉住。
test('changedFiles 必须被导出，且在真实 git 夹具上返回 merge-base..head 的文件清单', () => {
  const clf = require('./classify-docs-only.js')
  assert.strictEqual(typeof clf.changedFiles, 'function', 'changedFiles 未导出：判据只能各自拼 diff')
  const { dir } = gitRepoFixture({ 'docs/a.md': 'a\n' })
  const files = clf.changedFiles({ repo: dir, base: 'main', head: 'feature' })
  assert.deepStrictEqual(files, ['docs/a.md'], JSON.stringify(files))
})

test('changedFiles 在 base 不可解析时必须抛错，不得返回空数组（空清单会被上层判成"没改文件"）', () => {
  const clf = require('./classify-docs-only.js')
  const { dir } = gitRepoFixture({ 'docs/a.md': 'a\n' })
  assert.throws(
    () => clf.changedFiles({ repo: dir, base: 'no-such-ref-xyz', head: 'feature' }),
    /git 取证失败/,
  )
})

test('main() 必须走 changedFiles 这一份取源（防止 CLI 与判据各算各的）', () => {
  const src = fs.readFileSync(path.join(__dirname, 'classify-docs-only.js'), 'utf8')
  const body = src.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.match(body, /changedFiles\(\{/, 'main() 未调用 changedFiles')
  // 真正的不变量是"diff 只取一次"，不是"用了某个具体 flag"：新增记录要判"是不是新文件"，
  // 所以取源返回 name-status、名字由它派生 —— 若按 flag 计数，改成 --name-status 会让锁
  // 既可能假绿（0 处 name-only 时旧断言直接不成立）也可能假红。
  const diffCalls = (body.match(/git\(repo,\s*\['diff'/g) || []).length
  assert.strictEqual(diffCalls, 1, `git diff 取源出现 ${diffCalls} 处，必须收敛为一处`)
})

test('changedFileStatuses 必须区分 A/M/D/R（"改了一篇历史记录"不能算"新增了记录"）', () => {
  const { changedFileStatuses } = require('./classify-docs-only.js')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'name-status-'))
  const run = (a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  run(['init', '--quiet', '-b', 'main']); run(['config', 'user.email', 't@e.com']); run(['config', 'user.name', 't'])
  // 重命名内容必须足够大：git 的相似度启发式对 1 字节文件不判 R（实测第一版夹具就是这样，
  // 结果 A+D 而非 R —— 那是夹具问题，不是解析问题）。
  const body = Array.from({ length: 40 }, (_, i) => `line ${i} of shared rename content`).join('\n')
  fs.writeFileSync(path.join(dir, 'a.js'), '1'); fs.writeFileSync(path.join(dir, 'gone.md'), 'k')
  fs.writeFileSync(path.join(dir, 'will-rename.md'), body)
  run(['add', '.']); run(['commit', '--quiet', '-m', 'base'])
  run(['checkout', '--quiet', '-b', 'feature'])
  fs.mkdirSync(path.join(dir, 'openspec', 'records'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'openspec', 'records', 'new-rec.md'), 'x')
  fs.writeFileSync(path.join(dir, 'a.js'), '2')
  fs.unlinkSync(path.join(dir, 'gone.md'))
  fs.writeFileSync(path.join(dir, 'renamed.md'), body); fs.unlinkSync(path.join(dir, 'will-rename.md'))
  run(['add', '-A']); run(['commit', '--quiet', '-m', 'c'])
  const got = changedFileStatuses({ repo: dir, base: 'main', head: 'feature' })
  const flat = got.map((e) => `${e.status} ${e.file}`).sort()
  assert.ok(got.length >= 4, `解析结果过少（退化成空/半空就是这类 bug 的形状）：${JSON.stringify(flat)}`)
  assert.ok(flat.includes('A openspec/records/new-rec.md'), `新增记录文件必须是 A：${JSON.stringify(flat)}`)
  assert.ok(flat.includes('M a.js'), `修改必须是 M：${JSON.stringify(flat)}`)
  assert.ok(flat.includes('D gone.md'), `删除必须是 D：${JSON.stringify(flat)}`)
  const r = got.find((e) => /^R/.test(e.status))
  assert.ok(r, `重命名必须判成 R 且取新路径，不能拆成 A+D：${JSON.stringify(flat)}`)
  assert.strictEqual(r.file, 'renamed.md', `R 的 file 必须是新路径（旧路径进 from）：${JSON.stringify(r)}`)
  assert.strictEqual(r.from, 'will-rename.md', `R 的 from 必须是旧路径：${JSON.stringify(r)}`)
})
