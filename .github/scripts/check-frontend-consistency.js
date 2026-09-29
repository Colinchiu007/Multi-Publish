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

// 扫描面（scope）：
//   renderer —— 渲染层业务目录 + src 根入口（既有两模式的扫描面，保持不变）
//   allSrc   —— apps/desktop/src/** 全域（含 styles/*.css）；别名回潮门禁需要看到 CSS
const ALL_SRC_EXTS = /\.(css|vue|js|ts)$/

const PATTERNS = {
  windowConfirm: { re: /\bwindow\.confirm\s*\(/, label: '原生 window.confirm（应为 ElMessageBox/confirmDanger）', scope: 'renderer' },
  rendererIpcDirect: { re: /\bwindow\.electronAPI\b/, label: '渲染层直调 window.electronAPI（应走 src/api 桥接层）', scope: 'renderer' },
  appleAlias: {
    re: /var\(\s*--apple-/,
    label: '@deprecated 别名层消费 var(--apple-*)（应改指 tokens.css 权威令牌；ui-apple-token-retirement 只降不升，批次 6 钉 0）',
    scope: 'allSrc',
    // CSS 只有块注释；「注释在前、代码在后」的同一行必须仍被检出（见 stripBlockComments）
    commentStyle: 'blockAware',
  },
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
  // 注意：css 是批次 0 新增的扫描面（appleAlias）；此处只扩展「测试文件」判定到该扩展名，
  // 既有 .js/.ts/.mjs/.cjs 的排除语义保持不变（否则会静默改变既有两模式的计数）。
  if (/\.(test|spec)\.(js|ts|mjs|cjs|css)$/.test(norm)) return true
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

/**
 * apps/desktop/src/** 全域扫描面（含 styles/*.css）。
 * 独立于 listRendererFiles：别名回潮门禁要覆盖 CSS，但既有两模式（window.confirm /
 * window.electronAPI）的判定面必须保持不变 —— 不共用同一遍历器。
 */
function listAllSrcFiles (srcRoot) {
  const out = []
  walk(srcRoot)
  return out

  function walk (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (!ALL_SRC_EXTS.test(entry.name)) continue
      const rel = path.relative(srcRoot, full)
      if (isExcluded(rel)) continue
      out.push({ rel, full })
    }
  }
}

/** 按 pattern.scope 取文件清单（带缓存，避免同一 scope 重复遍历） */
function filesForScope (srcRoot, scope, cache = new Map()) {
  if (cache.has(scope)) return cache.get(scope)
  const files = scope === 'allSrc' ? listAllSrcFiles(srcRoot) : listRendererFiles(srcRoot)
  cache.set(scope, files)
  return files
}

// 注释行（整行 //、/* 前导、JSDoc 的 * 续行、HTML <!-- ）不计违规：
// 注释里的提及不是真实调用；行内尾注释仍计入（保守方向，避免误放行）
function isCommentLine (line) {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('<!--')
}

/**
 * 剥离行内块注释（跨行状态），返回本行剩余代码。
 * 为什么需要：`isCommentLine` 对「以 /* 开头」的整行直接跳过 —— 在 CSS 里
 * `/* 说明 *\/ .a { color: var(--apple-accent) }` 这种「注释在前、代码在后」的
 * 同一行会被整体漏检（批次 0 反证实测踩到）。新增的 allSrc 扫描面（含 CSS）
 * 必须按「去注释后的代码」判定，才能守住回潮门禁。
 * 既有 renderer 面沿用 isCommentLine（不改其判定语义）。
 */
function stripBlockComments (line, state) {
  let out = ''
  let i = 0
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf('*/', i)
      if (end === -1) return out
      state.inBlock = false
      i = end + 2
      continue
    }
    const start = line.indexOf('/*', i)
    if (start === -1) { out += line.slice(i); break }
    out += line.slice(i, start)
    const end = line.indexOf('*/', start + 2)
    if (end === -1) { state.inBlock = true; break }
    i = end + 2
  }
  return out
}

