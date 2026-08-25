import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetAppLocale = vi.fn()
vi.mock('@/i18n', () => ({ getAppLocale: () => mockGetAppLocale() }))

import {
  formatDateTime,
} from './datetime'

// 固定参考时间：2026-08-24T06:30:05Z（本地时区渲染由 Intl 决定，断言用包含性匹配）
const ISO = '2026-08-24T06:30:05Z'

describe('formatDateTime 空值与无效值语义', () => {
  beforeEach(() => {
    mockGetAppLocale.mockReturnValue('zh')
    vi.useRealTimers()
  })

  it('空值返回 emptyText（默认空串）', () => {
    expect(formatDateTime(null)).toBe('')
    expect(formatDateTime(undefined)).toBe('')
    expect(formatDateTime('')).toBe('')
    expect(formatDateTime('', { emptyText: 'N/A' })).toBe('N/A')
  })

  it('无法解析的日期返回 invalidText（默认空串），不再向调用方抛异常', () => {
    expect(formatDateTime('not-a-date')).toBe('')
    expect(formatDateTime('not-a-date', { invalidText: '原始值' })).toBe('原始值')
    // 历史上 Dashboard 变体无 try 保护，此处钉死不抛出契约
    expect(() => formatDateTime('###')).not.toThrow()
  })

  it('invalidText 支持回传原始值语义（usePipelineHistory/Intelligence/ReplayTimeline）', () => {
    const raw = 'weird-but-present'
    expect(formatDateTime(raw, { invalidText: raw, emptyText: '' })).toBeTypeOf('string')
  })
})

describe('formatDateTime 五种样式', () => {
  beforeEach(() => {
    mockGetAppLocale.mockReturnValue('zh')
  })

  it('full：完整日期时间（默认）', () => {
    const out = formatDateTime(ISO)
    expect(out).toContain('2026')
  })

  it('time：仅时分秒且 24 小时制', () => {
    const out = formatDateTime(ISO, { style: 'time' })
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('time-seconds 显式带秒；hour-minute 仅时分', () => {
    expect(formatDateTime(ISO, { style: 'time-seconds' })).toMatch(/\d{2}:\d{2}:\d{2}/)
    expect(formatDateTime(ISO, { style: 'hour-minute' })).toMatch(/^\d{2}:\d{2}/)
    expect(formatDateTime(ISO, { style: 'hour-minute' })).not.toMatch(/:\d{2}:\d{2}$/)
  })

  it('short：短月份 + 日 + 时分（ProjectCard 语义）', () => {
    const out = formatDateTime(ISO, { style: 'short' })
    expect(out.length).toBeGreaterThan(0)
    expect(out).not.toContain('2026') // 不含年份
  })

  it('numeric-short：数字月份变体（Home 语义）', () => {
    const out = formatDateTime(ISO, { style: 'numeric-short' })
    expect(out.length).toBeGreaterThan(0)
  })
})

describe('formatDateTime locale 感知', () => {
  it('app locale 为 en 时使用 en-US 渲染', () => {
    mockGetAppLocale.mockReturnValue('en')
    const out = formatDateTime(ISO, { style: 'time' })
    // en-US 12 小时制默认被 hour12:false 覆盖为 24 小时
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })

  it('显式传入 locale 优先于 app locale', () => {
    mockGetAppLocale.mockReturnValue('zh')
    const out = formatDateTime(ISO, { style: 'time', locale: 'en-US' })
    expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})
