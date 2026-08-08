import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TtsVoiceService } from './tts-voice-service'

const CACHE_KEY = 'tts-voice-catalog:v2:openai-tts:tts-1'
const GPT4O_MINI_TTS_CACHE_KEY = 'tts-voice-catalog:v2:openai-tts:gpt-4o-mini-tts'
const LEGACY_GPT4O_MINI_TTS_CACHE_KEY = 'tts-voice-catalog:v1:openai-tts:gpt-4o-mini-tts'
const PREFERENCE_KEY = 'tts-voice-preference:v1:openai-tts:tts-1'

function createUserStore(initialValues = {}, ownerSubject = 'user-a') {
  const values = new Map(Object.entries(initialValues))
  return {
    getUserSetting: vi.fn((key, defaultValue) => values.has(key) ? values.get(key) : defaultValue),
    setUserSetting: vi.fn((key, value) => values.set(key, value)),
    getOwnerSubject: vi.fn(() => ownerSubject),
    values,
  }
}

function createManager(result = { code: 0, data: ['alloy', 'nova'] }) {
  return {
    getProvider: vi.fn(() => ({
      id: 'openai-tts',
      category: 'tts',
      models: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts', 'gpt-4o-mini-tts-2025-12-15'],
    })),
    callAdapter: vi.fn(async (...args) => typeof result === 'function' ? result(...args) : result),
  }
}

