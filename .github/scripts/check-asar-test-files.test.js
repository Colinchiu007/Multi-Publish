'use strict'
/**
 * check-asar-test-files.test.js — 打包产物「不得混入单元测试」门禁的回归锁
 *
 * 覆盖两个**正交**的失败维度（任一维度单独存在时另一维度看不见它）：
 *   维度 A「声明被删/被改窄」→ checkConfig（静态读 apps/desktop/package.json，CI 每跑必查）
 *   维度 B「声明有效但产物仍有」→ evaluateEntries / checkAsar（读真实 app.asar 清单）
 * 因此本文件既测"缺一条排除就红"，也测"清单里有一个测试条目就红"，还测"清单为空不许报 OK"。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  TEST_FILE_RE,
  normalizeAsarPath,
  isTestArtifactPath,
  countTestEntries,
  evaluateEntries,
  REQUIRED_TEST_EXCLUSIONS,
  REQUIRED_TEST_DIR_EXCLUSIONS,
  checkConfig,
  checkWiring,
  readWorkflowBodies,
  checkNamingCensus,
  checkAsar,
  readDesktopBuildFiles,
} = require('./check-asar-test-files.js')

test('isTestArtifactPath：判定表（含 Windows 反斜杠与相邻扩展名负控）', () => {
  // asar 的 listPackage 在 Windows 上返回 **反斜杠** 路径，不归一化会让所有分类判据静默全落"其他"
  assert.equal(isTestArtifactPath('\\electron\\services\\logger.test.js'), true)
  assert.equal(isTestArtifactPath('/electron/services/logger.test.js'), true)
  assert.equal(isTestArtifactPath('/electron/a.test.mjs'), true)
  assert.equal(isTestArtifactPath('/electron/a.test.cjs'), true)
  // ts 族是实测补进来的：apps/desktop/electron/core/container.test.ts 曾真实进过产物
  assert.equal(isTestArtifactPath('/electron/core/container.test.ts'), true)
  assert.equal(isTestArtifactPath('/packages/x/src/a.test.tsx'), true)
  // 负控：这些都不是本仓"单测文件"命名（白名单未收录的扩展名由 checkNamingCensus 负责在出现当天变红）
  assert.equal(isTestArtifactPath('/electron/a.js'), false)
  assert.equal(isTestArtifactPath('/electron/a.tests.js'), false, 'a.tests.js 不是 {被测}.test.js 约定')
  assert.equal(isTestArtifactPath('/electron/a.test.jsx'), false, 'jsx 未登记进白名单（本仓 0 个此类文件）')
  assert.equal(isTestArtifactPath('/electron/a.test.js.map'), false, 'source map 不是被执行的测试文件')
  assert.equal(isTestArtifactPath('/electron/test.js'), false)
  assert.equal(isTestArtifactPath('/electron/mytests.test.js'), true)
})

test('TEST_FILE_RE 与 REQUIRED_TEST_EXCLUSIONS 必须同族（防"判据认得、排除没写"这一半漏口）', () => {
  assert.equal(TEST_FILE_RE.source, '\\.test\\.(?:js|mjs|cjs|ts|tsx)$')
  const extsFromRe = ['js', 'mjs', 'cjs', 'ts', 'tsx']
  assert.deepEqual(REQUIRED_TEST_EXCLUSIONS, extsFromRe.map((e) => '!**/*.test.' + e))
  // 每个排除模式去掉 `!**/` 与 `!` 后，必须能被同一条判据命中（两处若各写一份口径，这条立刻红）
  for (const p of REQUIRED_TEST_EXCLUSIONS) {
    assert.equal(isTestArtifactPath('/electron/x' + p.replace(/^!\*\*\//, '')), true, '模式与判据脱节: ' + p)
  }
})

test('countTestEntries：命中集合与顺序敏感的精确断言', () => {
  const entries = [
    '/electron/a.test.js', '/electron/a.js', '\\electron\\b.test.js',
    '/node_modules/pkg/c.test.cjs', '/dist/index.html',
  ]
  const r = countTestEntries(entries)
  assert.equal(r.total, 5)
  assert.equal(r.tests.length, 3)
  // 归一化后按字典序，保证现场输出稳定（不做排序的话同一份产物两次跑可能给出不同顺序）
  assert.deepEqual(r.tests, ['/electron/a.test.js', '/electron/b.test.js', '/node_modules/pkg/c.test.cjs'])
})

test('evaluateEntries：清单为空 / 无条目 一律判"不可证明"，不得当成通过（反向偏置）', () => {
  assert.deepEqual(evaluateEntries([]), {
    ok: false, unverifiable: true, total: 0, tests: [],
  })
  const okCase = evaluateEntries(['/electron/a.js'])
  assert.equal(okCase.ok, true)
  assert.equal(okCase.unverifiable, undefined)
  assert.deepEqual(okCase.tests, [])
  const badCase = evaluateEntries(['/electron/a.js', '/electron/a.test.js'])
  assert.equal(badCase.ok, false)
  assert.deepEqual(badCase.tests, ['/electron/a.test.js'])
})

test('normalizeAsarPath：反斜杠转正斜杠，且幂等', () => {
  assert.equal(normalizeAsarPath('\\a\\b\\c.test.js'), '/a/b/c.test.js')
  assert.equal(normalizeAsarPath('/a/b/c.test.js'), '/a/b/c.test.js')
})

test('checkConfig：真实仓库的 build.files 必须含全部三类排除（防回潮主锁）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const r = checkConfig(readDesktopBuildFiles(repoRoot))
  assert.equal(r.ok, true, '缺项: ' + JSON.stringify(r.missing))
  assert.deepEqual(r.missing, [])
})