function findViolations (srcRoot) {
  const result = {}
  for (const key of Object.keys(PATTERNS)) result[key] = []
  if (!fs.existsSync(srcRoot)) return result

  // 按**消费点（处）**计数：同一行出现 2 次算 2 处（基线语义是「引用数」，见
  // ui-apple-token-retirement 基线 337/339 处）。既有两模式目前基线为 0，逐次计数
  // 不改变其判定；若将来某行出现两次 `window.electronAPI`，逐次计数只会更准确。
  const globalRes = {}
  for (const [key, { re }] of Object.entries(PATTERNS)) {
    globalRes[key] = re.flags.includes('g') ? new RegExp(re.source, re.flags) : new RegExp(re.source, re.flags + 'g')
  }

  const scopeCache = new Map()
  for (const [key, { scope, commentStyle }] of Object.entries(PATTERNS)) {
    let blockState = { inBlock: false }
    for (const { rel, full } of filesForScope(srcRoot, scope || 'renderer', scopeCache)) {
      const content = fs.readFileSync(full, 'utf8')
      const lines = content.split(/\r?\n/)
      blockState = { inBlock: false } // 每个文件重置块注释状态
      lines.forEach((line, idx) => {
        let target = line
        if (commentStyle === 'blockAware') {
          const isCss = /\.css$/.test(rel)
          if (!isCss && isCommentLine(line)) return // .vue/.js：整行注释约定照旧
          target = stripBlockComments(line, blockState)
          if (!target.trim()) return
          if (!isCss && target.trim().startsWith('//')) return
        } else if (isCommentLine(line)) {
          return
        }
        const re = globalRes[key]
        re.lastIndex = 0
        while (re.exec(target) !== null) {
          result[key].push({ file: `apps/desktop/src/${rel.replace(/\\/g, '/')}`, line: idx + 1 })
          if (re.lastIndex === 0) break // 零宽匹配保护
        }
      })
    }
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

/**
 * 共享基线文件的写入必须**保留他方键**：frontend-consistency-baseline.json 由三个检查
 * 共用（本脚本 windowConfirm/rendererIpcDirect、check-color-literals 的 colorLiterals、
 * check-css-var-defined 的 cssVarUndefined）。若本脚本只写自己的键，另两个门禁读到的基线
 * 会变 undefined → 比较失败 → 误报 FAIL（且掩盖真实基线）。
 * 契约：以旧基线为底、用本次计数覆盖；旧基线里没有的键**不得凭空补 0**（缺失是配置错误，
 * 应由各自门禁的 fail-closed 分支报出来，而不是被悄悄抹平）。
 */
function mergeBaseline (oldCounts, nextCounts) {
  return { ...(oldCounts || {}), ...(nextCounts || {}) }
}

function writeBaseline (counts) {
  const old = readBaseline({ required: false }) || {}
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(mergeBaseline(old, counts), null, 2)}\n`, 'utf8')
}

/**
 * 基线判定（纯函数，便于回归）：
 * - 基线**缺键** → fail-closed（`counts > undefined` 恒 false，会静默放行新增检查项）
 * - 当前计数 > 基线 → 失败（只降不升）
 */
function evaluateBaseline (counts, base) {
  const failures = []
  for (const [key, { label }] of Object.entries(PATTERNS)) {
    const allowed = base[key]
    if (allowed === undefined) {
      failures.push(`${label}: 基线缺少 "${key}" 键（运行 --update-baseline 固定存量；不得静默放行）`)
      continue
    }
    if (counts[key] > allowed) failures.push(`${label}: 当前 ${counts[key]} 处 > 基线 ${allowed} 处`)
  }
  return failures
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
  const failures = evaluateBaseline(counts, base)

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

module.exports = { findViolations, parseArgs, isExcluded, PATTERNS, mergeBaseline, evaluateBaseline, listRendererFiles, listAllSrcFiles }

if (require.main === module) main()
