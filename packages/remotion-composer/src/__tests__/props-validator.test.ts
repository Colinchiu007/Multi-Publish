import { describe, it, expect } from 'vitest'
import { validateProps } from '../props-validator'

// props-validator 单元测试
// 覆盖 validateProps 的所有公共分支：cuts 结构校验、字段类型校验、
// sceneType 警告、theme 警告、chartData/chartSeries 类型校验

describe('validateProps - cuts 字段基础校验', () => {
  it('cuts 缺失时返回 invalid 并给出错误信息', () => {
    const result = validateProps({})
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('props.cuts must be an array')
    expect(result.warnings).toEqual([])
  })

  it('cuts 为 null 时返回 invalid', () => {
    const result = validateProps({ cuts: null })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('props.cuts must be an array')
  })

  it('cuts 为非数组类型（对象）时返回 invalid', () => {
    const result = validateProps({ cuts: { id: 'x' } })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('props.cuts must be an array')
  })

  it('cuts 为非数组类型（字符串）时返回 invalid', () => {
    const result = validateProps({ cuts: 'not-an-array' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('props.cuts must be an array')
  })

  it('cuts 为空数组时返回 invalid', () => {
    const result = validateProps({ cuts: [] })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('props.cuts must not be empty')
  })

  it('cuts 为空数组时不继续后续字段校验（提前返回）', () => {
    // 即使有 theme 字段也不会产生 warning，因为已提前 return
    const result = validateProps({ cuts: [], theme: 'unknown-theme' })
    expect(result.warnings).toEqual([])
  })
})

describe('validateProps - cut.id 校验', () => {
  it('id 缺失时给出错误', () => {
    const result = validateProps({
      cuts: [{ in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].id is required')
  })

  it('id 为非字符串类型时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 123, in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].id is required')
  })

  it('id 为空字符串时被视为缺失（!cut.id 先于 typeof 判断）', () => {
    // 源码：if (!cut.id || typeof cut.id !== 'string')
    // 空字符串 '' 是 falsy，!'' === true，因此触发 "id is required" 错误
    const result = validateProps({
      cuts: [{ id: '', in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.errors).toContain('cuts[0].id is required')
    expect(result.valid).toBe(false)
  })

  it('多个 cut 的 id 错误信息分别标注索引', () => {
    const result = validateProps({
      cuts: [
        { in_seconds: 0, out_seconds: 5 },
        { id: 'ok', in_seconds: 5, out_seconds: 10 },
        { in_seconds: 10, out_seconds: 15 },
      ],
    })
    expect(result.errors).toContain('cuts[0].id is required')
    expect(result.errors).toContain('cuts[2].id is required')
    expect(result.errors).not.toContain('cuts[1].id is required')
  })
})

describe('validateProps - in_seconds / out_seconds 校验', () => {
  it('in_seconds 为负数时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: -1, out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].in_seconds must be non-negative')
  })

  it('in_seconds 为非数字时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: '0', out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].in_seconds must be non-negative')
  })

  it('in_seconds 缺失时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].in_seconds must be non-negative')
  })

  it('in_seconds = 0 时合法', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.errors).not.toContain('cuts[0].in_seconds must be non-negative')
  })

  it('out_seconds 为非数字时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0, out_seconds: '5' }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].out_seconds must be a number')
  })

  it('out_seconds 缺失时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].out_seconds must be a number')
  })

  it('out_seconds <= in_seconds 时给出错误（相等）', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 5, out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].out_seconds > in_seconds')
  })

  it('out_seconds < in_seconds 时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 10, out_seconds: 5 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].out_seconds > in_seconds')
  })

  it('out_seconds 略大于 in_seconds 时合法', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 5, out_seconds: 5.001 }],
    })
    expect(result.errors).not.toContain('cuts[0].out_seconds > in_seconds')
    expect(result.valid).toBe(true)
  })

  it('in_seconds 非数字时即使 out_seconds <= in_seconds 也不会触发 out_seconds 错误（短路逻辑）', () => {
    // 源码：else if (typeof cut.in_seconds === 'number' && cut.out_seconds <= cut.in_seconds)
    // 当 in_seconds 不是 number 时，out_seconds <= in_seconds 的比较不会触发
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 'bad', out_seconds: 0 }],
    })
    expect(result.errors).not.toContain('cuts[0].out_seconds > in_seconds')
    // 但 in_seconds 错误仍存在
    expect(result.errors).toContain('cuts[0].in_seconds must be non-negative')
  })
})

describe('validateProps - cut.type 警告', () => {
  it('未知的 type 产生 warning 但不影响 valid', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'unknown_type', in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('cuts[0].type "unknown_type" unknown')
  })

  it('合法的 type 不产生 warning', () => {
    const validTypes = [
      'text_card', 'stat_card', 'callout', 'comparison', 'hero_title',
      'bar_chart', 'line_chart', 'pie_chart', 'kpi_grid', 'progress_bar',
      'anime_scene', 'terminal_scene', 'screenshot_scene',
    ]
    validTypes.forEach((type, i) => {
      const result = validateProps({
        cuts: [{ id: `a-${i}`, type, in_seconds: 0, out_seconds: 5 }],
      })
      expect(result.warnings.filter((w) => w.includes(`cuts[0].type`))).toEqual([])
    })
  })

  it('type 缺失时不产生 warning', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.warnings.filter((w) => w.includes('cuts[0].type'))).toEqual([])
  })
})