test('checkConfig：扩展名族齐了但漏掉按目录排除，仍必须判不通过（实测残留的唯一来源）', () => {
  const noDir = ['dist/**/*', 'electron/**/*', 'node_modules/**/*'].concat(REQUIRED_TEST_EXCLUSIONS)
  const r = checkConfig(noDir)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, REQUIRED_TEST_DIR_EXCLUSIONS,
    '缺的必须恰好是那条目录排除 —— electron/tests/story2video-real-ffmpeg.node-test.cjs 用的不是 .test. 命名')
})

test('checkConfig：摘掉任一排除即红，且点名缺的是哪一条', () => {
  const all = REQUIRED_TEST_EXCLUSIONS.concat(REQUIRED_TEST_DIR_EXCLUSIONS)
  const full = ['dist/**/*', 'electron/**/*', 'node_modules/**/*'].concat(all)
  assert.equal(checkConfig(full).ok, true)
  for (const drop of all) {
    const r = checkConfig(full.filter((f) => f !== drop))
    assert.equal(r.ok, false, '摘掉 ' + drop + ' 必须判不通过')
    assert.deepEqual(r.missing, [drop], '必须点名恰好是被摘掉的那一条')
  }
})

test('checkConfig：把排除写窄成"只管 electron"必须判不通过（实测 462 条里有 44 条来自 node_modules）', () => {
  const narrowed = ['dist/**/*', 'electron/**/*', 'node_modules/**/*',
    '!electron/**/*.test.js', '!electron/**/*.test.mjs', '!electron/**/*.test.cjs']
  const r = checkConfig(narrowed)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, REQUIRED_TEST_EXCLUSIONS.concat(REQUIRED_TEST_DIR_EXCLUSIONS),
    '五条全域扩展名排除与目录排除都算缺失')
})

test('checkConfig：files 缺失 / 非数组 / 空数组一律抛错，不返回"通过"', () => {
  for (const bad of [undefined, null, 'dist/**/*', [], {}]) {
    assert.throws(() => checkConfig(bad), /无法证明|必须是数组/, '不可接受: ' + JSON.stringify(bad))
  }
})

test('checkAsar：asar 文件不存在时抛错（fail closed），不得报"0 个测试文件所以 OK"', () => {
  const missing = path.join(os.tmpdir(), 'mp-definitely-not-here-' + process.pid + '.asar')
  assert.equal(fs.existsSync(missing), false, '夹具前提：路径必须不存在')
  assert.throws(() => checkAsar(missing), /不存在/)
})

