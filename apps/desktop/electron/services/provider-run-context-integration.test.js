// @vitest-environment node
'use strict'

const { ProviderError, ERROR_CODES } = require('./adapters/_base/provider-error')
const { ProviderRunContext, ProviderCircuitOpenError } = require('./provider-run-context')
const { ModelProviderManager } = require('./model-provider-manager')

describe('ModelProviderManager.callAdapter runtime circuit breaker', () => {
  let manager
  let adapter

  beforeEach(() => {
    __enableElectronMock()
    __registerMock('./logger', { info: vi.fn(), warn: vi.fn(), error: vi.fn() })

    manager = new ModelProviderManager({ _ready: true, addProviderLog: vi.fn() })
    manager._ready = true
    adapter = {
      supports: vi.fn(() => true),
      chatCompletion: vi.fn(async () => ({ content: 'ok' })),
      cloneVoice: vi.fn(async () => ({ id: 'MiniMaxCloneVoice_new123' })),
    }
    manager.registerAdapter('minimax-multimodal', () => adapter)
    vi.spyOn(manager, 'getProviderWithKey').mockReturnValue({
      id: 'minimax-multimodal',
      name: 'MiniMax',
      category: 'multimodal',
      api_key: 'sk-test',
      api_key_enc: null,
      models: ['MiniMax-M3'],
      config: {},
    })
  })

  it('opens provider breaker on quota error and stops later adapter calls', async () => {
    adapter.chatCompletion.mockRejectedValueOnce(new ProviderError(
      ERROR_CODES.QUOTA_EXCEEDED,
      '[QUOTA_EXCEEDED] insufficient balance',
      { providerId: 'minimax-multimodal' },
    ))
    const ctx = new ProviderRunContext()

    const first = await manager.callAdapter('minimax-multimodal', 'chatCompletion', { messages: [] }, { providerRunContext: ctx })

    expect(first.code).toBe(-1)
    expect(ctx.isOpen('minimax-multimodal')).toBe(true)
    expect(adapter.chatCompletion).toHaveBeenCalledTimes(1)

    const second = await manager.callAdapter('minimax-multimodal', 'chatCompletion', { messages: [] }, { providerRunContext: ctx })
    expect(second.errorCode).toBe('PROVIDER_CIRCUIT_OPEN')
    expect(second).toMatchObject({ code: -1, message: expect.stringContaining('minimax-multimodal') })
    expect(adapter.chatCompletion).toHaveBeenCalledTimes(1)
  })

  it('keeps legacy three-argument calls working without a runtime context', async () => {
    const result = await manager.callAdapter('minimax-multimodal', 'chatCompletion', { messages: [] })
    expect(result.code).toBe(0)
    expect(adapter.chatCompletion).toHaveBeenCalledTimes(1)
  })

  it('passes runtime context to cloneVoice and deduplicates same-voice recovery', async () => {
    adapter.cloneVoice = vi.fn(async () => ({ id: 'MiniMaxCloneVoice_new123' }))
    const ctx = new ProviderRunContext()

    const first = ctx.cloneVoiceOnce({
      providerId: 'minimax-multimodal',
      voiceId: 'MiniMaxCloneVoice_00jngz',
      fn: async () => {
        const r = await manager.callAdapter('minimax-multimodal', 'cloneVoice', { name: 'MiniMaxCloneVoice_00jngz', samples: [] })
        if (r.code !== 0) throw new ProviderCircuitOpenError('minimax-multimodal', r.message)
        return r.data.id
      },
    })
    const second = ctx.cloneVoiceOnce({
      providerId: 'minimax-multimodal',
      voiceId: 'MiniMaxCloneVoice_00jngz',
      fn: vi.fn(async () => 'should-not-run'),
    })

    await expect(first).resolves.toMatchObject({ succeeded: true, voiceId: 'MiniMaxCloneVoice_new123' })
    await expect(second).resolves.toMatchObject({ succeeded: true, voiceId: 'MiniMaxCloneVoice_new123' })
    expect(adapter.cloneVoice).toHaveBeenCalledTimes(1)
  })
})
