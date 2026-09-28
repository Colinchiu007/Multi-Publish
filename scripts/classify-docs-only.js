// docs-only 判定单一真源（change: docs-only-ci-shortcircuit）
//
// 三个消费方共用本模块，禁止出现第二份判定实现：
//   1. CI changes job（quality-gate / electron-ci / build 的 job 级短路判定）
//   2. workflow-contract.test.js（import CI_IGNORED_PATHS 断言 push paths-ignore 同源）
//   3. 本地质量节拍 docs-only 快速通道（AGENTS.md）
//
// 匹配语义（fail-closed，与 GitHub paths 文档字面语义对齐）：
//   * `dir/**`  => 路径以 `dir/` 开头（任意深度）
//   * `*.md`    => 仅根目录 .md（GitHub 文档：'*.{js,py}' matches files in the root
//                  directory）；子目录 .md 必须由显式 `dir/**` 条目覆盖
//   * 字面量    => 路径全等
//   * 其他形态  => 不命中（宁可全量，不可漏跑）
//
// 判定语义：当且仅当文件清单非空且全部命中白名单时 docs-only=true；
// 空清单 / 非数组 / 任一未命中 => false（fail-closed）。
//
// CLI：
//   node scripts/classify-docs-only.js --base=<ref> [--head=<ref>] [--repo=<dir>]
// 输出（stdout，供人工审计）：
//   docs-only=true|false
//   files=<N>
//   <file>（每行一个）
// 环境变量 GITHUB_OUTPUT 存在时追加 `docs-only=<bool>`。
// git 失败（ref 不存在等）=> 非零退出，让 changes job 红、gate-result 拦截。

'use strict'

const { execFileSync } = require('node:child_process')

// 与三个全量 workflow 的 push.paths-ignore 保持逐项一致（真源在此，
// workflow-contract.test.js 从这里 import 并断言一致）。
const CI_IGNORED_PATHS = [
  '01-docs/**',
  'docs/**',
  '*.md',
  'LICENSE',
  '.gitignore',
  '.editorconfig',
  '.ccg/**',
  '.claude/**',
  '.hermes/**',
  '.agents/**',
  'openspec/**',
]

function matchesPattern(filePath, pattern) {
  if (pattern.endsWith('/**')) {
    const dir = pattern.slice(0, -3) // '01-docs/**' -> '01-docs'
    return filePath.startsWith(dir + '/')
  }
  if (pattern === '*.md') {
    return !filePath.includes('/') && filePath.endsWith('.md')
  }
  return filePath === pattern
}

function isDocsOnly(files) {
  if (!Array.isArray(files) || files.length === 0) return false
  return files.every((f) =>
    typeof f === 'string' && CI_IGNORED_PATHS.some((p) => matchesPattern(f, p)),
  )
}

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' })
}

function parseArgs(argv) {
  const out = {}
  for (const arg of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(arg)
    if (m) out[m[1]] = m[2]
    else if (arg.startsWith('--')) out[arg.slice(2)] = true
  }
  return out
}

function main(argv) {
  const args = parseArgs(argv)
  const repo = args.repo || process.cwd()
  const base = args.base
  const head = args.head || 'HEAD'
  if (!base) {
    process.stderr.write('用法: node classify-docs-only.js --base=<ref> [--head=<ref>] [--repo=<dir>]\n')
    process.exit(2)
  }

  let mergeBase
  let diffRaw
  try {
    // PR base 可能落后于 main：用 merge-base 防漏检（与 build.yml package-relevant 同模式）
    mergeBase = git(repo, ['merge-base', base, head]).trim()
    diffRaw = git(repo, ['diff', '--name-only', '-z', mergeBase, head])
  } catch (e) {
    process.stderr.write(`[classify-docs-only] git 取证失败: ${String(e.message || e)}\n`)
    process.exit(1)
  }

  const files = diffRaw.split('\0').filter((f) => f.length > 0)
  const docsOnly = isDocsOnly(files)

  const lines = [`docs-only=${docsOnly}`, `files=${files.length}`, ...files]
  process.stdout.write(lines.join('\n') + '\n')

  if (process.env.GITHUB_OUTPUT) {
    require('node:fs').appendFileSync(
      process.env.GITHUB_OUTPUT,
      `docs-only=${docsOnly}\n`,
      'utf8',
    )
  }
  process.exit(0)
}

module.exports = { CI_IGNORED_PATHS, isDocsOnly, matchesPattern }

if (require.main === module) {
  main(process.argv.slice(2))
}