test('checkAsar：对真实 asar 能读出清单并判定（os.tmpdir 下自建，不依赖仓库构建残留）', async () => {
  const Asar = require(path.resolve(__dirname, '..', '..', 'node_modules', '@electron', 'asar'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-asar-gate-'))
  const archive = path.join(dir, 'out.asar')
  try {
    fs.mkdirSync(path.join(dir, 'src', 'electron'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'electron', 'main.js'), '// ok\n')
    fs.writeFileSync(path.join(dir, 'src', 'electron', 'main.test.js'), '// test\n')
    await Asar.createPackage(path.join(dir, 'src'), archive)
    const r = checkAsar(archive)
    assert.equal(r.total > 0, true, '清单必须非空，否则这条锁什么都没测')
    assert.equal(r.ok, false, '含 main.test.js 必须判不通过')
    assert.deepEqual(r.tests, ['/electron/main.test.js'])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('checkAsar：夹具必须真的能判"通过"（只测"含测试即红"会把恒红的实现误当成有效锁）', async () => {
  const Asar = require(path.resolve(__dirname, '..', '..', 'node_modules', '@electron', 'asar'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-asar-gate-ok-'))
  const archive = path.join(dir, 'out.asar')
  try {
    fs.mkdirSync(path.join(dir, 'src', 'electron'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src', 'electron', 'main.js'), '// ok\n')
    fs.writeFileSync(path.join(dir, 'src', 'electron', 'helper.js'), '// ok\n')
    await Asar.createPackage(path.join(dir, 'src'), archive)
    const r = checkAsar(archive)
    // 精确 3 条：/electron 这个**目录条目**也在 listPackage 的返回里（实测形状）。
    // 记这条不是为了好看，是为了让"解析退化成一个目录条目/退化到只读一层"这类形状变化当场可辨。
    assert.equal(r.total, 3, '清单条目数必须精确（含目录条目），实得 ' + r.total)
    assert.equal(r.ok, true)
    assert.deepEqual(r.tests, [])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ---- 命名完整性反查：白名单漏族当天必须变红 ----

test('checkWiring：真实 workflow 正文里两个维度都已接线', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const r = checkWiring(readWorkflowBodies(repoRoot))
  assert.deepEqual(r.missing, [], '缺接线: ' + JSON.stringify(r.missing))
})

test('checkWiring：产物维度不在可执行正文里 ⇒ 判未接线（剥注释由 readWorkflowBodies 负责）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const real = readWorkflowBodies(repoRoot)
  // 从真实正文里把 --asar 那一步整段摘掉，再以「注释行」放回去：
  // 关键在于原始文件里那一步**字面上还在**（只是被注释），若判据写成 includes(原文) 就会假绿。
  const lines = real.build.split('\n')
  const hit = lines.findIndex((l) => l.includes('check-asar-test-files.js --asar'))
  assert.ok(hit > 1, '前提：真实 build.yml 里能找到那一步，否则这条夹具在测空气')
  const stepLines = lines.slice(hit - 2, hit + 1)
  const commented = lines
    .filter((_, i) => i < hit - 2 || i > hit)
    .concat(stepLines.map((l) => '# ' + l.trim()))
    .join('\n')
  assert.match(commented, /check-asar-test-files\.js --asar/, '夹具前提：字面仍在，只是变成注释')
  const r = checkWiring({ qualityGate: real.qualityGate, build: commented })
  assert.equal(r.ok, false)
  assert.match(r.missing.join('|'), /build\.yml/)
})

test('readWorkflowBodies：注释里的调用不得进入可执行正文（接线判据的地基）', () => {
  // 自我否证设计：同一份 yml，剥注释后**必须看不见**那行调用，而未剥的原文**必须看得见**。
  // 只断言"剥完找不到"是不够的 —— 判据写错成"永远找不到"时该断言同样通过（本仓把它叫装饰性锁）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2702-wiring-'))
  try {
    const wfDir = path.join(dir, '.github', 'workflows')
    fs.mkdirSync(wfDir, { recursive: true })
    const yml = [
      'jobs:',
      '  gate:',
      '    steps:',
      '      # 有人把调用注释掉了，字面还在文件里：node .github/scripts/check-asar-test-files.js',
      '      - run: node --test .github/scripts/check-asar-test-files.test.js',
      '',
    ].join('\n')
    fs.writeFileSync(path.join(wfDir, 'quality-gate.yml'), yml)
    fs.writeFileSync(path.join(wfDir, 'build.yml'), 'jobs:\n  build:\n    steps:\n      - run: echo ok\n')

    const bodies = readWorkflowBodies(dir)
    const raw = fs.readFileSync(path.join(wfDir, 'quality-gate.yml'), 'utf8')
    assert.match(raw, /node \.github\/scripts\/check-asar-test-files\.js/, '前提：注释里确实出现过这条调用')
    assert.doesNotMatch(bodies.qualityGate, /node \.github\/scripts\/check-asar-test-files\.js/, '注释里的调用必须被剥掉')
    assert.match(bodies.qualityGate, /node --test \.github\/scripts\/check-asar-test-files\.test\.js/, '可执行行必须留着')
    // 且此时判据必须判「config 维度未接线」，而不是因为字面存在就放行
    const r = checkWiring({ qualityGate: bodies.qualityGate, build: 'x' })
    assert.equal(r.ok, false)
    assert.match(r.missing.join('|'), /--config 维度/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('checkWiring 自身退化成 no-op 必须立刻变红（把锁改成恒过，负控夹具须抓到）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const real = readWorkflowBodies(repoRoot)
  // 与上面 N10 型变异同形：判据恒不报缺 ⇒ 任何未接线场景都会被放行
  const asNoOp = () => ({ ok: true, missing: [] })
  assert.equal(asNoOp({ qualityGate: real.qualityGate, build: '' }).ok, true, '夹具前提：no-op 恒过')
  // 因此唯一能抓住它的就是"真实未接线"的夹具：这里用两条独立负控
  const negative = { qualityGate: real.qualityGate, build: real.build.replace(/run: node \.github\/scripts\/check-asar-test-files\.js --asar \S+/, 'run: echo 什么都没跑') }
  assert.equal(checkWiring(negative).ok, false, '真实判据必须抓住被摘掉的那一步（no-op 版本抓不住）')
  const emptyGate = { qualityGate: 'jobs:\n', build: real.build }
  assert.equal(checkWiring(emptyGate).ok, false, '真实判据必须抓住 quality-gate 侧的两条点名')
})

test('checkWiring：产物维度条件与打包步骤不一致必须判未接线', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const real = readWorkflowBodies(repoRoot)
  // 把 if 条件改成恒真之外的另一种（例如只判 OS）：打包被短路时该步骤会去读不存在/陈旧的产物
  const drifted = real.build.replace(
    /if: runner\.os == 'Windows' && steps\.changes\.outputs\.package-relevant == 'true'(\s*\n\s*shell: bash\s*\n\s*run: node \.github\/scripts\/check-asar-test-files\.js --asar)/,
    'if: runner.os == \'Windows\'$1',
  )
  assert.notEqual(drifted, real.build, '前提：变异锚点必须真的命中')
  const r = checkWiring({ qualityGate: real.qualityGate, build: drifted })
  assert.equal(r.ok, false)
  assert.match(r.missing.join('|'), /同条件/)
})

test('checkWiring：正文为空一律抛错，不得判"已接线"（反向偏置）', () => {
  assert.throws(() => checkWiring({ qualityGate: '', build: 'x' }), /解析退化/)
  assert.throws(() => checkWiring({ qualityGate: 'x', build: '' }), /解析退化/)
  assert.throws(() => checkWiring({}), /解析退化/)
})

test('checkNamingCensus：真实仓库打包域内的 `.test.` 文件必须全部被白名单覆盖（含规模下界）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const r = checkNamingCensus(repoRoot)
  assert.deepEqual(r.missed, [], '漏族: ' + JSON.stringify(r.missed))
  // 规模下界：解析退化成一个很小的集合时（例如 pathspec/域前缀写错）必须变红，而不是"0 漏族 = OK"
  assert.ok(r.scanned > 400, 'scanned 必须达到本仓打包域单测的量级，实得 ' + r.scanned)
})

test('checkNamingCensus：新增第六族命名（.test.vue）必须被点名（这条才让"白名单"不是一句自我声明）', () => {
  const list = [
    'apps/desktop/electron/a.test.js',
    'apps/desktop/electron/b.test.vue',
    'packages/shared-utils/src/c.test.ts',
  ]
  const r = checkNamingCensus('.', { listFiles: () => list })
  assert.equal(r.scanned, 3)
  assert.deepEqual(r.missed, ['apps/desktop/electron/b.test.vue'])
})

test('checkNamingCensus：域外文件不参与判定（scripts/*.test.ps1 从不进产物，判它等于第一天就假红）', () => {
  const list = [
    'apps/desktop/electron/a.test.js',
    'scripts/session-init.test.sh',
    'scripts/mp-worktree-health.test.ps1',
    '.github/scripts/check-ps1-bom.test.js',
  ]
  const r = checkNamingCensus('.', { listFiles: () => list })
  assert.equal(r.scanned, 1, '只有打包域内的 a.test.js 计入')
  assert.deepEqual(r.missed, [])
})

test('checkNamingCensus：清单为空 / 域内没有任何 `.test.` 文件 ⇒ 判前提失效，不得报"干净"', () => {
  assert.throws(() => checkNamingCensus('.', { listFiles: () => [] }), /遍历不完整/)
  assert.throws(
    () => checkNamingCensus('.', { listFiles: () => ['apps/desktop/electron/main.js', 'package.json'] }),
    /前提失效|矛盾/,
  )
})
