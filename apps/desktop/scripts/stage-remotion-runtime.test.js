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
  isInsideDirectory,
  verifyStagedClosure,
  resolvesInsideStagedTree,
  destinationOf,
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
      // copy 被换成 spy ⇒ 什么都没落盘，闭包自证（verifyStagedClosure）必须显式关掉；
      // 它自身的红/绿由下面那条真落盘的同名测试负责，不靠这里顺带经过。
      verify: false,
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

test('剪枝判据命中目录时必须抛错：剪掉一个目录等于连带删掉整棵子树，而自证只看得到父层目录名', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-h-'))
  try {
    const pkgDir = path.join(root, 'node_modules', 'p1')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'p1', version: '1.0.0' }))
    // 一个**目录**长得像测试文件（QM-6 外部评审 Q1 的现实形状）。
    // 静默剪掉它 ⇒ 它底下的依赖全没了，但判据② 只比 node_modules 的直接子项，看不见这层丢失。
    fs.mkdirSync(path.join(pkgDir, 'node_modules', 'weird.test.js'), { recursive: true })
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'c', dependencies: { p1: '^1.0.0' } }))
    assert.throws(() => stageRemotionRuntime({
      composerDir: root,
      composerPackageJson: path.join(root, 'package.json'),
      outputDir: path.join(root, 'out'),
      verify: false,
    }), /命中了一个目录/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('剪枝判据无法 stat 命中路径时必须抛错，不得默认"是文件"剪掉（ENOTDIR 恰恰是目录那一层）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-j-'))
  try {
    const pkgDir = path.join(root, 'node_modules', 'p1')
    fs.mkdirSync(pkgDir, { recursive: true })
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({ name: 'p1', version: '1.0.0' }))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'c', dependencies: { p1: '^1.0.0' } }))
    const calls = []
    stageRemotionRuntime({
      composerDir: root,
      composerPackageJson: path.join(root, 'package.json'),
      outputDir: path.join(root, 'out'),
      mkdir: () => {}, remove: () => {}, verify: false,
      copy: (src, dest, opts) => { calls.push(opts.filter); return opts },
    })
    const filter = calls[0]
    // keep.js 是个**文件**，往它下面再挂一层就是 ENOTDIR —— 评审点名的"stat 失败最常见的真实成因"。
    const notDir = path.join(pkgDir, 'package.json', 'sub', 'x.test.js')
    assert.throws(() => filter(notDir), /无法 stat/,
      '判不出目录还是文件时不许按"文件"静默剪（那正是整棵子树消失的入口）')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('落点唯一性必须按大小写折叠比：Windows 上 Foo 与 foo 是两个 key、同一个物理目录', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-k-'))
  try {
    const mk = (dir, manifest) => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
      return dir
    }
    // 两个只差大小写的名字来自两棵互不嵌套的树：按字符串比会各占一个 key、双双放行，
    // 而在大小写不敏感的打包机上它们写的是同一个目录 —— 就是 #2778 本体换了个马甲。
    const upper = mk(path.join(root, 'treeA', 'node_modules', 'Twin'), { name: 'Twin', version: '1.0.0' })
    const lower = mk(path.join(root, 'treeB', 'node_modules', 'twin'), { name: 'twin', version: '2.0.0' })
    mk(path.join(root, 'treeA', 'node_modules', 'aaa'), { name: 'aaa', version: '1.0.0', dependencies: { Twin: '^1.0.0' } })
    mk(path.join(root, 'treeB', 'node_modules', 'bbb'), { name: 'bbb', version: '1.0.0', dependencies: { twin: '^2.0.0' } })
    fs.writeFileSync(path.join(root, 'package.json'),
      JSON.stringify({ name: 'composer', dependencies: { aaa: '^1.0.0', bbb: '^1.0.0' } }))
    const TABLE = {
      aaa: path.join(root, 'treeA', 'node_modules', 'aaa', 'package.json'),
      bbb: path.join(root, 'treeB', 'node_modules', 'bbb', 'package.json'),
    }
    let thrown = null
    try {
      stageRemotionRuntime({
        composerDir: root,
        composerPackageJson: path.join(root, 'package.json'),
        outputDir: path.join(root, 'out'),
        mkdir: () => {}, remove: () => {}, verify: false,
        copy: () => {},
        resolvePackage: (name, fromDirectory) => {
          if (TABLE[name]) return TABLE[name]
          return path.join(fromDirectory.includes('treeA') ? upper : lower, 'package.json')
        },
      })
    } catch (e) { thrown = e }
    assert.ok(thrown, '只差大小写的两个源必须被当成同一个落点抢占')
    assert.match(thrown.message, /同一目标目录/)
    assert.ok(thrown.message.includes('treeA') && thrown.message.includes('treeB'), '两边来源都要点名')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('verifyStagedClosure 的 nested 列举必须尊重注入的 exists（判据② 得能被纯内存驱动，不是只认硬磁盘）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-i-'))
  try {
    const src = path.join(root, 'src', 'node_modules', 'parent')
    const dest = path.join(root, 'out', 'parent')
    const srcNested = path.join(src, 'node_modules')
    for (const dir of [src, path.join(srcNested, 'helper'), dest]) fs.mkdirSync(dir, { recursive: true })
    // 不声明依赖：让 ③ 无从插话，这条只测 ② 的注入接缝。
    fs.writeFileSync(path.join(src, 'package.json'), JSON.stringify({ name: 'parent', version: '1.0.0' }))
    fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify({ name: 'parent', version: '1.0.0' }))
    fs.writeFileSync(path.join(srcNested, 'helper', 'package.json'), JSON.stringify({ name: 'helper', version: '1.0.0' }))
    const records = [{ name: 'parent', packageJson: path.join(src, 'package.json'), directory: src }]

    // 真盘：源有 nested、落点没有 ⇒ 必须红（这条已有行为，写在前面是为了让"注入版不红"有意义）。
    assert.throws(() => verifyStagedClosure(path.join(root, 'out'), records), /少了源里有的 nested/)

    // 注入：只对"源那份 node_modules"报不存在 ⇒ 两边都该是空集 ⇒ 不许红。
    // 若实现像改前那样硬用 fs.existsSync，这条会照旧抛错 —— 注入接缝就只是装饰。
    const real = fs.existsSync
    assert.doesNotThrow(() => verifyStagedClosure(path.join(root, 'out'), records, {
      existsSync: (p) => p !== srcNested && real(p),
    }))
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

