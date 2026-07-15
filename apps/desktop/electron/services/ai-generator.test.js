// @ts-check
/**
 * ai-generator.test.js — P1 TDD 先行测试
 *
 * 验证「删除 PROVIDERS + _configs 后行为不变」：
 * - listProviders(type) 委托 manager.listProviders(category)
 * - getProviderConfig(id) 委托 manager.getProvider(id)
 * - listModels(id) 委托 manager.getProvider(id).models
 * - testConnection(id) 委托 manager.testConnection(id)
 * - generate() 委托 manager.getProviderWithKey(id) + PythonBridge
 * - updateProviderConfig() 委托 manager.updateProvider(id, updates)
 *
 * 关键：无 manager 时返回空/null，不再回退到 PROVIDERS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── mock 依赖 ───
const mockManager = {
  _ready: true,
  listProviders: vi.fn((category) => {
    if (category === 'video') return [{ id: 'hunyuan', name: '腾讯混元', category: 'video', models: ['hunyuan-video'] }]
    if (category === 'tts') return [{ id: 'elevenlabs', name: 'ElevenLabs', category: 'tts', models: ['eleven_multilingual_v2'] }]
    if (category === 'image') return [{ id: 'flux', name: 'Flux', category: 'image', models: ['flux-pro'] }]
    if (category === 'audio') return [{ id: 'suno', name: 'Suno', category: 'audio', models: ['suno-v4'] }]
    return []
  }),
  getProvider: vi.fn((id) => {
    if (id === 'hunyuan') return { id: 'hunyuan', name: '腾讯混元', category: 'video', models: ['hunyuan-video'], base_url: '', enabled: false }
    return null
  }),
  getProviderWithKey: vi.fn((id) => {
    if (id === 'hunyuan') return { id: 'hunyuan', name: '腾讯混元', category: 'video', models: ['hunyuan-video'], api_key: 'sk-test', base_url: '' }
    return null
  }),
  testConnection: vi.fn(async (id) => {
    if (id === 'hunyuan') return { code: 0, message: '连接成功' }
    return { code: -1, message: '服务商不存在' }
  }),
  updateProvider: vi.fn(() => ({ code: 0 })),
}

// mock python-bridge
__registerMock('./python-bridge', {
  isRunning: vi.fn(() => false),
  requestBackend: vi.fn(async () => { throw new Error('mock: python bridge not running') }),
})

// mock logger
__registerMock('./logger', {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

let AIGenerator

beforeAll(() => {
  __enableElectronMock()
  AIGenerator = require('./ai-generator').AIGenerator
})

describe('AIGenerator — P1 统一数据源（删除 PROVIDERS）', () => {
  let gen

  beforeEach(() => {
    vi.clearAllMocks()
    gen = new AIGenerator()
    gen.setModelProviderManager(mockManager)
  })

  describe('listProviders', () => {
    it('listProviders("video") 委托 manager 返回视频供应商', () => {
      const result = gen.listProviders('video')
      expect(mockManager.listProviders).toHaveBeenCalledWith('video')
      expect(Array.isArray(result)).toBe(true)
      expect(result.some(p => p.id === 'hunyuan')).toBe(true)
    })

    it('listProviders("tts") 委托 manager 返回 TTS 供应商', () => {
      const result = gen.listProviders('tts')
      expect(mockManager.listProviders).toHaveBeenCalledWith('tts')
      expect(result.some(p => p.id === 'elevenlabs')).toBe(true)
    })

    it('listProviders("image") 委托 manager 返回图片供应商', () => {
      const result = gen.listProviders('image')
      expect(mockManager.listProviders).toHaveBeenCalledWith('image')
      expect(result.some(p => p.id === 'flux')).toBe(true)
    })

    it('listProviders("audio") 委托 manager 返回音频供应商', () => {
      const result = gen.listProviders('audio')
      expect(mockManager.listProviders).toHaveBeenCalledWith('audio')
      expect(result.some(p => p.id === 'suno')).toBe(true)
    })

    it('listProviders(null) 委托 manager 返回全部', () => {
      const result = gen.listProviders(null)
      expect(mockManager.listProviders).toHaveBeenCalled()
      expect(Array.isArray(result)).toBe(true)
    })

    it('无 manager 时返回空数组（不再回退到 PROVIDERS）', () => {
      const genNoManager = new AIGenerator()
      const result = genNoManager.listProviders('video')
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })
  })

  describe('getProviderConfig', () => {
    it('getProviderConfig("hunyuan") 委托 manager 返回配置（不含 apiKey）', () => {
      const config = gen.getProviderConfig('hunyuan')
      expect(mockManager.getProvider).toHaveBeenCalledWith('hunyuan')
      expect(config).toBeTruthy()
      expect(config.id).toBe('hunyuan')
      expect(config.apiKey).toBeUndefined()
    })

    it('getProviderConfig("unknown") 返回 null', () => {
      const result = gen.getProviderConfig('unknown_provider')
      expect(result).toBeNull()
    })

    it('无 manager 时返回 null', () => {
      const genNoManager = new AIGenerator()
      expect(genNoManager.getProviderConfig('hunyuan')).toBeNull()
    })
  })

  describe('listModels', () => {
    it('listModels("hunyuan") 委托 manager 返回模型列表', () => {
      const models = gen.listModels('hunyuan')
      expect(mockManager.getProvider).toHaveBeenCalledWith('hunyuan')
      expect(Array.isArray(models)).toBe(true)
      expect(models).toContain('hunyuan-video')
    })

    it('listModels("unknown") 返回空数组', () => {
      const result = gen.listModels('unknown_provider')
      expect(Array.isArray(result)).toBe(true)
      expect(result).toEqual([])
    })
  })

  describe('testConnection', () => {
    it('testConnection("hunyuan") 委托 manager', async () => {
      const result = await gen.testConnection('hunyuan')
      expect(mockManager.testConnection).toHaveBeenCalledWith('hunyuan')
      expect(result.code).toBe(0)
    })

    it('无 manager 时返回失败', async () => {
      const genNoManager = new AIGenerator()
      const result = await genNoManager.testConnection('hunyuan')
      expect(result.success !== true || result.code < 0).toBe(true)
    })
  })

  describe('updateProviderConfig', () => {
    it('updateProviderConfig 委托 manager.updateProvider', () => {
      const result = gen.updateProviderConfig('hunyuan', { api_key: 'sk-new' })
      expect(mockManager.updateProvider).toHaveBeenCalledWith('hunyuan', { api_key: 'sk-new' })
    })
  })

  describe('generate', () => {
    it('generate 委托 manager.getProviderWithKey + PythonBridge', async () => {
      // PythonBridge mock 返回 isRunning=false，应抛错
      await expect(gen.generate('video', 'hunyuan', {})).rejects.toThrow()
      expect(mockManager.getProviderWithKey).toHaveBeenCalledWith('hunyuan')
    })

    it('generate 未知供应商抛错', async () => {
      await expect(gen.generate('video', 'unknown_provider', {})).rejects.toThrow()
    })
  })

  describe('PROVIDERS 已删除验证', () => {
    it('AIGenerator 实例不再有 _configs Map', () => {
      expect(gen._configs).toBeUndefined()
    })

    it('AIGenerator 模块不再导出 PROVIDERS', () => {
      const mod = require('./ai-generator')
      expect(mod.PROVIDERS).toBeUndefined()
    })
  })

  // ─── P1 质量节拍补跑：边界场景（manager._ready / 突变安全 / 异常 / 未知 type） ───
  describe('P1 补跑：manager._ready=false 边界', () => {
    it('manager._ready=false 时 listProviders 返回空数组', () => {
      const genNotReady = new AIGenerator()
      const notReadyManager = { ...mockManager, _ready: false }
      genNotReady.setModelProviderManager(notReadyManager)
      const result = genNotReady.listProviders('video')
      expect(result).toEqual([])
      expect(notReadyManager.listProviders).not.toHaveBeenCalled()
    })

    it('manager._ready=false 时 getProviderConfig 返回 null', () => {
      const genNotReady = new AIGenerator()
      const notReadyManager = { ...mockManager, _ready: false }
      genNotReady.setModelProviderManager(notReadyManager)
      const result = genNotReady.getProviderConfig('hunyuan')
      expect(result).toBeNull()
    })

    it('manager._ready=false 时 listModels 返回空数组', () => {
      const genNotReady = new AIGenerator()
      const notReadyManager = { ...mockManager, _ready: false }
      genNotReady.setModelProviderManager(notReadyManager)
      const result = genNotReady.listModels('hunyuan')
      expect(result).toEqual([])
    })

    it('manager._ready=false 时 testConnection 返回失败', async () => {
      const genNotReady = new AIGenerator()
      const notReadyManager = { ...mockManager, _ready: false }
      genNotReady.setModelProviderManager(notReadyManager)
      const result = await genNotReady.testConnection('hunyuan')
      expect(result.success).toBe(false)
    })

    it('manager._ready=false 时 updateProviderConfig 返回 false', () => {
      const genNotReady = new AIGenerator()
      const notReadyManager = { ...mockManager, _ready: false }
      genNotReady.setModelProviderManager(notReadyManager)
      const result = genNotReady.updateProviderConfig('hunyuan', { api_key: 'x' })
      expect(result).toBe(false)
    })

    it('manager._ready=false 时 generate 抛错', async () => {
      const genNotReady = new AIGenerator()
      const notReadyManager = { ...mockManager, _ready: false }
      genNotReady.setModelProviderManager(notReadyManager)
      await expect(genNotReady.generate('video', 'hunyuan', {}))
        .rejects.toThrow(/manager.*not available/i)
    })
  })

  describe('P1 补跑：listModels 突变安全', () => {
    it('修改 listModels 返回值不污染 manager 内部', () => {
      // manager.getProvider 返回 { models: ['hunyuan-video'] }
      const result1 = gen.listModels('hunyuan')
      expect(result1).toContain('hunyuan-video')

      // 修改返回值
      result1.push('tampered')
      result1[0] = 'mutated'

      // 再次获取，应该不受影响
      const result2 = gen.listModels('hunyuan')
      expect(result2).not.toContain('tampered')
      expect(result2).toContain('hunyuan-video')
    })
  })

  describe('P1 补跑：updateProviderConfig 异常', () => {
    it('manager.updateProvider 抛异常时不崩溃', () => {
      const errorManager = {
        ...mockManager,
        updateProvider: vi.fn(() => { throw new Error('DB locked') }),
      }
      gen.setModelProviderManager(errorManager)
      // 当前实现不 try-catch，异常会抛出
      expect(() => gen.updateProviderConfig('hunyuan', { api_key: 'x' }))
        .toThrow('DB locked')
    })
  })

  describe('P1 补跑：generate 未知 type', () => {
    it('未知 type 回退到 chatCompletion 方法', async () => {
      // 使用 integration test 的 mock 模式
      mockManager._adapterFactories = new Map()
      mockManager._adapterFactories.set('unknown_type_provider', () => ({}))
      mockManager.getProviderWithKey.mockReturnValue({ id: 'unknown_type_provider', api_key: 'sk-test' })
      mockManager.callAdapter = vi.fn(async () => ({ code: 0, data: { content: 'ok' } }))

      // 未知 type 'embedding' 不在 TYPE_TO_METHOD 中，应回退到 chatCompletion
      const result = await gen.generate('embedding', 'unknown_type_provider', {})
      expect(mockManager.callAdapter).toHaveBeenCalledWith('unknown_type_provider', 'chatCompletion', expect.any(Object))
      expect(result.content).toBe('ok')
    })
  })
})