describe('validateProps - chartData / chartSeries 类型校验', () => {
  it('bar_chart + chartData 非数组时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'bar_chart', in_seconds: 0, out_seconds: 5, chartData: { x: 1 } }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].chartData must be array')
  })

  it('pie_chart + chartData 非数组时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'pie_chart', in_seconds: 0, out_seconds: 5, chartData: 'not-array' }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].chartData must be array')
  })

  it('kpi_grid + chartData 非数组时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'kpi_grid', in_seconds: 0, out_seconds: 5, chartData: 42 }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].chartData must be array')
  })

  it('bar_chart + chartData 为数组时合法', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'bar_chart', in_seconds: 0, out_seconds: 5, chartData: [{ label: 'A', value: 1 }] }],
    })
    expect(result.valid).toBe(true)
    expect(result.errors).not.toContain('cuts[0].chartData must be array')
  })

  it('bar_chart + chartData 缺失时合法（不强制要求）', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'bar_chart', in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.valid).toBe(true)
  })

  it('line_chart + chartSeries 非数组时给出错误', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'line_chart', in_seconds: 0, out_seconds: 5, chartSeries: { x: 1 } }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].chartSeries must be array')
  })

  it('line_chart + chartSeries 为数组时合法', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'line_chart', in_seconds: 0, out_seconds: 5, chartSeries: [{ name: 'S', data: [] }] }],
    })
    expect(result.valid).toBe(true)
  })

  it('非图表类型的 cut 携带 chartData 非数组时不报错（仅图表类型检查）', () => {
    const result = validateProps({
      cuts: [{ id: 'a', type: 'text_card', in_seconds: 0, out_seconds: 5, chartData: 'whatever' }],
    })
    expect(result.errors).not.toContain('cuts[0].chartData must be array')
    expect(result.valid).toBe(true)
  })
})

describe('validateProps - theme 警告', () => {
  it('未知 theme 字符串产生 warning 但 valid 仍为 true', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0, out_seconds: 5 }],
      theme: 'unknown-theme',
    })
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('theme "unknown-theme" unknown')
  })

  it('合法 theme 不产生 warning', () => {
    const validThemes = [
      'clean-professional', 'flat-motion-graphics', 'minimalist-diagram', 'anime-ghibli',
    ]
    validThemes.forEach((theme) => {
      const result = validateProps({
        cuts: [{ id: 'a', in_seconds: 0, out_seconds: 5 }],
        theme,
      })
      expect(result.warnings.filter((w) => w.startsWith('theme '))).toEqual([])
    })
  })

  it('theme 缺失时不产生 warning', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0, out_seconds: 5 }],
    })
    expect(result.warnings.filter((w) => w.startsWith('theme '))).toEqual([])
  })

  it('theme 为非字符串类型时不产生 warning（按当前实现跳过校验）', () => {
    const result = validateProps({
      cuts: [{ id: 'a', in_seconds: 0, out_seconds: 5 }],
      theme: 123,
    })
    expect(result.warnings.filter((w) => w.startsWith('theme '))).toEqual([])
  })
})

describe('validateProps - 综合场景', () => {
  it('合法的多 cut 场景全部通过', () => {
    const result = validateProps({
      cuts: [
        { id: 'intro', type: 'hero_title', in_seconds: 0, out_seconds: 5 },
        { id: 'stats', type: 'kpi_grid', in_seconds: 5, out_seconds: 12, chartData: [{ v: 1 }] },
        { id: 'chart', type: 'line_chart', in_seconds: 12, out_seconds: 20, chartSeries: [{ name: 'A', data: [1, 2] }] },
        { id: 'outro', type: 'text_card', in_seconds: 20, out_seconds: 25 },
      ],
      theme: 'clean-professional',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('同时存在多种错误时全部收集', () => {
    const result = validateProps({
      cuts: [
        { in_seconds: -1, out_seconds: 5, type: 'bad_type' },
        { id: 'ok', in_seconds: 5, out_seconds: 5 },
      ],
      theme: 'bad-theme',
    })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('cuts[0].id is required')
    expect(result.errors).toContain('cuts[0].in_seconds must be non-negative')
    expect(result.errors).toContain('cuts[1].out_seconds > in_seconds')
    expect(result.warnings).toContain('cuts[0].type "bad_type" unknown')
    expect(result.warnings).toContain('theme "bad-theme" unknown')
  })

  it('返回结构包含 valid / errors / warnings 三个字段', () => {
    const result = validateProps({ cuts: [{ id: 'a', in_seconds: 0, out_seconds: 1 }] })
    expect(result).toHaveProperty('valid')
    expect(result).toHaveProperty('errors')
    expect(result).toHaveProperty('warnings')
    expect(Array.isArray(result.errors)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
    expect(typeof result.valid).toBe('boolean')
  })
})
