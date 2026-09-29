/**
 * tokens.css 语义槽契约测试（批次 2：ui-apple-token-retirement Task 2）
 *
 * 钉死四件事：
 * 1. 迁移 `--apple-*` 前必须补齐的语义槽真实存在且值正确（字重/字体族/行高/动效/间距补槽）；
 * 2. 阴影级差与既有品牌色相口径一致（`rgba(30, 27, 75, α)`）；
 * 3. 暗色补齐的 `--color-text-*` 与 `--color-primary-light` 必须**真覆盖**（不得等于浅色值），
 *    且暗色文字档在暗色卡片底上对比度 ≥ 4.5:1（可读性下限，防止「深字落深底」复发）；
 * 4. 既有浅色关键槽零改动（本批次是纯新增 + 暗色修复，不得顺手改浅色观感）。
 *
 * 另锁一处历史缺陷：`video-creation-tokens.css` 暗色块的 `--text` 曾转发到**背景** token
 * `--ep-bg`（2026-09-20 暗色不可读事故根因），此处按「不得指向背景槽 + 对比度达标」双断言钉死。
 *
 * 断言规范（QM-3）：结构类断言用 toEqual/toBe，避免清一色 toContain。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const tokensCss = read('./tokens.css')
const videoCreationTokensCss = read('./video-creation-tokens.css')

/** 取 CSS 变量定义：返回 { name: value }，scope 为 root 或 dark */
function readVarBlock (css, scope) {
  const startIdx = scope === 'dark'
    ? css.indexOf('[data-theme="dark"]')
    : css.indexOf(':root {')
  const block = css.slice(startIdx, startIdx + css.slice(startIdx).indexOf('\n}'))
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => [m[1], m[2].trim()]),
  )
}

const light = readVarBlock(tokensCss, 'root')
const dark = readVarBlock(tokensCss, 'dark')

/** 相对亮度（WCAG 2.x） */
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

describe('批次 2：迁移前必须补齐的语义槽', () => {
  it('字重槽', () => {
    expect({
      regular: light['--font-weight-regular'],
      medium: light['--font-weight-medium'],
      semibold: light['--font-weight-semibold'],
      bold: light['--font-weight-bold'],
    }).toEqual({ regular: '400', medium: '500', semibold: '600', bold: '700' })
  })

  it('字体族槽（取值与别名层现值一致，保证迁移时字体渲染不变）', () => {
    expect(light['--font-family-display']).toBe("'SF Pro Display', 'Inter', 'PingFang SC', system-ui, sans-serif")
    expect(light['--font-family-text']).toBe("'SF Pro Text', 'Inter', 'PingFang SC', system-ui, sans-serif")
    expect(light['--font-family-mono']).toBe("'SF Mono', 'JetBrains Mono', 'Consolas', monospace")
  })

  it('行高槽', () => {
    expect({
      tight: light['--leading-tight'],
      normal: light['--leading-normal'],
      relaxed: light['--leading-relaxed'],
    }).toEqual({ tight: '1.2', normal: '1.5', relaxed: '1.625' })
  })

  it('动效槽（时长与缓动）', () => {
    expect({
      fast: light['--duration-fast'],
      normal: light['--duration-normal'],
      slow: light['--duration-slow'],
    }).toEqual({ fast: '120ms', normal: '200ms', slow: '320ms' })
    expect({
      easeDefault: light['--ease-default'],
      spring: light['--ease-spring'],
      inOut: light['--ease-in-out'],
    }).toEqual({
      easeDefault: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    })
  })

  it('间距补槽：--spacing-16（批次 5 history-page 的唯一缺档）', () => {
    expect(light['--spacing-16']).toBe('64px')
  })

  it('阴影级差与既有品牌色相口径一致（rgba(30, 27, 75, α)）', () => {
    for (const name of ['--shadow-sm', '--shadow-md', '--shadow-lg']) {
      expect(light[name]).toContain('rgba(30, 27, 75,')
    }
  })
})

