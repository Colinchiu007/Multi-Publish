import { describe, expect, it } from 'vitest'

import {
  CAPABILITY_TYPES,
  getVoiceCapability,
  normalizeVoiceList,
} from './tts-voice-catalog'

describe('TTS 音色能力目录', () => {
  it('只对已批准的 provider/model 组合返回能力', () => {
    for (const model of ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15']) {
      expect(getVoiceCapability('openai-tts', model)).toMatchObject({
        model,
        type: CAPABILITY_TYPES.BUILTIN,
        canListVoices: true,
        defaultVoiceId: 'alloy',
      })
    }
    expect(getVoiceCapability('openai-tts', 'unknown-model')).toMatchObject({
      type: CAPABILITY_TYPES.UNSUPPORTED,
      canListVoices: false,
    })
    expect(getVoiceCapability('unknown-provider', 'tts-1')).toMatchObject({
      type: CAPABILITY_TYPES.UNSUPPORTED,
      canListVoices: false,
    })
  })

  it('提供平台个人槽位和已实现克隆的明确元数据', () => {
    const doubao = getVoiceCapability('doubao-tts', 'doubao-tts')
    const elevenLabs = getVoiceCapability('elevenlabs', 'eleven_multilingual_v2')

    expect(doubao).toMatchObject({
      type: CAPABILITY_TYPES.PROVIDER_PERSONAL_SLOT,
      clone: {
        enabled: false,
        entry: 'provider_console',
        implementation: 'external_console_required',
      },
    })
    expect(elevenLabs).toMatchObject({
      type: CAPABILITY_TYPES.USER_CLONE,
      clone: {
        enabled: true,
        entry: 'desktop_upload',
        implementation: 'adapter_implemented',
      },
    })
  })

  it('只保留安全可显示的音色元数据', () => {
    const voices = normalizeVoiceList([
      {
        voice_id: 'voice-1',
        name: '安全音色',
        api_key: 'must-not-persist',
        authorization: 'Bearer must-not-persist',
        audio: Buffer.from('must-not-persist'),
        clonePath: 'voice-clones/user-1.wav',
      },
      {
        id: 'voice-2',
        display_name: '备用音色',
        token: 'must-not-persist',
        clonePath: '../../escape.wav',
      },
    ], { source: CAPABILITY_TYPES.USER_CLONE })

    expect(voices).toEqual([
      {
        id: 'voice-1',
        name: '安全音色',
        source: CAPABILITY_TYPES.USER_CLONE,
        clonePath: 'voice-clones/user-1.wav',
      },
      {
        id: 'voice-2',
        name: '备用音色',
        source: CAPABILITY_TYPES.USER_CLONE,
      },
    ])
    expect(JSON.stringify(voices)).not.toContain('must-not-persist')
  })

  it('多模态预设（minimax-multimodal）复用 MiniMax TTS 音色能力边界', () => {
    for (const model of ['speech-2.8-turbo', 'speech-2.8-hd', 'speech-2.6-hd', 'speech-2.6-turbo']) {
      const capability = getVoiceCapability('minimax-multimodal', model)
      expect(capability).toMatchObject({
        model,
        type: CAPABILITY_TYPES.USER_CLONE,
        canListVoices: true,
        defaultVoiceId: 'male-qn-qingse',
        clone: { enabled: true, entry: 'desktop_upload', implementation: 'adapter_implemented' },
      })
    }
    // 非 TTS 模型与未列入白名单的 TTS 模型必须 fail closed
    expect(getVoiceCapability('minimax-multimodal', 'image-01')).toMatchObject({
      type: CAPABILITY_TYPES.UNSUPPORTED,
      canListVoices: false,
      reason: 'model_not_whitelisted',
    })
    expect(getVoiceCapability('minimax-multimodal', 'speech-3.0')).toMatchObject({
      type: CAPABILITY_TYPES.UNSUPPORTED,
      canListVoices: false,
      reason: 'model_not_whitelisted',
    })
  })
})
