const adapterRegistry = require('./adapters/_base/registry-singleton')

// @vitest-environment node
'use strict'

const { ModelProviderManager } = require('./model-provider-manager')

function createManager(provider) {
  const manager = new ModelProviderManager(null)
  manager._ready = true
  manager.getProviderWithKey = vi.fn(() => provider)
  manager._writeLog = vi.fn()
  if (adapterRegistry.hasFactory(provider.id)) { adapterRegistry.removeFactory(provider.id) } adapterRegistry.registerFactory(provider.id, () => ({}))
  manager._getOrCreateAdapter = vi.fn(() => ({
    supports: () => true,
    synthesize: vi.fn(async () => ({ audio: Buffer.from('audio'), format: 'wav' })),
  }))
  return manager
}

describe('ModelProviderManager local no-key adapters', () => {
  it('allows a loopback Piper provider without an API key', async () => {
    const manager = createManager({
      id: 'piper',
      name: 'Piper',
      category: 'tts',
      base_url: 'http://127.0.0.1:5000',
      api_key: '',
    })

    await expect(manager.callAdapter('piper', 'synthesize', { text: '本地语音' }))
      .resolves.toMatchObject({ code: 0, data: { format: 'wav' } })
    expect(manager._getOrCreateAdapter).toHaveBeenCalledTimes(1)
  })

  it('still rejects a no-key local adapter when its endpoint is remote', async () => {
    const manager = createManager({
      id: 'piper',
      name: 'Piper',
      category: 'tts',
      base_url: 'https://example.invalid',
      api_key: '',
    })

    await expect(manager.callAdapter('piper', 'synthesize', { text: '不应发出远程请求' }))
      .resolves.toMatchObject({ code: -1, message: expect.stringMatching(/API Key/i) })
    expect(manager._getOrCreateAdapter).not.toHaveBeenCalled()
  })
  it.each([
    ['piper', 'tts'],
    ['local-diffusion', 'image'],
    ['comfyui', 'image'],
  ])('returns an enabled loopback %s provider as the default without an API key', (id, category) => {
    const provider = {
      id,
      name: id,
      category,
      base_url: 'http://127.0.0.1:5000',
      api_key_enc: null,
      api_key: '',
      models: '[]',
      config: '{}',
      enabled: 1,
      is_default: 1,
      is_preset: 1,
    }
    const manager = new ModelProviderManager({
      db: {
        prepare: vi.fn(() => ({ all: vi.fn(() => [provider]) })),
      },
    })
    manager._ready = true

    expect(manager.getDefault(category)).toMatchObject({
      id,
      is_configured: true,
      api_key_masked: '',
    })
  })
})