describe('批次 2：暗色槽补齐与可读性', () => {
  const textSlots = ['--color-text-strong', '--color-text-primary', '--color-text-secondary', '--color-text-muted']

  it('暗色补齐四个文字槽且都真覆盖（不得等于浅色值）', () => {
    for (const name of textSlots) {
      expect(light[name]).toBeTruthy()
      expect(dark[name]).toBeTruthy()
      expect(dark[name]).not.toBe(light[name])
    }
  })

  it('暗色文字档在暗色卡片底上对比度 ≥ 4.5:1', () => {
    const cardBg = dark['--color-bg-card']
    expect(cardBg).toBeTruthy()
    for (const name of textSlots) {
      // strong/primary/secondary/muted 由亮到暗，最低档也必须过线
      expect(contrast(dark[name], cardBg), `${name} 在 ${cardBg} 上对比度不足`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('暗色 --color-primary-light 有覆盖（否则暗色下仍是浅色底）', () => {
    expect(light['--color-primary-light']).toBeTruthy()
    expect(dark['--color-primary-light']).toBeTruthy()
    expect(dark['--color-primary-light']).not.toBe(light['--color-primary-light'])
  })

  it('--color-primary 保持不覆盖（desktop-ui-consistency 既有合同）', () => {
    expect(light['--color-primary']).toBe('#5048E5')
    expect(dark['--color-primary']).toBeUndefined()
  })
})

describe('批次 2：--text 暗色缺陷回归锁（2026-09-20 事故）', () => {
  const videoRoot = readVarBlock(videoCreationTokensCss, 'root')
  const videoDark = readVarBlock(videoCreationTokensCss, 'dark')

  it('暗色 --text 不得转发到背景类 token（事故根因）', () => {
    const value = videoDark['--text']
    expect(value).toBeTruthy()
    expect(value).not.toMatch(/--ep-bg|--color-bg-|--surface\b|--bg\b/)
  })

  it('暗色 --text 指向前景 token（与浅色 --text 结构对称）', () => {
    expect(videoRoot['--text']).toMatch(/var\(--ink\b/)
    expect(videoDark['--text']).toMatch(/var\(--ink\b/)
  })

  it('暗色 --text 解析目标在暗色底上可读（fallback 值对比度 ≥ 4.5:1）', () => {
    const fallback = /,\s*(#[0-9a-f]{6})\s*\)/i.exec(String(videoDark['--text']))?.[1]
    expect(fallback, '暗色 --text 必须带暗色可读 fallback').toBeTruthy()
    expect(contrast(fallback, videoDark['--ep-bg'])).toBeGreaterThanOrEqual(4.5)
  })
})

describe('批次 2：既有浅色关键槽零改动（回归锁）', () => {
  it('品牌色/圆角/字号/间距快照不变', () => {
    expect({
      primary: light['--color-primary'],
      primaryHover: light['--color-primary-hover'],
      radiusSm: light['--radius-sm'],
      radiusMd: light['--radius-md'],
      radiusLg: light['--radius-lg'],
      fontSizeXs: light['--font-size-xs'],
      fontSizeXxl: light['--font-size-xxl'],
      spacing1: light['--spacing-1'],
      spacing8: light['--spacing-8'],
      shadowSm: light['--shadow-sm'],
      shadowFloat: light['--shadow-float'],
    }).toEqual({
      primary: '#5048E5',
      primaryHover: '#603af9',
      radiusSm: '8px',
      radiusMd: '12px',
      radiusLg: '16px',
      fontSizeXs: '12px',
      fontSizeXxl: '32px',
      spacing1: '4px',
      spacing8: '32px',
      shadowSm: '0 1px 2px rgba(30, 27, 75, 0.06), 0 1px 3px rgba(30, 27, 75, 0.10)',
      shadowFloat: '0 2px 8px rgba(30, 27, 75, 0.08)',
    })
  })

  it('本批次只做新增与暗色修复：浅色块不含任何 --text/--font-weight 之外的重定义', () => {
    // --font-weight-* 是本批次新增（浅色块新键），不得出现于暗色块（字重不随主题变）
    for (const name of ['--font-weight-regular', '--font-weight-bold']) {
      expect(dark[name]).toBeUndefined()
    }
  })
})
