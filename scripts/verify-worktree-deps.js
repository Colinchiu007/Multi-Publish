#!/usr/bin/env node
// @ts-check
/**
 * verify-worktree-deps.js — worktree 依赖解析门禁
 *
 * 1. 对每个消费方（根 + 各 workspace），用 require.resolve 解析其
 *    dependencies/devDependencies 中声明的 @multi-publish/* 包，断言解析结果
 *    的 realpath 落在当前 worktree 内（pnpm workspace 链接自动指向本 worktree）。
 * 2. 扫描现有 node_modules/@multi-publish 链接（根 + 各 workspace），断言没有
 *    指向主仓库/其他 worktree 的 junction/symlink（双模块实例）。
 *
 * 说明：pnpm（node-linker=hoisted）只为被消费的 workspace 包建立链接，未被
 * 任何包依赖的 workspace（如 @multi-publish/desktop 自身）不要求链接存在。
 *
 * 用法：node scripts/verify-worktree-deps.js [--strict]
 * 退出码：0 = 全部通过；1 = 存在失败项
 */
'use strict'
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const { execFileSync } = require('child_process')

/** 从 git worktree list 派生主仓库路径（首个条目，供错误提示判定"疑似指向主仓库"）。 */
function mainRepoPath() {
  try {
    const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' })
    const first = out.split('\n').find((l) => l.startsWith('worktree '))
    if (first) return first.slice('worktree '.length).trim()
  } catch {}
  return null
}
const mainRepo = mainRepoPath()

/** canonical 解析：失败时返回 null（用于必须真实解析的场景）。 */
function canonicalStrict(p) {
  try {
    return fs.realpathSync.native(p)
  } catch {
    return null
  }
}
function canonical(p) {
  return canonicalStrict(p) || path.resolve(p)
}

function workspaceDirs() {
  const dirs = []
  for (const base of ['apps', 'packages']) {
    const baseDir = path.join(root, base)
    if (!fs.existsSync(baseDir)) continue
    for (const name of fs.readdirSync(baseDir)) {
      const dir = path.join(baseDir, name)
      if (fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'package.json'))) dirs.push(dir)
    }
  }
  return dirs
}

function readDeps(pkg) {
  return Object.assign({}, pkg.dependencies, pkg.devDependencies)
}

function main() {
  const strict = process.argv.includes('--strict')
  const rootCanon = canonical(root)
  const failures = []
  const consumed = new Set()
  const checkers = [root, ...workspaceDirs()]
  const workspaceByName = new Map()
  for (const dir of workspaceDirs()) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    if (pkg.name && pkg.name.startsWith('@multi-publish/')) workspaceByName.set(pkg.name, dir)
  }

  // 1. 消费方解析校验
  let resolveCount = 0
  for (const dir of checkers) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    for (const [depName, version] of Object.entries(readDeps(pkg))) {
      if (!depName.startsWith('@multi-publish/')) continue
      const workspaceDir = workspaceByName.get(depName)
      if (!workspaceDir) continue // 非 workspace 的 @multi-publish 包（不应存在）跳过
      consumed.add(depName)
      let resolved
      try {
        // 解析包主入口（部分包 exports 字段不导出 ./package.json，故不能解析子路径）
        resolved = require.resolve(depName, { paths: [dir] })
      } catch {
        failures.push(`${depName}: 从 ${path.relative(root, dir)} 解析失败（缺链接或未安装）`)
        continue
      }
      const resolvedCanon = canonical(resolved)
      const expectedCanon = canonical(workspaceDir)
      if (!resolvedCanon.startsWith(expectedCanon + path.sep)) {
        failures.push(
          `${depName}: 从 ${path.relative(root, dir)} 解析到 ${resolvedCanon}（应为 ${expectedCanon}）` +
            (resolvedCanon.startsWith(canonical(mainRepo)) ? ' — 疑似指向主仓库（junction 双实例）' : '')
        )
      } else {
        resolveCount++
      }
    }
  }

  // 2. 现有链接扫描（防 junction 指向外部 / 悬挂链接）
  for (const base of checkers) {
    const scopeDir = path.join(base, 'node_modules', '@multi-publish')
    if (!fs.existsSync(scopeDir)) continue
    for (const entry of fs.readdirSync(scopeDir)) {
      const link = path.join(scopeDir, entry)
      const targetCanon = canonicalStrict(link)
      if (targetCanon === null) {
        failures.push(`${entry}（${link}）: 悬挂链接（目标不存在或无法解析 realpath）`)
        continue
      }
      if (!targetCanon.startsWith(rootCanon + path.sep)) {
        failures.push(`${entry}（${link}）-> ${targetCanon}（不在当前 worktree 内）`)
      }
    }
  }

  console.log(`[verify-worktree-deps] worktree: ${root}`)
  console.log(`[verify-worktree-deps] 消费方解析通过 ${resolveCount} 项; 被消费 workspace: ${[...consumed].join(', ') || '(无)'}`)
  if (strict && consumed.size === 0) {
    console.error('[verify-worktree-deps] --strict 且无任何被消费 workspace')
    process.exit(1)
  }
  if (failures.length > 0) {
    console.error('[verify-worktree-deps] 失败：')
    for (const f of failures) console.error('  - ' + f)
    console.error('[verify-worktree-deps] 修复：移除 node_modules 后执行 pnpm install（整目录 Junction 已废弃）')
    process.exit(1)
  }
  console.log('[verify-worktree-deps] OK')
  process.exit(0)
}

main()
