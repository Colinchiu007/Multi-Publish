// @ts-check
/**
 * P2-6c 看板接线回归（T22）：preload 通道映射 ↔ 渲染层 api 名称必须两头都真跑一次。
 *
 * 这一层的失效方式是「静默」——preload 少一行，渲染层 invokeWithFallback 直接吃兜底信封，
 * 界面显示 0 而不是报错；单测只测渲染层的话永远测不到。所以这里两边都用真实现跑，不读源码字符串。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createKnowledgeLibraryApi } = require('./knowledge-library')

describe('preload performanceOverview 通道映射', () => {
  it('按 params 原样透传到 performance:overview 通道', async () => {
    const invoke = vi.fn(async () => ({ code: 0, data: { hasData: true } }))
    const api = createKnowledgeLibraryApi({ invoke })
    const r = await api.performanceOverview({ windowDays: 14 })
    expect(invoke).toHaveBeenCalledWith('performance:overview', { windowDays: 14 })
    expect(r.data.hasData).toBe(true)
  })

  it('缺省参数也必须挂上通道（不得因 undefined 参数而提前 return）', async () => {
    const invoke = vi.fn(async () => ({ code: 0, data: { hasData: false } }))
    const api = createKnowledgeLibraryApi({ invoke })
    await api.performanceOverview()
    expect(invoke.mock.calls.length).toBe(1)
    expect(invoke.mock.calls[0][0]).toBe('performance:overview')
  })
})

describe('src/api/knowledge-library 的 performanceOverview', () => {
  beforeEach(() => { vi.resetModules() })
  afterEach(() => { delete window.electronAPI })

  it('有 electronAPI 时把参数与返回值原样穿过（不是只返回兜底）', async () => {
    const spy = vi.fn(async (params) => ({ code: 0, data: { totals: { views: 12 }, echo: params } }))
    window.electronAPI = { performanceOverview: spy }
    const mod = await import('@/api/knowledge-library')
    const r = await mod.performanceOverview({ windowDays: 21 })
    expect(spy).toHaveBeenCalledWith({ windowDays: 21 })
    expect(r.data.totals.views).toBe(12)
    expect(r.data.echo).toEqual({ windowDays: 21 })
  })

  it('无 electronAPI（浏览器打开 Vite）时必须返回兜底信封而不是抛错', async () => {
    const mod = await import('@/api/knowledge-library')
    const r = await mod.performanceOverview({})
    expect(r).toEqual(expect.objectContaining({ code: expect.any(Number) }))
    expect(r.data).toBeNull()
  })
})
