import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

__enableElectronMock()

let registerTtsVoiceCatalogHandlers
let originalIsPackaged

beforeEach(async () => {
  vi.resetModules()
  originalIsPackaged = __electronMock.app.isPackaged
  __electronMock.app.isPackaged = false
  const module = await import('./tts-voice-catalog')
  registerTtsVoiceCatalogHandlers = module.default || module
})

afterEach(() => {
  __electronMock.app.isPackaged = originalIsPackaged
})

function createIpcMain() {
  const handlers = new Map()
  return {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
    handlers,
  }
}

describe('TTS 音色目录 IPC', () => {
  it('注册读取、刷新和选择通道，并把参数交给受控服务', async () => {
    const ipcMain = createIpcMain()
    const ttsVoiceService = {
      getCatalog: vi.fn(async (input) => ({ code: 0, data: input })),
      getCapability: vi.fn((input) => ({ code: 0, data: input })),
      selectVoice: vi.fn(async (input) => ({ code: 0, data: input })),
      clearVoicePreference: vi.fn(async (input) => ({ code: 0, data: input })),
    }

    registerTtsVoiceCatalogHandlers(ipcMain, { ttsVoiceService })

    expect([...ipcMain.handlers.keys()]).toEqual([
      'tts-voice:catalog',
      'tts-voice:capability',
      'tts-voice:select',
      'tts-voice:clear-preference',
    ])
    await expect(ipcMain.handlers.get('tts-voice:catalog')({}, {
      providerId: 'openai-tts', model: 'tts-1', refresh: true,
    })).resolves.toMatchObject({ code: 0 })
    expect(ttsVoiceService.getCatalog).toHaveBeenCalledWith({
      providerId: 'openai-tts', model: 'tts-1', refresh: true,
    })
  })

  it('注册并转发恢复服务商默认音色通道', async () => {
    const ipcMain = createIpcMain()
    const ttsVoiceService = { getCatalog: vi.fn(), getCapability: vi.fn(), selectVoice: vi.fn(), clearVoicePreference: vi.fn(async (input) => ({ code: 0, data: input })) }
    registerTtsVoiceCatalogHandlers(ipcMain, { ttsVoiceService })
    await expect(ipcMain.handlers.get('tts-voice:clear-preference')({}, { providerId: 'openai-tts', model: 'tts-1' })).resolves.toMatchObject({ code: 0 })
    expect(ttsVoiceService.clearVoicePreference).toHaveBeenCalledWith({ providerId: 'openai-tts', model: 'tts-1' })
  })

  it('拒绝格式错误的 renderer 参数，不调用服务', async () => {
    const ipcMain = createIpcMain()
    const ttsVoiceService = {
      getCatalog: vi.fn(),
      getCapability: vi.fn(),
      selectVoice: vi.fn(),
    }
    registerTtsVoiceCatalogHandlers(ipcMain, { ttsVoiceService })

    const result = await ipcMain.handlers.get('tts-voice:select')({}, {
      providerId: 'openai-tts', model: 'tts-1', voiceId: ['proxy-safe-no'],
    })

    expect(result).toMatchObject({ code: -2, message: 'VOICE_CATALOG_INVALID_ARGUMENTS' })
    expect(ttsVoiceService.selectVoice).not.toHaveBeenCalled()
  })
})

it('默认组合路径合并 owner-scoped active clone 并持久化选择', async () => {
  const ipcMain = createIpcMain()
  const values = new Map()
  const store = {
    getOwnerSubject: () => 'owner-a',
    getUserSetting: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    setUserSetting: (key, value) => values.set(key, value),
  }
  const modelProviderManager = {
    getProvider: () => ({ category: 'tts', models: ['eleven_multilingual_v2'] }),
    callAdapter: vi.fn(async (_provider, method) => method === 'listVoices'
      ? { code: 0, data: [{ voiceId: 'built-in', name: 'Built in' }] }
      : { code: 0, data: null }),
  }
  const app = { getPath: () => 'C:/tmp/tts-user-data' }
  values.set('tts-voice-clones:v2:elevenlabs:eleven_multilingual_v2', {
    version: 2,
    providerId: 'elevenlabs',
    model: 'eleven_multilingual_v2',
    voices: [{ id: 'clone-a', name: 'Clone A', source: 'user_clone', createdAt: Date.now(), deletionState: 'active' }],
  })
  registerTtsVoiceCatalogHandlers(ipcMain, { store, modelProviderManager, app })
  const args = { providerId: 'elevenlabs', model: 'eleven_multilingual_v2', refresh: true }
  await expect(ipcMain.handlers.get('tts-voice:catalog')({}, args)).resolves.toMatchObject({ data: { voices: expect.arrayContaining([expect.objectContaining({ id: 'clone-a' })]) } })
  await expect(ipcMain.handlers.get('tts-voice:select')({}, { ...args, voiceId: 'clone-a' })).resolves.toMatchObject({ code: 0, data: { selectedVoiceId: 'clone-a' } })
  expect(values.get('tts-voice-preference:v1:elevenlabs:eleven_multilingual_v2').voiceId).toBe('clone-a')
})
