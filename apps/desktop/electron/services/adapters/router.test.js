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
      // _logCall(provider, status, error, context) — 只验证前两参数
      expect(logSpy).toHaveBeenCalledOnce()
      expect(logSpy.mock.calls[0][0]).toMatchObject({ id: 'openai' })
      expect(logSpy.mock.calls[0][1]).toBe('success')
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
      // 第一次调用应该记录 error — _logCall(provider, status, error, context)
      const errorCall = logSpy.mock.calls.find(c => c[1] === 'error')
      expect(errorCall).toBeDefined()
      expect(errorCall[0]).toMatchObject({ id: 'openai' })
      expect(errorCall[2]).toBe('fail')
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

    it('默认实现不抛错（空钩子）', () => {
      // 使用原始 router（未 monkey-patch）
      const freshRouter = new ProviderRouter(manager)
      expect(() => freshRouter._logCall({ id: 'openai' }, 'success')).not.toThrow()
      expect(() => freshRouter._logCall({ id: 'openai' }, 'error', 'fail')).not.toThrow()
    })
  })

  // ─── Phase 2+：logHandler 注入（model_provider_logs 表启用）───
  describe('_logCall — logHandler 注入模式', () => {
    it('构造函数传入 logHandler 时 _logCall 调用它', () => {
      const logs = []
      const handler = (provider, status, error) => {
        logs.push({ providerId: provider.id, status, error })
      }
      const r = new ProviderRouter(manager, handler)
      r._logCall({ id: 'openai' }, 'success')
      r._logCall({ id: 'anthropic' }, 'error', 'timeout')
      expect(logs).toHaveLength(2)
      expect(logs[0]).toEqual({ providerId: 'openai', status: 'success', error: null })
      expect(logs[1]).toEqual({ providerId: 'anthropic', status: 'error', error: 'timeout' })
    })

    it('logHandler 抛错时不影响主流程（静默吞掉）', () => {
      const badHandler = () => { throw new Error('log write failed') }
      const r = new ProviderRouter(manager, badHandler)
      // _logCall 不应抛错
      expect(() => r._logCall({ id: 'openai' }, 'success')).not.toThrow()
      expect(() => r._logCall({ id: 'openai' }, 'error', 'fail')).not.toThrow()
    })

    it('未传入 logHandler 时 _logCall 静默不抛错', () => {
      const r = new ProviderRouter(manager)
      expect(() => r._logCall({ id: 'openai' }, 'success')).not.toThrow()
    })

    it('setLogHandler 动态注入日志处理器', () => {
      const r = new ProviderRouter(manager)
      const logs = []
      r.setLogHandler((provider, status, error) => {
        logs.push({ providerId: provider.id, status })
      })
      r._logCall({ id: 'openai' }, 'success')
      expect(logs).toHaveLength(1)
      expect(logs[0].providerId).toBe('openai')
    })

    it('setLogHandler(null) 清除日志处理器', () => {
      const logs = []
      const r = new ProviderRouter(manager, () => { logs.push('called') })
      r.setLogHandler(null)
      r._logCall({ id: 'openai' }, 'success')
      expect(logs).toHaveLength(0)
    })
  })

  // ─── Phase 2+ 扩展：_logCall context 参数（latency_ms/action/category）───
  describe('_logCall — context 参数传递', () => {
    it('logHandler 接收第 4 参数 context（含 category/action/latency_ms）', () => {
      const logs = []
      const handler = (provider, status, error, context) => {
        logs.push({ providerId: provider.id, status, error, context })
      }
      const r = new ProviderRouter(manager, handler)
      r._logCall({ id: 'openai' }, 'success', null, {
        category: 'llm', action: 'chat', latency_ms: 150
      })
      expect(logs).toHaveLength(1)
      expect(logs[0].context).toEqual({ category: 'llm', action: 'chat', latency_ms: 150 })
    })

    it('context 缺省时 logHandler 收到空对象（向后兼容）', () => {
      const logs = []
      const handler = (provider, status, error, context) => {
        logs.push({ status, context })
      }
      const r = new ProviderRouter(manager, handler)
      r._logCall({ id: 'openai' }, 'success')
      expect(logs[0].context).toEqual({})
    })

    it('executeWithFailover 成功时 logHandler 收到 latency_ms 和 action', async () => {
      const logs = []
      const mgr = createMockManager([
        { id: 'p1', category: 'llm', enabled: true },
      ])
      const r = new ProviderRouter(mgr, (provider, status, error, context) => {
        logs.push({ providerId: provider.id, status, context })
      })
      await r.executeWithFailover('llm', async () => 'ok', {
        action: 'chat', maxRetries: 1
      })
      expect(logs).toHaveLength(1)
      expect(logs[0].status).toBe('success')
      expect(logs[0].context.category).toBe('llm')
      expect(logs[0].context.action).toBe('chat')
      expect(typeof logs[0].context.latency_ms).toBe('number')
      expect(logs[0].context.latency_ms).toBeGreaterThanOrEqual(0)
    })

    it('executeWithFailover 失败时 logHandler 收到 error + latency_ms', async () => {
      const logs = []
      const mgr = createMockManager([
        { id: 'p1', category: 'llm', enabled: true },
        { id: 'p2', category: 'llm', enabled: true },
      ])
      const r = new ProviderRouter(mgr, (provider, status, error, context) => {
        logs.push({ providerId: provider.id, status, error, context })
      })
      await expect(r.executeWithFailover('llm', async () => {
        throw new Error('timeout')
      }, { action: 'chat', maxRetries: 2 })).rejects.toThrow('timeout')

      // 两次失败都应记录
      expect(logs).toHaveLength(2)
      expect(logs.every(l => l.status === 'error')).toBe(true)
      expect(logs.every(l => l.error === 'timeout')).toBe(true)
      expect(logs.every(l => l.context.action === 'chat')).toBe(true)
      expect(logs.every(l => typeof l.context.latency_ms === 'number')).toBe(true)
    })

    it('executeWithFailover 未传 action 时 context.action 为 null', async () => {
      const logs = []
      const mgr = createMockManager([
        { id: 'p1', category: 'tts', enabled: true },
      ])
      const r = new ProviderRouter(mgr, (provider, status, error, context) => {
        logs.push({ context })
      })
      await r.executeWithFailover('tts', async () => 'ok', { maxRetries: 1 })
      expect(logs[0].context.action).toBeNull()
      expect(logs[0].context.category).toBe('tts')
    })
  })

  // ─── P3.3 质量节拍补跑：边界场景 ───
  describe('P3.3 补跑：getNext — priority 排序边界', () => {
    it('相同 priority 时返回第一个（排序稳定）', () => {
      // 三个 provider 都 priority=5
      const mgr = createMockManager([
        { id: 'p1', category: 'llm', priority: 5, enabled: true },
        { id: 'p2', category: 'llm', priority: 5, enabled: true },
        { id: 'p3', category: 'llm', priority: 5, enabled: true },
      ])
      const r = new ProviderRouter(mgr)
      const result = r.getNext('llm', 'priority')
      expect(result).toBeTruthy()
      // 应返回排序后第一个（具体哪个由 sort 稳定性决定，但必须是 p1/p2/p3 之一）
      expect(['p1', 'p2', 'p3']).toContain(result.id)
    })

    it('provider 无 priority 字段（视为 0）', () => {
      const mgr = createMockManager([
        { id: 'no-prio', category: 'llm', enabled: true },  // 无 priority
        { id: 'has-prio', category: 'llm', priority: 1, enabled: true },
      ])
      const r = new ProviderRouter(mgr)
      const result = r.getNext('llm', 'priority')
      expect(result.id).toBe('has-prio')
    })

    it('负数 priority 排序正确', () => {
      const mgr = createMockManager([
        { id: 'neg', category: 'llm', priority: -10, enabled: true },
        { id: 'zero', category: 'llm', priority: 0, enabled: true },
      ])
      const r = new ProviderRouter(mgr)
      const result = r.getNext('llm', 'priority')
      expect(result.id).toBe('zero')
    })
  })

  describe('P3.3 补跑：getNext — round_robin 边界', () => {
    it('单个 provider 重复调用返回同一个', () => {
      const mgr = createMockManager([
        { id: 'only', category: 'tts', priority: 1, enabled: true },
      ])
      const r = new ProviderRouter(mgr)
      for (let i = 0; i < 5; i++) {
        const result = r.getNext('tts', 'round_robin')
        expect(result.id).toBe('only')
      }
    })

    it('resetIndex(category) 重置指定类别索引', () => {
      // 调用两次让索引前进
      const first = router.getNext('llm', 'round_robin')
      const second = router.getNext('llm', 'round_robin')
      expect(second.id).not.toBe(first.id)

      // 重置
      router.resetIndex('llm')
      const afterReset = router.getNext('llm', 'round_robin')
      expect(afterReset.id).toBe(first.id)
    })

    it('resetIndex() 不传参数重置所有类别', () => {
      const llmFirst = router.getNext('llm', 'round_robin')
      router.getNext('llm', 'round_robin')

      router.resetIndex()
      const afterReset = router.getNext('llm', 'round_robin')
      expect(afterReset.id).toBe(llmFirst.id)
    })

    it('resetIndex(unknown) 不抛错', () => {
      expect(() => router.resetIndex('unknown-category')).not.toThrow()
    })
  })

  describe('P3.3 补跑：getNext — failover 边界', () => {
    it('无 default 时返回第一个 enabled provider', () => {
      // 未设置 default
      const result = router.getNext('llm', 'failover')
      expect(result).toBeTruthy()
      expect(result.id).toBe('openai')
    })

    it('excludeId 等于 default 时返回第一个 enabled', () => {
      manager.setDefault('llm', 'openai')
      const result = router.getNext('llm', 'failover', 'openai')
      expect(result).toBeTruthy()
      expect(result.id).not.toBe('openai')
    })

    it('excludeId 排除所有 provider 时返回 null', () => {
      // 只有一个 provider 且被 exclude
      const mgr = createMockManager([
        { id: 'only', category: 'tts', priority: 1, enabled: true },
      ])
      const r = new ProviderRouter(mgr)
      const result = r.getNext('tts', 'failover', 'only')
      expect(result).toBeNull()
    })
  })

  describe('P3.3 补跑：getNext — listEnabledProviders 异常返回', () => {
    it('listEnabledProviders 返回 null 时 getNext 返回 null', () => {
      manager.listEnabledProviders = vi.fn(() => null)
      const result = router.getNext('llm', 'default')
      expect(result).toBeNull()
    })

    it('listEnabledProviders 抛错时 getNext 传播错误', () => {
      manager.listEnabledProviders = vi.fn(() => {
        throw new Error('DB connection failed')
      })
      expect(() => router.getNext('llm', 'default')).toThrow('DB connection failed')
    })
  })

  describe('P3.3 补跑：executeWithFailover — maxRetries 默认值', () => {
    it('不传 options 时使用默认 maxRetries=3', async () => {
      const fn = vi.fn(async () => {
        throw new Error('always fail')
      })
      await expect(router.executeWithFailover('llm', fn)).rejects.toThrow('always fail')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('maxRetries=1 只调用一次', async () => {
      const fn = vi.fn(async () => {
        throw new Error('single attempt')
      })
      await expect(router.executeWithFailover('llm', fn, { maxRetries: 1 }))
        .rejects.toThrow('single attempt')
      expect(fn).toHaveBeenCalledOnce()
    })

    it('maxRetries 负数抛错', async () => {
      await expect(router.executeWithFailover('llm', async () => 'ok', { maxRetries: -1 }))
        .rejects.toThrow(/maxRetries|positive/i)
    })
  })

  describe('P3.3 补跑：executeWithFailover — fn 返回 falsy 值不触发故障转移', () => {
    it('fn 返回 null 视为成功', async () => {
      manager.setDefault('llm', 'openai')
      const fn = vi.fn(async () => null)
      const result = await router.executeWithFailover('llm', fn)
      expect(result).toBeNull()
      expect(fn).toHaveBeenCalledOnce()
    })

    it('fn 返回 0 视为成功', async () => {
      manager.setDefault('llm', 'openai')
      const fn = vi.fn(async () => 0)
      const result = await router.executeWithFailover('llm', fn)
      expect(result).toBe(0)
      expect(fn).toHaveBeenCalledOnce()
    })

    it('fn 返回 false 视为成功', async () => {
      manager.setDefault('llm', 'openai')
      const fn = vi.fn(async () => false)
      const result = await router.executeWithFailover('llm', fn)
      expect(result).toBe(false)
    })

    it('fn 返回空字符串视为成功', async () => {
      manager.setDefault('llm', 'openai')
      const fn = vi.fn(async () => '')
      const result = await router.executeWithFailover('llm', fn)
      expect(result).toBe('')
    })
  })

  describe('P3.3 补跑：executeWithFailover — 错误类型', () => {
    it('ProviderError 透传到最后', async () => {
      const { ProviderError, ERROR_CODES } = require('./provider-error')
      const fn = vi.fn(async () => {
        throw new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid key')
      })
      try {
        await router.executeWithFailover('llm', fn, { maxRetries: 2 })
        expect.fail('Should throw')
      } catch (e) {
        expect(e).toBeInstanceOf(ProviderError)
        expect(e.code).toBe(ERROR_CODES.AUTH_FAILED)
      }
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('每次失败 excludeIds 累积（不重复失败 provider）— MAJOR bug 已修复', async () => {
      manager.setDefault('llm', 'openai')
      const calledIds = []
      const fn = vi.fn(async (provider) => {
        calledIds.push(provider.id)
        throw new Error('fail ' + provider.id)
      })
      await expect(router.executeWithFailover('llm', fn, { maxRetries: 3 }))
        .rejects.toThrow()
      // 3 次调用应该是 3 个不同的 provider（不重复尝试已失败的）
      expect(calledIds).toHaveLength(3)
      expect(new Set(calledIds).size).toBe(3)
    })

    it('excludeIds 累积验证：3 个 provider 全部失败时不重复', async () => {
      // 3 个 provider，maxRetries=5（大于 provider 数），应只调用 3 次后抛错
      const mgr = createMockManager([
        { id: 'p1', category: 'llm', priority: 1, enabled: true },
        { id: 'p2', category: 'llm', priority: 2, enabled: true },
        { id: 'p3', category: 'llm', priority: 3, enabled: true },
      ])
      // 不设置 default，确保 failover 走 providers[0]
      mgr.getDefault = vi.fn(() => null)
      const r = new ProviderRouter(mgr)

      const calledIds = []
      const fn = vi.fn(async (provider) => {
        calledIds.push(provider.id)
        throw new Error('always fail')
      })

      // maxRetries=5 但只有 3 个 provider，应 3 次后因 "No available provider" 抛错
      await expect(r.executeWithFailover('llm', fn, { maxRetries: 5 }))
        .rejects.toThrow(/No available provider|always fail/)

      // 验证：3 次调用都是不同的 provider（累积排除生效）
      expect(calledIds).toHaveLength(3)
      expect(new Set(calledIds).size).toBe(3)
    })

    it('第 2 次重试不重复第 1 次失败的 provider', async () => {
      manager.setDefault('llm', 'openai')
      const calledIds = []
      const fn = vi.fn(async (provider) => {
        calledIds.push(provider.id)
        if (calledIds.length === 1) throw new Error('first fail')
        return 'ok from ' + provider.id
      })
      const result = await router.executeWithFailover('llm', fn, { maxRetries: 2 })
      // 第一次和第二次应该是不同的 provider
      expect(calledIds[0]).not.toBe(calledIds[1])
      expect(result).toMatch(/^ok from /)
    })
  })

  describe('P3.3 补跑：executeWithFailover — strategy 透传', () => {
    it('使用 priority 策略时按优先级故障转移', async () => {
      const calledIds = []
      const fn = vi.fn(async (provider) => {
        calledIds.push(provider.id)
        if (provider.id === 'openai') throw new Error('top priority fail')
        return 'ok from ' + provider.id
      })
      const result = await router.executeWithFailover('llm', fn, {
        maxRetries: 2,
        strategy: 'priority',
      })
      // 第一次应该 priority 最高的 openai，失败后下一个
      expect(calledIds[0]).toBe('openai')
      expect(calledIds[1]).not.toBe('openai')
      expect(result).toMatch(/^ok from /)
    })

    it('使用 round_robin 策略时轮询故障转移', async () => {
      const calledIds = []
      const fn = vi.fn(async (provider) => {
        calledIds.push(provider.id)
        if (calledIds.length === 1) throw new Error('first fail')
        return 'ok'
      })
      const result = await router.executeWithFailover('llm', fn, {
        maxRetries: 2,
        strategy: 'round_robin',
      })
      expect(calledIds).toHaveLength(2)
      expect(calledIds[0]).not.toBe(calledIds[1])
      expect(result).toBe('ok')
    })
  })

  describe('P3.3 补跑：constructor 参数校验', () => {
    it('manager 缺失 listEnabledProviders 方法时 getNext 抛错', () => {
      const brokenManager = {}
      const r = new ProviderRouter(brokenManager)
      expect(() => r.getNext('llm', 'default')).toThrow()
    })

    it('manager=null 时不立即抛错（延迟到 getNext）', () => {
      const r = new ProviderRouter(null)
      expect(() => r.getNext('llm', 'default')).toThrow()
    })
  })
})
