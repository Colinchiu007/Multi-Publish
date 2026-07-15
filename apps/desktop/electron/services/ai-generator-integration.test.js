// @ts-check
/**
 * ai-generator-integration.test.js — P3.5 TDD: ai-generator 集成 router + callAdapter
 *
 * 验证：
 * - setRouter: 注入 ProviderRouter
 * - generateViaAdapter: 有 Adapter 注册时通过 callAdapter 调用
 * - generateWithFailover: 通过 router.executeWithFailover 故障转移
 * - generateViaPythonBridge: 无 Adapter 时 fallback 到 python-bridge
 * - onProgress 回调透传
 * - ProviderError 透传
 * - 无 manager/router 错误处理
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

__registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })
__registerMock('./python-bridge', {
  isRunning: vi.fn(() => false),
  requestBackend: vi.fn(async () => ({ content: 'python-bridge response' })),
})

const { AIGenerator } = require('./ai-generator')
const { ProviderError, ERROR_CODES } = require('./adapters/provider-error')

// ─── mock manager ───
function createMockManager(providers = []) {
  return {
    _ready: true,
    listProviders: vi.fn((category) => providers.filter(p => p.category === category)),
    getProvider: vi.fn((id) => providers.find(p => p.id === id) || null),
    getProviderWithKey: vi.fn((id) => {
      const p = providers.find(p => p.id === id)
      return p ? { ...p, api_key: p.api_key || 'sk-test' } : null
    }),
    testConnection: vi.fn(async (id) => ({ code: 0, data: { success: true } })),
    updateProvider: vi.fn(),
    callAdapter: vi.fn(async (providerId, method, params) => {
      return { code: 0, data: { content: 'adapter response from ' + providerId } }
    }),
    _adapterFactories: new Map(),
  }
}

// ─── mock router ───
function createMockRouter(providers) {
  return {
    getNext: vi.fn((category, strategy, excludeId) => {
      const available = providers.filter(p => p.category === category && p.id !== excludeId && p.enabled !== false)
      return available[0] || null
    }),
    executeWithFailover: vi.fn(async (category, fn, options = {}) => {
      const provider = providers.find(p => p.category === category && p.enabled !== false)
      if (!provider) throw new Error('No available provider for category "' + category + '"')
      return await fn(provider)
    }),
  }
}

describe('AIGenerator — P3.5 router + callAdapter 集成', () => {
  let ai, manager, router

  beforeEach(() => {
    manager = createMockManager([
      { id: 'openai', name: 'OpenAI', category: 'llm', api_key: 'sk-test', enabled: true },
      { id: 'anthropic', name: 'Anthropic', category: 'llm', api_key: 'sk-anthropic', enabled: true },
    ])
    router = createMockRouter(manager.listProviders('llm'))
    ai = new AIGenerator()
    ai.setModelProviderManager(manager)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setRouter — 注入 ProviderRouter', () => {
    it('setRouter 注入 router 实例', () => {
      ai.setRouter(router)
      expect(ai._router).toBe(router)
    })
  })

  describe('generateViaAdapter — 通过 callAdapter 调用', () => {
    it('有 Adapter 注册时通过 callAdapter 调用', async () => {
      ai.setRouter(router)
      // 模拟 manager 有 Adapter 工厂注册
      manager._adapterFactories.set('openai', () => ({}))

      const result = await ai.generate('llm', 'openai', {
        messages: [{ role: 'user', content: 'Hi' }],
      })

      expect(result.content).toBe('adapter response from openai')
      expect(manager.callAdapter).toHaveBeenCalledWith('openai', 'chatCompletion', expect.any(Object))
    })

    it('chatCompletion 方法映射', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('openai', () => ({}))

      await ai.generate('llm', 'openai', {
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const callArgs = manager.callAdapter.mock.calls[0]
      expect(callArgs[1]).toBe('chatCompletion')
    })
  })

  describe('generateWithFailover — 故障转移', () => {
    it('通过 router.executeWithFailover 调用', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('openai', () => ({}))
      manager._adapterFactories.set('anthropic', () => ({}))

      await ai.generate('llm', null, {
        messages: [{ role: 'user', content: 'Hi' }],
        useFailover: true,
      })

      expect(router.executeWithFailover).toHaveBeenCalled()
    })

    it('主 provider 失败自动切换到备用', async () => {
      const failoverRouter = createMockRouter([
        { id: 'openai', category: 'llm', enabled: true },
        { id: 'anthropic', category: 'llm', enabled: true },
      ])
      failoverRouter.executeWithFailover = vi.fn(async (category, fn) => {
        // 模拟 openai 失败，anthropic 成功
        const providers = [
          { id: 'openai', category: 'llm', enabled: true },
          { id: 'anthropic', category: 'llm', enabled: true },
        ]
        for (const p of providers) {
          try {
            return await fn(p)
          } catch (e) { /* 继续下一个 */ }
        }
        throw new Error('All failed')
      })
      manager.callAdapter = vi.fn(async (providerId) => {
        if (providerId === 'openai') {
          return { code: -1, error: new ProviderError(ERROR_CODES.RATE_LIMITED, 'rate limited') }
        }
        return { code: 0, data: { content: 'from anthropic' } }
      })

      ai.setRouter(failoverRouter)
      manager._adapterFactories.set('openai', () => ({}))
      manager._adapterFactories.set('anthropic', () => ({}))

      const result = await ai.generate('llm', null, {
        messages: [{ role: 'user', content: 'Hi' }],
        useFailover: true,
      })

      expect(result.content).toBe('from anthropic')
      expect(manager.callAdapter).toHaveBeenCalledTimes(2)
    })
  })

  describe('generateViaPythonBridge — 无 Adapter 时 fallback', () => {
    it('无 Adapter 注册时 fallback 到 python-bridge', async () => {
      // 不注册任何 Adapter
      const PythonBridge = require('./python-bridge')
      PythonBridge.isRunning.mockReturnValue(true)
      PythonBridge.requestBackend.mockClear()
      PythonBridge.requestBackend.mockResolvedValue({ content: 'python-bridge response' })
      // sora provider 存在于 manager
      manager.getProviderWithKey.mockReturnValue({ id: 'sora', api_key: 'sk-test', category: 'video' })

      const result = await ai.generate('video', 'sora', {
        prompt: 'a cat',
      })

      expect(PythonBridge.requestBackend).toHaveBeenCalled()
      expect(result.content).toBe('python-bridge response')
    })

    it('python-bridge 也不可用时抛错', async () => {
      const PythonBridge = require('./python-bridge')
      PythonBridge.isRunning.mockReturnValue(false)
      manager.getProviderWithKey.mockReturnValue({ id: 'sora', api_key: 'sk-test', category: 'video' })

      await expect(ai.generate('video', 'sora', { prompt: 'a cat' }))
        .rejects.toThrow(/not available|python/i)
    })
  })

  describe('generate — 错误处理', () => {
    it('无 manager 抛错', async () => {
      const ai2 = new AIGenerator()
      await expect(ai2.generate('llm', 'openai', {}))
        .rejects.toThrow(/manager.*not available/i)
    })

    it('provider 不存在抛错', async () => {
      ai.setRouter(router)
      manager.getProviderWithKey.mockReturnValue(null)

      await expect(ai.generate('llm', 'nonexistent', {}))
        .rejects.toThrow(/unknown provider|not found/i)
    })

    it('ProviderError 透传', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('openai', () => ({}))
      manager.callAdapter.mockResolvedValue({
        code: -1,
        error: new ProviderError(ERROR_CODES.AUTH_FAILED, 'Invalid key'),
      })

      await expect(ai.generate('llm', 'openai', { messages: [] }))
        .rejects.toThrow(/Invalid key/)
    })
  })

  describe('generate — onProgress 回调', () => {
    it('onProgress 在调用前触发 start 事件', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('openai', () => ({}))

      const events = []
      await ai.generate('llm', 'openai', {
        messages: [{ role: 'user', content: 'Hi' }],
      }, (e) => events.push(e))

      expect(events.length).toBeGreaterThan(0)
      expect(events[0]).toMatchObject({ stage: expect.any(String) })
    })
  })

  describe('testConnection — 升级', () => {
    it('委托给 manager.testConnection', async () => {
      const result = await ai.testConnection('openai')
      expect(manager.testConnection).toHaveBeenCalledWith('openai')
      expect(result.code).toBe(0)
    })
  })

  describe('方法映射 — type 到 Adapter method', () => {
    it('llm → chatCompletion', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('openai', () => ({}))

      await ai.generate('llm', 'openai', { messages: [] })
      expect(manager.callAdapter.mock.calls[0][1]).toBe('chatCompletion')
    })

    it('tts → synthesize', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('elevenlabs', () => ({}))
      manager.listProviders.mockReturnValue([{ id: 'elevenlabs', category: 'tts' }])
      manager.getProviderWithKey.mockReturnValue({ id: 'elevenlabs', api_key: 'sk-test', category: 'tts' })

      await ai.generate('tts', 'elevenlabs', { text: 'hello' })
      expect(manager.callAdapter.mock.calls[0][1]).toBe('synthesize')
    })

    it('image → generateImage', async () => {
      ai.setRouter(router)
      manager._adapterFactories.set('dalle', () => ({}))
      manager.getProviderWithKey.mockReturnValue({ id: 'dalle', api_key: 'sk-test', category: 'image' })

      await ai.generate('image', 'dalle', { prompt: 'a cat' })
      expect(manager.callAdapter.mock.calls[0][1]).toBe('generateImage')
    })
  })
})