// ===================== #2778：同名不同版本被摊平进同一目标目录 =====================

/** 造一棵最小假 node_modules：parent 自带 nested shared@2，仓库根另有 shared@1。 */
function buildNestedOverrideTree (prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const nm = path.join(root, 'node_modules')
  const write = (rel, manifest, extraFiles) => {
    const dir = path.join(nm, ...rel.split('/'))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(Object.assign({ version: '1.0.0' }, manifest)))
    for (const [name, body] of Object.entries(extraFiles || {})) fs.writeFileSync(path.join(dir, name), body)
    return dir
  }
  const sharedRoot = write('shared', { name: 'shared', version: '1.0.0' }, { 'index.js': 'ROOT\n' })
  const parent = write('parent', { name: 'parent', dependencies: { shared: '^1.0.0' } })
  // parent 自带的 nested 覆盖（真实 pnpm 摊平前的形状就是这样：node_modules/parent/node_modules/shared）
  const nested = path.join(parent, 'node_modules', 'shared')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({
    name: 'shared', version: '2.0.0', dependencies: { 'only-by-nested': '^1.0.0' },
  }))
  fs.writeFileSync(path.join(nested, 'index.js'), 'NESTED\n'
  )
  const onlyByNested = write('only-by-nested', { name: 'only-by-nested' })
  fs.writeFileSync(path.join(root, 'package.json'),
    JSON.stringify({ name: 'composer', dependencies: { parent: '^1.0.0', shared: '^1.0.0' } }))
  return { root, nm, sharedRoot, parent, nested, onlyByNested }
}

