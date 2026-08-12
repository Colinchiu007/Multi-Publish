import { describe, expect, it, vi } from 'vitest'

import { createTtsVoiceCloneApi } from './tts-voice-clone'

describe('TTS 音色克隆 preload API', () => {
  it('只暴露固定的克隆 IPC 通道', async () => {
    const ipcRenderer = { invoke: vi.fn(async () => ({ code: 0 })) }
    const api = createTtsVoiceCloneApi(ipcRenderer)

    await api.ttsVoiceClone.requirements({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2' })
    await api.ttsVoiceClone.chooseSamples({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2' })
    await api.ttsVoiceClone.list({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2' })
    await api.ttsVoiceClone.add({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2', name: 'Voice', selectionId: 'selection-a', consent: true })
    await api.ttsVoiceClone.deleteClone({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice-a' })
    await api.ttsVoiceClone.rename({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice-a', name: '我的音色' })

    expect(ipcRenderer.invoke.mock.calls).toEqual([
      ['tts-voice-clone:requirements', { providerId: 'elevenlabs', model: 'eleven_multilingual_v2' }],
      ['tts-voice-clone:choose-samples', { providerId: 'elevenlabs', model: 'eleven_multilingual_v2' }],
      ['tts-voice-clone:list', { providerId: 'elevenlabs', model: 'eleven_multilingual_v2' }],
      ['tts-voice-clone:add', { providerId: 'elevenlabs', model: 'eleven_multilingual_v2', name: 'Voice', selectionId: 'selection-a', consent: true }],
      ['tts-voice-clone:delete', { providerId: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice-a' }],
      ['tts-voice-clone:rename', { providerId: 'elevenlabs', model: 'eleven_multilingual_v2', voiceId: 'voice-a', name: '我的音色' }],
    ])
  })
})
