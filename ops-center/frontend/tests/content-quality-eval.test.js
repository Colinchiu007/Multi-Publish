import { describe, expect, it } from 'vitest'
import { isApplicable, hasApplicableSamples } from '../src/views/content-quality-eval-utils'

describe('ContentQualityEval 维度适用性展示契约', () => {
  it('applicable=false 的维度应显示为 N/A 而非低分进度条', () => {
    expect(isApplicable({ id: 'clone_divergence', applicable: false, score: 0 })).toBe(false)
    expect(isApplicable({ id: 'logic', applicable: true, score: 65 })).toBe(true)
    // 旧记录缺失 applicable 字段按适用处理，避免前端把旧数据误判成 N/A
    expect(isApplicable({ id: 'logic', score: 65 })).toBe(true)
  })

  it('count=0 的统计维度应显示为“暂无适用样本”而非 0 分进度条', () => {
    expect(hasApplicableSamples({ id: 'clone_divergence', count: 0 })).toBe(false)
    expect(hasApplicableSamples({ id: 'logic', count: 5 })).toBe(true)
    expect(hasApplicableSamples(undefined)).toBe(false)
  })
})