test('collectRuntimePackages：被父包整目录携带的 nested 覆盖不得再单独记一条顶层包（#2778 摊平根因）', () => {
  const t = buildNestedOverrideTree('mp-2778-a-')
  try {
    const records = collectRuntimePackages(path.join(t.root, 'package.json'))
    const names = records.map((r) => r.name).sort()
    assert.deepEqual(names, ['only-by-nested', 'parent', 'shared'],
      'shared 只能有一条顶层记录；但 nested 那份的依赖 only-by-nested 仍必须被展开（跳过记录≠跳过展开）')
    const shared = records.filter((r) => r.name === 'shared')
    assert.equal(shared.length, 1, '两条 shared 就是互相覆盖的来源')
    assert.equal(shared[0].packageJson, path.join(t.sharedRoot, 'package.json'),
      '顶层 shared 必须是仓库解析命中的那份（root@1.0.0），不是父包自带的 @2.0.0')
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true })
  }
})

test('collectRuntimePackages：composer 自己 node_modules 里的包必须照常记录（它不作为"被拷贝的父包"存在）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-b-'))
  try {
    // 真实布局里 workspace 包（@multi-publish/*）就挂在 composer 自己的 node_modules 下（pnpm 链接），
    // 而 composer 的 node_modules **不会**被拷进产物（extraResources 的 !node_modules/**）；
    // 所以"跳过 nested"只适用于父包本身被拷贝的情形。
    const inside = path.join(root, 'node_modules', 'inside-composer')
    fs.mkdirSync(inside, { recursive: true })
    fs.writeFileSync(path.join(inside, 'package.json'), JSON.stringify({ name: 'inside-composer', version: '3.0.0' }))
    fs.writeFileSync(path.join(root, 'package.json'),
      JSON.stringify({ name: 'composer', dependencies: { 'inside-composer': '^3.0.0' } }))
    const records = collectRuntimePackages(path.join(root, 'package.json'))
    assert.deepEqual(records.map((r) => r.name), ['inside-composer'],
      'composer 自身 node_modules 里的依赖若被跳过，产物里就直接少一个包 ⇒ MODULE_NOT_FOUND')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('stageRemotionRuntime：两个不同源映射到同一目标目录必须抛错并点名两边（禁止"后拷覆盖前拷"）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-c-'))
  try {
    const mk = (dir, manifest) => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
      return dir
    }
    // 两棵互不嵌套的树各自提供一个 twin，且版本不同 —— 这正是 react-dom@18/@19 抢同一个顶层目录的形状
    const twinA = mk(path.join(root, 'treeA', 'node_modules', 'twin'), { name: 'twin', version: '1.0.0' })
    const twinB = mk(path.join(root, 'treeB', 'node_modules', 'twin'), { name: 'twin', version: '2.0.0' })
    const aaa = mk(path.join(root, 'treeA', 'node_modules', 'aaa'), { name: 'aaa', version: '1.0.0', dependencies: { twin: '^1.0.0' } })
    const bbb = mk(path.join(root, 'treeB', 'node_modules', 'bbb'), { name: 'bbb', version: '1.0.0', dependencies: { twin: '^1.0.0' } })
    fs.writeFileSync(path.join(root, 'package.json'),
      JSON.stringify({ name: 'composer', dependencies: { aaa: '^1.0.0', bbb: '^1.0.0' } }))
    const TABLE = {
      aaa: path.join(aaa, 'package.json'),
      bbb: path.join(bbb, 'package.json'),
    }
    let thrown = null
    try {
      stageRemotionRuntime({
        composerDir: root,
        composerPackageJson: path.join(root, 'package.json'),
        outputDir: path.join(root, 'out'),
        resolvePackage: (name, fromDirectory) => {
          if (TABLE[name]) return TABLE[name]
          return path.join(fromDirectory.includes('treeA') ? twinA : twinB, 'package.json')
        },
      })
    } catch (e) {
      thrown = e
    }
    assert.ok(thrown, '必须抛错；静默让后拷的覆盖前拷就是 #2778 的成因')
    assert.match(thrown.message, /同一目标目录/)
    assert.match(thrown.message, /twin/, '必须点名是哪个包被抢')
    assert.ok(thrown.message.includes('1.0.0') || thrown.message.includes('treeA'), '两边来源都要出现在文案里，否则现场无法归因')
    assert.ok(thrown.message.includes('treeA') && thrown.message.includes('treeB'), '两边来源都要点名')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('verifyStagedClosure：拷贝结果多出源里没有的 nested 包必须抛错（"文件级互相覆盖"的唯一可见症状）', () => {
  const t = buildNestedOverrideTree('mp-2778-d-')
  const out = path.join(t.root, 'out')
  try {
    const result = stageRemotionRuntime({
      composerDir: t.root,
      composerPackageJson: path.join(t.root, 'package.json'),
      outputDir: out,
    })
    assert.equal(result.packages.filter((n) => n === 'shared').length, 1)
    // 基线：暂存结果与源逐目录一致时必须通过
    assert.doesNotThrow(() => verifyStagedClosure(out, result.records))
    // 植入本次事故的确切形状：给 shared 塞一个源里根本没有的 nested 覆盖
    const planted = path.join(out, 'shared', 'node_modules', 'ghost')
    fs.mkdirSync(planted, { recursive: true })
    fs.writeFileSync(path.join(planted, 'package.json'), JSON.stringify({ name: 'ghost', version: '9.9.9' }))
    assert.throws(() => verifyStagedClosure(out, result.records), /nested/)
    fs.rmSync(planted, { recursive: true, force: true })
    // 再植入"package.json 被别的版本覆盖"
    fs.writeFileSync(path.join(out, 'shared', 'package.json'), JSON.stringify({ name: 'shared', version: '9.9.9' }))
    assert.throws(() => verifyStagedClosure(out, result.records), /package.json/)
  } finally {
    fs.rmSync(t.root, { recursive: true, force: true })
  }
})

