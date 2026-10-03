/**
 * ep-theme.css 浅色可解析性合同（主按钮 hover 隐形 Bug 的回归锁，2026-09-29）
 *
 * 根因：EP 把主按钮 hover 档写在 --el-color-primary-light-3、禁用/描边档写在 -light-5，
 * 本桥接层曾把它们指向 --color-primary-dark-tint —— 而该 token 只在 [data-theme="dark"] 定义。
 * 浅色下无兜底的 var() 是 guaranteed-invalid，依赖它的声明按「invalid at computed-value time」
 * 退化为 initial：background 变透明、border 变 currentColor，而文字仍是 --el-color-white，
 * 于是「设为默认」弹窗的【确定】按钮一 hover 就整块隐形（Chromium 实测 bg=rgba(0,0,0,0)）。
 *
 * 现有 sidebar.tokens.test.js 把 :root 与 [data-theme="dark"] 合并后只判「token 是否存在」，
 * 对「只在暗色定义的 token 被浅色层消费」这一形态完全免疫 —— 本锁按主题分别求解补齐。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const epThemeCss = read('./ep-theme.css')
const tokensCss = read('./tokens.css')

/** 取某作用域内的变量声明表：scope='root' 取 :root，'dark' 取 [data-theme="dark"] */
function varTable (source, scope) {
  const anchor = scope === 'dark' ? /\[data-theme="dark"\]\s*\{/ : /:root\s*\{/
  const match = anchor.exec(source)
  if (!match) throw new Error(`未找到 ${scope} 作用域，解析已退化`)
  const rest = source.slice(match.index + match[0].length)
  const body = rest.slice(0, rest.indexOf('\n}'))
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )
}

/** 按 CSS 语义在某主题内求解 var() 链；解不出返回 null（等价 invalid at computed-value time） */
function resolve (expr, vars) {
  const m = /^\s*var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+?)\s*)?\)\s*$/.exec(expr)
  if (!m) return expr.trim()
  const [, name, fallback] = m
  if (vars[name] !== undefined) return resolve(vars[name], vars)
  return fallback === undefined ? null : resolve(fallback, vars)
}

const lightTokens = varTable(tokensCss, 'root')
const darkTokens = { ...lightTokens, ...varTable(tokensCss, 'dark') }
const bridge = varTable(epThemeCss, 'root')
const lightVars = { ...lightTokens, ...bridge }
const darkVars = { ...darkTokens, ...bridge }

const PRIMARY_RAMP = ['--el-color-primary-light-3', '--el-color-primary-light-5']

describe('ep-theme.css 浅色可解析性合同', () => {
  it('每个无兜底的 var() 引用都能在浅色单独解析', () => {
    const noFallback = [...new Set([...epThemeCss.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]))]
    expect(noFallback.length).toBeGreaterThan(10)
    // 可解析域 = tokens.css 的浅色表 + 本文件 :root 桥接层自身。只比 tokens 表会把
    // 「引用本文件自己声明的 EP 变量」误判成不可解析（实测由 M1 反证暴露）。
    expect(noFallback.filter((name) => lightVars[name] === undefined)).toEqual([])
  })

  it('主按钮 hover / 禁用档在浅色可解析，且与常态主色区分', () => {
    const base = lightTokens['--color-primary']
    for (const name of PRIMARY_RAMP) {
      const resolved = resolve(bridge[name], lightVars)
      expect(resolved, name).toBe(lightTokens['--color-primary-hover'])
      expect(resolved, name).not.toBe(base)
    }
  })

  it('暗色档仍解析为 --color-primary-dark-tint（不得为修浅色连带改掉暗色）', () => {
    expect(darkTokens['--color-primary-dark-tint']).toBe('#7b74ff')
    for (const name of PRIMARY_RAMP) {
      expect(resolve(bridge[name], darkVars), name).toBe('#7b74ff')
    }
  })

  it('--el-fill-color 不再桥接到全仓无定义的 --color-bg-hover', () => {
    expect(resolve(bridge['--el-fill-color'], lightVars)).toBe(lightTokens['--color-bg-inset'])
  })
})

