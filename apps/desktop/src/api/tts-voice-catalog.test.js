import { afterEach, describe, expect, it, vi } from 'vitest'

import { getTtsVoiceCapability, getTtsVoiceCatalog, selectTtsVoice } from './tts-voice-catalog'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderer TTS 音色目录 API', () => {
  it('使用隔离后的 preload API，并把 reactive 输入转换为纯 JSON', async () => {
    const catalog = vi.fn(async (input) => ({ code: 0, data: input }))
    const capability = vi.fn(async (input) => ({ code: 0, data: input }))
    const select = vi.fn(async (input) => ({ code: 0, data: input }))
    vi.stubGlobal('window', { electronAPI: { ttsVoice: { catalog, capability, select } } })

    const input = { providerId: 'openai-tts', model: 'tts-1', nested: { value: 'safe' } }
    await getTtsVoiceCatalog(input)
    await getTtsVoiceCapability(input)
    await selectTtsVoice({ ...input, voiceId: 'alloy' })

    expect(catalog).toHaveBeenCalledWith(input)
    expect(capability).toHaveBeenCalledWith(input)
    expect(select).toHaveBeenCalledWith({ ...input, voiceId: 'alloy' })
  })

  it('在 Electron API 缺失时 fail closed', async () => {
    vi.stubGlobal('window', {})

    await expect(getTtsVoiceCatalog({ providerId: 'openai-tts', model: 'tts-1' }))
      .resolves.toMatchObject({ code: -1, message: 'TTS_VOICE_API_UNAVAILABLE', data: { voices: [] } })
  })
})
