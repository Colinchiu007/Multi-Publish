// Regression tests for .github/scripts/check-coverage-include-sfc.js
//
// Why this lock exists: M-6 的本质是一条「删掉也不会变红」的变更 —— coverage.include
// 缩到不含 .vue 的范围，门禁照样绿、门禁数字照样涨。因此回归锁不能只断言「现在配了 .vue」，
// 那样一个拼错的 `src/**.vue` 就能让整条锁变成装饰。本文件对每条断言各造一个反例，
// 要求判据逐条转红。
//
// 夹具用真实临时目录 + 真实 fs.globSync，而不是塞一个手搓的 glob 解析器：
// 手搓解析器本身可能与真实语义漂移，那又是一条「跑绿但没测到」的锁。
//
//   node --test .github/scripts/check-coverage-include-sfc.test.js

const { test, before, after } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { evaluate, expandGlob } = require('./check-coverage-include-sfc.js')

const ROOT = path.resolve(__dirname, '..', '..')
const DESKTOP = path.join(ROOT, 'apps', 'desktop')

// 缩小的夹具文件集：够区分「全盖 / 漏一层 / 漏目录 / 假 glob」，又不必是仓库全量。
// 刻意在 views 与 components 下各留一个 nested/ —— 「只盖一层」的判据要靠它才测得出来。
const SRC_VUE = [
  'src/views/Home.vue',
  'src/views/nested/Panel.vue',
  'src/components/Widget.vue',
  'src/components/nested/Deep.vue',
]
const TH = { statements: 55, branches: 40, functions: 60, lines: 55 }

let FIXTURE
before(() => {
  FIXTURE = fs.mkdtempSync(path.join(os.tmpdir(), 'm6-cov-fixture-'))
  for (const f of SRC_VUE) {
    fs.mkdirSync(path.dirname(path.join(FIXTURE, f)), { recursive: true })
    fs.writeFileSync(path.join(FIXTURE, f), '<template><div/></template>\n')
  }
  // 一个 .js 兄弟文件，确保 *.js glob 也有东西可命中
  fs.mkdirSync(path.join(FIXTURE, 'src', 'stores'), { recursive: true })
  fs.writeFileSync(path.join(FIXTURE, 'src', 'stores', 'a.js'), 'export const a = 1\n')
})
after(() => {
  fs.rmSync(FIXTURE, { recursive: true, force: true })
})

const check = (include, extra = {}) => evaluate(include, SRC_VUE, { thresholds: TH, cwd: FIXTURE, ...extra })

// ── 1. 正常形态 ────────────────────────────────────────────────────────────
test('真配置形态判绿（唯一能盖住全部 src .vue 的 glob）', () => {
  const r = check(['src/**/*.js', 'src/**/*.vue'])
  assert.strictEqual(r.pass, true, '应通过：' + r.reasons.join(' | '))
  assert.strictEqual(r.coveredCount, SRC_VUE.length)
})

// ── 2. M-6 修复前的形态：include 全是 .js ──────────────────────────────────
test('修复前形态（13 条全为 *.js）必须判红', () => {
  const before = [
    'electron/services/**/*.js', 'electron/ipc-handlers/**/*.js', 'electron/core/**/*.js',
    'electron/bootstrap/**/*.js', 'electron/bootstrap.js', 'electron/main.js',
    'electron/window.js', 'electron/shutdown.js', 'src/stores/**/*.js',
    'src/composables/**/*.js', 'src/views/**/*.js', 'src/components/**/*.js',
    'src/domain/**/*.js',
  ]
  const r = check(before)
  assert.strictEqual(r.pass, false, '缺少 .vue 条目时不得通过')
  assert.match(r.reasons.join(' '), /没有任何能匹配 \.vue 的条目/)
})

// ── 3. 假 glob：写法像模像样，实测命中 0 个 ─────────────────────────────────
// 这是最容易骗过人的形态，也是本锁存在的首要理由。`src/**.vue`（少一个 `*`）在
// 直觉上与 `src/**/*.vue` 几乎一样，但在真实 glob 引擎下零命中。
test('假 glob（src/**.vue，真实引擎下命中 0 个）必须判红 —— 本锁的首要防线', () => {
  // 先证明这个夹具下该 glob 真的零命中，避免这条断言因夹具写错而"假红"
  assert.deepStrictEqual(expandGlob('src/**.vue', FIXTURE), [], '前提：src/**.vue 确应命中 0 个')
  assert.ok(expandGlob('src/**/*.vue', FIXTURE).length > 0, '前提：src/**/*.vue 确应命中若干')

  const r = check(['src/**/*.js', 'src/**.vue'])
  assert.strictEqual(r.pass, false)
  assert.match(r.reasons.join(' '), /实测命中 0 个文件/)
})

