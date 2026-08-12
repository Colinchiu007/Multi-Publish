// @vitest-environment node
'use strict'

const { lookupRootCauses, ROOT_CAUSE_RULES, UNKNOWN_CANDIDATE, MAX_CANDIDATES } = require('./root-cause-map')

const FIELDS = ['causeId', 'label', 'checks', 'advice', 'confidence']

describe('root-cause-map：错误 → 候选根因', () => {
  it('split + ECONNREFUSED → sidecar_unavailable 候选（带 checks/advice）', () => {
    const result = lookupRootCauses({ stage: 'split' }, { message: 'ECONNREFUSED, sidecar not running' })
    const hit = result.find(c => c.causeId === 'sidecar_unavailable')
    expect(hit).toBeTruthy()
    expect(hit.label).toContain('sidecar')
    expect(Array.isArray(hit.checks)).toBe(true)
    expect(hit.checks.length).toBeGreaterThan(0)
    expect(typeof hit.advice).toBe('string')
    expect(hit.confidence).toBe('high')
  })

  it('compose + ENOSPC → disk_full', () => {
    const result = lookupRootCauses({ stage: 'compose' }, { message: 'ENOSPC: no space left on device' })
    expect(result.some(c => c.causeId === 'disk_full')).toBe(true)
  })

  it('422 → sidecar_stale_instance（契约漂移）', () => {
    const result = lookupRootCauses({ stage: 'optimize' }, { code: 422, message: 'platform 联合枚举不存在' })
    expect(result.some(c => c.causeId === 'sidecar_stale_instance')).toBe(true)
  })

  it('未命中 → unknown 通用建议候选（低置信度）', () => {
    const result = lookupRootCauses({ stage: 'compose' }, { message: 'a completely unexpected failure text' })
    expect(result.length).toBe(1)
    expect(result[0].causeId).toBe('unknown')
    expect(result[0].confidence).toBe('low')
    expect(result[0].checks.length).toBeGreaterThan(0)
  })

  it('空输入 → unknown 兜底且不抛错', () => {
    expect(() => lookupRootCauses(null, null)).not.toThrow()
    const result = lookupRootCauses(null, null)
    expect(result[0].causeId).toBe('unknown')
  })

  it('所有候选字段完整且为原始值', () => {
    const result = lookupRootCauses({ stage: 'compose' }, { message: '429 rate limit, ENOSPC, ECONNREFUSED 8002' })
    expect(result.length).toBeGreaterThan(0)
    for (const candidate of result) {
      for (const field of FIELDS) {
        expect(Object.prototype.hasOwnProperty.call(candidate, field)).toBe(true)
      }
      expect(Array.isArray(candidate.checks)).toBe(true)
    }
  })

  it('候选数量不超过 MAX_CANDIDATES', () => {
    const result = lookupRootCauses({ stage: 'split' }, { message: 'ENOSPC ECONNREFUSED 429 ffmpeg decode failed' })
    expect(result.length).toBeLessThanOrEqual(MAX_CANDIDATES)
  })

  it('规则表非空且每条规则含 causeId/test/confidence', () => {
    expect(ROOT_CAUSE_RULES.length).toBeGreaterThan(0)
    for (const rule of ROOT_CAUSE_RULES) {
      expect(typeof rule.causeId).toBe('string')
      expect(typeof rule.test).toBe('function')
      expect(typeof rule.confidence).toBe('string')
    }
  })

  it('UNKNOWN_CANDIDATE 常量结构完整', () => {
    expect(UNKNOWN_CANDIDATE.causeId).toBe('unknown')
    expect(UNKNOWN_CANDIDATE.confidence).toBe('low')
  })
})

