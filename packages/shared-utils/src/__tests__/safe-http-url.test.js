import { describe, it, expect } from 'vitest'
import * as cjsGuard from '../safe-http-url.js'
import * as esmGuard from '../safe-http-url.browser.js'

/**
 * safe-http-url 判定表 + CJS/ESM 孪生 parity
 *
 * 存在理由（PRD-HREF-SCHEME-GUARD-2026-09-29）：
 * 渲染层把第三方 API 返回的 `url` 字段直绑 `<a :href>`，Vue 3 **不做**任何 URL 净化
 * （Vue 2 的 isUnsafeURL 守卫在 v3 已被移除），而本应用的渲染进程持有 `window.electronAPI`。
 * HN Algolia 的 `d.url` 由提交人完全可控 ⇒ `javascript:` 可直达 href，
 * 用户点击即在应用特权上下文内执行任意 JS。
 *
 * 判据口径：只按**前缀**放行 http/https。不做启发式（不剥控制字符、不看 schema 之外的东西），
 * 因为"清洗后放行"永远比"不产出链接"多一个绕过面。不安全的结果一律 null，由调用点降级为纯文本。
 */

const TABLE = [
  // [输入, 期望]
  ['https://example.com/a?b=1', 'https://example.com/a?b=1'],
  ['http://example.com', 'http://example.com'],
  ['HTTPS://Example.COM', 'HTTPS://Example.COM'],
  ['  https://a.example  ', 'https://a.example'],
  ['https://to_co@example.com', 'https://to_co@example.com'],
  // 攻击面：本 PR 要消灭的东西
  ['javascript:alert(1)', null],
  ['javascript:window.electronAPI.store.set("k","v")', null],
  ['  javascript:alert(1)', null],
  ['JaVaScRiPt:alert(1)', null],
  ['jav&#x61;script:alert(1)', null],
  ['java\tscript:alert(1)', null],
  // 前缀锚定性反例：判据缺 `^` 时这两条会漏（QM-6 后端 Warning-1）
  ['javascript:https://evil.example', null],
  ['xhttps://evil.example', null],
  ['data:text/html;base64,PHNjcmlwdD4=', null],
  ['vbscript:msgbox(1)', null],
  ['file:///C:/Windows/win.ini', null],
  // 协议相对与缺协议：在 file:// 宿主下解析不出合法目标，一律不产出链接
  ['//evil.example/x', null],
  ['example.com/x', null],
  ['https:x', null],
  ['https:/x', null],
  // 非字符串 / 空
  ['', null],
  ['   ', null],
  [null, null],
  [undefined, null],
  [123, null],
  [{ url: 'https://a' }, null],
  [[], null],
  [true, null],
]

describe('safeHttpUrl 判定表', () => {
  it.each(TABLE)('safeHttpUrl(%o) → %o', (input, expected) => {
    expect(cjsGuard.safeHttpUrl(input)).toBe(expected)
  })

  it('返回值必须是去空白后的原串，不得重编码或改写（链接目标必须与来源逐字一致）', () => {
    expect(cjsGuard.safeHttpUrl('  https://a.example/b%20c  ')).toBe('https://a.example/b%20c')
  })

  it('导出形态合同：判定函数与正则常量都在位', () => {
    expect(typeof cjsGuard.safeHttpUrl).toBe('function')
    expect(cjsGuard.HTTP_URL_RE instanceof RegExp).toBe(true)
  })

  it('规模下界：判定表不得退化成空集（空表会让 parity 变成恒真）', () => {
    expect(TABLE.length).toBeGreaterThan(15)
  })
})

describe('CJS/ESM 孪生 parity', () => {
  // 按 source+flags 比较正则，避免两个文件各写一份而语义漂移不报（AGENTS.md 既有口径）
  it('两个孪生的判据正则必须逐字同源', () => {
    expect(esmGuard.HTTP_URL_RE.source).toBe(cjsGuard.HTTP_URL_RE.source)
    expect(esmGuard.HTTP_URL_RE.flags).toBe(cjsGuard.HTTP_URL_RE.flags)
  })

  it('导出集合必须一致（QM-6 Warning-2：只比判据会漏"仅 CJS 侧新增导出"这条生产崩溃路径）', () => {
    // 渲染端 import 的是 ESM 孪生（vite alias），单测因 vitest.config 无该 alias 而解析到 CJS。
    // 于是"CJS 新增了 isSafeScheme 而孪生没补"在单测里完全不可见，生产构建才报 undefined is not a function。
    //
    // CJS 被 ESM 加载时命名空间会多出一个 `default`（实测其值是 `module.exports` 那个对象，
    // 与命名空间包装对象**不是同一个引用**，所以不能用 `ns.default === ns` 判自指）。
    // 判据改用**值等价**：`default` 必须镜像同一组导出（每个键的值都等于命名空间上的同名值），
    // 才认定为加载器产物并剔除；若有人真写了 `export default …`，等价条件不成立 ⇒ 本断言当场变红。
    // 不做无条件 filter('default')，那是把这一类漂移直接藏进断言里。
    function apiKeys (ns) {
      const d = ns.default
      const isInteropDefault = !!d && typeof d === 'object' &&
        Object.keys(ns).filter(k => k !== 'default').every(k => d[k] === ns[k]) &&
        Object.keys(d).every(k => ns[k] === d[k])
      return Object.keys(ns).filter(k => !(k === 'default' && isInteropDefault)).sort()
    }
    expect(apiKeys(esmGuard)).toEqual(apiKeys(cjsGuard))
    // 且两侧都必须真的暴露这两个 API（键集相同但都缺 safeHttpUrl 也算漂移）
    expect(apiKeys(esmGuard)).toEqual(['HTTP_URL_RE', 'safeHttpUrl'])
    // 反证预留：如果哪天 CJS 侧新增导出而孪生没补，上面第一条就会红
    expect(typeof cjsGuard.default === 'object' ? Object.keys(cjsGuard.default).sort() : []).toEqual(['HTTP_URL_RE', 'safeHttpUrl'])
  })

  it.each(TABLE)('孪生对同一输入必须给出同一结论：%o → %o', (input, expected) => {
    expect(esmGuard.safeHttpUrl(input)).toBe(expected)
    expect(esmGuard.safeHttpUrl(input)).toBe(cjsGuard.safeHttpUrl(input))
  })
})