// ---- 真实闭包上的不变量（不拷贝，只解析；跑一次约 1-2 秒） ----

test('真实 remotion 闭包：顶层记录必须两两不互相包含，且 name 唯一（#2778 的确切形状）', () => {
  const composerPackageJson = path.resolve(__dirname, '..', '..', '..', 'packages', 'remotion-composer', 'package.json')
  assert.ok(fs.existsSync(composerPackageJson), '前提：真实 composer package.json 必须在位，否则这条在测空气')
  const records = collectRuntimePackages(composerPackageJson)
  assert.ok(records.length > 100, '规模下界：解析退化成一个很小的集合时不许报"没有重复"，实得 ' + records.length)

  const names = records.map((r) => r.name)
  const dupNames = names.filter((n, i) => names.indexOf(n) !== i)
  assert.deepEqual(dupNames, [], '同一个顶层落点被多个源抢占 ⇒ 文件级互相覆盖：' + JSON.stringify([...new Set(dupNames)]))

  // 同一件事的**大小写**形态（QM-6 外部评审 Q2）：打包机是 Windows，`Foo` 与 `foo` 是两个不同的 Map key，
  // 却是同一个物理目录 ⇒ 摊平覆盖会绕过"一个落点一个源"的抛错。这里按实测锁住而不是在运行期加平台嗅探：
  // 一旦闭包里真的出现只差大小写的两个名字，这条会红，届时再决定是消歧还是拒绝暂存。
  const folded = names.map((n) => n.toLowerCase())
  const dupFolded = folded.filter((n, i) => folded.indexOf(n) !== i)
  assert.deepEqual(dupFolded, [], '名字只差大小写 ⇒ 在大小写不敏感的文件系统上会撞同一个物理目录：'
    + JSON.stringify([...new Set(dupFolded)]))

  const nested = []
  for (const a of records) {
    for (const b of records) {
      if (a === b) continue
      const rel = path.relative(a.directory, b.packageJson)
      if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) nested.push(b.name + ' inside ' + a.name)
    }
  }
  assert.deepEqual(nested, [], '被别的包整目录携带的包不得再占一个顶层落点')

  // 症状级：本仓事故的具体两边。修复前 react-dom 会有两条（18.3.1 与 19.3.0），且 react@19 会被摊到 react-dom 下面。
  const reactDom = records.filter((r) => r.name === 'react-dom')
  assert.equal(reactDom.length, 1)
  assert.equal(JSON.parse(fs.readFileSync(reactDom[0].packageJson, 'utf8')).version,
    JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'node_modules', 'react-dom', 'package.json'), 'utf8')).version,
    '顶层 react-dom 必须是仓库解析命中的那份，不是谁顺带摊进来的另一版本')
})

