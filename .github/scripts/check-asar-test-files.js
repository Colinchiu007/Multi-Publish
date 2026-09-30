#!/usr/bin/env node
// 行注释而非块注释：本文件正文要逐字写出 glob 排除模式，而 glob 里的双星+斜杠序列会**提前终止**
// `/* ... */` 块注释 —— 实测这样写出来的文件 `node --check` 直接 SyntaxError: Unexpected token '*'，
// 且门禁从未运行却被登记成"已接线"。回归机制就是 require 期抛 SyntaxError ⇒ 整个测试文件红，
// 不存在"静默通过"的形态（因此不需要、也不该再写一个自己解析注释的"结构锁"去重复这件事）。
/**
 * check-asar-test-files.js — 「打包产物不得混入单元测试文件」门禁
 *
 * 存在理由（#2702，2026-09-30 本机真打包实测）：apps/desktop/package.json 的 build.files
 * 原来只有三条包含模式（dist、electron、node_modules 各自的整目录通配）加三条与本问题无关的排除，
 * **没有任何**测试文件排除；而本仓约定单测与被测代码同目录（{被测文件}.test.js）。
 * 于是 electron 那条整目录通配把 418 个主进程单测整批打进 app.asar，
 * 实测产物里共 **462** 个测试条目：
 *   electron 418 · node_modules 里的 workspace 包 shared-utils 21 · 其他第三方 node_modules 23
 * 代价不只是体积：测试里含内部接口形状、mock 的平台端点与错误码字符串，等于把内部契约地图
 * 随安装包发给用户侧（本仓有 credential-store / OIDC / 云账号同步等内部面）。
 * 另实测 3 个 .test.ts（含我们自己的 apps/desktop/electron/core/container.test.ts）同样在产物里，
 * 所以排除集按**族**收齐（js/mjs/cjs/ts/tsx），并由 checkNamingCensus() 反查"仓库里还有没有第六族"。
 * 明确**不在**本门禁范围内的是 2718 个第三方 .js.map（同一次实测发现，量级更大但属另一个产品决策：
 * 生产 source map 有助于排障，删不删需要单独定口径，不在"测试文件"这条判据里顺手夹带）。
 *
 * 两个正交维度，各配一种模式（各自都看不见对方的失败）：
 *   --config  静态读 build.files，断言五条**全域**排除仍在原位。CI 每次必跑，成本约 0。
 *   --asar    读真实 app.asar 清单，断言测试条目数为 0。挂在 build.yml 打包步骤之后，
 *             因为"声明写了但没生效"（electron-builder 对 node_modules 的收集另有依赖遍历路径）
 *             只有真产物能证明；反过来，只测产物则任何一次"打包被跳过"都会让门禁静默消失。
 *
 * 反向偏置（与 .github/scripts/check-ps1-bom.js 同口径）：
 *  - build.files 读不到 / 非数组 / 为空 ⇒ 抛错，不返回"通过"；
 *  - asar 文件不存在 ⇒ 抛错；清单为空 ⇒ 判 unverifiable（一次不完整的枚举报"全绿"比报不出来更危险）；
 *  - 排除若写窄成"只管 electron 目录"也算缺项 —— 实测 44/462 来自 node_modules，
 *    窄排除会给出"配了门禁"的假象却放走那 44 条。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

/**
 * 判据扩展名集合。**必须与 checkNamingCensus() 一起看**：那条锁会拿仓库真实文件清单反过来检查
 * 这个集合有没有漏族 —— 本仓 1036 个 .test. 命名文件里，落在打包域内的有 js / ts / mjs，
 * 光锁 js 三件套会放走 apps/desktop/electron/core/container.test.ts（实测确实进了产物）。
 */
const TEST_FILE_RE = /\.test\.(?:js|mjs|cjs|ts|tsx)$/

/** 会被 electron-builder 收集进 app.asar 的仓库域（workspace 包经 node_modules/@multi-publish 进入）。 */
const PACKAGED_DOMAIN = ['apps/desktop/', 'packages/']

/** 必须存在于 build.files 的排除模式：整棵树通配（不是只盯 electron 目录）。 */
const REQUIRED_TEST_EXCLUSIONS = ['.js', '.mjs', '.cjs', '.ts', '.tsx'].map((ext) => '!**/*.test' + ext)

/**
 * 按**目录**排除的测试面：`electron/tests/` 里存的按定义就是测试，但其中
 * `story2video-real-ffmpeg.node-test.cjs` 用的是 `{被测}.node-test.cjs` 命名，
 * 上面那族扩展名通配抓不到它（实测修复后它是该目录唯一残留条目）。
 * 该目录的唯一引用来自 apps/desktop/tests/gui-ci-exit-contract.test.js，且读的是**仓库路径**
 * 而非产物路径 ⇒ 从包里排除不影响任何运行时代码。
 */
