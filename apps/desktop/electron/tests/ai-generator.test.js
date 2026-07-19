import { beforeEach, describe, expect, it, vi } from 'vitest'

const { AIGenerator } = require('../services/ai-generator')

describe('AIGenerator 当前 provider manager 委托合同', () => {
  let generator
  let manager

  beforeEach(() => {
    manager = {
      _ready: true,
      listProviders: vi.fn((type) => ({
        video: [{ id: 'hunyuan', category: 'video' }],
        audio: [{ id: 'suno', category: 'audio' }],
        image: [{ id: 'flux', category: 'image' }],
        tts: [{ id: 'elevenlabs', category: 'tts' }],
      })[type] || []),
      getProvider: vi.fn((providerId) => providerId === 'hunyuan'
        ? { id: 'hunyuan', models: ['hunyuan-video'] }
        : null),
    }
    generator = new AIGenerator()
    generator.setModelProviderManager(manager)
  })

  it('导出 AIGenerator 类', () => {
    expect(AIGenerator).toBeTypeOf('function')
  })

  it('按类型委托 manager.listProviders 并返回数组', () => {
    const results = ['video', 'audio', 'image', 'tts'].map((type) => generator.listProviders(type))

    expect(manager.listProviders.mock.calls).toEqual([
      ['video'],
      ['audio'],
      ['image'],
      ['tts'],
    ])
    expect(results.every(Array.isArray)).toBe(true)
  })

  it('视频 provider 包含 hunyuan', () => {
    expect(generator.listProviders('video')).toContainEqual(
      expect.objectContaining({ id: 'hunyuan', category: 'video' }),
    )
  })

  it('TTS provider 包含 elevenlabs', () => {
    expect(generator.listProviders('tts')).toContainEqual(
      expect.objectContaining({ id: 'elevenlabs', category: 'tts' }),
    )
  })

  it('图片 provider 包含 flux', () => {
    expect(generator.listProviders('image')).toContainEqual(
      expect.objectContaining({ id: 'flux', category: 'image' }),
    )
  })

  it('getProviderConfig 委托 manager 且不暴露 apiKey', () => {
    const config = generator.getProviderConfig('hunyuan')

    expect(manager.getProvider).toHaveBeenCalledWith('hunyuan')
    expect(config).toEqual({ id: 'hunyuan', models: ['hunyuan-video'] })
    expect(config).not.toHaveProperty('apiKey')
  })

  it('未知 provider 返回 null', () => {
    expect(generator.getProviderConfig('unknown_provider')).toBeNull()
    expect(manager.getProvider).toHaveBeenCalledWith('unknown_provider')
  })

  it('listModels 委托 manager 并返回独立模型数组', () => {
    const models = generator.listModels('hunyuan')

    expect(manager.getProvider).toHaveBeenCalledWith('hunyuan')
    expect(models).toEqual(['hunyuan-video'])
    models.push('mutated')
    expect(generator.listModels('hunyuan')).toEqual(['hunyuan-video'])
  })
})
