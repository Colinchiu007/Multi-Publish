// @vitest-environment node
/**
 * provider-anomaly.test.js — ProviderAnomalyBus 单元测试
 *
 * 验证：
 * - slowThresholdMs 各类别阈值与未知类别回退
 * - isSlow 耗时判断（边界值/非法输入）
 * - report 无效上报忽略、结构化条目、同 provider 覆盖
 * - snapshot 排序与 MAX_SNAPSHOT 截断
 * - clear 清空快照
 * - anomaly 事件通知
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  ProviderAnomalyBus,
  slowThresholdMs,
  MAX_SNAPSHOT,
} from './provider-anomaly'

describe('slowThresholdMs', () => {
  it('返回各类别慢响应阈值', () => {
    expect(slowThresholdMs('llm')).toBe(30000)
    expect(slowThresholdMs('tts')).toBe(30000)
    expect(slowThresholdMs('audio')).toBe(30000)
    expect(slowThresholdMs('image')).toBe(60000)
    expect(slowThresholdMs('video')).toBe(120000)
  })

  it('未知类别回退默认阈值', () => {
    expect(slowThresholdMs('unknown')).toBe(60000)
    expect(slowThresholdMs('speech_recognition')).toBe(60000)
  })
})

describe('ProviderAnomalyBus', () => {
  let bus
  beforeEach(() => {
    bus = new ProviderAnomalyBus()
  })

  it('isSlow 判断耗时是否达到/超过阈值', () => {
    expect(bus.isSlow('llm', 29999)).toBe(false)
    expect(bus.isSlow('llm', 30000)).toBe(true)
    expect(bus.isSlow('llm', 30001)).toBe(true)
    expect(bus.isSlow('image', 59999)).toBe(false)
    expect(bus.isSlow('image', 60000)).toBe(true)
    expect(bus.isSlow('video', 120000)).toBe(true)
  })

  it('isSlow 对非法输入返回 false', () => {
    expect(bus.isSlow('llm', null)).toBe(false)
    expect(bus.isSlow('llm', undefined)).toBe(false)
    expect(bus.isSlow('llm', 'abc')).toBe(false)
    expect(bus.isSlow('llm', NaN)).toBe(false)
  })

  it('report 忽略无效上报', () => {
    bus.report(null)
    bus.report({})
    bus.report({ providerId: '   ' })
    bus.report({ providerId: 123 })
    expect(bus.snapshot()).toEqual([])
  })

  it('report 生成结构化快照条目', () => {
    bus.report({ providerId: 'agnes-llm', category: 'llm', model: 'agnes-v1', latencyMs: 90000, kind: 'slow' })
    const snap = bus.snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0]).toMatchObject({
      providerId: 'agnes-llm',
      category: 'llm',
      model: 'agnes-v1',
      latencyMs: 90000,
      kind: 'slow',
    })
    expect(typeof snap[0].lastAt).toBe('string')
  })

  it('同一 provider 重复上报只保留最新条目', () => {
    bus.report({ providerId: 'p', latencyMs: 100, kind: 'slow' })
    bus.report({ providerId: 'p', latencyMs: 999, kind: 'timeout' })
    const snap = bus.snapshot()
    expect(snap).toHaveLength(1)
    expect(snap[0].latencyMs).toBe(999)
    expect(snap[0].kind).toBe('timeout')
  })

  it('快照按最近更新排序并截断到 MAX_SNAPSHOT', () => {
    for (let i = 0; i < 8; i++) {
      bus.report({ providerId: 'p' + i, latencyMs: i, kind: 'slow' })
    }
    const snap = bus.snapshot()
    expect(snap).toHaveLength(MAX_SNAPSHOT)
    expect(snap[0].providerId).toBe('p7')
  })

  it('clear 清空全部快照', () => {
    bus.report({ providerId: 'p', latencyMs: 1, kind: 'slow' })
    bus.clear()
    expect(bus.snapshot()).toEqual([])
  })

  it('上报时发出 anomaly 事件', () => {
    const handler = vi.fn()
    bus.on('anomaly', handler)
    bus.report({ providerId: 'p', latencyMs: 1, kind: 'slow' })
    expect(handler).toHaveBeenCalledOnce()
  })
})
