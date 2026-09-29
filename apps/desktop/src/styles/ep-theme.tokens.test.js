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
  it('每个无兜底的 var() 引用都能在浅色 :root 单独解析', () => {
    const noFallback = [...new Set([...epThemeCss.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map((m) => m[1]))]
    expect(noFallback.length).toBeGreaterThan(10)
    expect(noFallback.filter((name) => lightTokens[name] === undefined)).toEqual([])
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
