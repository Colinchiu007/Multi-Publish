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
// 判据只有一份实现（#2765）：本门禁与 apps/desktop/scripts/stage-remotion-runtime.js 必须拿到同一个
// 函数，否则漂移的表现就是「门禁说干净、产物里还有」。#2702 那轮修的是 app.asar，这一轮修的是它
// 看不见的松散文件树（extraResources）—— 两个域共用一条判据才不会各说一套。
const { TEST_FILE_RE, normalizePathSeparators, isTestArtifactPath, TEST_EXCLUSION_PATTERNS } =
  // 本仓 workspace 链接在 apps/desktop/node_modules 下，仓库根没有 @multi-publish/*（实测 require.resolve
  // 从 .github/scripts 走会 MODULE_NOT_FOUND），故这里按**检出根相对路径**取，不依赖链接布局。
  require(path.join(path.resolve(__dirname, '..', '..'), 'packages', 'shared-utils', 'src', 'artifact-test-pattern.js'))

/** 会被 electron-builder 收集进 app.asar 的仓库域（workspace 包经 node_modules/@multi-publish 进入）。 */
const PACKAGED_DOMAIN = ['apps/desktop/', 'packages/']

/** 必须存在于 build.files 的排除模式：整棵树通配（不是只盯 electron 目录）。 */
const REQUIRED_TEST_EXCLUSIONS = TEST_EXCLUSION_PATTERNS

/**
 * 按**目录**排除的测试面：`electron/tests/` 里存的按定义就是测试，但其中
 * `story2video-real-ffmpeg.node-test.cjs` 用的是 `{被测}.node-test.cjs` 命名，
 * 上面那族扩展名通配抓不到它（实测修复后它是该目录唯一残留条目）。
 * 该目录的唯一引用来自 apps/desktop/tests/gui-ci-exit-contract.test.js，且读的是**仓库路径**
 * 而非产物路径 ⇒ 从包里排除不影响任何运行时代码。
 */
const REQUIRED_TEST_DIR_EXCLUSIONS = ['!electron/tests/**']

/** 打包步骤的 if 条件原文 —— 产物侧检查必须与它逐字相同，否则两条件会各自漂移。 */
const PACKAGING_STEP_CONDITION = "runner.os == 'Windows' && steps.changes.outputs.package-relevant == 'true'"

/** app.asar 之外的两条产物检查通道，必须各自在 build.yml 里有一步。 */
const ARTIFACT_FLAGS = ['--asar', '--resources']

/** 读整个 build 段：files 与 extraResources 是两条独立拷贝通道，只锁一条等于没锁。 */
function readDesktopBuild (repoRoot) {
  const pkgPath = path.join(repoRoot, 'apps', 'desktop', 'package.json')
  let json
  try {
    json = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  } catch (e) {
    throw new Error('无法读取/解析 ' + pkgPath + '：' + e.message)
  }
  if (!json || !json.build) throw new Error(pkgPath + ' 没有 build 段 ⇒ 无法判定，拒绝通过')
  return json.build
}

/**
 * asar 的 listPackage 在 Windows 上返回**反斜杠**路径（实测 `\node_modules\@babel`）。
 * 不归一化则所有按 `/` 前缀做的分类判据会静默把全部条目归到"其他"，等于没分类。
 */
const normalizeAsarPath = normalizePathSeparators

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
 * 接线锁：本门禁的三个维度必须各自挂在**会执行它**的 workflow 正文里。
 *
 * 为什么单独一条判据：`--config`（静态读声明）、`--asar`（包内条目）与 `--resources`（asar 之外的
 * 松散树）两两互看不见对方的失败面，任何一侧被从 workflow 里摘掉，另两侧仍然全绿 ——
 * 于是门禁退化成"看起来在守、实际恒绿"的装饰（AGENTS.md 同源教训）。
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
  // 产物维度：--asar（包内条目）与 --resources（asar 之外的松散树）各一次，且所在步骤的条件
  // 必须与打包步骤一致 —— 条件不一致时会出现「打包被跳过、产物检查看着跑了其实读的是上一轮残留」或反向误红。
  for (const flag of ARTIFACT_FLAGS) {
    const why = packagingStepWhy(bd, flag)
    if (why) missing.push(why)
  }
  return { ok: missing.length === 0, missing }
}

