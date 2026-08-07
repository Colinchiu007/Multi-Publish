import { describe, expect, it, vi } from 'vitest'

import { createTtsVoiceCatalogApi } from './tts-voice-catalog'

describe('TTS 音色目录 preload API', () => {
  it('只暴露固定的受控 IPC 通道', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({ code: 0 })) }
    const api = createTtsVoiceCatalogApi(ipcRenderer)

    await api.ttsVoice.catalog({ providerId: 'openai-tts', model: 'tts-1' })
    await api.ttsVoice.capability({ providerId: 'openai-tts', model: 'tts-1' })
    await api.ttsVoice.select({ providerId: 'openai-tts', model: 'tts-1', voiceId: 'alloy' })

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ['tts-voice:catalog', { providerId: 'openai-tts', model: 'tts-1' }],
      ['tts-voice:capability', { providerId: 'openai-tts', model: 'tts-1' }],
      ['tts-voice:select', { providerId: 'openai-tts', model: 'tts-1', voiceId: 'alloy' }],
    ])
  })
})