const REQUIRED_TEST_DIR_EXCLUSIONS = ['!electron/tests/**']

/**
 * asar 的 listPackage 在 Windows 上返回**反斜杠**路径（实测 `\node_modules\@babel`）。
 * 不归一化则所有按 `/` 前缀做的分类判据会静默把全部条目归到"其他"，等于没分类。
 */
function normalizeAsarPath (p) {
  return String(p).split('\\').join('/')
}

function isTestArtifactPath (p) {
  return TEST_FILE_RE.test(normalizeAsarPath(p))
}

/** @returns {{total:number, tests:string[]}} tests 已归一化并按字典序排序（现场输出必须可复现） */
function countTestEntries (entries) {
  if (!Array.isArray(entries)) throw new TypeError('countTestEntries 需要数组，收到 ' + Object.prototype.toString.call(entries))
  const tests = entries.filter(isTestArtifactPath).map(normalizeAsarPath).sort()
  return { total: entries.length, tests }
}

/**
 * 把清单折成判定。**空清单不可证明**：listPackage 对一个存在但结构不符的 asar 可能返回空数组，
 * 此时报"0 个测试文件"就是假绿。
 */
function evaluateEntries (entries) {
  const { total, tests } = countTestEntries(entries)
  if (total === 0) return { ok: false, unverifiable: true, total: 0, tests: [] }
  return { ok: tests.length === 0, total, tests }
}

/** 读 apps/desktop/package.json 的 build.files（不 require 它，避免副作用）。 */
function readDesktopBuildFiles (repoRoot) {
  const pkgPath = path.join(repoRoot, 'apps', 'desktop', 'package.json')
  let raw
  try {
    raw = fs.readFileSync(pkgPath, 'utf8')
  } catch (e) {
    throw new Error('无法读取 ' + pkgPath + '（读不到即无法证明，拒绝判定为通过）：' + e.code)
  }
  let json
  try {
    json = JSON.parse(raw)
  } catch (e) {
    throw new Error(pkgPath + ' 不是合法 JSON：' + e.message)
  }
  const files = json && json.build && json.build.files
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error(pkgPath + ' 的 build.files 缺失或为空 ⇒ 必须是数组且非空才能判定，现值 '
      + Object.prototype.toString.call(files))
  }
  return files
}

/**
 * 命名完整性反查：扫 tracked 文件，凡 basename 含 `.test.` 且落在打包域内的，必须被 TEST_FILE_RE 覆盖。
 *
 * 为什么需要它：TEST_FILE_RE 是"我想到哪几族就锁哪几族"的白名单，新增一族命名（例如
 * `foo.test.vue`、`bar.test.tsx`）时，白名单不会自动变红，产物就会**静默**开始混入该族测试。
 * 这条把"白名单是否覆盖仓库真实命名分布"变成可执行判据，域外文件（如 `scripts/*.test.ps1`
 * 从不进产物）不参与判定，免得把门禁写成与打包无关的抱怨。
 * @param {string} repoRoot
 * @param {{listFiles?:(repoRoot:string)=>string[]}} [opts] 注入文件清单，供回归锁构造"第六族"场景
 * @returns {{scanned:number, missed:string[]}}
 */