describe('TtsVoiceService', () => {
  let now
  let store
  let manager
  let service

  beforeEach(() => {
    now = 1_700_000_000_000
    store = createUserStore()
    manager = createManager()
    service = new TtsVoiceService({
      store,
      modelProviderManager: manager,
      now: () => now,
      cacheTtlMs: 60_000,
    })
  })

  it('通过当前用户的 settings 缓存已注册 adapter 的 listVoices 结果', async () => {
    const first = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    const second = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })

    expect(manager.callAdapter).toHaveBeenCalledTimes(1)
    expect(manager.callAdapter).toHaveBeenCalledWith('openai-tts', 'listVoices', { model: 'tts-1' })
    expect(first).toMatchObject({ code: 0, data: { cache: 'refreshed', selectedVoiceId: 'alloy' } })
    expect(second).toMatchObject({ code: 0, data: { cache: 'hit', selectedVoiceId: 'alloy' } })
    expect(store.setUserSetting).toHaveBeenCalledWith(CACHE_KEY, expect.objectContaining({
      providerId: 'openai-tts',
      model: 'tts-1',
      voices: [
        { id: 'alloy', name: 'alloy', source: 'builtin' },
        { id: 'nova', name: 'nova', source: 'builtin' },
      ],
    }), 'user-a')
    expect(store.getUserSetting.mock.calls.map(([key]) => key)).toContain(CACHE_KEY)
  })

  it('仅在显式刷新或缓存失效时再次调用 adapter', async () => {
    await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1', refresh: true })
    now += 60_001
    await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })

    expect(manager.callAdapter).toHaveBeenCalledTimes(3)
  })

  it('按模型向 adapter 传递最小安全参数，并隔离不同模型的目录缓存', async () => {
    manager = createManager((providerId, method, params) => {
      expect(providerId).toBe('openai-tts')
      expect(method).toBe('listVoices')
      if (params.model === 'tts-1') {
        return { code: 0, data: ['alloy', 'ash', 'coral'] }
      }
      if (params.model === 'gpt-4o-mini-tts') {
        return { code: 0, data: ['alloy', 'coral', 'ballad', 'verse', 'marin', 'cedar'] }
      }
      return { code: -1, message: 'unexpected model' }
    })
    service = new TtsVoiceService({
      store,
      modelProviderManager: manager,
      now: () => now,
      cacheTtlMs: 60_000,
    })

    const legacy = await service.getCatalog({
      providerId: 'openai-tts',
      model: 'tts-1',
      rendererOnly: 'must-not-reach-adapter',
    })
    const gpt4oMini = await service.getCatalog({
      providerId: 'openai-tts',
      model: 'gpt-4o-mini-tts',
    })
    const legacyCacheHit = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    const gpt4oMiniCacheHit = await service.getCatalog({ providerId: 'openai-tts', model: 'gpt-4o-mini-tts' })

    expect(manager.callAdapter).toHaveBeenCalledTimes(2)
    expect(manager.callAdapter).toHaveBeenNthCalledWith(1, 'openai-tts', 'listVoices', { model: 'tts-1' })
    expect(manager.callAdapter).toHaveBeenNthCalledWith(2, 'openai-tts', 'listVoices', { model: 'gpt-4o-mini-tts' })
    expect(legacy).toMatchObject({
      code: 0,
      data: { cache: 'refreshed', voices: [{ id: 'alloy' }, { id: 'ash' }, { id: 'coral' }] },
    })
    expect(gpt4oMini).toMatchObject({
      code: 0,
      data: { cache: 'refreshed', voices: [{ id: 'alloy' }, { id: 'coral' }, { id: 'ballad' }, { id: 'verse' }, { id: 'marin' }, { id: 'cedar' }] },
    })
    expect(legacy.data.voices.map((voice) => voice.id)).not.toContain('ballad')
    expect(gpt4oMini.data.voices.map((voice) => voice.id)).toContain('ballad')
    expect(legacyCacheHit).toMatchObject({ code: 0, data: { cache: 'hit' } })
    expect(gpt4oMiniCacheHit).toMatchObject({ code: 0, data: { cache: 'hit' } })
    expect(store.values.get(CACHE_KEY)).toMatchObject({ model: 'tts-1' })
    expect(store.values.get(GPT4O_MINI_TTS_CACHE_KEY)).toMatchObject({ model: 'gpt-4o-mini-tts' })
  })

  it('忽略旧的模型无关 v1 目录缓存，并以 v2 目录刷新当前模型', async () => {
    store.values.set(LEGACY_GPT4O_MINI_TTS_CACHE_KEY, {
      version: 1,
      providerId: 'openai-tts',
      model: 'gpt-4o-mini-tts',
      voices: [{ id: 'alloy', name: 'alloy', source: 'builtin' }],
      refreshedAt: now,
      expiresAt: now + 60_000,
    })
    manager.callAdapter.mockResolvedValueOnce({ code: 0, data: ['alloy', 'ballad'] })

    const result = await service.getCatalog({ providerId: 'openai-tts', model: 'gpt-4o-mini-tts' })

    expect(manager.callAdapter).toHaveBeenCalledWith(
      'openai-tts',
      'listVoices',
      { model: 'gpt-4o-mini-tts' },
    )
    expect(result).toMatchObject({
      code: 0,
      data: { cache: 'refreshed', voices: [{ id: 'alloy' }, { id: 'ballad' }] },
    })
    expect(store.getUserSetting).not.toHaveBeenCalledWith(LEGACY_GPT4O_MINI_TTS_CACHE_KEY, expect.anything(), 'user-a')
    expect(store.values.get(GPT4O_MINI_TTS_CACHE_KEY)).toMatchObject({ version: 2, model: 'gpt-4o-mini-tts' })
  })

  it('从失效偏好回退到合法默认音色，并修复当前用户的偏好记录', async () => {
    store.values.set(PREFERENCE_KEY, {
      providerId: 'openai-tts',
      model: 'tts-1',
      voiceId: 'removed-voice',
      selectedAt: now - 1,
    })

    const result = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })

    expect(result).toMatchObject({ code: 0, data: { selectedVoiceId: 'alloy' } })
    expect(store.setUserSetting).toHaveBeenCalledWith(PREFERENCE_KEY, expect.objectContaining({
      providerId: 'openai-tts',
      model: 'tts-1',
      voiceId: 'alloy',
    }), 'user-a')
  })

  it('拒绝跨模型或不在目录内的选择，不覆盖已有合法偏好', async () => {
    await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    store.setUserSetting.mockClear()

    const mismatch = await service.selectVoice({
      providerId: 'openai-tts',
      model: 'unknown-model',
      voiceId: 'alloy',
    })
    const unknownVoice = await service.selectVoice({
      providerId: 'openai-tts',
      model: 'tts-1',
      voiceId: 'not-in-catalog',
    })

    expect(mismatch).toMatchObject({ code: -1, message: 'VOICE_MODEL_MISMATCH' })
    expect(unknownVoice).toMatchObject({ code: -1, message: 'VOICE_NOT_IN_CATALOG' })
    expect(store.setUserSetting).not.toHaveBeenCalledWith(
      PREFERENCE_KEY,
      expect.objectContaining({ voiceId: 'not-in-catalog' }),
    )
  })

  it('选择音色后恢复服务商默认，清除偏好且重新读取仍返回默认音色', async () => {
    await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    await service.selectVoice({ providerId: 'openai-tts', model: 'tts-1', voiceId: 'nova' })
    expect(store.values.get(PREFERENCE_KEY)).toMatchObject({ voiceId: 'nova' })
    const cleared = await service.clearVoicePreference({ providerId: 'openai-tts', model: 'tts-1' })
    expect(cleared).toMatchObject({ code: 0, data: { selectedVoiceId: 'alloy', preference: 'cleared' } })
    expect(store.values.get(PREFERENCE_KEY)).toBeNull()
    const reread = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    expect(reread).toMatchObject({ code: 0, data: { selectedVoiceId: 'alloy' } })
    expect(store.values.get(PREFERENCE_KEY)).toBeNull()
  })

  it('对不支持或未配置的 provider fail closed，且不写入 cache 或偏好', async () => {
    const unsupported = await service.getCatalog({ providerId: 'mimo-tts', model: 'mimo-v2.5-tts' })
    manager.callAdapter.mockResolvedValueOnce({ code: -1, message: 'Bearer token leaked by upstream' })
    const unavailable = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })

    expect(unsupported).toMatchObject({ code: -1, message: 'VOICE_CATALOG_UNSUPPORTED' })
    expect(unavailable).toMatchObject({ code: -1, message: 'VOICE_CATALOG_UNAVAILABLE' })
    expect(manager.callAdapter).toHaveBeenCalledTimes(1)
    expect(store.setUserSetting).not.toHaveBeenCalled()
  })

  it('拒绝不匹配的缓存和敏感的 adapter 输出，避免把 secret 写入 settings', async () => {
    store.values.set(CACHE_KEY, {
      providerId: 'openai-tts',
      model: 'tts-1-hd',
      refreshedAt: now,
      expiresAt: now + 60_000,
      voices: [{ id: 'wrong-model', name: 'wrong-model', source: 'builtin' }],
    })
    manager.callAdapter.mockResolvedValueOnce({
      code: 0,
      data: [{ id: 'alloy', name: 'alloy', token: 'should-never-persist', audio: 'also-never-persist' }],
    })

    const result = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })

    expect(manager.callAdapter).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ code: 0, data: { voices: [{ id: 'alloy', name: 'alloy', source: 'builtin' }] } })
    expect(JSON.stringify(store.values.get(CACHE_KEY))).not.toContain('should-never-persist')
    expect(JSON.stringify(store.values.get(CACHE_KEY))).not.toContain('also-never-persist')
  })

  it('在异步刷新开始时固定 owner，避免登录切换时跨用户读写目录和偏好', async () => {
    let resolveAdapter
    manager.callAdapter.mockImplementationOnce(() => new Promise(resolve => { resolveAdapter = resolve }))

    const pending = service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })
    await Promise.resolve()
    store.getOwnerSubject.mockReturnValue('user-b')
    resolveAdapter({ code: 0, data: ['alloy', 'nova'] })

    const result = await pending

    expect(result).toMatchObject({ code: 0, data: { selectedVoiceId: 'alloy' } })
    expect(store.getOwnerSubject).toHaveBeenCalledTimes(1)
    expect(store.getUserSetting.mock.calls.every(([, , owner]) => owner === 'user-a')).toBe(true)
    expect(store.setUserSetting.mock.calls.every(([, , owner]) => owner === 'user-a')).toBe(true)
  })

  it('在身份未解析时 fail closed，不读取缓存、不调用 adapter 或写入偏好', async () => {
    store.getOwnerSubject.mockReturnValue(null)

    const result = await service.getCatalog({ providerId: 'openai-tts', model: 'tts-1' })

    expect(result).toMatchObject({ code: -1, message: 'VOICE_OWNER_UNAVAILABLE' })
    expect(store.getUserSetting).not.toHaveBeenCalled()
    expect(store.setUserSetting).not.toHaveBeenCalled()
    expect(manager.callAdapter).not.toHaveBeenCalled()
  })
})


