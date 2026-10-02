'use strict'

const fs = require('fs')
const path = require('path')
// 「什么算测试文件」的判据只有一份实现（#2765）：门禁侧与本侧必须同一函数，
// 否则漂移的表现就是「门禁说干净、产物里还有」。
const { isTestArtifactPath, TEST_FILE_RE: TEST_ARTIFACT_RE } =
  require('@multi-publish/shared-utils/src/artifact-test-pattern')

function packagePathSegments(name) {
  return name.startsWith('@') ? name.split('/') : [name]
}

/** target 是否位于 dir 之内（不含等于自身）；用 path.relative 而不是字符串前缀，避免 `pkg` 与 `pkg-evil` 误判。 */
function isInsideDirectory(dir, target) {
  const rel = path.relative(dir, target)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** 记录在暂存树里的落点：一个 name 只能有一个，两个源抢它就是本次事故的形状。 */
function destinationOf(outputDir, name) {
  return path.join(outputDir, ...packagePathSegments(name))
}

function runtimeDependencyEntries(manifest) {
  const entries = new Map()
  for (const name of Object.keys(manifest.dependencies || {})) entries.set(name, { name, optional: false })
  for (const name of Object.keys(manifest.peerDependencies || {})) {
    entries.set(name, { name, optional: manifest.peerDependenciesMeta?.[name]?.optional === true })
  }
  for (const name of Object.keys(manifest.optionalDependencies || {})) entries.set(name, { name, optional: true })
  return [...entries.values()]
}

function packageDependencies(manifest) {
  return runtimeDependencyEntries(manifest).map((entry) => entry.name)
}

function resolvePackageJson(name, fromDirectory) {
  try {
    return require.resolve(name + '/package.json', { paths: [fromDirectory] })
  } catch (originalError) {
    let directory = fromDirectory
    const segments = packagePathSegments(name)
    while (directory !== path.dirname(directory)) {
      const candidate = path.join(directory, 'node_modules', ...segments, 'package.json')
      if (fs.existsSync(candidate)) return candidate
      directory = path.dirname(directory)
    }
    throw originalError
  }
}

function collectRuntimePackages(composerPackageJson, resolvePackage = resolvePackageJson) {
  const records = []
  const composerDir = path.dirname(composerPackageJson)
  const pending = runtimeDependencyEntries(JSON.parse(fs.readFileSync(composerPackageJson, 'utf8')))
    .map((entry) => ({ ...entry, fromDirectory: composerDir }))
  const seen = new Set()

  while (pending.length > 0) {
    const current = pending.pop()
    let packageJson
    try {
      packageJson = resolvePackage(current.name, current.fromDirectory)
    } catch (error) {
      if (current.optional && error?.code === 'MODULE_NOT_FOUND') continue
      throw error
    }
    if (seen.has(packageJson)) continue
    seen.add(packageJson)

    const manifest = JSON.parse(fs.readFileSync(packageJson, 'utf8'))
    const ownDir = path.dirname(packageJson)
    records.push({ name: current.name, packageJson, directory: ownDir })
    for (const dependency of runtimeDependencyEntries(manifest)) {
      pending.push({ ...dependency, fromDirectory: ownDir })
    }
  }

  // 解析结果落在"另一个会被整目录拷贝的包"里面 ⇒ 它已随那个包一起进产物，不得再单独占一个顶层落点。
  // 判据取"是否在任一被拷贝包目录内"而不是"是否是父包的直接嵌套"：实测本仓闭包里
  // `estraverse` 会既作为 `node_modules/webpack/node_modules/estraverse`（某父包的**再嵌套**解析结果）
  // 又作为 hoisted 的 `node_modules/estraverse` 被记到 —— 只比父包目录会漏，
  // 漏下来的表现就是两个不同版本抢同一个顶层目录、文件级互相覆盖（#2778）。
  // 这里两阶段过滤（先收全再筛），是为了不依赖遍历顺序；被筛掉的包其依赖**已在上一轮照常展开过**，
  // 所以"跳过记录"不会连带"跳过展开"（那会让产物少包 ⇒ 运行期 MODULE_NOT_FOUND，比错版本更难查）。
  return records.filter((record) =>
    !records.some((other) => other !== record && isInsideDirectory(other.directory, record.packageJson)))
}

/**
 * 在**暂存树内部**解析一条依赖边（不得逃出 outputDir 借宿主仓库的 node_modules）。
 * 这是"跳过被携带的记录"这条优化的反向保险：筛错了一个包的症状是运行期 MODULE_NOT_FOUND，
 * 比它要修的错版本缺陷更难查，所以必须在打包时逐边证"还在"。
 */
function resolvesInsideStagedTree (name, fromDirectory, outputDir, exists) {
  const segments = packagePathSegments(name)
  const boundary = path.resolve(outputDir)
  let dir = path.resolve(fromDirectory)
  for (let guard = 0; guard < 64; guard += 1) {
    if (!isInsideDirectory(boundary, dir) && dir !== boundary) return false
    if (exists(path.join(dir, 'node_modules', ...segments, 'package.json'))) return true
    if (dir === boundary) return exists(path.join(boundary, ...segments, 'package.json'))
    dir = path.dirname(dir)
  }
  return false
}

/**
 * 暂存结果的自证（#2778）：摊平器真正的失效方式是"两个源写同一个目录"，
 * 而它**只在加载时炸**，所以必须在打包时就出声，而不是留给用户去点一次视频合成。
 *
 * 三条判据都不猜版本语义，只比源与落点，外加逐边可解析：
 *   ① 落点的 `package.json` 与被记录的那份源逐字节相同 —— 被别的版本覆盖即红；
 *   ② 落点里 `node_modules/` 的直接子项集合必须等于源里的 —— 多出/少了源里没有的 nested 包都红
 *      （本次事故的确切形状就是 `react-dom/node_modules/react@19` 凭空出现在 18 的目录下）；
 *   ③ 每个被拷贝包的每条运行时依赖边，都必须能在暂存树内解析到（含 optional 之外的边）。
 * @returns {{checked:number, edges:number}}
 */
function verifyStagedClosure (outputDir, records, opts = {}) {
  const read = opts.readFileSync || ((p) => fs.readFileSync(p))
  const listNested = opts.readdir || ((dir) => readNestedNames(dir, opts.readdirSync || fs.readdirSync, exists))
  const exists = opts.existsSync || fs.existsSync
  let edges = 0

  for (const record of records) {
    const source = path.dirname(record.packageJson)
    const destination = destinationOf(outputDir, record.name)
    if (!exists(destination)) {
      throw new Error('暂存结果缺少包目录（闭包不完整）：' + destination)
    }
    const destManifest = path.join(destination, 'package.json')
    if (!exists(destManifest)) {
      throw new Error('暂存结果里 ' + record.name + ' 没有 package.json（无法证明它是被记录的那份源）')
    }
    if (!Buffer.from(read(destManifest)).equals(Buffer.from(read(record.packageJson)))) {
      throw new Error('暂存结果被覆盖：' + destination + '/package.json 与源 ' + record.packageJson
        + ' 不是同一份（同名不同版本抢同一个目标目录，即 #2778 的摊平缺陷）')
    }
    const sourceNested = listNested(path.join(source, 'node_modules'))
    const destNested = listNested(path.join(destination, 'node_modules'))
    const extra = destNested.filter((n) => !sourceNested.includes(n))
    if (extra.length > 0) {
      throw new Error('暂存结果多出源里没有的 nested 依赖：' + record.name + ' → ' + extra.join(', ')
        + '（嵌套副本会优先命中，等于把错版本喂给运行期）')
    }
    const missing = sourceNested.filter((n) => !destNested.includes(n))
    if (missing.length > 0) {
      throw new Error('暂存结果少了源里有的 nested 依赖：' + record.name + ' → ' + missing.join(', '))
    }
    // ③ 逐边可解析：筛"被携带的记录"这条优化如果筛错，症状是运行期 MODULE_NOT_FOUND。
    //    只认**非 optional** 的边（optional 缺失本就被允许），且解析域严格限制在暂存树内 ——
    //    逃出 outputDir 去命中宿主仓库的 node_modules 会把它伪装成"打包也好的"。
    const manifest = JSON.parse(read(path.join(destination, 'package.json')).toString('utf8'))
    for (const entry of runtimeDependencyEntries(manifest)) {
      if (entry.optional) continue
      edges += 1
      if (!resolvesInsideStagedTree(entry.name, destination, outputDir, exists)) {
        throw new Error('暂存树里解析不到依赖：' + record.name + ' → ' + entry.name
          + '（被筛掉的记录若是某个顶层包唯一的解析目标，产物就会少包；这条边就是那条优化的反向保险）')
      }
    }
  }
  return { checked: records.length, edges }
}

/** scoped 包要展开一层（`@scope/name` 算一个条目），否则比对结果会全是 `@scope`。 */
function readNestedNames (nodeModulesDir, readdirSync, exists) {
  // exists 必须跟着注入走（QM-6 附带发现）：否则 ② 无法在纯内存夹具里驱动，
  // 判据② 这一层就只剩"真文件系统"一种测法，而它恰恰是打包期最需要能被测的一条。
  if (!(exists || fs.existsSync)(nodeModulesDir)) return []
  const out = []
  for (const ent of readdirSync(nodeModulesDir, { withFileTypes: true })) {
    if (ent.name.startsWith('@') && ent.isDirectory()) {
      for (const sub of readdirSync(path.join(nodeModulesDir, ent.name), { withFileTypes: true })) {
        out.push(ent.name + '/' + sub.name)
      }
    } else {
      out.push(ent.name)
    }
  }
  return out.sort()
}

function stageRemotionRuntime(options = {}) {
  const composerDir = options.composerDir || path.resolve(__dirname, '..', '..', '..', 'packages', 'remotion-composer')
  const composerPackageJson = path.join(composerDir, 'package.json')
  const outputDir = options.outputDir || path.join(__dirname, '..', '.remotion-runtime', 'node_modules')
  const rawCopy = options.copy || fs.cpSync
  let prunedTestFiles = 0
  const testArtifactFilter = (srcPath) => {
    if (isTestArtifactPath(srcPath)) {
      // 只许剪**文件**。cpSync 的 filter 对目录同样调用，而剪掉一个目录等于连带删掉它整棵子树 ——
      // `verifyStagedClosure` 的判据② 只比 `node_modules` 的**直接子项**，深度 ≥2 的丢失对自证不可见
      //（QM-6 外部评审 Q1）。真实包名不会长得像测试文件，所以这里出声而不是静默剪掉一坨运行期要用的东西。
      let isDirectory = false
      try { isDirectory = fs.statSync(srcPath).isDirectory() } catch { isDirectory = false }
      if (isDirectory) {
        throw new Error('剪枝判据命中了一个目录，拒绝整棵子树静默消失：' + srcPath
          + '（子树里的依赖不会进落点，而自证只看到父层目录名仍在）')
      }
      prunedTestFiles += 1
      return false
    }
    return true
  }
  // 注入点保持原契约：调用方传进来的 copy 一样会收到 filter，否则回归锁测的是"包装层"而不是真行为。
  // （QM-6 外部评审建议"若调用方自带 filter 应叠加而非顶掉"——已核实该分支不可达：
  // 本文件唯一一处 copy 调用（下面收集循环里）传的是 { recursive, dereference }，从不带 filter。
  // 因此这里不写组合逻辑，避免留一条无调用方、无测试覆盖的分支。）
  const copy = (source, destination, opts) => rawCopy(source, destination,
    Object.assign({}, opts, { filter: testArtifactFilter }))
  // 注入 copy 的单测里没有真的落盘，自证那道（verifyStagedClosure）就要显式关掉 ——
  // 不给"默默跳过校验"留口子：只有调用方明确声明 verify:false 才跳。
  const verify = options.verify !== false
  const remove = options.remove || fs.rmSync
  const mkdir = options.mkdir || fs.mkdirSync

  if (!fs.existsSync(composerPackageJson)) {
    throw new Error('Remotion Composer package.json 不存在: ' + composerPackageJson)
  }

  remove(outputDir, { recursive: true, force: true })
  mkdir(outputDir, { recursive: true })

  const packages = collectRuntimePackages(composerPackageJson, options.resolvePackage)
  // 先证"一个落点只有一个源"再动手拷 —— 反过来（先拷再查）会留下已经互相覆盖的残树，
  // 而 beforePack 抛错时electron-builder 已经写了一半产物。
  const claimed = new Map()
  for (const record of packages) {
    const destination = destinationOf(outputDir, record.name)
    const previous = claimed.get(destination)
    if (previous && previous !== record.packageJson) {
      throw new Error('两个不同源要写同一目标目录，拒绝摊平覆盖：' + destination
        + ' ← ' + previous + ' | ' + record.packageJson)
    }
    claimed.set(destination, record.packageJson)
  }
  for (const record of packages) {
    const source = path.dirname(record.packageJson)
    const destination = destinationOf(outputDir, record.name)
    copy(source, destination, { recursive: true, dereference: true })
  }
  // 自证：拷贝结果必须与"被记录的那份源"逐目录一致（被覆盖 / 多出 nested 包都当场红）
  const verified = verify ? verifyStagedClosure(outputDir, packages) : { checked: 0 }
  return {
    outputDir,
    packages: packages.map((record) => record.name),
    records: packages,
    prunedTestFiles,
    verified: verified.checked,
    verifiedEdges: verified.edges,
  }
}

module.exports = {
  isTestArtifactPath,
  TEST_ARTIFACT_RE,
  collectRuntimePackages,
  destinationOf,
  isInsideDirectory,
  packageDependencies,
  resolvePackageJson,
  resolvesInsideStagedTree,
  runtimeDependencyEntries,
  stageRemotionRuntime,
  verifyStagedClosure,
}
