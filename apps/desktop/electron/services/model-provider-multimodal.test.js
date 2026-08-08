// @ts-check
/**
 * model-provider-multimodal.test.js — 多模态模型类别/预设/路由/偏好开关
 *
 * 覆盖：
 *   - multimodal 类别与标签、MiniMax 多模态预设能力声明（≥2 项）与能力默认模型
 *   - 种子持久化：预设 capabilities/capability_models 写入行 config
 *   - getDefault 多模态路由：开启偏好且多模态已配置且声明能力 → 返回多模态模型；
 *     未开启 / 未配置 / 未声明能力 → 返回类别 provider
 *   - 偏好开关读写
 *   - MinimaxMultimodalAdapter 能力与委托
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

const initSqlJs = require('sql.js')

class SqlJsAdapter {
  constructor (database) { this.database = database }
  prepare (sql) {
    const database = this.database
    return {
      run (...params) {
        const statement = database.prepare(sql)
        if (params.length) statement.bind(params)
        statement.step()
        const changes = database.getRowsModified()
        statement.free()
        return { changes }
      },
      get (...params) {
        const statement = database.prepare(sql)
        if (params.length) statement.bind(params)
        const row = statement.step() ? statement.getAsObject() : undefined
        statement.free()
        return row
      },
      all (...params) {
        const rows = []
        const statement = database.prepare(sql)
        if (params.length) statement.bind(params)
        while (statement.step()) rows.push(statement.getAsObject())
        statement.free()
        return rows
      },
    }
  }
  exec (sql) { this.database.exec(sql) }
}

async function createStore (database, settings) {
  const { SCHEMA_SQL } = require('./store-schema')
  const db = new SqlJsAdapter(database)
  for (const statement of SCHEMA_SQL) db.exec(statement)
  const map = settings || new Map()
  const store = {
    db,
    _ready: true,
    _resolveOwnerSubject: () => 'test-owner',
    getSetting: (key) => map.has(key) ? map.get(key) : null,
    setSetting: (key, value) => map.set(key, value),
    getUserSetting: (key, fallback) => (map.has(key) ? map.get(key) : fallback),
    setUserSetting: (key, value) => map.set(key, value),
  }
  return { db, store }
}

function newManager (store) {
  const { ModelProviderManager } = require('./model-provider-manager')
  const manager = new ModelProviderManager(store)
  manager.init()
  return manager
}

function enableProvider (db, id, apiKey = 'test-key') {
  db.prepare('UPDATE model_providers SET enabled = ? WHERE id = ?').run(1, id)
  db.prepare('UPDATE model_providers SET api_key = ? WHERE id = ?').run(apiKey, id)
}

describe('多模态模型类别与 MiniMax 预设', () => {
  let database

  beforeAll(async () => {
    const SQL = await initSqlJs()
    database = new SQL.Database()
  })
  afterAll(() => { if (database) database.close() })

  it('multimodal 类别与中文标签存在，且预设能力 ≥ 2 项', async () => {
    const { store } = await createStore(database)
    const manager = newManager(store)
    const presets = manager.getAvailablePresets('multimodal')
    const minimax = presets.find(p => p.id === 'minimax-multimodal')
    expect(minimax).toBeDefined()
    expect(minimax.name).toBe('MiniMax')
    expect(Array.isArray(minimax.capabilities)).toBe(true)
    expect(minimax.capabilities.length).toBeGreaterThanOrEqual(2)
    expect(minimax.capability_models).toBeDefined()
    // 能力默认模型必须覆盖每个声明能力
    for (const cap of minimax.capabilities) {
      expect(typeof minimax.capability_models[cap]).toBe('string')
    }
  })

  it('存量行 diff-merge：旧能力配置升级时合并新增 llm 能力', async () => {
    const { db, store } = await createStore(database)
    const manager = newManager(store)
    // 模拟升级前的存量行（无 llm）
    db.prepare("UPDATE model_providers SET config = ?, updated_at = datetime('now') WHERE id = 'minimax-multimodal'")
      .run(JSON.stringify({
        capabilities: ['tts', 'image', 'video'],
        capability_models: { tts: 'speech-2.8-turbo', image: 'image-01', video: 'MiniMax-Hailuo-2.3' },
      }))
    manager._syncPresetCapabilities()
    const row = db.prepare("SELECT config FROM model_providers WHERE id = 'minimax-multimodal'").get()
    const config = JSON.parse(row.config)
    expect([...config.capabilities].sort()).toEqual(['image', 'llm', 'tts', 'video'])
    expect(config.capability_models.llm).toBe('MiniMax-M2.7')
  })

  it('种子持久化：预设行 config 包含 capabilities 与 capability_models', async () => {
    const { db, store } = await createStore(database)
    const manager = newManager(store)
    const row = db.prepare("SELECT config FROM model_providers WHERE id = 'minimax-multimodal'").get()
    expect(row).toBeDefined()
    const config = JSON.parse(row.config)
    expect(config.capabilities).toContain('tts')
    expect(config.capability_models.image).toBe('image-01')
    const listed = manager.listProviders('multimodal')[0]
    expect([...listed.capabilities].sort()).toEqual(['image', 'llm', 'tts', 'video'])
    expect(listed.capability_models.video).toBe('MiniMax-Hailuo-2.3')
  })
})

describe('getDefault 多模态路由', () => {
  let database
  let db
  let store
  let manager

  beforeAll(async () => {
    const SQL = await initSqlJs()
    database = new SQL.Database()
    ;({ db, store } = await createStore(database))
    manager = newManager(store)
    // 配置类别 provider 与多模态 provider
    enableProvider(db, 'elevenlabs', 'tts-key')
    enableProvider(db, 'minimax-image', 'img-key')
    enableProvider(db, 'minimax-multimodal', 'mm-key')
  })
  afterAll(() => { if (database) database.close() })

  it('未开启偏好时返回类别 provider', () => {
    store.setUserSetting('prefer_multimodal', false)
    const tts = manager.getDefault('tts')
    expect(tts.id).toBe('elevenlabs')
  })

  it('开启偏好且多模态声明能力时，llm/tts/image/video 返回多模态模型', () => {
    store.setUserSetting('prefer_multimodal', true)
    expect(manager.getDefault('llm').id).toBe('minimax-multimodal')
    expect(manager.getDefault('tts').id).toBe('minimax-multimodal')
    expect(manager.getDefault('image').id).toBe('minimax-multimodal')
    expect(manager.getDefault('video').id).toBe('minimax-multimodal')
  })

  it('多模态未声明能力（speech_recognition）时回退类别 provider', () => {
    store.setUserSetting('prefer_multimodal', true)
    expect(manager.getDefault('speech_recognition')).toBeNull()
  })

  it('多模态未配置时回退类别 provider', async () => {
    db.prepare("UPDATE model_providers SET enabled = ? WHERE id = 'minimax-multimodal'").run(0)
    store.setUserSetting('prefer_multimodal', true)
    expect(manager.getDefault('tts').id).toBe('elevenlabs')
  })
})

describe('多模态偏好开关', () => {
  let database

  beforeAll(async () => {
    const SQL = await initSqlJs()
    database = new SQL.Database()
  })
  afterAll(() => { if (database) database.close() })

  it('默认开启，set/get 往返持久化', async () => {
    const { store } = await createStore(database)
    const manager = newManager(store)
    expect(manager.getMultimodalPreference()).toBe(true)
    expect(manager.setMultimodalPreference(false).code).toBe(0)
    expect(manager.getMultimodalPreference()).toBe(false)
    expect(manager.setMultimodalPreference(true).code).toBe(0)
    expect(manager.getMultimodalPreference()).toBe(true)
  })
})

describe('MinimaxMultimodalAdapter', () => {
  it('能力包含 llm/tts/image/video 方法与基础方法', () => {
    const { MinimaxMultimodalAdapter } = require('./adapters/minimax-multimodal')
    const adapter = new MinimaxMultimodalAdapter({ apiKey: 'k', baseUrl: 'https://api.minimaxi.com/v1' })
    const caps = adapter.capabilities()
    expect(caps).toContain('chatCompletion')
    expect(caps).toContain('synthesize')
    expect(caps).toContain('listVoices')
    expect(caps).toContain('generateImage')
    expect(caps).toContain('generateVideo')
    expect(caps).toContain('getVideoStatus')
    expect(caps).toContain('testConnection')
    expect(adapter.validateConfig().valid).toBe(true)
    expect(adapter.supports('chatCompletion')).toBe(true)
  })

  it('缺少 API Key 时校验失败', () => {
    const { MinimaxMultimodalAdapter } = require('./adapters/minimax-multimodal')
    const adapter = new MinimaxMultimodalAdapter({ baseUrl: 'https://api.minimaxi.com/v1' })
    expect(adapter.validateConfig().valid).toBe(false)
  })

  it('方法委托到内部 MiniMax TTS/Image/Video 适配器', async () => {
    const { MinimaxMultimodalAdapter } = require('./adapters/minimax-multimodal')
    const adapter = new MinimaxMultimodalAdapter({ apiKey: 'k', baseUrl: 'https://api.minimaxi.com/v1' })
    const ttsSpy = vi.spyOn(adapter._tts, 'synthesize').mockResolvedValue({ audio: Buffer.from('00', 'hex'), format: 'mp3' })
    const imageSpy = vi.spyOn(adapter._image, 'generateImage').mockResolvedValue({})
    const videoSpy = vi.spyOn(adapter._video, 'generateVideo').mockResolvedValue({})
    const voiceSpy = vi.spyOn(adapter._tts, 'listVoices').mockResolvedValue([])
    const llmSpy = vi.spyOn(adapter._llm, 'chatCompletion').mockResolvedValue({ content: 'ok' })

    await adapter.synthesize({ text: 'hi' })
    await adapter.generateImage({ prompt: 'x' })
    await adapter.generateVideo({ prompt: 'y' })
    await adapter.listVoices()
    await adapter.chatCompletion({ model: 'MiniMax-M2.7', messages: [{ role: 'user', content: 'hi' }] })

    expect(ttsSpy).toHaveBeenCalledWith({ text: 'hi' })
    expect(imageSpy).toHaveBeenCalledWith({ prompt: 'x' })
    expect(videoSpy).toHaveBeenCalledWith({ prompt: 'y' })
    expect(voiceSpy).toHaveBeenCalledTimes(1)
    expect(llmSpy).toHaveBeenCalledWith({ model: 'MiniMax-M2.7', messages: [{ role: 'user', content: 'hi' }] })
  })
})

describe('ai-generator 多模态能力模型选择', () => {
  it('generateWithDefault 使用 provider.capability_models[type] 作为模型', async () => {
    const { AIGenerator } = require('./ai-generator')
    const callAdapter = vi.fn(async () => ({ code: 0, data: { audio: Buffer.from('00', 'hex') } }))
    const manager = {
      _ready: true,
      getDefault: () => ({
        id: 'minimax-multimodal', enabled: true, is_configured: true,
        models: ['speech-2.8-turbo', 'image-01', 'MiniMax-Hailuo-2.3'],
        capability_models: { tts: 'speech-2.8-turbo', image: 'image-01' },
      }),
      getProviderWithKey: (id) => ({ id, api_key: 'k' }),
      callAdapter,
      _adapterFactories: new Map([['minimax-multimodal', () => ({})]]),
    }
    const ai = new AIGenerator()
    ai.setModelProviderManager(manager)
    await ai.generateWithDefault('tts', { text: 'hi' })
    expect(callAdapter).toHaveBeenCalledWith('minimax-multimodal', 'synthesize', expect.objectContaining({ model: 'speech-2.8-turbo' }))
  })

  it('generateWithDefault(llm) 使用多模态 capability_models.llm 并走 chatCompletion', async () => {
    const { AIGenerator } = require('./ai-generator')
    const callAdapter = vi.fn(async () => ({ code: 0, data: { content: 'ok' } }))
    const manager = {
      _ready: true,
      getDefault: () => ({
        id: 'minimax-multimodal', enabled: true, is_configured: true,
        models: ['speech-2.8-turbo', 'image-01', 'MiniMax-Hailuo-2.3', 'MiniMax-M2.7'],
        capability_models: { llm: 'MiniMax-M2.7', tts: 'speech-2.8-turbo', image: 'image-01', video: 'MiniMax-Hailuo-2.3' },
      }),
      getProviderWithKey: (id) => ({ id, api_key: 'k' }),
      callAdapter,
      _adapterFactories: new Map([['minimax-multimodal', () => ({})]]),
    }
    const ai = new AIGenerator()
    ai.setModelProviderManager(manager)
    const result = await ai.generateWithDefault('llm', { messages: [{ role: 'user', content: 'hi' }] })
    expect(callAdapter).toHaveBeenCalledWith('minimax-multimodal', 'chatCompletion', expect.objectContaining({ model: 'MiniMax-M2.7' }))
    expect(result.content).toBe('ok')
  })

  it('普通 provider（无 capability_models）回退首个模型', async () => {
    const { AIGenerator } = require('./ai-generator')
    const callAdapter = vi.fn(async () => ({ code: 0, data: { content: 'ok' } }))
    const manager = {
      _ready: true,
      getDefault: () => ({ id: 'openai', enabled: true, is_configured: true, models: ['gpt-4o'] }),
      getProviderWithKey: (id) => ({ id, api_key: 'k' }),
      callAdapter,
      _adapterFactories: new Map([['openai', () => ({})]]),
    }
    const ai = new AIGenerator()
    ai.setModelProviderManager(manager)
    await ai.generateWithDefault('llm', { messages: [] })
    expect(callAdapter).toHaveBeenCalledWith('openai', 'chatCompletion', expect.objectContaining({ model: 'gpt-4o' }))
  })
})