// ── 4. 漏一层：`src/views/*.vue` 盖得住 Home，盖不住 views 下的 nested/ ──────
test('只盖一层（src/views/*.vue）漏掉 views/nested/ 时必须判红', () => {
  const r = check(['src/**/*.js', 'src/views/*.vue'])
  assert.strictEqual(r.pass, false)
  const uncovered = r.uncovered.map((f) => path.posix.basename(f)).sort()
  assert.deepStrictEqual(uncovered, ['Deep.vue', 'Panel.vue', 'Widget.vue'],
    'Home.vue 在 views 顶层，应被判为已覆盖')
})

// ── 4b. 只盖 views 整棵树、漏 components 整棵树 ─────────────────────────────
test('src/views/**/*.vue 漏掉 components 整棵树时必须判红', () => {
  const r = check(['src/**/*.js', 'src/views/**/*.vue'])
  assert.strictEqual(r.pass, false)
  const uncovered = r.uncovered.map((f) => path.posix.basename(f)).sort()
  assert.deepStrictEqual(uncovered, ['Deep.vue', 'Widget.vue'])
})

// ── 6. 多条 .vue glob 合起来能盖全 ⇒ 通过（防误报） ────────────────────────
test('多条 .vue glob 合起来盖全时不得误报', () => {
  const r = check(['src/**/*.js', 'src/views/**/*.vue', 'src/components/**/*.vue'])
  assert.strictEqual(r.pass, true, '不应误报：' + r.reasons.join(' | '))
})

// ── 7. 阈值被删 / 置 0 ──────────────────────────────────────────────────────
test('coverage.thresholds 被删掉时必须判红（删阈值等于取消门禁）', () => {
  const r = evaluate(['src/**/*.js', 'src/**/*.vue'], SRC_VUE, { thresholds: {}, cwd: FIXTURE })
  assert.strictEqual(r.pass, false)
  for (const m of ['statements', 'branches', 'functions', 'lines']) {
    assert.match(r.reasons.join(' '), new RegExp(`thresholds\\.${m}`))
  }
})

test('阈值被置 0 也必须判红（0 永远通过，等于没有门禁）', () => {
  const r = evaluate(['src/**/*.js', 'src/**/*.vue'], SRC_VUE, { thresholds: { ...TH, branches: 0 }, cwd: FIXTURE })
  assert.strictEqual(r.pass, false)
  assert.match(r.reasons.join(' '), /thresholds\.branches/)
})

// ── 8. 形态异常不得被当成「零条违规」放行 ──────────────────────────────────
test('include 缺失（undefined）必须判红，不得静默通过', () => {
  const r = evaluate(undefined, SRC_VUE, { thresholds: TH, cwd: FIXTURE })
  assert.strictEqual(r.pass, false)
  assert.match(r.reasons.join(' '), /没有任何能匹配 \.vue 的条目/)
})

// ── 9. 对真实仓库配置跑一遍：这条锁不得与仓库现状脱节 ──────────────────────
// 上面全用夹具。若真仓库的 vitest.config.js 变了形状，它们仍可能全绿，
// 所以这里必须有一条钉在真文件上的断言，且走真实 glob 引擎 + 真实 src 树。
test('真实 apps/desktop/vitest.config.js 判绿，且确实纳入 src 下全部 .vue', () => {
  const cfg = require(path.join(DESKTOP, 'vitest.config.js'))
  const cov = cfg.test.coverage
  const { walk } = require('./check-coverage-include-sfc.js')
  const srcVue = walk(path.join(DESKTOP, 'src'), DESKTOP).filter((f) => f.endsWith('.vue'))

  assert.ok(srcVue.length > 100, `src 下 .vue 数量异常（${srcVue.length}），样本前提失效`)

  const r = evaluate(cov.include, srcVue, { thresholds: cov.thresholds, cwd: DESKTOP })
  assert.strictEqual(r.pass, true, '真实配置应判绿：' + r.reasons.join(' | '))
  assert.strictEqual(r.coveredCount, srcVue.length, 'src 下每一个 .vue 都必须在门禁范围内')
})

// ── 10. 结构锁：本门禁必须真的接进 workflow，否则等于没写 ─────────────────
// 新增 *.test.js 若不被 workflow 显式 `node --test` 点名，回归锁在 CI 上永远不跑。
test('check-coverage-include-sfc 必须被 quality-gate.yml 显式接线', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'quality-gate.yml'), 'utf8')
  const lf = yml.replace(/\r\n/g, '\n')
  assert.match(lf, /node --test \.github\/scripts\/check-coverage-include-sfc\.test\.js/,
    '回归锁未被 workflow 点名 —— CI 上不会执行')
  assert.match(lf, /node \.github\/scripts\/check-coverage-include-sfc\.js/,
    '门禁本体未被 workflow 点名')
})