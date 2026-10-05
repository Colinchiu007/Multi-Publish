// Regression tests for scripts/nx-affected-probe.js
//
// What this gate is for: quality-gate.yml's Gate 4 asks nx "which non-desktop projects
// with a test target does this PR affect?". If the answer is genuinely EMPTY, Gate 4 must
// exit early and skip the workspace test run. If that empty answer is MISREAD as "detection
// failed, run anyway", nx runs 0 tasks, no test process is ever started, the runtime egress
// ledger sink never writes a line, and the fail-closed verdict at the end of the step
// (`check-test-egress-ledger.js`, "台账文件不存在") turns a perfectly normal PR red.
// Observed on PR #2596 (run 37255412754) — Gate Result went red purely as knock-on damage.
//
// The exact trigger: the CI runner restores the Nx cache, and `actions/cache` only stores
// `.nx/cache` — the db under `.nx/workspace-data/d` is NOT part of the cache key. So nx finds
// cache entries with no local metadata and prints a warning **on stdout**, in front of the JSON:
//
//     NX   Unrecognized Cache Artifacts
//     Nx found unrecognized artifacts in the cache directory and will not be able to use them.
//     ...
//     []
//
// The previous detector (#2902) compared the whole trimmed text for equality with '' or '[]',
// which is a pure string identity test: any prompt text in front of the JSON defeats it, and
// the empty set silently degrades to "detection failed". These tests pin the three-state
// contract that replaces it, including the fail-closed direction.
//
//   node --test scripts/nx-affected-probe.test.js

const { test } = require('node:test')
const assert = require('node:assert')
const { execFileSync } = require('node:child_process')
const path = require('node:path')

const probe = require('./nx-affected-probe.js')
const { classifyNxAffectedOutput, KIND_EMPTY, KIND_NON_EMPTY, KIND_UNPARSABLE } = probe

// The real prompt nx emitted on the CI runner, verbatim from run 37255412754.
const NX_CACHE_WARNING = [
  '',
  '  NX   Unrecognized Cache Artifacts',
  '',
  'Nx found unrecognized artifacts in the cache directory and will not be able to use them.',
  'Nx can only restore artifacts it has metadata about.',
  'Read about this warning and how to address it here: https://nx.dev/troubleshooting/unknown-local-cache',
  '',
  '',
].join('\n')

// ---------------------------------------------------------------------------
// The regression itself: a polluted empty set must still be recognised as empty
// ---------------------------------------------------------------------------

test('受污染的空集输出仍判为空集（旧判据在这里漏判，是 PR #2596 假红的直接成因）', () => {
  const raw = NX_CACHE_WARNING + '[]\n'
  const verdict = classifyNxAffectedOutput({ text: raw, exitCode: 0 })

  assert.strictEqual(verdict.kind, KIND_EMPTY)
  assert.deepStrictEqual(verdict.projects, [])
  assert.strictEqual(verdict.count, 0)
})

test('旧判据的漏判被钉死为已知事实（防止有人以"回归"为名把全等判定搬回来）', () => {
  const raw = NX_CACHE_WARNING + '[]\n'
  const trimmed = raw.trim()

  // 这就是 #2902 引入的原写法：字符串全等。被提示文本一污染，两条都不成立。
  assert.notStrictEqual(trimmed, '')
  assert.notStrictEqual(trimmed, '[]')
  // 旧写法因此既不早退、也无法解析出项目清单。
  const oldWaySkip = trimmed === '' || trimmed === '[]'
  assert.strictEqual(oldWaySkip, false, '旧全等判据在本输入上必须确实漏判，否则这条测试没测到东西')
  assert.strictEqual(
    classifyNxAffectedOutput({ text: raw, exitCode: 0 }).kind,
    KIND_EMPTY,
    '新判据在同一个输入上必须判空集',
  )
})

test('受污染的非空集仍判出项目清单', () => {
  const raw = NX_CACHE_WARNING + '["@multi-publish/ai-writer","@multi-publish/shared-utils"]\n'
  const verdict = classifyNxAffectedOutput({ text: raw, exitCode: 0 })

  assert.strictEqual(verdict.kind, KIND_NON_EMPTY)
  assert.strictEqual(verdict.count, 2)
  assert.deepStrictEqual(verdict.projects, ['@multi-publish/ai-writer', '@multi-publish/shared-utils'])
})

test('提示文本里出现的方括号不得被当成项目清单', () => {
  const raw = 'Read about this warning [here] and [there]\n[]\n'
  const verdict = classifyNxAffectedOutput({ text: raw, exitCode: 0 })

  assert.strictEqual(verdict.kind, KIND_EMPTY, '散文里的 [...] 不是 nx 的输出，行级 parse 应当跳过它们')
})

// ---------------------------------------------------------------------------
// Clean inputs — the pre-existing behaviour must not regress
// ---------------------------------------------------------------------------

test('干净空集判为空集（#2902 已修的能力，保持）', () => {
  assert.strictEqual(classifyNxAffectedOutput({ text: '[]\n', exitCode: 0 }).kind, KIND_EMPTY)
  assert.strictEqual(classifyNxAffectedOutput({ text: '[]', exitCode: 0 }).kind, KIND_EMPTY)
  assert.strictEqual(classifyNxAffectedOutput({ text: '  []  \r\n', exitCode: 0 }).kind, KIND_EMPTY)
})

