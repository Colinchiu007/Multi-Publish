#!/usr/bin/env node
/**
 * check-renderer-cjs-boundary.js — 渲染进程跨包导入边界门禁
 *
 * 判据：apps/desktop/src（渲染层，浏览器环境）里凡 import
 * `@multi-publish/shared-utils/src/<mod>` 的，必须满足二者之一：
 *   A. `<mod>` 已在 apps/desktop/vite.config.js 的 resolve.alias 登记（指向 *.browser.js ESM 孪生）；
 *   B. `<mod>` 是 .json（数据文件，浏览器可直接 import）。
 * 否则该模块是 CommonJS，浏览器无法执行 —— vite dev server 会在**运行时**抛
 * "does not provide an export named ..."，整页渲染失败。
 *
 * 为什么需要这个门禁（事故背景，2026-10-07 / PR #3011）：
 *   渲染层曾直接具名 import CommonJS 的 platform-schedule-capability.js。
 *   这类越界在本地与 CI 早期全是绿的 ——
 *     · `vite build` 绿：rollup 的 commonjs 插件在构建期做了 interop；
 *     · vitest 绿：vite-node 自带 CJS interop；
 *     · `tsc --noEmit` 绿：JS 文件不做模块形态检查；
 *     · electron-builder 打包绿：asar 里塞的就是 CJS，主进程用 require 没问题。
 *   **只有跑 dev server 的视觉回归会红**，而报错形态是「页面渲染失败」+ 一条
 *   ESM 具名导出错误，指向渲染层的路由组件，与「某个平台不支持定时」毫无关系，
 *   排查成本极高（本次靠 CI 产物的像素差异图才拿到直接证据）。
 *
 * 所以门禁必须**静态**判：只要是 CommonJS 跨边界且没登记，就红。
 *
 * 用法：node scripts/check-renderer-cjs-boundary.js [--json]
 * 退出码：0 = 通过；1 = 存在未登记的跨边界导入；2 = 门禁自身故障（fail-closed）
 */
'use strict'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const RENDERER_DIR = path.join(ROOT, 'apps', 'desktop', 'src')
const VITE_CONFIG = path.join(ROOT, 'apps', 'desktop', 'vite.config.js')
const SHARED_PREFIX = '@multi-publish/shared-utils/src/'

/** 不扫描：测试自身、locales（纯数据装配） */
function shouldScan (file) {
  const base = path.basename(file)
  if (base.endsWith('.test.js') || base.endsWith('.spec.js')) return false
  if (file.includes(`${path.sep}__tests__${path.sep}`)) return false
  const rel = path.relative(RENDERER_DIR, file).split(path.sep).join('/')
  if (rel.startsWith('locales/')) return false
  return /\.(js|vue)$/.test(file)
}

function walk (dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

/** 从 vite.config.js 里解析 alias 表：'specifier': '...path...' */
function readAliases (source) {
  const aliases = new Set()
  const re = /['"](@multi-publish\/shared-utils\/src\/[^'"]+)['"]\s*:\s*[^,\n]+/g
  let m
  while ((m = re.exec(source)) !== null) aliases.add(m[1])
  return aliases
}

/** 收集渲染层源码里对 shared-utils 的导入 specifier（含 .vue 的 <script>） */
function collectImports (file) {
  let src = fs.readFileSync(file, 'utf8')
  if (file.endsWith('.vue')) {
    // 只取 <script> 块（模板里的字符串不是模块导入）
    src = (src.match(/<script[^>]*>([\s\S]*?)<\/script>/g) || []).join('\n')
  }
  const specs = []
  const re = new RegExp(`(?:import[\\s\\S]*?from|import|require)\\s*\\(?\\s*['"\`](${SHARED_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^'"\`]+)['"\`]`, 'g')
  let m
  while ((m = re.exec(src)) !== null) specs.push(m[1])
  return specs
}

function main () {
  const asJson = process.argv.includes('--json')

  if (!fs.existsSync(RENDERER_DIR)) {
    console.error('[renderer-cjs-boundary] FAIL：找不到渲染层目录 ' + RENDERER_DIR)
    return 2
  }
  if (!fs.existsSync(VITE_CONFIG)) {
    console.error('[renderer-cjs-boundary] FAIL：找不到 vite.config.js，无法判定 alias 登记')
    return 2
  }

  const aliases = readAliases(fs.readFileSync(VITE_CONFIG, 'utf8'))
  const violations = []
  let scanned = 0

  for (const file of walk(RENDERER_DIR)) {
    if (!shouldScan(file)) continue
    scanned += 1
    for (const spec of collectImports(file)) {
      if (spec.endsWith('.json')) continue                      // 规则 B
      if (aliases.has(spec)) continue                           // 规则 A
      violations.push({
        file: path.relative(ROOT, file).split(path.sep).join('/'),
        spec
      })
    }
  }

  if (asJson) {
    console.log(JSON.stringify({ scanned, aliases: [...aliases], violations }, null, 2))
    return violations.length ? 1 : 0
  }

  if (violations.length > 0) {
    console.error(`[renderer-cjs-boundary] FAIL：渲染层有 ${violations.length} 处未登记的 CommonJS 跨边界导入（已扫 ${scanned} 个文件）`)
    for (const v of violations) {
      console.error(`  ${v.file}  ->  ${v.spec}`)
    }
    console.error('[renderer-cjs-boundary] 修法二选一：')
    console.error('[renderer-cjs-boundary]   A) 建 packages/shared-utils/src/<mod>.browser.js ESM 孪生，并在 apps/desktop/vite.config.js 的 resolve.alias 登记')
    console.error('[renderer-cjs-boundary]      （孪生的函数层漂移由 __tests__ 下的 parity 回归拦截）')
    console.error('[renderer-cjs-boundary]   B) 若该模块只是数据，改为导入同名 .json，浏览器可直接消费')
    return 1
  }

  console.log(`[renderer-cjs-boundary] PASS（已扫 ${scanned} 个渲染层文件，alias 登记 ${aliases.size} 项，无未登记的 CJS 跨边界导入）`)
  return 0
}

process.exit(main())