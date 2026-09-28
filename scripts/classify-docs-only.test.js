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
