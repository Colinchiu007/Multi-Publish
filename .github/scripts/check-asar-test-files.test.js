'use strict'
/**
 * check-asar-test-files.test.js — 打包产物「不得混入单元测试」门禁的回归锁
 *
 * 覆盖三类**互相看不见**的失败面（任一面单独存在时另外两面全绿）：
 *   A「声明被删/被改窄」→ checkConfig + checkExtraResourcesConfig（静态读 apps/desktop/package.json 的
 *     build.files 与 build.extraResources —— 这是 app.asar 之外的第二条拷贝通道，#2765 实测带走 189 个测试文件）
 *   B「声明有效但产物仍有」→ evaluateEntries / checkAsar（读真实 app.asar 清单）
 *     + walkLooseFiles / checkLooseResources（扫 win-unpacked/resources 松散树，不认声明只认字节）
 *   C「门禁本身被从 workflow 里摘掉」→ checkWiring（三处调用点逐个核对，注释里的字面不算接线）
 * 因此本文件既测"缺一条排除就红"，也测"清单里有一个测试条目就红"，还测"清单为空/目录不存在不许报 OK"。
 */
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

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
  packagingStepWhy,
  readWorkflowBodies,
  checkNamingCensus,
  checkAsar,
  readDesktopBuildFiles,
  readDesktopBuild,
  checkExtraResourcesConfig,
  walkLooseFiles,
  checkLooseResources,
  parseCliArgs,
  main,
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

test('checkWiring：真实 workflow 正文里三个维度都已接线', () => {
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
  const negative = {
    qualityGate: real.qualityGate,
    build: dropCommands(real.build, ['--asar', '--resources']),
  }
  assert.notEqual(negative.build, real.build, '前提：变异锚点必须真的命中，否则这条负控在测空气')
  assert.equal(checkWiring(negative).ok, false, '真实判据必须抓住被摘掉的那两步（no-op 版本抓不住）')
  // 两个产物维度各自独立：只摘一条也必须红，且点名的是被摘的那一条
  for (const flag of ['--asar', '--resources']) {
    const one = { qualityGate: real.qualityGate, build: dropCommands(real.build, [flag]) }
    const r = checkWiring(one)
    assert.equal(r.ok, false, '只摘 ' + flag + ' 必须判未接线')
    assert.match(r.missing.join('|'), new RegExp('build\\.yml 的 ' + flag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + ' 维度步骤不存在'),
      '必须点名是哪一维，实得 ' + JSON.stringify(r.missing))
  }
  const emptyGate = { qualityGate: 'jobs:\n', build: real.build }
  assert.equal(checkWiring(emptyGate).ok, false, '真实判据必须抓住 quality-gate 侧的两条点名')
})

/** 把 run 块里"以该 flag 调用本门禁"的命令行整行摘掉（模拟从 workflow 正文删除该维度）。 */
function dropCommands (text, flags) {
  return text.split('\n')
    .filter((line) => !flags.some((f) => /(^|\s)node \.github\/scripts\/check-asar-test-files\.js\s/.test(line) && line.includes(f)))
    .join('\n')
}

test('checkWiring：同一维度被抄进两个步骤也要红（口径分裂不得靠"至少有一处对"放行）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const real = readWorkflowBodies(repoRoot)
  // 第二处用不同的 if 条件：若判据是"有任何一步配对即通过"，这种重复会永久绿，
  // 而真正生效的那一步一旦被改窄，现场看不出哪条在守。
  const i = real.build.indexOf('      - name: Upload Windows artifact')
  assert.ok(i > 0, '前提：真实 build.yml 里能找到 Upload Windows artifact 这一步')
  const injected = [
    '      - name: Duplicated resources check',
    "        if: github.ref == 'refs/heads/main'",
    '        shell: bash',
    '        run: node .github/scripts/check-asar-test-files.js --resources apps/desktop/dist-electron/win-unpacked/resources',
    '',
  ].join('\n')
  const duplicated = real.build.slice(0, i) + injected + real.build.slice(i)
  const r = checkWiring({ qualityGate: real.qualityGate, build: duplicated })
  assert.equal(r.ok, false)
  assert.match(r.missing.join('|'), /--resources 维度步骤出现在 2 个步骤里/)
})

