/**
 * 无前缀别名层契约测试（P4：61 处深色模式低对比修复）
 *
 * 背景：业务代码里流传着一套无前缀别名（--text-primary / --bg / --card-bg /
 * --text-secondary / --bg-secondary / --cohere-green），被 29+15+4+4+7+3 个文件
 * 引用，但从未在任何 tokens 文件中定义 —— check-css-var-defined 门禁报 59 处
 * UNDEF。变量未定义时回退到继承值：暗色下出现「深字压深底」（accounts 整页
 * 1.13:1）与「浅字压浅底」（dashboard 试用横幅 1.09:1）两种不可读形态
 * （实测见 01-docs/UX-前端交互与用户体检研究方案-2026-10-07.md §3.3 / §8）。
 *
 * 修法：tokens.css 增加别名桥接层 —— :root 里映射到既有 --color-* 语义槽，
 * dark 块同位置映射到暗色变体（CSS 变量的作用域机制让暗色自动覆盖亮色）。
 * 不改 62 个业务文件（改引用侧是 ui-token 收编批次的活，见研究方案 Wave 5）。
 *
 * 本测试钉死四件事：
 * 1. 六个别名在 :root 与 [data-theme="dark"] 都有定义（UNDEF 清零的前提）；
 * 2. 暗色别名必须真覆盖 —— 不得与亮色同值（否则主题切换失效）；
 * 3. 暗色文字别名在暗色卡片底上的 WCAG 对比度 ≥ 4.5:1（防止「深字落深底」复发，
 *    与 tokens.slots.test.js 同一口径）；
 * 4. 别名指向正确的语义槽（--text-primary → --color-text-primary 等，
 *    防止「转发到背景槽」类历史事故复发 —— 参见本目录 tokens.slots.test.js
 *    头注释里 2026-09-20 的 --text → --ep-bg 事故）。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const tokensCss = read('./tokens.css')

function readVarBlock (css, scope) {
  // ⚠ 必须匹配**行首**的块选择器：注释里也会出现 [data-theme="dark"] 字样
  //（本文件亮色别名注释就写过「暗色覆盖见下方 [data-theme="dark"] 同名块」），
  // 朴素的 indexOf 会命中注释、从第 44 行开始解析 —— 那是亮色区，
  // dark[...] 全 undefined。这正是 tokens.slots.test.js 主线上红 4 个的
  // 同源解析 bug。真实选择器必然顶格（CSS 惯例 + 本文件实测），用 ^ 锚定。
  // 块尾也不能用 indexOf('\n}')：dark 块内含嵌套 {}，须配对扫描。
  const re = scope === 'dark'
    ? /^\[data-theme="dark"\]\s*\{/m
    : /^:root\s*\{/m
  const m = re.exec(css)
  if (!m) throw new Error(`找不到 ${scope} 块选择器`)
  const startIdx = m.index
  let depth = 0
  let endIdx = -1
  for (let i = css.indexOf('{', startIdx); i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}') {
      depth--
      if (depth === 0) { endIdx = i; break }
    }
  }
  const block = css.slice(startIdx, endIdx)
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((mm) => [mm[1], mm[2].trim()]),
  )
}

const light = readVarBlock(tokensCss, 'root')
const dark = readVarBlock(tokensCss, 'dark')

/** 解析 var() 转发：返回被指向的槽名（仅支持纯转发 `var(--x)` 形状） */
function resolveRef (value) {
  const m = /^var\((--[a-z0-9-]+)\)$/i.exec(String(value).trim())
  if (!m) throw new Error(`别名必须是纯转发 var(--槽名) 形状，收到: ${value}`)
  return m[1]
}

function luminance (hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) throw new Error(`只支持 6 位 hex，收到: ${hex}`)
  const channels = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast (fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

const ALIASES = [
  '--text-primary',
  '--text-secondary',
  '--bg',
  '--bg-secondary',
  '--card-bg',
  '--cohere-green',
]

describe('无前缀别名层（P4 深色可读性修复）', () => {
  it('六个别名在亮色与暗色区都有定义', () => {
    for (const a of ALIASES) {
      expect(light[a], `亮色区缺 ${a}`).toBeDefined()
      expect(dark[a], `暗色区缺 ${a}`).toBeDefined()
    }
  })

  it('暗色别名必须真覆盖（解析后最终值不得等于亮色）', () => {
    // 别名是纯转发 var(--color-*)，亮暗两区字符串必然相同 —— 但 CSS 变量按
    // 作用域解析：dark 块里 --color-text-primary 重定义为 #e8e8ed，
    // 同名转发随之解析出暗色值。「真覆盖」断言必须比较解析后最终值，
    // 而不是转发字符串本身（否则纯转发会被误判为「未覆盖」）。
    for (const a of ALIASES) {
      const lightFinal = light[resolveRef(light[a])]
      const darkFinal = dark[resolveRef(dark[a])]
      expect(darkFinal, `${a} 暗色最终值(${darkFinal})与亮色(${lightFinal})相同，主题切换将失效`)
        .not.toBe(lightFinal)
    }
  })

  it('别名指向正确的语义槽（防止转发到背景槽类事故）', () => {
    const expectTargets = {
      '--text-primary': '--color-text-primary',
      '--text-secondary': '--color-text-secondary',
      '--bg': '--color-bg-canvas',
      '--bg-secondary': '--color-bg-inset',
      '--card-bg': '--color-bg-card',
      '--cohere-green': '--color-success',
    }
    for (const [alias, target] of Object.entries(expectTargets)) {
      expect(resolveRef(light[alias]), `${alias} 亮色应转发到 ${target}`).toBe(target)
      expect(resolveRef(dark[alias]), `${alias} 暗色应转发到 ${target}`).toBe(target)
    }
  })

  it('暗色文字别名在暗色卡片底上对比度 ≥ 4.5:1', () => {
    const cardBg = dark['--color-bg-card']
    for (const [alias, target] of [
      ['--text-primary', '--color-text-primary'],
      ['--text-secondary', '--color-text-secondary'],
    ]) {
      const fg = dark[target]
      const r = contrast(fg, cardBg)
      expect(r, `${alias}(${fg}) 在暗色卡片底(${cardBg})上对比度 ${r.toFixed(2)}:1 < 4.5`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