/**
 * 主按钮「禁用态」合同（2026-10-02）
 *
 * EP 把禁用档写在**元素作用域**上：`.el-button--primary { --el-button-disabled-bg-color:
 * var(--el-color-primary-light-5) }`。因此本文件 :root 里的 --el-disabled-bg-color 对它无效
 * （元素自带声明优先于继承），必须用同名选择器在同档作用域改写。
 *
 * 未改写前的症状与 hover 修复同源：light-5 现兜底为饱和主色 --color-primary-hover，
 * 于是「禁用」与「可点/悬停」是同一块紫色 —— 禁用态看起来完全可用，用户会去点它。
 * 禁用态的语义是**降格**（中性底 + 弱化描边 + 弱化文字），不是换一种彩色。
 *
 * 第三档必须同时改：只淡化底、留 --el-color-white 当禁用文字，就会在浅色中性底上
 * 复现刚修掉的那类隐形（白字白底）。故这里用实测对比度兜住，而不是只断言"变量存在"。
 */
const PRIMARY_DISABLED = {
  bg: '--el-button-disabled-bg-color',
  border: '--el-button-disabled-border-color',
  text: '--el-button-disabled-text-color',
}

/** 取元素级规则块（非 :root / 非 [data-theme]）里的变量声明表 */
function scopedVarTable (source, selector) {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`)
  const match = re.exec(source)
  if (!match) return null
  const rest = source.slice(match.index + match[0].length)
  const close = rest.indexOf('\n}')
  if (close < 0) throw new Error(`${selector} 规则块未闭合，解析已退化`)
  return Object.fromEntries(
    [...rest.slice(0, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )
}

function channel (v) { const f = v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; return f }

/** 只接受实测可解析的色；解析不了即抛（fail closed，禁止把"没测出来"当成"通过"） */
function luminance (color) {
  let m = /^#([0-9a-f]{6})$/i.exec(color)
  if (m) {
    const n = parseInt(m[1], 16)
    return 0.2126 * channel(((n >> 16) & 255) / 255)
      + 0.7152 * channel(((n >> 8) & 255) / 255)
      + 0.0722 * channel((n & 255) / 255)
  }
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(color)
  if (m) {
    return 0.2126 * channel(+m[1] / 255) + 0.7152 * channel(+m[2] / 255) + 0.0722 * channel(+m[3] / 255)
  }
  throw new Error(`无法解析颜色（禁用态对比度无法实测）：${JSON.stringify(color)}`)
}

function contrast (a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe('ep-theme.css 主按钮禁用态合同', () => {
  const scoped = scopedVarTable(read('./ep-theme.css'), '.el-button--primary')

  it('禁用三档必须写在 .el-button--primary 元素作用域上（写在 :root 会被 EP 自带声明压掉）', () => {
    expect(scoped, '缺少 .el-button--primary 规则块').not.toBeNull()
    for (const name of Object.values(PRIMARY_DISABLED)) {
      expect(scoped[name], name).toBeDefined()
    }
  })

  it.each([['light', lightVars], ['dark', darkVars]])('%s 主题下禁用底/描边/文字全部可解析', (_label, vars) => {
    for (const [key, name] of Object.entries(PRIMARY_DISABLED)) {
      expect(resolve(scoped[name], vars), name).toMatch(/^#[0-9a-f]{6}$|^rgba?\(/i)
      expect(resolve(scoped[name], vars), key).not.toBeNull()
    }
  })

  it.each([['light', lightVars], ['dark', darkVars]])('%s 主题下禁用底既不同于常态主色也不同于 hover 档', (_label, vars) => {
    const normal = resolve(bridge['--el-color-primary'], vars)
    const hover = resolve(bridge['--el-color-primary-light-3'], vars)
    const disabledBg = resolve(scoped[PRIMARY_DISABLED.bg], vars)
    expect(disabledBg).not.toBe(normal)
    expect(disabledBg).not.toBe(hover)
  })

  it.each([['light', lightVars], ['dark', darkVars]])('%s 主题下禁用文字对禁用底对比度 ≥ 3（防止复现白字白底隐形）', (_label, vars) => {
    const disabledBg = resolve(scoped[PRIMARY_DISABLED.bg], vars)
    const disabledText = resolve(scoped[PRIMARY_DISABLED.text], vars)
    expect(contrast(disabledText, disabledBg)).toBeGreaterThanOrEqual(3)
  })
})