describe('selectVoice — MiniMax 系统音色 id（含空格/括号）', () => {
  it('接受 Chinese (Mandarin)_Reliable_Executive 并保存偏好（回归 VOICE_CATALOG_INVALID_ARGUMENTS）', async () => {
    const now = 1_700_000_000_000
    const store = createUserStore()
    const manager = {
      getProvider: vi.fn(() => ({ id: 'minimax-tts', category: 'tts', models: ['speech-2.8-turbo'] })),
      callAdapter: vi.fn(async () => ({ code: 0, data: [
        { id: 'male-qn-qingse', name: '青年男声' },
        { id: 'Chinese (Mandarin)_Reliable_Executive', name: '沉稳高管' },
        { id: 'Chinese (Mandarin)_Humorous_Elder', name: '搞笑大爷' },
      ] })),
    }
    const service = new TtsVoiceService({ store, modelProviderManager: manager, now: () => now, cacheTtlMs: 60_000 })

    const catalog = await service.getCatalog({ providerId: 'minimax-tts', model: 'speech-2.8-turbo' })
    expect(catalog.code).toBe(0)
    expect(catalog.data.voices.map((v) => v.id)).toContain('Chinese (Mandarin)_Reliable_Executive')

    const selected = await service.selectVoice({ providerId: 'minimax-tts', model: 'speech-2.8-turbo', voiceId: 'Chinese (Mandarin)_Reliable_Executive' })
    expect(selected.code).toBe(0)
    expect(selected.data.selectedVoiceId).toBe('Chinese (Mandarin)_Reliable_Executive')
    expect(store.setUserSetting).toHaveBeenCalledWith(
      'tts-voice-preference:v1:minimax-tts:speech-2.8-turbo',
      expect.objectContaining({ voiceId: 'Chinese (Mandarin)_Reliable_Executive' }),
      'user-a',
    )
  })

  it('拒绝含路径分隔符/遍历序列的 voiceId', async () => {
    const now = 1_700_000_000_000
    const service = new TtsVoiceService({ store: createUserStore(), modelProviderManager: createManager(), now: () => now, cacheTtlMs: 60_000 })
    const result = await service.selectVoice({ providerId: 'openai-tts', model: 'tts-1', voiceId: '..\..\evil' })
    expect(result).toMatchObject({ code: -1, message: 'VOICE_CATALOG_INVALID_ARGUMENTS' })
  })
})