test('isInsideDirectory：必须按路径段判，不能按字符串前缀（`pkg` 不得算包含 `pkg-evil`）', () => {
  assert.equal(isInsideDirectory('/a/pkg', '/a/pkg/node_modules/x/package.json'), true)
  assert.equal(isInsideDirectory('/a/pkg', '/a/pkg-evil/node_modules/x/package.json'), false,
    '前缀判据会把兄弟目录判成"被携带"，于是那个包从闭包里凭空消失（比错版本更难查）')
  assert.equal(isInsideDirectory('/a/pkg', '/a/pkg/package.json'), true, '目录内的文件当然算内含')
  assert.equal(isInsideDirectory('/a/pkg', '/a/pkg'), false, '等于自身不算内含')
  assert.equal(isInsideDirectory('/a/pkg', '/b/pkg/package.json'), false)
})

test('verifyStagedClosure：源里有的 nested 依赖在落点缺失时也必须抛错（少包与多包是两个方向）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-e-'))
  try {
    const parent = path.join(root, 'node_modules', 'parent')
    const nested = path.join(parent, 'node_modules', 'helper')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(parent, 'package.json'), JSON.stringify({ name: 'parent', version: '1.0.0', dependencies: { helper: '^1.0.0' } }))
    fs.writeFileSync(path.join(nested, 'package.json'), JSON.stringify({ name: 'helper', version: '2.0.0' }))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'composer', dependencies: { parent: '^1.0.0' } }))
    const out = path.join(root, 'out')
    const result = stageRemotionRuntime({
      composerDir: root,
      composerPackageJson: path.join(root, 'package.json'),
      outputDir: out,
    })
    assert.doesNotThrow(() => verifyStagedClosure(out, result.records))
    // 摘掉落点里那份 nested（模拟"整目录拷贝被别的规则剪掉"）
    fs.rmSync(path.join(out, 'parent', 'node_modules', 'helper'), { recursive: true, force: true })
    assert.throws(() => verifyStagedClosure(out, result.records), /少了源里有的 nested/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('verifyStagedClosure：顶层包缺依赖时必须抛错，且解析域不得逃出 outputDir（"筛错记录"的反向保险）', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-f-'))
  try {
    const mk = (dir, manifest) => {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(manifest))
      return dir
    }
    const a = mk(path.join(root, 'node_modules', 'a'), { name: 'a', version: '1.0.0', dependencies: { b: '^1.0.0' } })
    // b 物理上就在 a 里面（被 a 整目录携带），但 a 又是**顶层**包 ⇒ 顶层树里根本没有 b。
    // 运行期从 <out>/a 解析 'b' 时，Node 会先看 <out>/a/node_modules/b（在，随拷贝带过去）⇒ 允许；
    // 而下面的 hostEscape 用例证的是"不能靠宿主仓库的 node_modules 蒙过去"。
    fs.mkdirSync(path.join(a, 'node_modules', 'b'), { recursive: true })
    fs.writeFileSync(path.join(a, 'node_modules', 'b', 'package.json'), JSON.stringify({ name: 'b', version: '2.0.0' }))
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'composer', dependencies: { a: '^1.0.0' } }))
    const out = path.join(root, 'out')
    const result = stageRemotionRuntime({
      composerDir: root,
      composerPackageJson: path.join(root, 'package.json'),
      outputDir: out,
    })
    assert.equal(result.records.length, 1, 'b 由 a 携带，不该占顶层落点')
    assert.doesNotThrow(() => verifyStagedClosure(out, result.records), '嵌套可解析 ⇒ 不该红')

    // 现在把 a 携带的那份删掉：顶层与 a 内部都没有 b ⇒ 必须红。
    // 不点名是哪一条判据先红（②"少了源里有的 nested"会先于③"解析不到依赖"触发），
    // 两条都是同一症状的合法出口，所以只锁"红且点名 a → b"；③ 自身的红由下一条用例专门测。
    fs.rmSync(path.join(out, 'a', 'node_modules', 'b'), { recursive: true, force: true })
    assert.throws(() => verifyStagedClosure(out, result.records), /a → b/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('verifyStagedClosure：①② 都成立时 ③ 必须能单独红，且解析不得摸到 outputDir 之外的同名包', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-2778-g-'))
  try {
    const srcDir = path.join(root, 'src', 'node_modules', 'a')
    fs.mkdirSync(srcDir, { recursive: true })
    const manifest = { name: 'a', version: '1.0.0', dependencies: { b: '^1.0.0' } }
    fs.writeFileSync(path.join(srcDir, 'package.json'), JSON.stringify(manifest))
    const out = path.join(root, 'out')
    fs.mkdirSync(path.join(out, 'a'), { recursive: true })
    fs.writeFileSync(path.join(out, 'a', 'package.json'), JSON.stringify(manifest))
    // b 落在 out **之外**、却在 a 的真实祖先链上（root/node_modules/b）：
    // 没有边界判据的实现会一路往上摸到它，把"产物少包"假装成"解析得到"。
    fs.mkdirSync(path.join(root, 'node_modules', 'b'), { recursive: true })
    fs.writeFileSync(path.join(root, 'node_modules', 'b', 'package.json'),
      JSON.stringify({ name: 'b', version: '2.0.0' }))

    // ①（落点 manifest 与源逐字节相同）与 ②（两边 nested 都是空集）在此夹具里恒成立，
    // 所以这条红只能来自 ③ —— 这正是上一条用例测不到的那一格（那边 ② 会先抢着红）。
    const records = [{ name: 'a', packageJson: path.join(srcDir, 'package.json'), directory: srcDir }]
    assert.throws(() => verifyStagedClosure(out, records), /解析不到依赖：a → b/)

    // 把 b 挪进树内 ⇒ 必须转绿：证明上一条的红确实来自"边解析不到"，而非别的判据顺带拦下。
    fs.mkdirSync(path.join(out, 'b'), { recursive: true })
    fs.writeFileSync(path.join(out, 'b', 'package.json'), JSON.stringify({ name: 'b', version: '2.0.0' }))
    assert.doesNotThrow(() => verifyStagedClosure(out, records))
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('resolvesInsideStagedTree：出了 outputDir 边界一律算解析不到（不得借宿主仓库的 node_modules 蒙过自证）', () => {
  const out = path.join(os.tmpdir(), 'mp-2778-boundary-' + process.pid)
  // 真实仓库里 react 当然存在；但它不在这个空的 outputDir 里 ⇒ 必须判 false。
  // 若实现往上走到宿主 node_modules 就命中，这条会假绿地把整棵自证变成装饰。
  assert.equal(resolvesInsideStagedTree('react', out, out, () => false), false)
  const exists = (p) => p === path.join(out, 'react', 'package.json')
  assert.equal(resolvesInsideStagedTree('react', path.join(out, 'consumer'), out, exists), true,
    '顶层兄弟目录应被命中（这就是"每个包的每条边都得在树里"的语义）')
  assert.equal(resolvesInsideStagedTree('@scope/pkg', path.join(out, 'consumer'), out,
    (p) => p === path.join(out, '@scope', 'pkg', 'package.json')), true, 'scoped 包按两段拼')
  // fromDirectory 本身就落在树**外**（上游那格优化筛错时的真实形状：拿到的源目录不在 outputDir 下）：
  // 第一步就必须判 false，不得继续往上摸宿主仓库的 node_modules。
  // exists 用注入的假实现，所以这条不依赖"这台机器装没装 react"，摘掉边界守卫即红。
  const hostRoot = path.join(out, '..', 'host-repo')
  assert.equal(resolvesInsideStagedTree('react', hostRoot, out,
    (p) => p === path.join(hostRoot, 'node_modules', 'react', 'package.json')), false,
    '起点在树外 ⇒ 一步都不许往上走')
})
