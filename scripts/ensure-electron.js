#!/usr/bin/env node
// @ts-check
/**
 * ensure-electron.js — 确保 electron 二进制就绪（方案 B，不接入 npm postinstall）
 *
 * 背景：electron@43.x 的 npm 包不再声明 `postinstall: node install.js`（31~41 都有），
 * 因此 `npm install` 重装 electron 后 `dist/` 不会被自动下载。本脚本按需显式触发
 * electron 自带的 install.js（优先走本地 @electron/get 缓存，秒级完成）。
 *
 * 用法：
 *   node scripts/ensure-electron.js
 *   ELECTRON_SKIP_BINARY_DOWNLOAD=1 node scripts/ensure-electron.js   # 显式跳过
 *
 * 退出码：0 = 已就绪 / 已跳过 / 修复成功；1 = 缺失且修复失败
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const electronDir = path.join(root, 'node_modules', 'electron')

function isDistComplete () {
  const exe = process.platform === 'win32' ? 'electron.exe' : 'electron'
  return (
    fs.existsSync(path.join(electronDir, 'dist', exe)) &&
    fs.existsSync(path.join(electronDir, 'dist', 'version')) &&
    fs.existsSync(path.join(electronDir, 'path.txt'))
  )
}

function main () {
  if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD === '1') {
    console.log('[ensure-electron] skipped by ELECTRON_SKIP_BINARY_DOWNLOAD=1')
    process.exit(0)
  }
  if (!fs.existsSync(path.join(electronDir, 'package.json'))) {
    console.error('[ensure-electron] electron 包不存在：' + electronDir + '（请先 pnpm install）')
    process.exit(1)
  }
  if (isDistComplete()) {
    console.log('[ensure-electron] electron dist 已就绪，跳过')
    process.exit(0)
  }

  console.log('[ensure-electron] electron dist 缺失，执行 install.js ...')
  const result = spawnSync(process.execPath, [path.join(electronDir, 'install.js')], {
    cwd: electronDir,
    stdio: 'inherit',
    shell: false,
  })
  if (result.status !== 0) {
    console.error('[ensure-electron] install.js 执行失败，exit=' + result.status)
    process.exit(result.status === null ? 1 : result.status)
  }
  if (!isDistComplete()) {
    console.error('[ensure-electron] install.js 执行后 dist 仍不完整')
    process.exit(1)
  }
  const version = fs.readFileSync(path.join(electronDir, 'dist', 'version'), 'utf8').trim()
  console.log('[ensure-electron] electron dist 已就绪：v' + version)
}

main()