describe('getCatalog — 失效克隆音色（voice_id 不合规）', () => {
  it('非法克隆不进入可选项并回退默认音色；以 invalidVoices 返回供前端提示', async () => {
    const now = 1_700_000_000_000
    const store = createUserStore()
    const manager = {
      getProvider: vi.fn(() => ({ id: 'minimax-tts', category: 'tts', models: ['speech-2.8-turbo'] })),
      callAdapter: vi.fn(async () => ({ code: 0, data: [{ id: 'male-qn-qingse', name: '青涩青年音色' }] })),
    }
    const cloneService = {
      listClones: vi.fn(async () => ({
        code: 0,
        data: {
          voices: [
            { id: '01', name: '01', source: 'user_clone', invalid: true },
            { id: 'MiniMaxVoice_abc123', name: '合法克隆', source: 'user_clone' },
          ],
        },
      })),
    }
    const service = new TtsVoiceService({ store, modelProviderManager: manager, now: () => now, cacheTtlMs: 60_000 })
    service._cloneService = cloneService

    const catalog = await service.getCatalog({ providerId: 'minimax-tts', model: 'speech-2.8-turbo' })
    expect(catalog.code).toBe(0)
    expect(catalog.data.voices.map((v) => v.id)).not.toContain('01')
    expect(catalog.data.voices.map((v) => v.id)).toContain('MiniMaxVoice_abc123')
    expect(catalog.data.invalidVoices.map((v) => v.id)).toEqual(['01'])
    expect(catalog.data.selectedVoiceId).toBe('male-qn-qingse')
  })
})
