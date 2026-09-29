// @ts-check
/**
 * dev-launcher.test.js — dev 启动参数/默认 userData 解析（node --test）
 * 回归保护：dev.js 直接启动必须落到固定 D 盘 profile，不得再掉进随机临时目录。
 */
'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { buildElectronArgs, resolveUserDataDir, resolveAllowAllOrigins, DEFAULT_USER_DATA_DIR } = require('./dev-launcher')
const fs = require('node:fs')
const path = require('node:path')

test('resolveUserDataDir 未设置 env 时使用固定 D 盘默认 profile', () => {
  assert.equal(resolveUserDataDir({}), DEFAULT_USER_DATA_DIR)
  assert.ok(DEFAULT_USER_DATA_DIR.startsWith('D:\\'))
  assert.ok(DEFAULT_USER_DATA_DIR.includes('Multi-Publish-debug-profile'))
})

test('resolveUserDataDir 尊重显式 ELECTRON_USER_DATA_DIR（并发隔离/start-desktop.ps1）', () => {
  assert.equal(resolveUserDataDir({ ELECTRON_USER_DATA_DIR: 'X:\\custom\\profile' }), 'X:\\custom\\profile')
})

test('buildElectronArgs 透传 userData/cache 并默认 CDP 端口 9222', () => {
  const args = buildElectronArgs({
    electronUserDataDir: 'D:\\tmp\\Multi-Publish-debug-profile',
    electronCacheDir: 'D:\\tmp\\Multi-Publish-debug-profile\\cache',
    desktopDir: 'D:\\app',
    platform: 'win32',
  })
  assert.ok(args.includes('--user-data-dir=D:\\tmp\\Multi-Publish-debug-profile'))
  assert.ok(args.includes('--disk-cache-dir=D:\\tmp\\Multi-Publish-debug-profile\\cache'))
  assert.ok(args.includes('--remote-debugging-port=9222'))
  assert.equal(args[args.length - 1], 'D:\\app')
})

test('buildElectronArgs 支持自定义 CDP 端口（worktree 独立端口）', () => {
  const args = buildElectronArgs({
    electronUserDataDir: 'D:/tmp/profile',
    electronCacheDir: 'D:/tmp/profile/cache',
    desktopDir: 'D:/app',
    cdpPort: 9333,
    platform: 'win32',
  })
  assert.ok(args.includes('--remote-debugging-port=9333'))
})

test('resolveUserDataDir 吞并尾随空白（cmd set "VAR=val &" 尾随空格陷阱回归保护）', () => {
  assert.equal(resolveUserDataDir({ ELECTRON_USER_DATA_DIR: ' X:\\custom\\profile ' }), 'X:\\custom\\profile')
  assert.equal(resolveUserDataDir({ ELECTRON_USER_DATA_DIR: 'X:\\custom\\profile  ' }), 'X:\\custom\\profile')
  assert.equal(resolveUserDataDir({ ELECTRON_USER_DATA_DIR: '   ' }), DEFAULT_USER_DATA_DIR)
})

test('buildElectronArgs 默认不得放行任意 Origin（安全默认，不得由调用方遗漏决定）', () => {
  const args = buildElectronArgs({
    electronUserDataDir: 'D:/tmp/profile',
    electronCacheDir: 'D:/tmp/profile/cache',
    desktopDir: 'D:/app',
    platform: 'win32',
  })
  assert.equal(args.filter(a => a.startsWith('--remote-allow-origins')).length, 0)
  assert.equal(args[args.length - 1], 'D:/app')
})

test('buildElectronArgs 显式开启时只追加一条 --remote-allow-origins=* 且 desktopDir 保持末位', () => {
  const args = buildElectronArgs({
    electronUserDataDir: 'D:/tmp/profile',
    electronCacheDir: 'D:/tmp/profile/cache',
    desktopDir: 'D:/app',
    cdpPort: 9333,
    platform: 'win32',
    allowAllOrigins: true,
  })
  const hits = args.filter(a => a.startsWith('--remote-allow-origins'))
  assert.deepEqual(hits, ['--remote-allow-origins=*'])
  assert.equal(args[args.length - 1], 'D:/app')
  // 开关必须排在应用路径之前，否则等于把开关当参数交给 app
  assert.ok(args.indexOf(hits[0]) < args.length - 1)
  assert.ok(args.includes('--remote-debugging-port=9333'))
})

test('resolveAllowAllOrigins 只对 trim 后恰好为 "1" 放行（尾随空格兼容 + 拒绝宽松写法）', () => {
  assert.equal(resolveAllowAllOrigins({}), false)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: '1' }), true)
  // cmd `set "VAR=1 &"` 的尾随空格陷阱：不 trim 就会静默失效
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: '1 ' }), true)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: ' 1' }), true)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: '0' }), false)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: 'true' }), false)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: '' }), false)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: '   ' }), false)
  assert.equal(resolveAllowAllOrigins({ MP_CDP_ALLOW_ALL_ORIGINS: 1 }), false)
})

test('接线锁：dev.js 必须真的读取开关并传给 buildElectronArgs（写了 helper 没人调即红）', () => {
  const src = fs.readFileSync(path.join(__dirname, 'dev.js'), 'utf8')
  assert.ok(/require\('\.\/dev-launcher'\)/.test(src), 'dev.js 不再从 dev-launcher 取参数装配')
  assert.match(src, /const \{[^}]*resolveAllowAllOrigins[^}]*\} = require\('\.\/dev-launcher'\)/)
  assert.match(src, /const allowAllOrigins = resolveAllowAllOrigins\(process\.env\)/)
  assert.match(src, /buildElectronArgs\(\{[^}]*allowAllOrigins[^}]*\}\)/)
})

test('留痕锁：开关生效时 dev.js 必须打印现场（禁止以静默 no-op 表达「已开启」）', () => {
  const src = fs.readFileSync(path.join(__dirname, 'dev.js'), 'utf8')
  assert.match(src, /if \(allowAllOrigins\) \{/)
  assert.match(src, /--remote-allow-origins=\* ENABLED/)
})
