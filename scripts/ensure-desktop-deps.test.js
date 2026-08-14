// @ts-check
/**
 * ensure-desktop-deps.test.js — 自愈脚本纯逻辑测试（node --test）
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const lib = require('./ensure-desktop-deps')

function makeRoot(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `edd-test-${process.pid}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(dir, 'node_modules', '@img'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'node_modules', '@element-plus'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'node_modules', '@ctrl'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'apps', 'desktop'), { recursive: true })
  return dir
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2))
}

test('collectMissing 识别缺失与损坏包', (t) => {
  const root = makeRoot(t)
  // @img/colour 完整
  writeJson(path.join(root, 'node_modules', '@img', 'colour', 'package.json'), { name: '@img/colour', version: '1.1.0' })
  fs.writeFileSync(path.join(root, 'node_modules', '@img', 'colour', 'index.cjs'), 'module.exports = {}')
  // icons-vue 存在但缺关键文件（模拟损坏）
  writeJson(path.join(root, 'node_modules', '@element-plus', 'icons-vue', 'package.json'), { name: '@element-plus/icons-vue', version: '2.3.2' })
  fs.mkdirSync(path.join(root, 'node_modules', '@element-plus', 'icons-vue', 'dist'), { recursive: true })
  // @ctrl/tinycolor 完全缺失
  const missing = lib.collectMissing(root)
  const names = missing.map((m) => m.name)
  assert.ok(names.includes('@ctrl/tinycolor'), 'tinycolor 应缺失')
  assert.ok(names.includes('@element-plus/icons-vue'), 'icons-vue 应因关键文件缺失被标记')
  assert.ok(!names.includes('@img/colour'), 'colour 完整不应被标记')
})

test('readDesktopDeps 解析 desktop 直接依赖', (t) => {
  const root = makeRoot(t)
  writeJson(path.join(root, 'apps', 'desktop', 'package.json'), {
    name: '@multi-publish/desktop',
    dependencies: { vue: '^3.5.0', '@element-plus/icons-vue': '^2.3.2' },
  })
  const deps = lib.readDesktopDeps(root)
  assert.equal(deps['vue'], '^3.5.0')
  assert.equal(deps['@element-plus/icons-vue'], '^2.3.2')
})

test('buildRestoreCommands 生成 npm pack + 解包 + 复制命令', () => {
  const plan = lib.buildRestoreCommands([
    { name: '@ctrl/tinycolor', version: '4.2.0', range: '^4.2.0', scope: '@ctrl', short: 'tinycolor' },
  ], 'C:/tmp/edd-work')
  assert.ok(plan.length >= 3, '应有 pack/tar/copy 命令')
  const joined = plan.join('\n')
  assert.match(joined, /npm pack @ctrl\/tinycolor@4\.2\.0/)
  assert.match(joined, /tar -xzf/)
  assert.match(joined, /tinycolor/)
})

test('invalidateViteCache 将 deps 缓存改名', (t) => {
  const root = makeRoot(t)
  const vite = path.join(root, 'apps', 'desktop', 'node_modules', '.vite')
  const deps = path.join(vite, 'deps')
  fs.mkdirSync(deps, { recursive: true })
  fs.writeFileSync(path.join(deps, '_metadata.json'), '{}')
  const result = lib.invalidateViteCache(root)
  assert.equal(result.renamed, true)
  assert.equal(fs.existsSync(deps), false)
  const leftovers = fs.readdirSync(vite)
  assert.ok(leftovers.some((n) => n.startsWith('deps.stale-')), '应留下可回退的 stale 目录')
})

test('--check 在健康树返回 0', (t) => {
  const root = makeRoot(t)
  writeJson(path.join(root, 'apps', 'desktop', 'package.json'), { name: '@multi-publish/desktop', dependencies: {} })
  for (const p of lib.FRAGILE) {
    const dir = path.join(root, 'node_modules', ...p.name.split('/'))
    fs.mkdirSync(dir, { recursive: true })
    for (const f of p.files) {
      const file = path.join(dir, f)
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, 'x')
    }
  }
  const out = execFileSync(process.execPath, [path.join(__dirname, 'ensure-desktop-deps.js'), '--check', '--root', root], { encoding: 'utf8' })
  assert.match(out, /OK|ok/i)
})

test('buildCmdLine 对 range/元字符参数加引号（防 cmd ^ 转义与重定向）', () => {
  const line = lib.buildCmdLine(['pack', '@ctrl/tinycolor@^4.2.0', '--pack-destination', 'C:/tmp/x y'])
  assert.ok(line.includes('"@ctrl/tinycolor@^4.2.0"'), '版本 spec 必须带引号')
  assert.ok(line.includes('"C:/tmp/x y"'), '含空格路径必须带引号')
  assert.ok(!/@\^4\.2\.0[^"]/.test(line), 'caret 不得裸露在引号外')
  assert.ok(line.startsWith('pack '), '命令名不带引号，避免 cmd /s 残留引号')
})

test('fragileFor 平台过滤：非 win32-x64 不检查 sharp 平台包', () => {
  const win = lib.fragileFor('win32', 'x64').map((p) => p.name)
  assert.ok(win.includes('@img/sharp-win32-x64'))
  const mac = lib.fragileFor('darwin', 'arm64').map((p) => p.name)
  assert.ok(!mac.includes('@img/sharp-win32-x64'))
  assert.ok(mac.includes('@img/colour'))
})

test('collectMissing 平台感知', (t) => {
  const root = makeRoot(t)
  writeJson(path.join(root, 'apps', 'desktop', 'package.json'), { name: '@multi-publish/desktop', dependencies: {} })
  // 仅放 cross-platform 包，win32 缺失 sharp
  fs.mkdirSync(path.join(root, 'node_modules', '@img', 'colour'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', '@img', 'colour', 'index.cjs'), 'x')
  const winMissing = lib.collectMissing(root, 'win32', 'x64').map((m) => m.name)
  assert.ok(winMissing.includes('@img/sharp-win32-x64'))
  const macMissing = lib.collectMissing(root, 'darwin', 'arm64').map((m) => m.name)
  assert.ok(!macMissing.includes('@img/sharp-win32-x64'))
})


test('collectMissing 识别 pnpm hoisted 布局（workspace 包在 apps/desktop/node_modules）', (t) => {
  const root = makeRoot(t)
  writeJson(path.join(root, 'apps', 'desktop', 'package.json'), {
    name: '@multi-publish/desktop',
    dependencies: { '@multi-publish/ai-writer': '^1.0.0', vue: '^3.5.0' },
  })
  // pnpm hoisted：普通包在根 node_modules，@multi-publish/* 只在 apps/desktop/node_modules
  fs.mkdirSync(path.join(root, 'node_modules', 'vue'), { recursive: true })
  fs.writeFileSync(path.join(root, 'node_modules', 'vue', 'package.json'), JSON.stringify({ name: 'vue', version: '3.5.0' }))
  fs.mkdirSync(path.join(root, 'apps', 'desktop', 'node_modules', '@multi-publish', 'ai-writer'), { recursive: true })
  fs.writeFileSync(path.join(root, 'apps', 'desktop', 'node_modules', '@multi-publish', 'ai-writer', 'package.json'), JSON.stringify({ name: '@multi-publish/ai-writer', version: '1.0.0' }))
  const missing = lib.collectMissing(root).map((m) => m.name)
  assert.ok(!missing.includes('@multi-publish/ai-writer'), 'pnpm 布局下 workspace 包不应缺失')
  assert.ok(!missing.includes('vue'), 'vue 不应缺失')
})

test('findTgz 发现 npm 实际产物名（range 解析后为具体版本）', (t) => {
  const root = makeRoot(t)
  const work = path.join(root, 'work')
  fs.mkdirSync(work, { recursive: true })
  fs.writeFileSync(path.join(work, 'picocolors-1.1.1.tgz'), 'x')
  fs.writeFileSync(path.join(work, 'other.tgz'), 'x')
  assert.equal(lib.findTgz(work, 'picocolors'), 'picocolors-1.1.1.tgz')
  assert.equal(lib.findTgz(work, '@ctrl/tinycolor'.split('/').slice(1).join('-')), null)
})
