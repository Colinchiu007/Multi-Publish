#!/usr/bin/env node
// @ts-check
/**
 * run-package-install.js — 在 pnpm 布局下定位包真实目录并执行其 install/postinstall 脚本
 *
 * 背景：electron-ci.yml 原使用硬编码路径 node_modules/@remotion/bundler/node_modules/esbuild/install.js，
 * 该嵌套路径在 pnpm（hoisted 与 isolated）下都不再可靠存在。本脚本依次尝试：
 *   1. 包名在仓库根的 require.resolve（hoisted 扁平布局）
 *   2. 在 @remotion/bundler 等父包目录向上解析（npm 嵌套布局 / pnpm 嵌套 symlink）
 *   3. 在 node_modules/.pnpm 虚拟存储下按 <name>@<version> 目录 glob 兜底
 *
 * 用法：
 *   node scripts/run-package-install.js esbuild vue-demi
 *   node scripts/run-package-install.js --script install.js esbuild
 * 退出码：0 = 全部成功或目标包无需 install 脚本；1 = 任一失败
 */
'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')

function parseArgs(argv) {
  let script = 'install.js'
  const packages = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--script') { script = argv[++i]; continue }
    packages.push(argv[i])
  }
  return { script, packages }
}

/** 从给定起始目录向上解析 name/package.json（穿透 pnpm symlink）。 */
function resolveViaRequire(name, fromDir) {
  try {
    return path.dirname(require.resolve(`${name}/package.json`, { paths: [fromDir] }))
  } catch {
    return null
  }
}

/** 在 node_modules/.pnpm 虚拟存储下按 <name>@<version> 目录查找（全部匹配版本）。 */
function resolveViaVirtualStore(name) {
  const pnpmRoot = path.join(root, 'node_modules', '.pnpm')
  if (!fs.existsSync(pnpmRoot)) return []
  const entries = fs.readdirSync(pnpmRoot).filter((e) => e.startsWith(`${name}@`))
  const dirs = []
  for (const entry of entries) {
    const dir = path.join(pnpmRoot, entry, 'node_modules', name)
    if (fs.existsSync(path.join(dir, 'package.json'))) dirs.push(dir)
  }
  return dirs
}

function resolvePackageDirs(name) {
  const dirs = []
  for (const candidate of [
    resolveViaRequire(name, root),
    resolveViaRequire(name, path.join(root, 'node_modules', '@remotion', 'bundler')),
    resolveViaRequire(name, path.join(root, 'node_modules', 'vue-demi')),
  ]) {
    if (candidate && !dirs.includes(candidate)) dirs.push(candidate)
  }
  for (const dir of resolveViaVirtualStore(name)) {
    if (!dirs.includes(dir)) dirs.push(dir)
  }
  return dirs
}

// 已知风险（评审接受）：node-linker=hoisted 下包目录是 store 硬链接，postinstall 若改写自身文件
// 会写穿共享 store。vue-demi postinstall 幂等且 pnpm allowBuilds 会在每次 install 时重跑并重新链接
// 覆盖，因此此处显式执行（CI --ignore-scripts 场景）是可接受的；esbuild install.js 在有平台二进制时
// 为 no-op。不要在共享 store 上运行会破坏内容的非幂等脚本。
function runInstall(pkgDir, scriptName) {
  const scriptPath = path.join(pkgDir, scriptName)
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'))
  if (!fs.existsSync(scriptPath)) {
    console.log(`[run-package-install] ${pkg.name}@${pkg.version}: 无 ${scriptName}，跳过`)
    return true
  }
  console.log(`[run-package-install] ${pkg.name}@${pkg.version}: 执行 ${scriptPath}`)
  const result = spawnSync(process.execPath, [scriptPath], { cwd: pkgDir, stdio: 'inherit', shell: false })
  if (result.status !== 0) {
    console.error(`[run-package-install] ${pkg.name}: ${scriptName} 失败 exit=${result.status}`)
    return false
  }
  return true
}

function main() {
  const { script, packages } = parseArgs(process.argv.slice(2))
  if (packages.length === 0) {
    console.error('用法: node scripts/run-package-install.js [--script <name>] <pkg>...')
    process.exit(1)
  }
  let ok = true
  for (const name of packages) {
    const dirs = resolvePackageDirs(name)
    if (dirs.length === 0) {
      console.error(`[run-package-install] 找不到包 ${name}（已尝试 require.resolve 与 .pnpm 虚拟存储）`)
      ok = false
      continue
    }
    for (const dir of dirs) {
      if (!runInstall(dir, script)) ok = false
    }
  }
  console.log(ok ? '[run-package-install] 完成' : '[run-package-install] 存在失败')
  process.exit(ok ? 0 : 1)
}

main()