function defaultListFiles (repoRoot) {
  const { execFileSync } = require('node:child_process')
  let raw
  try {
    raw = execFileSync('git', ['-C', repoRoot, 'ls-files', '-z'],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (e) {
    throw new Error('无法枚举 tracked 文件（git ls-files 失败 ⇒ 拒绝判定为通过）：' + e.message)
  }
  return raw.split('\0').filter(Boolean)
}

function checkNamingCensus (repoRoot, opts) {
  const listFiles = (opts && opts.listFiles) || defaultListFiles
  const files = listFiles(repoRoot)
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('文件清单为空 —— 遍历不完整，不许报"全绿"')
  }
  const inDomain = files.filter((f) => PACKAGED_DOMAIN.some((p) => f.startsWith(p)))
  const anyTest = inDomain.filter((f) => path.basename(f).includes('.test.'))
  if (anyTest.length === 0) {
    throw new Error('打包域内找不到任何 `.test.` 命名文件（' + inDomain.length + ' 个域内文件）—— '
      + '这与本仓约定"单测与被测代码同目录"矛盾，判为遍历/前提失效而非"没有测试所以干净"')
  }
  return { scanned: anyTest.length, missed: anyTest.filter((f) => !TEST_FILE_RE.test(f)).sort() }
}

/**
 * 接线锁：本门禁的两个维度必须各自挂在**会执行它**的 workflow 正文里。
 *
 * 为什么单独一条判据：`--config` 与 `--asar` 互相看不见对方的失败面，任何一侧被从 workflow 里
 * 摘掉，另一侧仍然全绿 —— 于是门禁退化成"看起来在守、实际恒绿"的装饰（AGENTS.md 同源教训）。
 * 按**可执行正文**匹配（注释里提一句不算接线，与 scripts/check-unwired-tests.js 同口径）。
 *
 * 残余风险（不假装已消除）：本条锁自身由 quality-gate.yml 那两行驱动，把**那两行一起删掉**时
 * 它不会变红 —— 任何自证接线锁都有这个死角，靠 review 与 `check-unwired-tests.js` 的棘轮兜。
 * @param {{qualityGate:string, build:string}} texts 已剥注释的 workflow 正文
 * @returns {{ok:boolean, missing:string[]}}
 */
function checkWiring (texts) {
  const missing = []
  const qg = String((texts && texts.qualityGate) || '')
  const bd = String((texts && texts.build) || '')
  if (!qg) throw new Error('quality-gate 正文为空 —— 解析退化，拒绝判定为已接线')
  if (!bd) throw new Error('build 正文为空 —— 解析退化，拒绝判定为已接线')
  if (!qg.includes('node --test .github/scripts/check-asar-test-files.test.js')) {
    missing.push('quality-gate.yml 缺少本门禁的夹具回归点名')
  }
  if (!/^[^\n]*node \.github\/scripts\/check-asar-test-files\.js[^\n]*$/m.test(qg)) {
    missing.push('quality-gate.yml 缺少 --config 维度（无 --asar 参数的那次调用）')
  }
  // 产物维度：必须带 --asar，且所在步骤的条件与打包步骤一致 ——
  // 条件不一致时会出现「打包被跳过、产物检查看着跑了其实读的是上一轮残留」或反向误红。
  const asarStep = /if: runner\.os == 'Windows' && steps\.changes\.outputs\.package-relevant == 'true'\s*\n\s*shell: bash\s*\n\s*run: node \.github\/scripts\/check-asar-test-files\.js --asar \S+/
  if (!asarStep.test(bd)) {
    missing.push('build.yml 缺少与打包步骤同条件的 --asar 维度步骤（if + shell: bash + run 三行必须成组）')
  }
  return { ok: missing.length === 0, missing }
}

function readWorkflowBodies (repoRoot) {
  const read = (rel) => {
    const p = path.join(repoRoot, '.github', 'workflows', rel)
    if (!fs.existsSync(p)) throw new Error('workflow 文件不存在：' + p + '（读不到即无法证明接线，拒绝通过）')
    return fs.readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .map((line) => {
        const idx = line.search(/(^|\s)#/)
        return idx < 0 ? line : line.slice(0, idx)
      })
      .join('\n')
  }
  return { qualityGate: read('quality-gate.yml'), build: read('build.yml') }
}

/** @returns {{ok:boolean, missing:string[], files:string[]}} */
function checkConfig (files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('checkConfig 需要非空的 build.files 数组，收到 ' + Object.prototype.toString.call(files)
      + '（无法证明即拒绝通过）')
  }
  const required = REQUIRED_TEST_EXCLUSIONS.concat(REQUIRED_TEST_DIR_EXCLUSIONS)
  const missing = required.filter((p) => !files.includes(p))
  return { ok: missing.length === 0, missing, files }
}

/**
 * 读真实 asar 并判定。@electron/asar 只在 --asar 模式下 require，
 * 这样 config 模式对依赖安装状态的敏感度为 0。
 */
function checkAsar (asarPath) {
  if (!fs.existsSync(asarPath)) {
    throw new Error('asar 文件不存在：' + asarPath + '（"读不到产物"不等于"产物干净"，一律 fail closed）')
  }
  let listPackage
  try {
    listPackage = require('@electron/asar').listPackage
  } catch (e) {
    throw new Error('无法加载 @electron/asar（无法枚举 ⇒ 拒绝判定为通过）：' + e.message)
  }
  let entries
  try {
    entries = listPackage(asarPath)
  } catch (e) {
    throw new Error('listPackage 读取失败：' + asarPath + ' — ' + e.message)
  }
  return Object.assign({ asarPath }, evaluateEntries(entries))
}

function main (argv) {
  const arg = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const repoRoot = arg('--repo') || path.resolve(__dirname, '..', '..')
  const asarPath = arg('--asar')

  if (asarPath) {
    let r
    try {
      r = checkAsar(asarPath)
    } catch (e) {
      console.error('[asar-test-files] FAIL（asar 维度）：' + e.message)
      return 1
    }
    if (r.unverifiable) {
      console.error('[asar-test-files] FAIL（asar 维度）：清单为空，无法证明产物干净 — ' + r.asarPath)
      return 1
    }
    if (!r.ok) {
      console.error('[asar-test-files] FAIL（asar 维度）：' + r.tests.length + '/' + r.total
        + ' 个条目是单元测试文件')
      for (const t of r.tests.slice(0, 20)) console.error('    ' + t)
      if (r.tests.length > 20) console.error('    …另有 ' + (r.tests.length - 20) + ' 条')
      console.error('  修法：在 apps/desktop/package.json 的 build.files 追加 '
        + REQUIRED_TEST_EXCLUSIONS.concat(REQUIRED_TEST_DIR_EXCLUSIONS).join(' , '))
      return 1
    }
    console.log('[asar-test-files] OK（asar 维度）：' + r.total + ' 个条目中 0 个单元测试文件 — ' + path.normalize(r.asarPath))
    return 0
  }

  let files
  try {
    files = readDesktopBuildFiles(repoRoot)
  } catch (e) {
    console.error('[asar-test-files] FAIL（config 维度）：' + e.message)
    return 1
  }
  const r = checkConfig(files)
  if (!r.ok) {
    console.error('[asar-test-files] FAIL（config 维度）：apps/desktop/package.json 的 build.files 缺少测试文件排除')
    for (const m of r.missing) console.error('    缺 ' + m)
    console.error('  实测代价：本仓约定单测与被测代码同目录，缺排除时 app.asar 内含 462 个 *.test.{js,mjs,cjs}')
    console.error('    （electron/ 418 + node_modules/@multi-publish 21 + 其他第三方 23），')
    console.error('    把内部接口形状、平台端点与错误码字符串随安装包发给用户侧。')
    console.error('  注意：写窄成 "!electron/**/*.test.js" 不算满足 —— node_modules 那 44 条会漏出。')
    return 1
  }
  // 命名完整性反查：白名单可能漏族，这条负责在漏族当天变红
  const census = checkNamingCensus(repoRoot)
  if (census.missed.length > 0) {
    console.error('[asar-test-files] FAIL（命名维度）：打包域内有 ' + census.missed.length + '/'
      + census.scanned + ' 个 `.test.` 文件的扩展名不被 TEST_FILE_RE 覆盖，正在静默进产物：')
    for (const m of census.missed.slice(0, 20)) console.error('    ' + m)
    console.error('  修法：把该扩展名**同时**加进 TEST_FILE_RE 与 REQUIRED_TEST_EXCLUSIONS（两处一起改，缺一不可）。')
    return 1
  }
  // 接线维度：两个维度必须都挂在会执行它们的 workflow 正文里
  let wiring
  try {
    wiring = checkWiring(readWorkflowBodies(repoRoot))
  } catch (e) {
    console.error('[asar-test-files] FAIL（接线维度）：' + e.message)
    return 1
  }
  if (!wiring.ok) {
    console.error('[asar-test-files] FAIL（接线维度）：门禁已从 workflow 正文中缺失，剩下的维度不构成保护：')
    for (const m of wiring.missing) console.error('    缺 ' + m)
    return 1
  }
  console.log('[asar-test-files] OK（config 维度）：build.files 含全部 '
    + (REQUIRED_TEST_EXCLUSIONS.length + REQUIRED_TEST_DIR_EXCLUSIONS.length)
    + ' 条测试排除（' + REQUIRED_TEST_EXCLUSIONS.length + ' 条全域扩展名 + '
    + REQUIRED_TEST_DIR_EXCLUSIONS.length + ' 条测试目录；files 共 ' + files.length
    + ' 项）；命名反查 ' + census.scanned + ' 个打包域 `.test.` 文件全部被判据覆盖'
    + '；接线维度已核对（quality-gate.yml 的夹具+config 两行，build.yml 的同条件 --asar 步骤）')
  return 0
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = {
  TEST_FILE_RE,
  REQUIRED_TEST_EXCLUSIONS,
  REQUIRED_TEST_DIR_EXCLUSIONS,
  PACKAGED_DOMAIN,
  normalizeAsarPath,
  isTestArtifactPath,
  countTestEntries,
  evaluateEntries,
  readDesktopBuildFiles,
  checkConfig,
  checkWiring,
  readWorkflowBodies,
  checkNamingCensus,
  checkAsar,
  main,
}
