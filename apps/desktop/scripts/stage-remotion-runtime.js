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
  const pending = runtimeDependencyEntries(JSON.parse(fs.readFileSync(composerPackageJson, 'utf8')))
    .map((entry) => ({ ...entry, fromDirectory: path.dirname(composerPackageJson) }))
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
    records.push({ name: current.name, packageJson })
    for (const dependency of runtimeDependencyEntries(manifest)) {
      pending.push({ ...dependency, fromDirectory: path.dirname(packageJson) })
    }
  }

  return records
}

function stageRemotionRuntime(options = {}) {
  const composerDir = options.composerDir || path.resolve(__dirname, '..', '..', '..', 'packages', 'remotion-composer')
  const composerPackageJson = path.join(composerDir, 'package.json')
  const outputDir = options.outputDir || path.join(__dirname, '..', '.remotion-runtime', 'node_modules')
  const rawCopy = options.copy || fs.cpSync
  let prunedTestFiles = 0
  const testArtifactFilter = (srcPath) => {
    if (isTestArtifactPath(srcPath)) {
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
  const remove = options.remove || fs.rmSync
  const mkdir = options.mkdir || fs.mkdirSync

  if (!fs.existsSync(composerPackageJson)) {
    throw new Error('Remotion Composer package.json 不存在: ' + composerPackageJson)
  }

  remove(outputDir, { recursive: true, force: true })
  mkdir(outputDir, { recursive: true })

  const packages = collectRuntimePackages(composerPackageJson, options.resolvePackage)
  for (const record of packages) {
    const source = path.dirname(record.packageJson)
    const destination = path.join(outputDir, ...packagePathSegments(record.name))
    copy(source, destination, { recursive: true, dereference: true })
  }
  return { outputDir, packages: packages.map((record) => record.name), prunedTestFiles }
}

module.exports = {
  isTestArtifactPath,
  TEST_ARTIFACT_RE,
  collectRuntimePackages,
  packageDependencies,
  resolvePackageJson,
  runtimeDependencyEntries,
  stageRemotionRuntime,
}
