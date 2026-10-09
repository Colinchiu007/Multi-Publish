/**
 * locales 命名空间迁移脚本（拆分方案 v3 §3.3，一次性工具）
 * 用法：node scripts/migrate-locale-namespace.cjs <ns> [<ns>...] [--workdir <path>]
 * 行为：把 zh.js / en.js 顶层命名空间 <ns> 的对象体抽到 locales/<kebab>/{zh,en}.js，
 *       并在装配文件原位置改写为展开引用（zh: ...xxxZh / en: ...xxxEn）。
 * 安全：① zh/en 必须同时迁移；② 抽取失败（找不到命名空间）即整体中止；③ 改写后做键数对账。
 */
const fs = require('node:fs')
const path = require('node:path')

const args = process.argv.slice(2)
const wIdx = args.indexOf('--workdir')
const workdir = wIdx >= 0 ? args[wIdx + 1] : process.cwd()
const namespaces = args.filter((a, i) => !a.startsWith('--') && (wIdx < 0 || (i !== wIdx && i !== wIdx + 1)))
if (namespaces.length === 0) {
  console.error('usage: node migrate-locale-namespace.cjs <ns>... [--workdir <path>]')
  process.exit(1)
}

const localeDir = path.join(workdir, 'apps/desktop/src/locales')

function kebab(ns) { return ns.replace(/([A-Z])/g, (m) => '-' + m.toLowerCase()) }
function camel(dir) { return dir.replace(/-([a-z])/g, (_, c) => c.toUpperCase()) }
function varName(ns, lang) { return camel(kebab(ns)) + (lang === 'zh' ? 'Zh' : 'En') }

/** 提取顶层命名空间对象体（含首尾 `  ns: {` 到匹配的 `  },`），返回 {full, body, start, end} */
function extractNamespace(src, ns) {
  const headRe = new RegExp(`^  ${ns}: \\{`, 'm')
  const head = headRe.exec(src)
  if (!head) return null
  let i = head.index
  let depth = 0
  let begun = false
  let end = -1
  for (let j = i; j < src.length; j++) {
    const ch = src[j]
    if (ch === '{') { depth++; begun = true }
    else if (ch === '}') {
      depth--
      if (begun && depth === 0) { end = j; break }
    }
  }
  if (end < 0) return null
  // 对象体 = 从 `  ns: {` 之后到匹配的 `}` 之前（不含尾逗号）
  const openBrace = src.indexOf('{', i)
  const body = src.slice(openBrace + 1, end)
  // full = 包含 `  ns: {` 行起始到 `}` 及可能的后随逗号与换行
  let fullEnd = end + 1
  if (src[fullEnd] === ',') fullEnd++
  return { body, start: i, end: fullEnd, full: src.slice(i, fullEnd) }
}

function countTopKeys(body) {
  let n = 0
  for (const line of body.split('\n')) if (/^ {4}\w+:/.test(line)) n++
  return n
}

const results = []
for (const ns of namespaces) {
  const dir = kebab(ns)
  const outDir = path.join(localeDir, dir)
  for (const lang of ['zh', 'en']) {
    const asmFile = path.join(localeDir, `${lang}.js`)
    const src = fs.readFileSync(asmFile, 'utf8')
    const ext = extractNamespace(src, ns)
    if (!ext) { console.error(`FAIL: ${lang}.js 找不到命名空间 ${ns}`); process.exit(1) }
    const keyCount = countTopKeys(ext.body)
    // 顶层键数 < 5 告警（PR3 实测坑：create 域 360 行只有 story2video/history 两个子对象，
    // 键数口径对非对象键域失真，但 <5 必是大对象域，提示人工确认而非继续盲迁）
    if (keyCount < 5) console.warn(`WARN: ${ns} (${lang}) 仅 ${keyCount} 个顶层键——若是巨型对象域（如 create），属正常；否则请人工核对抽取边界`)
    // 嵌套展开检测（PR2 实测坑：memberCenter 域内含 ...identityDiagnosticsZh，直接搬运会丢 import → Gate 7 解析失败）
    const nestedSpreads = [...ext.body.matchAll(/\.\.\.(\w+)/g)].map((m) => m[1])
    if (nestedSpreads.length > 0) {
      console.error(`FAIL: ${ns} (${lang}) 含嵌套展开 ${nestedSpreads.join(',')}，迁移脚本不处理跨域引用——请先手工补 import 或调整迁移批次`)
      process.exit(1)
    }
    // 写域子模块
    fs.mkdirSync(outDir, { recursive: true })
    const moduleSrc = `/**\n * ${ns} 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）\n * 从 locales/${lang}.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。\n */\nexport default {${ext.body}}\n`
    fs.writeFileSync(path.join(outDir, `${lang}.js`), moduleSrc, 'utf8')
    // 改写装配文件：原位置替换为展开引用
    const vn = varName(ns, lang)
    const replaced = src.slice(0, ext.start) + `  ${ns}: { ...${vn} },` + src.slice(ext.end)
    // import 行插入到现有 import 块末尾
    const importLine = `import ${vn} from './${dir}/${lang}'\n`
    const lastImportIdx = replaced.lastIndexOf('\nimport ')
    const insertAt = replaced.indexOf('\n', lastImportIdx + 1) + 1
    const finalSrc = replaced.slice(0, insertAt) + importLine + replaced.slice(insertAt)
    fs.writeFileSync(asmFile, finalSrc, 'utf8')
    results.push({ ns, lang, dir, keyCount })
  }
}

// 对账：zh/en 同域键数一致
for (let i = 0; i < results.length; i += 2) {
  const zh = results[i]
  const en = results[i + 1]
  if (zh.keyCount !== en.keyCount) {
    console.error(`FAIL: ${zh.ns} 键数不对称 zh=${zh.keyCount} en=${en.keyCount}`)
    process.exit(1)
  }
}
console.log(JSON.stringify(results.map(({ ns, lang, dir, keyCount }) => `${lang}:${dir}(${keyCount})`).join(' '), null, 0))
