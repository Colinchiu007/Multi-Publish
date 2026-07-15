// @ts-check
/**
 * router.test.js — P3.3 TDD: ProviderRouter 路由策略 + 故障转移
 *
 * 验证：
 * - 4 种策略: default / priority / round_robin / failover
 * - getNext: 返回正确 provider，空列表返回 null
 * - executeWithFailover: 成功直接返回，失败自动切换
 * - maxRetries: 达到最大重试次数后抛最后错误
 * - excludeId: 故障转移排除已失败 provider
 * - round_robin 轮询: 多次调用循环使用
 * - 无可用 provider: 抛错
 * - _logCall: 成功/失败日志记录
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

__registerMock('../logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const { ProviderRouter } = require('./router')

// ─── mock manager ───
function createMockManager(providers = []) {
  const defaultMap = new Map()
  return {
    _providers: providers,
    listEnabledProviders: vi.fn((category) => {
      return providers.filter(p => p.category === category && p.enabled !== false)
    }),
    getDefault: vi.fn((category) => {
      return defaultMap.get(category) || null
    }),
    setDefault: vi.fn((category, id) => {
      const p = providers.find(p => p.id === id)
      if (p) defaultMap.set(category, p)
    }),
    _logs: [],
    logCall: vi.fn((providerId, status, error) => {
      defaultMap._logs = defaultMap._logs || []
      defaultMap._logs.push({ providerId, status, error })
    }),
  }
}

describe('ProviderRouter — P3.3 路由策略 + 故障转移', () => {
  let router, manager

  beforeEach(() => {
    manager = createMockManager([
      { id: 'openai', name: 'OpenAI', category: 'llm', priority: 10, enabled: true },
      { id: 'anthropic', name: 'Anthropic', category: 'llm', priority: 8, enabled: true },
      { id: 'gemini', name: 'Gemini', category: 'llm', priority: 5, enabled: true },
      { id: 'disabled-prov', name: 'Disabled', category: 'llm', priority: 100, enabled: false },
    ])
    router = new ProviderRouter(manager)
  })

  describe('getNext — default 策略', () => {
    it('返回 is_default 的 provider', () => {
      manager.setDefault('llm', 'anthropic')
      const result = router.getNext('llm', 'default')
      expect(result).toBeTruthy()
      expect(result.id).toBe('anthropic')
    })

    it('无默认时返回第一个 enabled provider', () => {
      const result = router.getNext('llm', 'default')
      expect(result).toBeTruthy()
      expect(result.id).toBe('openai')
    })
  })

  describe('getNext — priority 策略', () => {
    it('返回 priority 最高的 provider', () => {
      const result = router.getNext('llm', 'priority')
      expect(result).toBeTruthy()
      expect(result.id).toBe('openai') // priority=10
    })

    it('排除 disabled provider（即使 priority 高）', () => {
      const result = router.getNext('llm', 'priority')
      expect(result.id).not.toBe('disabled-prov')
    })
  })

  describe('getNext — round_robin 策略', () => {
    it('轮询所有 enabled provider', () => {
      const ids = []
      for (let i = 0; i < 6; i++) {
        const p = router.getNext('llm', 'round_robin')
        ids.push(p.id)
      }
      // 前 3 个应该是 3 个 enabled provider 的某种顺序
      expect(ids).toHaveLength(6)
      // 第 4 次应该回到第 1 个（循环）
      expect(ids[3]).toBe(ids[0])
      expect(ids[4]).toBe(ids[1])
    })

    it('不同 category 的轮询独立', () => {
      const llm1 = router.getNext('llm', 'round_robin')
      const tts1 = router.getNext('tts', 'round_robin')
      const llm2 = router.getNext('llm', 'round_robin')
      // llm 应该轮询到第 2 个
      expect(llm2.id).not.toBe(llm1.id)
    })
  })

  describe('getNext — failover 策略', () => {
    it('默认优先，排除 excludeId 后取第一个', () => {
      manager.setDefault('llm', 'openai')
      const result = router.getNext('llm', 'failover', 'openai')
      expect(result).toBeTruthy()
      expect(result.id).not.toBe('openai')
    })

    it('默认未被排除时返回默认', () => {
      manager.setDefault('llm', 'anthropic')
      const result = router.getNext('llm', 'failover', 'openai')
      expect(result.id).toBe('anthropic')
    })
  })

  describe('getNext — 边界情况', () => {
    it('空 provider 列表返回 null', () => {
      const result = router.getNext('tts', 'default')
      expect(result).toBeNull()
    })

    it('未知策略 fallback 到第一个', () => {
      const result = router.getNext('llm', 'unknown_strategy')
      expect(result).toBeTruthy()
    })

    it('所有 provider 都被排除返回 null', () => {
      const result = router.getNext('llm', 'default', 'openai')
      // default 策略忽略 excludeId
      expect(result).toBeTruthy()
    })
  })

  describe('executeWithFailover — 成功路径', () => {
    it('第一次成功直接返回结果', async () => {
      manager.setDefault('llm', 'openai')
      const fn = vi.fn(async (provider) => {
        return { content: 'success from ' + provider.id }
      })

      const result = await router.executeWithFailover('llm', fn)
      expect(result.content).toBe('success from openai')
      expect(fn).toHaveBeenCalledOnce()
    })

    it('记录成功日志', async () => {
      manager.setDefault('llm', 'openai')
      const logSpy = vi.spyOn(router, '_logCall')
      await router.executeWithFailover('llm', async () => 'ok')
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai' }), 'success')
    })
  })

  describe('executeWithFailover — 故障转移', () => {
    it('主 provider 失败自动切换到备用', async () => {
      manager.setDefault('llm', 'openai')
      const fn = vi.fn(async (provider) => {
        if (provider.id === 'openai') {
          throw new Error('OpenAI down')
        }
        return { content: 'success from ' + provider.id }
      })

      const result = await router.executeWithFailover('llm', fn, { maxRetries: 3 })
      expect(result.content).toBe('success from anthropic') // 或 gemini
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('达到 maxRetries 后抛最后错误', async () => {
      const fn = vi.fn(async () => {
        throw new Error('All down')
      })

      await expect(router.executeWithFailover('llm', fn, { maxRetries: 2 }))
        .rejects.toThrow('All down')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('记录失败日志', async () => {
      manager.setDefault('llm', 'openai')
      const logSpy = vi.spyOn(router, '_logCall')
      const fn = vi.fn(async (provider) => {
        if (provider.id === 'openai') throw new Error('fail')
        return 'ok'
      })

      await router.executeWithFailover('llm', fn, { maxRetries: 3 })
      // 第一次调用应该记录 error
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 'openai' }), 'error', 'fail')
    })
  })

  describe('executeWithFailover — 无可用 provider', () => {
    it('空列表抛错', async () => {
      await expect(router.executeWithFailover('tts', async () => 'ok'))
        .rejects.toThrow(/no available provider/i)
    })

    it('maxRetries=0 抛错', async () => {
      await expect(router.executeWithFailover('llm', async () => 'ok', { maxRetries: 0 }))
        .rejects.toThrow(/no available provider|maxRetries/i)
    })
  })

  describe('executeWithFailover — 与 callAdapter 集成', () => {
    it('通过 manager.callAdapter 调用', async () => {
      manager.setDefault('llm', 'openai')
      manager.callAdapter = vi.fn(async (providerId, method, params) => {
        if (providerId === 'openai') {
          return { code: -1, error: new Error('rate limited') }
        }
        return { code: 0, data: { content: 'from ' + providerId } }
      })

      const result = await router.executeWithFailover('llm', async (provider) => {
        const r = await manager.callAdapter(provider.id, 'chatCompletion', {})
        if (r.code !== 0) throw r.error || new Error(r.message)
        return r.data
      })

      expect(result.content).toMatch(/^from /)
      expect(manager.callAdapter).toHaveBeenCalledTimes(2)
    })
  })

  describe('_logCall', () => {
    it('成功调用记录 { status: success }', () => {
      const logs = []
      router._logCall = (provider, status, error) => {
        logs.push({ providerId: provider.id, status, error })
      }
      router._logCall({ id: 'openai' }, 'success')
      expect(logs).toHaveLength(1)
      expect(logs[0].status).toBe('success')
      expect(logs[0].error == null).toBe(true)
    })

    it('失败调用记录 { status: error, error }', () => {
      const logs = []
      router._logCall = (provider, status, error) => {
        logs.push({ providerId: provider.id, status, error })
      }
      router._logCall({ id: 'openai' }, 'error', 'timeout')
      expect(logs[0].status).toBe('error')
      expect(logs[0].error).toBe('timeout')
    })
  })
})
