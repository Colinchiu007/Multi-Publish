#!/usr/bin/env node
/**
 * check-frontend-consistency.js — desktop-ui-consistency 提交门禁（L1）
 *
 * 覆盖 spec：openspec/specs/desktop-ui-consistency
 *   - Requirement「IPC 渲染端访问单轨制」：渲染层禁止直调 window.electronAPI，
 *     统一经 src/api/** 桥接层（白名单目录）。
 *   - Requirement「危险操作确认门禁」场景「确认框实现统一」：禁止原生 window.confirm，
 *     唯一确认原语为 ElMessageBox（及未来的 confirmDanger 封装）。
 *
 * 用法：
 *   node check-frontend-consistency.js                  # 对照基线，存量上涨即失败（exit 1）
 *   node check-frontend-consistency.js --update-baseline # 重新生成基线（任何一项增长时拒绝，除非 --force）
 *   node check-frontend-consistency.js --json            # 输出 JSON 明细（供审查代理消费）
 *
 * 基线语义与 locale-cjk-baseline.json 一致：债务只降不升；
 * 降基线随修复提交入库，涨基线必须 --force 并在 PR 说明。
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const SRC_ROOT = path.join(ROOT, 'apps', 'desktop', 'src')
const BASELINE_FILE = path.join(__dirname, 'frontend-consistency-baseline.json')

// 渲染层业务目录；src/api 是唯一允许接触 window.electronAPI 的桥接层（spec 白名单）
const RENDERER_DIRS = [
  'views', 'components', 'composables', 'stores', 'features',
  'layouts', 'story2video', 'i18n', 'router', 'utils',
]

const PATTERNS = {
  windowConfirm: { re: /\bwindow\.confirm\s*\(/, label: '原生 window.confirm（应为 ElMessageBox/confirmDanger）' },
  rendererIpcDirect: { re: /\bwindow\.electronAPI\b/, label: '渲染层直调 window.electronAPI（应走 src/api 桥接层）' },
}

function parseArgs (args) {
  const opts = { updateBaseline: false, force: false, json: false }
  for (const a of args) {
    if (a === '--update-baseline') opts.updateBaseline = true
    else if (a === '--force') opts.force = true
    else if (a === '--json') opts.json = true
    else throw new Error(`unknown option: ${a}`)
  }
  return opts
}

function isExcluded (relPath) {
  const norm = relPath.replace(/\\/g, '/')
  if (norm.includes('/__tests__/') || norm.includes('/node_modules/')) return true
  if (/\.(test|spec)\.(js|ts|mjs|cjs)$/.test(norm)) return true
  return false
}

function listRendererFiles (srcRoot) {
  const files = []
  // src 根入口文件（App.vue / main.js 等）同样是渲染层组件，必须纳入扫描
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = path.join(srcRoot, entry.name)
    if (entry.isFile() && /\.(vue|js|ts)$/.test(entry.name)) {
      const rel = path.relative(srcRoot, full)
      if (!isExcluded(rel)) files.push({ rel, full })
    }
  }
  for (const dir of RENDERER_DIRS) {
    const absDir = path.join(srcRoot, dir)
    if (!fs.existsSync(absDir)) continue
    walk(absDir)
  }
  return files

  function walk (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!/\.(vue|js|ts)$/.test(entry.name)) continue
      const rel = path.relative(srcRoot, full)
      if (isExcluded(rel)) continue
      files.push({ rel, full })
    }
  }
}

// 注释行（整行 //、/* 前导、JSDoc 的 * 续行、HTML <!-- ）不计违规：
// 注释里的提及不是真实调用；行内尾注释仍计入（保守方向，避免误放行）
function isCommentLine (line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--')
}

function findViolations (srcRoot) {
  const result = {}
  for (const key of Object.keys(PATTERNS)) result[key] = []
  if (!fs.existsSync(srcRoot)) return result

  for (const { rel, full } of listRendererFiles(srcRoot)) {
    const content = fs.readFileSync(full, 'utf8')
    const lines = content.split(/\r?\n/)
    lines.forEach((line, idx) => {
      if (isCommentLine(line)) return
      for (const [key, { re }] of Object.entries(PATTERNS)) {
        if (re.test(line)) result[key].push({ file: `apps/desktop/src/${rel.replace(/\\/g, '/')}`, line: idx + 1 })
      }
    })
  }
  return result
}

function readBaseline ({ required = true } = {}) {
  if (!fs.existsSync(BASELINE_FILE)) {
    if (!required) return null
    // fail-closed：校验模式下基线缺失视为配置错误，不允许静默放行
    console.error(`[frontend-consistency] FAIL: 基线文件缺失: ${BASELINE_FILE}（运行 --update-baseline 生成并随提交入库）`)
    process.exit(1)
  }
  return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'))
}

function writeBaseline (counts) {
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(counts, null, 2)}\n`, 'utf8')
}

function main () {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
  const violations = findViolations(SRC_ROOT)
  const counts = {}
  for (const key of Object.keys(PATTERNS)) counts[key] = violations[key].length

  if (opts.updateBaseline) {
    const old = readBaseline({ required: false }) || {}
    const increased = Object.keys(counts).filter(k => counts[k] > (old[k] ?? 0))
    if (increased.length && !opts.force) {
      console.error(`[frontend-consistency] 拒绝更新基线：${increased.join(', ')} 存量增长（如确需增长请加 --force 并在 PR 说明）`)
      process.exit(1)
    }
    writeBaseline(counts)
    console.log(`[frontend-consistency] 基线已更新: ${JSON.stringify(counts)}`)
    return
  }

  const base = readBaseline()
  const failures = []
  for (const [key, { label }] of Object.entries(PATTERNS)) {
    if (counts[key] > base[key]) {
      failures.push(`${label}: 当前 ${counts[key]} 处 > 基线 ${base[key]} 处`)
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ counts, baseline: base, ok: failures.length === 0, violations }, null, 2))
  } else {
    for (const [key, { label }] of Object.entries(PATTERNS)) {
      console.log(`[frontend-consistency] ${key}: ${counts[key]} / 基线 ${base[key] ?? '∞'}`)
    }
    for (const key of Object.keys(PATTERNS)) {
      for (const v of violations[key]) console.log(`  - ${v.file}:${v.line}`)
    }
  }

  if (failures.length) {
    console.error('[frontend-consistency] FAIL\n  ' + failures.join('\n  '))
    process.exit(1)
  }
  if (!opts.json) console.log('[frontend-consistency] PASS')
}

module.exports = { findViolations, parseArgs, isExcluded, PATTERNS }

if (require.main === module) main()