/**
 * 定位「跑了 `check-asar-test-files.js <flag>` 的那一步」并核对它的 if/shell。
 *
 * 按 YAML 列表项切块而不是数相邻三行：一个 run 块里可以有两条命令（#2765 后 --asar 与 --resources
 * 同步骤），数行数的判据会在改成 `run: |` 时静默失效 —— 而失效方向是"永远匹配不上"，
 * 看起来像门禁在守、实际只剩一条恒定 missing。注释行在切块时直接丢弃，所以
 * 「把调用注释掉、字面留在文件里」这一类假接线在本层就被挡住，不依赖上游剥注释。
 * @returns {string} 空串表示合格，否则是给 CI 看的缺项文案
 */
function packagingStepWhy (buildText, flag) {
  const label = 'build.yml 的 ' + flag + ' 维度步骤'
  const needle = 'check-asar-test-files.js ' + flag
  const blocks = []
  let cur = null
  for (const line of String(buildText).split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue
    if (/^\s*-\s+\S/.test(line)) { cur = []; blocks.push(cur) }
    if (cur) cur.push(line)
  }
  const hits = blocks.filter((b) => b.some((l) => l.includes(needle)))
  if (hits.length === 0) return label + '不存在（注释里的调用不算接线）'
  if (hits.length > 1) return label + '出现在 ' + hits.length + ' 个步骤里（判据重复即口径分裂，只允许 1 处）'
  const ifLines = hits[0].filter((l) => /^\s*if:\s+/.test(l))
  if (ifLines.length !== 1) return label + '必须有且只有一行 if:（实测 ' + ifLines.length + ' 行）'
  if (ifLines[0].replace(/^\s*if:\s+/, '').trim() !== PACKAGING_STEP_CONDITION) {
    return label + '的 if 条件必须与打包步骤同条件：' + PACKAGING_STEP_CONDITION
  }
  if (!hits[0].some((l) => /^\s*shell:\s+bash\s*$/.test(l))) {
    return label + '必须声明 shell: bash（同一 run 块多条命令在 pwsh 下不 fail-fast）'
  }
  return ''
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

/**
 * extraResources 声明锁（#2765）：`extraResources` 是 app.asar **之外**的第二条拷贝通道。
 * 判据只挑"从仓库树里拷"的条目（`from` 以 `../` 开头）—— 这类条目会把源目录里的测试文件一起带进产物；
 * 而 `dist/fonts`、`.playwright-browsers`、`.remotion-runtime/node_modules` 这类**产物内暂存目录**
 * 不由仓库决定内容，其 cleanliness 交给 --resources 实证（.remotion-runtime 的剪枝在
 * stage-remotion-runtime.js，那条链共用同一判据）。
 * 刻意不维护"哪些条目需要 filter"的手工清单：手工清单正是本仓反复踩的"只可缩小却没人缩"的形态。
 */
function checkExtraResourcesConfig (build) {
  if (!build || !Array.isArray(build.extraResources) || build.extraResources.length === 0) {
    throw new Error('build.extraResources 缺失或为空 ⇒ 无法证明松散拷贝通道干净，拒绝判定为通过')
  }
  const offenders = []
  const covered = []
  for (const entry of build.extraResources) {
    const from = entry && typeof entry.from === 'string' ? entry.from : ''
    if (!from.startsWith('../')) continue
    const filter = Array.isArray(entry.filter) ? entry.filter : []
    const missing = REQUIRED_TEST_EXCLUSIONS.filter((p) => !filter.includes(p))
    if (missing.length === 0) covered.push(from)
    else offenders.push({ from, missing })
  }
  return { ok: offenders.length === 0, offenders, covered, scanned: build.extraResources.length }
}

/** 递归列出目录下的文件（返回相对路径，统一正斜杠）。 */
function walkLooseFiles (rootDir, opts = {}) {
  // readdir 可注入：符号链接这一支在 Windows 上"能不能真的建链接"取决于权限（非管理员通常 EPERM），
  // 把该形状做成确定性夹具比"建不了就 skip"更可靠 —— 后者会让这条判据在多数机器上永久静默不跑。
  const readdir = opts.readdir || ((abs) => fs.readdirSync(abs, { withFileTypes: true }))
  const out = []
  const stack = ['']
  while (stack.length > 0) {
    const rel = stack.pop()
    const abs = path.join(rootDir, rel)
    let entries
    try {
      entries = readdir(abs)
    } catch (e) {
      throw new Error('无法枚举 ' + abs + '（读不到即无法证明，拒绝判定为通过）：' + e.code)
    }
    for (const ent of entries) {
      const childRel = rel ? rel + '/' + ent.name : ent.name
      // 符号链接**按名字计入清单但绝不跟随**：跟随会把树外的内容算成产物，
      // 而整条跳过会留下假绿 —— 一个名叫 x.test.js 的链接同样是"发出去的测试文件"。
      // （该形状由 QM-6 外部评审提出，实测产物里 0 个链接，但判据不该依赖运气。）
      if (ent.isSymbolicLink()) { out.push(childRel.split(String.fromCharCode(92)).join('/')); continue }
      if (ent.isDirectory()) stack.push(childRel)
      else if (ent.isFile()) out.push(childRel.split(String.fromCharCode(92)).join('/'))
    }
  }
  return out.sort()
}

/**
 * 松散文件树实证：扫 `<resources>` 目录本身（app.asar 是一个文件，不展开其内部 —— 那由 --asar 负责）。
 * 空目录判 unverifiable：一次不完整/错路径的枚举报"0 个测试文件"就是假绿。
 */
function checkLooseResources (resourcesDir) {
  if (!fs.existsSync(resourcesDir)) throw new Error('目录不存在：' + resourcesDir + '（"读不到产物"不等于"产物干净"）')
  let st
  try { st = fs.statSync(resourcesDir) } catch (e) { throw new Error('无法 stat ' + resourcesDir + '：' + e.code) }
  if (!st.isDirectory()) throw new Error('不是目录：' + resourcesDir)
  const files = walkLooseFiles(resourcesDir)
  const verdict = evaluateEntries(files)
  return Object.assign({ resourcesDir }, verdict)
}

function main (argv) {
  const arg = (name) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const repoRoot = arg('--repo') || path.resolve(__dirname, '..', '..')
  const asarPath = arg('--asar')
  const resourcesDir = arg('--resources')

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

  if (resourcesDir) {
    let lr
    try {
      lr = checkLooseResources(path.resolve(resourcesDir))
    } catch (e) {
      console.error('[asar-test-files] FAIL（松散树维度）：' + e.message)
      return 1
    }
    if (lr.unverifiable) {
      console.error('[asar-test-files] FAIL（松散树维度）：清单为空，无法证明产物干净 — ' + lr.resourcesDir)
      return 1
    }
    if (!lr.ok) {
      console.error('[asar-test-files] FAIL（松散树维度）：' + lr.tests.length + '/' + lr.total + ' 个松散文件是单元测试文件')
      for (const t of lr.tests.slice(0, 20)) console.error('    ' + t)
      if (lr.tests.length > 20) console.error('    …另有 ' + (lr.tests.length - 20) + ' 条')
      console.error('  修法：剪枝点在 apps/desktop/scripts/stage-remotion-runtime.js（暂存时按同一判据跳过）')
      console.error('        与 apps/desktop/package.json 的 build.extraResources[].filter（从仓库树拷的条目）。')
      return 1
    }
    console.log('[asar-test-files] OK（松散树维度）：' + lr.total + ' 个松散文件中 0 个单元测试文件 — ' + path.normalize(lr.resourcesDir))
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
  // extraResources 声明锁：app.asar 之外还有这条通道（#2765 实测其松散树带 189 个测试文件）
  let er
  try {
    er = checkExtraResourcesConfig(readDesktopBuild(repoRoot))
  } catch (e) {
    console.error('[asar-test-files] FAIL（extraResources 维度）：' + e.message)
    return 1
  }
  if (!er.ok) {
    console.error('[asar-test-files] FAIL（extraResources 维度）：从仓库树拷贝的条目缺测试文件 filter：')
    for (const o of er.offenders) console.error('    ' + o.from + '  缺 ' + o.missing.join(' , '))
    console.error('  为何按 `from` 是否以 ../ 开头归类：这类条目内容直接来自仓库树，会连带测试文件；')
    console.error('  而 dist/fonts、.playwright-browsers、.remotion-runtime/node_modules 等暂存目录由 beforePack')
    console.error('  链生成，其 cleanliness 交给 --resources 实证（暂存端 stage-remotion-runtime 共用同一判据剪枝）。')
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
    + '；extraResources 维度已核对（' + er.scanned + ' 条目中 ' + er.covered.length + ' 条按 from 归类需带 filter，均已覆盖）'
    + '；接线维度已核对（quality-gate.yml 的夹具+config 两行，build.yml 的同条件 '
    + ARTIFACT_FLAGS.join(' + ') + ' 两个产物维度步骤）')
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
  packagingStepWhy,
  PACKAGING_STEP_CONDITION,
  ARTIFACT_FLAGS,
  readWorkflowBodies,
  checkNamingCensus,
  checkAsar,
  readDesktopBuild,
  checkExtraResourcesConfig,
  walkLooseFiles,
  checkLooseResources,
  main,
}
