// @ts-check
/**
 * stage-remotion-runtime.test.js — 运行时依赖暂存的回归锁（node --test）
 *
 * 存在的理由（#2765）：electron-builder 的 extraResources 第二条把
 * `.remotion-runtime/node_modules` **整坨**拷进 `resources/packages/remotion-composer/node_modules`，
 * 而这份松散文件树在 app.asar 之外，`check-asar-test-files.js --asar` 看不见它 ——
 * 实测产物里因此仍带 **189** 个 `*.test.*`（186 个来自这里）。
 * 本文件锁住"暂存阶段就不拷测试文件"这一收口点（beforePack 必然执行，比给 extraResources 加 glob 更早、更单一）。
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  isTestArtifactPath,
  collectRuntimePackages,
  stageRemotionRuntime,
  TEST_ARTIFACT_RE,
} = require('./stage-remotion-runtime')

test('isTestArtifactPath：判定表（与打包域同一族扩展名，且只认 basename 结尾）', () => {
  assert.equal(isTestArtifactPath('a.test.js'), true)
  assert.equal(isTestArtifactPath('a.test.mjs'), true)
  assert.equal(isTestArtifactPath('a.test.cjs'), true)
  assert.equal(isTestArtifactPath('a.test.ts'), true)
  assert.equal(isTestArtifactPath('a.test.tsx'), true)
  assert.equal(isTestArtifactPath('/x/y/subtitle-aligner-parity.test.ts'), true)
  assert.equal(isTestArtifactPath('a.js'), false)
  assert.equal(isTestArtifactPath('a.tests.js'), false)
  assert.equal(isTestArtifactPath('a.test.jsx'), false, '未登记进白名单的扩展名不算（由命名反查负责变红）')
  assert.equal(isTestArtifactPath('a.test.js.map'), false, 'source map 不是测试文件')
  assert.equal(isTestArtifactPath('test.js'), false)
})

test('TEST_ARTIFACT_RE 的字面量必须与门禁共享同一实现（防两处各写一份口径）', () => {
  const shared = require('@multi-publish/shared-utils/src/artifact-test-pattern')
  assert.equal(TEST_ARTIFACT_RE.source, shared.TEST_FILE_RE.source)
  assert.equal(isTestArtifactPath, shared.isTestArtifactPath, '必须是同一个函数，不是复制品')
})

test('stageRemotionRuntime：测试文件不进暂存树，运行期真正需要的文件必须仍在', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-stage-'))
  try {
    // 造一个最小"包"：src 与 tests 同级，tests 里既有测试也有非测试文件（后者必须保留）
    const pkgDir = path.join(root, 'node_modules', 'demo-pkg')
    fs.mkdirSync(path.join(pkgDir, 'lib'), { recursive: true })
    fs.mkdirSync(path.join(pkgDir, 'tests'), { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'demo-pkg', version: '1.0.0' }))
    fs.writeFileSync(path.join(pkgDir, 'index.js'), 'module.exports = 1\n')
    fs.writeFileSync(path.join(pkgDir, 'lib', 'runtime.js'), '// 运行期需要\n')
    fs.writeFileSync(path.join(pkgDir, 'tests', 'a.test.ts'), '// 测试\n')
    fs.writeFileSync(path.join(pkgDir, 'tests', 'b.test.js'), '// 测试\n')
    fs.writeFileSync(path.join(pkgDir, 'tests', 'fixtures.json'), '{"keep":true}\n')
    const composerDir = root
    fs.writeFileSync(path.join(composerDir, 'package.json'),
      JSON.stringify({ name: 'composer', dependencies: { 'demo-pkg': '^1.0.0' } }))

    const outDir = path.join(root, 'out', 'node_modules')
    const resolvePackage = (name, fromDir) => {
      const cand = path.join(fromDir, 'node_modules', ...name.split('/'), 'package.json')
      if (fs.existsSync(cand)) return cand
      throw Object.assign(new Error('not found ' + name), { code: 'MODULE_NOT_FOUND' })
    }
    const result = stageRemotionRuntime({
      composerDir,
      composerPackageJson: path.join(composerDir, 'package.json'),
      outputDir: outDir,
      resolvePackage,
    })

    assert.ok(result.packages.includes('demo-pkg'), '包本身必须被暂存：' + JSON.stringify(result.packages))
    const dest = path.join(outDir, 'demo-pkg')
    assert.equal(fs.existsSync(path.join(dest, 'index.js')), true, '入口文件必须保留')
    assert.equal(fs.existsSync(path.join(dest, 'lib', 'runtime.js')), true, '运行期文件必须保留')
    assert.equal(fs.existsSync(path.join(dest, 'tests', 'fixtures.json')), true,
      'tests 目录里**非测试命名**的文件必须保留（按文件判，不按目录判）')
    assert.equal(fs.existsSync(path.join(dest, 'tests', 'a.test.ts')), false, '测试文件不得进暂存树')
    assert.equal(fs.existsSync(path.join(dest, 'tests', 'b.test.js')), false, '测试文件不得进暂存树')
    assert.equal(result.prunedTestFiles, 2, '剪掉的条数必须如实回报（否则"到底有没有生效"看不见）')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('stageRemotionRuntime：过滤判据只作用于源，不改目标布局；且必须真的传给 copy', () => {
  const calls = []
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-stage2-'))
  try {
    const pkgDir = path.join(root, 'node_modules', 'p1')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'p1', version: '1.0.0' }))
    fs.writeFileSync(path.join(pkgDir, 'x.test.ts'), '// t\n')
    fs.writeFileSync(path.join(pkgDir, 'keep.js'), '// k\n')
    const composerDir = root
    fs.writeFileSync(path.join(composerDir, 'package.json'),
      JSON.stringify({ name: 'c', dependencies: { p1: '^1.0.0' } }))
    const outDir = path.join(root, 'out')
    const result = stageRemotionRuntime({
      composerDir,
      composerPackageJson: path.join(composerDir, 'package.json'),
      outputDir: outDir,
      resolvePackage: (name, fromDir) => {
        const cand = path.join(fromDir, 'node_modules', name, 'package.json')
        if (fs.existsSync(cand)) return cand
        throw Object.assign(new Error('nf'), { code: 'MODULE_NOT_FOUND' })
      },
      mkdir: () => {},
      remove: () => {},
      copy: (src, dest, opts) => { calls.push({ src, dest, hasFilter: typeof opts.filter === 'function', filter: opts.filter }) },
    })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].hasFilter, true, '必须把 filter 传给 cpSync，否则剪枝根本不发生')
    // filter 必须"拷之前"就存在且行为正确：直接把它抠出来当纯函数驱动，
    // 这样即使将来有人把 filter 换成恒真函数，这里立刻红（而不是等到真打包才发现）。
    const filter = calls[0].filter
    assert.equal(typeof filter, 'function')
    assert.equal(filter(path.join(pkgDir, 'x.test.ts')), false)
    assert.equal(filter(path.join(pkgDir, 'keep.js')), true)
    assert.equal(filter(path.join(pkgDir, 'sub')), true, '目录本身必须放行，否则整棵树拷不出来')
    assert.ok(result.packages.includes('p1'))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('collectRuntimePackages：传递依赖闭包与 optional 缺失的跳过（既有行为不得被本次改动破坏）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-stage3-'))
  try {
    const write = (name, manifest) => {
      const dir = path.join(root, 'node_modules', ...name.split('/'))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }))
      return dir
    }
    write('mid', { dependencies: { leaf: '^1.0.0' } })
    write('leaf', {})
    const composerDir = root
    const pkgJson = path.join(composerDir, 'package.json')
    fs.writeFileSync(pkgJson, JSON.stringify({
      name: 'c',
      dependencies: { mid: '^1.0.0' },
      optionalDependencies: { ghost: '^1.0.0' },
    }))
    // 用**真实**解析器（含逐级上溯），不用测试自己写的"只看同层 node_modules"的简化版 ——
    // pnpm hoisted 布局下 leaf 就挂在 root/node_modules，简化版会把闭包判成缺失。
    const names = collectRuntimePackages(pkgJson).map((r) => r.name).sort()
    assert.deepEqual(names, ['leaf', 'mid'], '传递依赖必须闭包；optional 缺失可跳过')
    // 非 optional 且解析不到 ⇒ 必须抛（不得静默少拷一个包，那会让产物缺依赖却在运行期才炸）。
    // 锁错误码而不是错误文案：默认解析器的消息来自 Module._load，随 Node 版本变。
    assert.throws(() => collectRuntimePackages(
      (() => {
        const p = path.join(composerDir, 'hard.json')
        fs.writeFileSync(p, JSON.stringify({ name: 'c', dependencies: { 'definitely-missing-pkg-x': '^1.0.0' } }))
        return p
      })()), (e) => e && e.code === 'MODULE_NOT_FOUND')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