test('干净非空集判出清单', () => {
  const verdict = classifyNxAffectedOutput({ text: '["@multi-publish/rpa-engine"]\n', exitCode: 0 })
  assert.strictEqual(verdict.kind, KIND_NON_EMPTY)
  assert.deepStrictEqual(verdict.projects, ['@multi-publish/rpa-engine'])
})

test('CRLF 与 BOM/空行混合不影响判定（CI 是 Windows runner，输出是 CRLF）', () => {
  const raw = '\r\n[]\r\n'
  assert.strictEqual(classifyNxAffectedOutput({ text: raw, exitCode: 0 }).kind, KIND_EMPTY)

  const crlfProjects = classifyNxAffectedOutput({ text: '["a","b"]\r\n', exitCode: 0 })
  assert.strictEqual(crlfProjects.kind, KIND_NON_EMPTY)
  assert.deepStrictEqual(crlfProjects.projects, ['a', 'b'])
})

test('多行 pretty-print JSON 仍能判出（nx 将来改输出格式时不至于静默退化成 unparsable）', () => {
  const pretty = JSON.stringify(['@multi-publish/ai-writer', '@multi-publish/video-clone-engine'], null, 2)
  const verdict = classifyNxAffectedOutput({ text: pretty, exitCode: 0 })

  assert.strictEqual(verdict.kind, KIND_NON_EMPTY)
  assert.strictEqual(verdict.count, 2)
})

// ---------------------------------------------------------------------------
// Fail-closed direction: "don't know" must never collapse into "empty"
// ---------------------------------------------------------------------------

test('nx 探测失败（非零退出）一律 unparsable，哪怕文本碰巧像空集', () => {
  // 这是 fail-closed 的核心：探测失败时若被当成"没有受影响项目"而早退，
  // 等于把测试静默关掉 —— 那比误红更危险。
  const verdict = classifyNxAffectedOutput({ text: '[]\n', exitCode: 1 })
  assert.strictEqual(verdict.kind, KIND_UNPARSABLE)
  assert.match(verdict.reason, /exited with code 1/)
})

test('空输入与非数组输出判 unparsable，不猜', () => {
  assert.strictEqual(classifyNxAffectedOutput({ text: '', exitCode: 0 }).kind, KIND_UNPARSABLE)
  assert.strictEqual(classifyNxAffectedOutput({ text: '   \n\n', exitCode: 0 }).kind, KIND_UNPARSABLE)
  assert.strictEqual(classifyNxAffectedOutput({ text: null, exitCode: 0 }).kind, KIND_UNPARSABLE)
  assert.strictEqual(classifyNxAffectedOutput({ text: undefined, exitCode: 0 }).kind, KIND_UNPARSABLE)
  assert.strictEqual(classifyNxAffectedOutput({ text: 'nx: command not found\n', exitCode: 0 }).kind, KIND_UNPARSABLE)
  assert.strictEqual(classifyNxAffectedOutput({ text: '{"projects":[]}\n', exitCode: 0 }).kind, KIND_UNPARSABLE)
})

test('kinds 三值封闭，调用方可以穷举', () => {
  assert.deepStrictEqual(
    [KIND_EMPTY, KIND_NON_EMPTY, KIND_UNPARSABLE].sort(),
    ['empty', 'non-empty', 'unparsable'],
  )
})

// ---------------------------------------------------------------------------
// CLI contract the workflow depends on
// ---------------------------------------------------------------------------

const scriptPath = path.join(__dirname, 'nx-affected-probe.js')

function runCli (stdin, args) {
  const res = require('node:child_process').spawnSync(process.execPath, [scriptPath, ...args], {
    input: stdin,
    encoding: 'utf8',
  })
  return { status: res.status, stdout: res.stdout, stderr: res.stderr }
}

test('CLI 输出机器可读单行 JSON，退出码 0', () => {
  const r = runCli(NX_CACHE_WARNING + '[]\n', ['--exit', '0'])
  assert.strictEqual(r.status, 0)
  const parsed = JSON.parse(r.stdout.trim())
  assert.strictEqual(parsed.kind, KIND_EMPTY)
  assert.deepStrictEqual(parsed.projects, [])
})

test('CLI 缺 --exit 或 --exit 非法时退出 2（脚本自身故障必须与 unparsable 区分开）', () => {
  assert.strictEqual(runCli('[]\n', []).status, 2)
  assert.strictEqual(runCli('[]\n', ['--exit']).status, 2)
  assert.strictEqual(runCli('[]\n', ['--exit', 'abc']).status, 2)
})

test('CLI 在 nx 失败时退出 0 但 kind=unparsable（合法结论，不是脚本错误）', () => {
  const r = runCli('[]\n', ['--exit', '2'])
  assert.strictEqual(r.status, 0)
  assert.strictEqual(JSON.parse(r.stdout.trim()).kind, KIND_UNPARSABLE)
})

test('模块可被 require 且不产生副作用输出', () => {
  const out = execFileSync(process.execPath, ['-e', "require(process.argv[1]); process.stdout.write('quiet')", scriptPath], { encoding: 'utf8' })
  assert.strictEqual(out, 'quiet')
})
