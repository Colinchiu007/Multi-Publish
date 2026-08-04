import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  addTtsVoiceClone,
  chooseTtsVoiceCloneSamples,
  deleteTtsVoiceClone,
  getTtsVoiceCloneRequirements,
  listTtsVoiceClones,
} from './tts-voice-clone'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderer TTS 音色克隆 API', () => {
  it('只调用隔离 preload API，并把输入转换为纯 JSON IPC 值', async () => {
    const requirements = vi.fn(async input => ({ code: 0, data: input }))
    const chooseSamples = vi.fn(async input => ({ code: 0, data: input }))
    const list = vi.fn(async input => ({ code: 0, data: input }))
    const add = vi.fn(async input => ({ code: 0, data: input }))
    const deleteClone = vi.fn(async input => ({ code: 0, data: input }))
    vi.stubGlobal('window', { electronAPI: { ttsVoiceClone: { requirements, chooseSamples, list, add, deleteClone } } })

    const input = { providerId: 'elevenlabs', model: 'eleven_multilingual_v2', nested: { value: 'safe' } }
    await getTtsVoiceCloneRequirements(input)
    await chooseTtsVoiceCloneSamples(input)
    await listTtsVoiceClones(input)
    await addTtsVoiceClone({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2', name: 'Voice', selectionId: 'selection-a', consent: true })
    await deleteTtsVoiceClone({ ...input, voiceId: 'voice-a' })

    expect(requirements).toHaveBeenCalledWith(input)
    expect(chooseSamples).toHaveBeenCalledWith(input)
    expect(list).toHaveBeenCalledWith(input)
    expect(add).toHaveBeenCalledWith({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2', name: 'Voice', selectionId: 'selection-a', consent: true })
    expect(deleteClone).toHaveBeenCalledWith({ ...input, voiceId: 'voice-a' })
  })

  it('在 Electron API 缺失时对列表 fail closed', async () => {
    vi.stubGlobal('window', {})

    await expect(listTtsVoiceClones({ providerId: 'elevenlabs', model: 'eleven_multilingual_v2' }))
      .resolves.toMatchObject({ code: -1, message: 'TTS_VOICE_CLONE_API_UNAVAILABLE', data: { voices: [] } })
  })
})
