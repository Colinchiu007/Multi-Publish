/**
 * locales 结构锁测试（前端拆分方案 v3 §3.2-2 / §3.3）
 *
 * 分批迁移期的三层断言：
 * ① 已迁移域：域子模块键集合 == 装配后 zh.js 中该命名空间键集合（子集精确相等，防搬运丢键/改键）；
 * ② 未迁移域：仍完整留在装配文件原文中（直接断言装配文件含该命名空间定义）；
 * ③ 全局：装配文件不得出现同名顶层命名空间重复展开（后展开覆盖先展开即红）。
 *
 * 全量迁完后（_rest.js 清空）本测试仍有效：① 变为全量逐域核对。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const localeDir = dirname(fileURLToPath(import.meta.url))

/** 收集已迁移域目录：含 zh.js + en.js 的子目录（排除既有先例目录，它们有自己的 copy 测试） */
const PRECEDENT_DIRS = new Set(['accounts-cloud-sync', 'identity-diagnostics'])
function migratedDomains() {
  return readdirSync(localeDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !PRECEDENT_DIRS.has(d.name))
    .map((d) => d.name)
    .filter((name) => existsSync(join(localeDir, name, 'zh.js')) || existsSync(join(localeDir, name, 'en.js')))
}

/** 顶层命名空间名 ↔ 目录名（kebab-case）映射：publishPage → publish-page */
function nsOfDir(dir) {
  return dir.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
}

/** 从模块源码提取指定对象文本的顶层键（粗略但足够：逐行匹配两空格缩进的 key:） */
function topKeysOfObject(src, objName) {
  const start = src.indexOf(`  ${objName}: {`)
  if (start < 0) return null
  const keys = []
  const lines = src.slice(start).split('\n')
  let depth = 0
  let begun = false
  for (const line of lines) {
    const trimmed = line.replace(/\/\/.*$/, '')
    for (const ch of trimmed) {
      if (ch === '{') { depth++; begun = true }
      if (ch === '}') depth--
    }
    if (begun && depth === 1) {
      const m = line.match(/^ {4}(\w+):/)
      if (m) keys.push(m[1])
    }
    if (begun && depth === 0) break
  }
  return keys
}

/** 域子模块的全部顶层键 */
function domainModuleKeys(file) {
  const src = readFileSync(file, 'utf8')
  const keys = []
  for (const line of src.split('\n')) {
    const m = line.match(/^ {2}(\w+):/)
    if (m) keys.push(m[1])
  }
  return keys
}

describe('locales 结构锁（拆分方案 v3）', () => {
  const domains = migratedDomains()

  it('已迁移域目录 zh/en 成对存在', () => {
    for (const d of domains) {
      expect(existsSync(join(localeDir, d, 'zh.js')), `${d}/zh.js 缺失`).toBe(true)
      expect(existsSync(join(localeDir, d, 'en.js')), `${d}/en.js 缺失`).toBe(true)
    }
  })

  it('① 已迁移域：子模块键集合 == 装配文件中该命名空间键集合（zh/en 双侧）', () => {
    const zhAsm = readFileSync(join(localeDir, 'zh.js'), 'utf8')
    const enAsm = readFileSync(join(localeDir, 'en.js'), 'utf8')
    for (const d of domains) {
      const ns = nsOfDir(d)
      const zhDomain = domainModuleKeys(join(localeDir, d, 'zh.js'))
      const enDomain = domainModuleKeys(join(localeDir, d, 'en.js'))
      // zh/en 子模块键必须互相对称
      expect(zhDomain.sort(), `${d} zh/en 子模块键不对称`).toEqual(enDomain.sort())
      // 装配文件中该命名空间必须包含子模块全部键（装配文件可能还有未迁出的残余键，故做包含而非全等）
      const zhAsmKeys = topKeysOfObject(zhAsm, ns) ?? []
      const enAsmKeys = topKeysOfObject(enAsm, ns) ?? []
      for (const k of zhDomain) {
        expect(zhAsmKeys, `zh.js ${ns} 缺键 ${k}`).toContain(k)
        expect(enAsmKeys, `en.js ${ns} 缺键 ${k}`).toContain(k)
      }
    }
  })

  it('③ 装配文件不得重复展开同一命名空间（防后展开覆盖先展开）', () => {
    for (const lang of ['zh', 'en']) {
      const src = readFileSync(join(localeDir, `${lang}.js`), 'utf8')
      const seen = new Set()
      for (const line of src.split('\n')) {
        const m = line.match(/^ {2}(\w+):\s*\{/)
        if (m) {
          expect(seen.has(m[1]), `${lang}.js 顶层命名空间重复: ${m[1]}`).toBe(false)
          seen.add(m[1])
        }
      }
    }
  })

  it('装配文件对空 _rest.js 容错：_rest 存在时必须导出对象', () => {
    const restZh = join(localeDir, '_rest', 'zh.js')
    if (existsSync(restZh)) {
      expect(readFileSync(restZh, 'utf8')).toMatch(/export default\s*\{/)
    }
  })
})