test('checkWiring：产物维度步骤缺 shell: bash 必须判未接线（多条命令在 pwsh 下不 fail-fast）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const real = readWorkflowBodies(repoRoot)
  const hit = real.build.split('\n').findIndex((l) => l.includes('check-asar-test-files.js --asar'))
  assert.ok(hit > 1, '前提：真实 build.yml 里能找到 --asar 那次调用')
  const lines = real.build.split('\n')
  assert.match(lines[hit - 4], /^\s*shell: bash\s*$/, '前提：该步骤紧邻上方就是 shell: bash')
  lines[hit - 4] = '        shell: pwsh'
  const r = checkWiring({ qualityGate: real.qualityGate, build: lines.join('\n') })
  assert.equal(r.ok, false)
  assert.match(r.missing.join('|'), /必须声明 shell: bash/)
})

test('packagingStepWhy：调用只以注释形态出现在合规步骤里 ⇒ 必须判未接线（"注释不算接线"在本层的锁）', () => {
  // 这条专门锁 packagingStepWhy 自己剥注释的那一步：readWorkflowBodies 也会剥，
  // 但如果判据改成"字面出现即算接线"，那么上游哪一次没剥干净就再没有第二道防线。
  const bd = [
    '      - name: Only commented',
    "        if: runner.os == 'Windows' && steps.changes.outputs.package-relevant == 'true'",
    '        shell: bash',
    '        run: |',
    '          # node .github/scripts/check-asar-test-files.js --asar apps/desktop/dist-electron/win-unpacked/resources/app.asar',
    '          # node .github/scripts/check-asar-test-files.js --resources apps/desktop/dist-electron/win-unpacked/resources',
    '',
  ].join('\n')
  assert.match(packagingStepWhy(bd, '--asar'), /不存在/)
  assert.match(packagingStepWhy(bd, '--resources'), /不存在/)
})

test('checkWiring：产物维度条件与打包步骤不一致必须判未接线', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const real = readWorkflowBodies(repoRoot)
  // 把 if 条件改成恒真之外的另一种（例如只判 OS）：打包被短路时该步骤会去读不存在/陈旧的产物
  const drifted = real.build.replace(
    /if: runner\.os == 'Windows' && steps\.changes\.outputs\.package-relevant == 'true'(\s*\n\s*shell: bash\s*\n\s*run: \|)/,
    "if: runner.os == 'Windows'$1",
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

// ===================== #2765：app.asar 之外的第二条拷贝通道 =====================

test('判据链上的源文件不得被 .gitignore 静默吞掉（本会话真踩过：.gitignore 的 test-*.js 未锚定目录）', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  // 这几份文件里任何一份被 git 忽略，CI 上就是 MODULE_NOT_FOUND —— 而本地因为文件真实存在，全绿。
  // AGENTS.md 已把该坑写在"新增测试文件名"上，既有锁 e2e-quality-infrastructure.test.js 的域也只有 *.test.js；
  // 本会话中的是一份**非测试**源文件（原名 test-artifact-pattern.js），所以那条锁没拦住 ⇒ 这里补一道按"判据链"划域的锁。
  const CHAIN = [
    'packages/shared-utils/src/artifact-test-pattern.js',
    '.github/scripts/check-asar-test-files.js',
    '.github/scripts/check-asar-test-files.test.js',
    'apps/desktop/scripts/stage-remotion-runtime.js',
    'apps/desktop/scripts/stage-remotion-runtime.test.js',
    'apps/desktop/scripts/before-pack.js',
  ]
  const ignored = CHAIN.filter((rel) => !fs.existsSync(path.join(repoRoot, rel)) || isGitIgnored(repoRoot, rel))
  assert.deepEqual(ignored, [], '判据链上被忽略/缺失的文件：' + JSON.stringify(ignored))

  // 反失明：探针必须能认出"确实被忽略"的东西，否则上面的"0 命中"没有任何含义。
  // 用一条本仓真实存在的忽略规则当负控（.gitignore 里的 dist-electron / 临时产物域），
  // 若哪天规则被删导致探针恒 false，这条会当场红。
  const NEGATIVES = ['apps/desktop/dist-electron/win-unpacked/resources/app.asar', 'scripts/test-probe-fixture.js']
  const missed = NEGATIVES.filter((rel) => !isGitIgnored(repoRoot, rel))
  assert.deepEqual(missed, [], '探针认不出被忽略的路径 ⇒ 判据已退化成恒 false：' + JSON.stringify(missed))
})

/** `git check-ignore` 命中即为真；取不到 git 时必须出声（抛错），不得返回 false 当成"没被忽略"。 */
function isGitIgnored (repoRoot, rel) {
  let out
  try {
    out = execFileSync('git', ['-C', repoRoot, 'check-ignore', '-v', '--', rel], { encoding: 'utf8' })
  } catch (e) {
    // rc=1 且无输出 = 未被忽略（git 的既定契约）；其余一律视为探针故障
    if (e.status === 1 && !String(e.stdout || '').trim() && !String(e.stderr || '').trim()) return false
    throw new Error('git check-ignore 探针故障（无法证明"没被忽略"，拒绝判定通过）：' + rel + ' :: ' + (e.message || e))
  }
  return String(out).trim().length > 0
}

test('判据只有一份实现：门禁与暂存脚本必须拿到同一个函数对象（防"两处各写一份"）', () => {
  const shared = require('../../packages/shared-utils/src/artifact-test-pattern.js')
  const staging = require('../../apps/desktop/scripts/stage-remotion-runtime.js')
  assert.equal(TEST_FILE_RE, shared.TEST_FILE_RE, '正则必须是同一个对象，不是同字面量的两份')
  assert.equal(isTestArtifactPath, shared.isTestArtifactPath)
  assert.equal(staging.isTestArtifactPath, shared.isTestArtifactPath)
  assert.deepEqual(REQUIRED_TEST_EXCLUSIONS, shared.TEST_EXCLUSION_PATTERNS)
})

test('checkExtraResourcesConfig：真实仓库的两条"从仓库树拷"的条目都必须已带 filter', () => {
  const repoRoot = path.resolve(__dirname, '..', '..')
  const build = readDesktopBuild(repoRoot)
  const r = checkExtraResourcesConfig(build)
  assert.equal(r.ok, true, '未覆盖: ' + JSON.stringify(r.offenders))
  assert.ok(r.scanned >= 6, 'extraResources 条目数应与实测同量级，实得 ' + r.scanned)
  assert.deepEqual(r.covered.sort(), ['../../config', '../../packages/remotion-composer'],
    '需带 filter 的条目由 from 是否以 ../ 开头决定，清单必须可枚举')
})

test('checkExtraResourcesConfig：新增一条 ../ 拷贝而不带 filter ⇒ 当场红，并点名缺哪几条', () => {
  const build = {
    extraResources: [
      { from: '../../packages/other-thing', to: 'packages/other-thing' },
      { from: '.media-tools', to: 'media-tools' },
    ],
  }
  const r = checkExtraResourcesConfig(build)
  assert.equal(r.ok, false)
  assert.equal(r.offenders.length, 1, '暂存目录（非 ../）不该被算成 offender')
  assert.equal(r.offenders[0].from, '../../packages/other-thing')
  assert.deepEqual(r.offenders[0].missing, REQUIRED_TEST_EXCLUSIONS)
})

test('checkExtraResourcesConfig：filter 写"半个"也必须点名余下的，且写法必须逐字精确', () => {
  const build = {
    extraResources: [
      { from: '../../x', to: 'x', filter: ['**/*', '!**/*.test.js', '!**/test.ts'] },
    ],
  }
  const r = checkExtraResourcesConfig(build)
  assert.equal(r.ok, false)
  assert.deepEqual(r.offenders[0].missing, ['!**/*.test.mjs', '!**/*.test.cjs', '!**/*.test.ts', '!**/*.test.tsx'],
    '!**/test.ts（少一个点）不算满足 !**.test.ts')
})

test('checkExtraResourcesConfig：extraResources 缺失/非数组/空 ⇒ 抛错，不返回"没有条目所以干净"', () => {
  for (const bad of [undefined, null, {}, { extraResources: [] }, { extraResources: 'x' }]) {
    assert.throws(() => checkExtraResourcesConfig(bad), /无法证明|缺失或为空/, '不可接受: ' + JSON.stringify(bad))
  }
})

test('walkLooseFiles + checkLooseResources：真目录实证（os.tmpdir 自建，含嵌套与目录自身不算文件）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-loose-'))
  try {
    fs.mkdirSync(path.join(dir, 'packages', 'remotion-composer', 'node_modules', 'p', 'tests'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'packages', 'remotion-composer', 'src'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'app.asar'), 'not-a-dir\n')
    fs.writeFileSync(path.join(dir, 'packages', 'remotion-composer', 'src', 'index.tsx'), '// 运行期需要\n')
    fs.writeFileSync(path.join(dir, 'packages', 'remotion-composer', 'node_modules', 'p', 'tests', 'a.test.ts'), '// t\n')
    fs.writeFileSync(path.join(dir, 'packages', 'remotion-composer', 'node_modules', 'p', 'tests', 'fixtures.json'), '{}\n')
    // QM-6 外部评审要求补的三形状：非 ASCII 路径、超深嵌套、文件名里有 `#`（剥注释的那套判据不得漏到这里）、emoji 名
    fs.mkdirSync(path.join(dir, 'config', '深层嵌套', 'a', 'b', 'c', 'd'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'config', '深层嵌套', 'a', 'b', 'c', 'd', '检查.test.ts'), '// t\n')
    fs.writeFileSync(path.join(dir, 'config', 'we#ird.test.js'), '// t\n')
    fs.writeFileSync(path.join(dir, 'config', 'emoji-🎬.json'), '{}\n')
    const files = walkLooseFiles(dir)
    assert.deepEqual(files, [
      'app.asar',
      'config/emoji-🎬.json',
      'config/we#ird.test.js',
      'config/深层嵌套/a/b/c/d/检查.test.ts',
      'packages/remotion-composer/node_modules/p/tests/a.test.ts',
      'packages/remotion-composer/node_modules/p/tests/fixtures.json',
      'packages/remotion-composer/src/index.tsx',
    ], '清单必须精确（目录不进列表、路径正斜杠、排序稳定）')
    const r = checkLooseResources(dir)
    assert.equal(r.total, 7)
    assert.equal(r.ok, false)
    assert.deepEqual(r.tests, [
      'config/we#ird.test.js',
      'config/深层嵌套/a/b/c/d/检查.test.ts',
      'packages/remotion-composer/node_modules/p/tests/a.test.ts',
    ], '非 ASCII / 深层 / 带 # 的测试文件一个都不许漏')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('walkLooseFiles：符号链接"按名字计入但绝不跟随"（既不假绿也不越界；QM-6 外部评审提出的形状）', () => {
  // 为什么用注入的 readdir 而不是真建符号链接：Windows 上非管理员建文件符号链接一般 EPERM，
  // 若"建不了就 skip"，这条判据在多数机器（含 CI）上等于永久不跑 —— 与"找不到宿主 d.ts 就 return 跳过"同错。
  const ent = (name, kind) => ({
    name,
    isSymbolicLink: () => kind === 'symlink',
    isDirectory: () => kind === 'dir',
    isFile: () => kind === 'file',
  })
  const TABLE = {
    '': [ent('a.js', 'file'), ent('sub', 'dir'), ent('sneaky.test.js', 'symlink'), ent('realdir', 'symlink')],
    'sub': [ent('b.test.ts', 'file')],
  }
  const visited = []
  const files = walkLooseFiles('FAKE-ROOT', {
    readdir: (abs) => {
      const rel = String(abs).slice('FAKE-ROOT'.length).replace(/^[\\/]/, '').split(String.fromCharCode(92)).join('/')
      visited.push(rel)
      const list = TABLE[rel]
      if (!list) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return list
    },
  })
  // 符号链接本身进清单（名叫 x.test.js 的链接同样是"发出去的测试文件"）；
  // 但它**不会被展开**：realdir 那条链接既没进清单也没被访问。
  assert.deepEqual(files, ['a.js', 'realdir', 'sneaky.test.js', 'sub/b.test.ts'])
  assert.equal(files.includes('realdir/x'), false, '链接指向的目录不得被展开')
  assert.deepEqual(visited.sort(), ['', 'sub'], '不得对符号链接路径调 readdir（跟随=把树外内容算成产物）')
  // 同一份清单喂给判定层：链接名与真文件都要被抓出来
  const verdict = evaluateEntries(files)
  assert.equal(verdict.ok, false)
  assert.deepEqual(verdict.tests, ['sneaky.test.js', 'sub/b.test.ts'])
})

test('checkLooseResources：目录不存在 / 不是目录 / 一个文件都没有 ⇒ 一律不判通过', () => {
  const missing = path.join(os.tmpdir(), 'mp-definitely-absent-' + process.pid + '.dir')
  assert.equal(fs.existsSync(missing), false, '夹具前提：路径必须不存在')
  assert.throws(() => checkLooseResources(missing), /不存在/)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-loose-empty-'))
  try {
    fs.mkdirSync(path.join(dir, 'only-sub', 'deeper'), { recursive: true })
    const r = checkLooseResources(dir)
    assert.equal(r.ok, false, '空清单不得报通过')
    assert.equal(r.unverifiable, true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const f = path.join(os.tmpdir(), 'mp-loose-notadir-' + process.pid + '.txt')
  fs.writeFileSync(f, 'x\n')
  try {
    assert.throws(() => checkLooseResources(f), /不是目录/)
  } finally {
    fs.rmSync(f, { force: true })
  }
})

test('parseCliArgs：参数被吃掉就是"该维度没跑"，四种漂移一律当场红（缺值/未知开关/位置参数/重复）', () => {
  assert.throws(() => parseCliArgs(['--resources']), /缺少取值/)
  assert.throws(() => parseCliArgs(['--asar', 'a', '--resources']), /缺少取值/)
  assert.throws(() => parseCliArgs(['--resource', 'x']), /无法理解的开关/)
  assert.throws(() => parseCliArgs(['apps/desktop/x.asar']), /位置参数/)
  assert.throws(() => parseCliArgs(['--asar', 'a', '--asar', 'b']), /重复出现/)
  assert.deepEqual(
    { asar: parseCliArgs(['--asar', 'a']).asar, repo: parseCliArgs([]).repo !== undefined },
    { asar: 'a', repo: true },
  )
})

test('main：--resources 漏填写值时不得退回 config 模式报 OK（旧写法就是这样把"没跑"报成"干净"的）', () => {
  const log = console.error
  const out = []
  console.error = (...a) => out.push(a.join(' '))
  try {
    assert.equal(main(['--resources']), 1)
    assert.match(out.join('\n'), /参数维度/)
    assert.doesNotMatch(out.join('\n'), /OK（config 维度）/, '缺值时绝不能偷偷跑去别的维度还报 OK')
  } finally {
    console.error = log
  }
})

test('main：同时给 --asar 与 --resources 时两维都必须跑（互不短路）', () => {
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-loose-both-'))
  const log = console.log
  const err = console.error
  const lines = []
  console.log = (...a) => lines.push(a.join(' '))
  console.error = (...a) => lines.push(a.join(' '))
  try {
    fs.mkdirSync(path.join(clean, 'y'), { recursive: true })
    fs.writeFileSync(path.join(clean, 'y', 'keep.js'), '// k\n')
    const missingAsar = path.join(clean, 'definitely-absent.asar')
    assert.equal(main(['--asar', missingAsar, '--resources', clean]), 1)
    const joined = lines.join('\n')
    assert.match(joined, /asar 维度/, '第一维必须有现场')
    assert.match(joined, /松散树维度/, '第二维也必须真有现场 —— 只跑第一维就 return 是本条要抓的形态')
  } finally {
    console.log = log
    console.error = err
    fs.rmSync(clean, { recursive: true, force: true })
  }
})

test('main(--resources)：脏目录返回 1、干净目录返回 0、目录不存在返回 1（不是 0）', () => {
  const dirty = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-loose-dirty-'))
  const clean = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-loose-clean-'))
  const log = console.error
  const out = []
  console.error = (...a) => out.push(a.join(' '))
  try {
    fs.mkdirSync(path.join(dirty, 'x'), { recursive: true })
    fs.writeFileSync(path.join(dirty, 'x', 'a.test.js'), '// t\n')
    fs.mkdirSync(path.join(clean, 'y'), { recursive: true })
    fs.writeFileSync(path.join(clean, 'y', 'keep.js'), '// k\n')
    assert.equal(main(['--resources', dirty]), 1)
    assert.ok(out.join('\n').includes('松散树维度'), '失败文案必须点名是哪个维度，否则现场无法归因')
    assert.equal(main(['--resources', clean]), 0)
    assert.equal(main(['--resources', path.join(dirty, 'nope')]), 1)
  } finally {
    console.error = log
    fs.rmSync(dirty, { recursive: true, force: true })
    fs.rmSync(clean, { recursive: true, force: true })
  }
})
