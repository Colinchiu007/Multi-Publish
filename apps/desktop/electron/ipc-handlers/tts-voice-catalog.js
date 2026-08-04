// @ts-check
'use strict'

const { TtsVoiceService } = require('../services/tts-voice-service')
const { TtsVoiceCloneService } = require('../services/tts-voice-clone-service')
const { withSenderCheck, EC } = require('./helpers')

function isSafeIdentifier (value, maxLength = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength &&
    /^[a-zA-Z0-9._-]+$/.test(value)
}

function normalizeCatalogArgs (args, options = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null
  if (!isSafeIdentifier(args.providerId, 128) || !isSafeIdentifier(args.model, 128)) return null
  if (args.refresh !== undefined && typeof args.refresh !== 'boolean') return null
  const result = {
    providerId: args.providerId,
    model: args.model,
  }
  if (args.refresh === true) result.refresh = true
  if (options.requireVoiceId) {
    if (!isSafeIdentifier(args.voiceId)) return null
    result.voiceId = args.voiceId
  }
  return result
}

function invalidArguments () {
  return { code: EC.VALIDATION_ERROR, message: 'VOICE_CATALOG_INVALID_ARGUMENTS' }
}

/**
 * 注册独立 TTS 音色目录 IPC。聚合注册中心负责调用本函数；本模块不注册
 * 上传/克隆通道，因为当前 adapter 没有已验收的官方上传 API 合同。
 */
function registerTtsVoiceCatalogHandlers (ipcMain, deps = {}) {
  const service = deps.ttsVoiceService || new TtsVoiceService({
    store: deps.store,
    modelProviderManager: deps.modelProviderManager,
    cloneService: deps.ttsVoiceCloneService || new TtsVoiceCloneService({
      store: deps.store,
      modelProviderManager: deps.modelProviderManager,
      app: deps.app,
    }),
  })

  ipcMain.handle('tts-voice:catalog', withSenderCheck(async (_event, args) => {
    const input = normalizeCatalogArgs(args)
    if (!input) return invalidArguments()
    try {
      return await service.getCatalog(input)
    } catch (_) {
      return { code: EC.REQUEST_ERROR, message: 'VOICE_CATALOG_UNAVAILABLE' }
    }
  }))

  ipcMain.handle('tts-voice:capability', withSenderCheck((_event, args) => {
    const input = normalizeCatalogArgs(args)
    if (!input) return invalidArguments()
    try {
      return service.getCapability(input)
    } catch (_) {
      return { code: EC.REQUEST_ERROR, message: 'VOICE_CATALOG_UNAVAILABLE' }
    }
  }))

  ipcMain.handle('tts-voice:select', withSenderCheck(async (_event, args) => {
    const input = normalizeCatalogArgs(args, { requireVoiceId: true })
    if (!input) return invalidArguments()
    try {
      return await service.selectVoice(input)
    } catch (_) {
      return { code: EC.REQUEST_ERROR, message: 'VOICE_CATALOG_UNAVAILABLE' }
    }
  }))

  ipcMain.handle('tts-voice:clear-preference', withSenderCheck(async (_event, args) => {
    const input = normalizeCatalogArgs(args)
    if (!input) return invalidArguments()
    try {
      return await service.clearVoicePreference(input)
    } catch (_) {
      return { code: EC.REQUEST_ERROR, message: 'VOICE_CATALOG_UNAVAILABLE' }
    }
  }))
}

module.exports = registerTtsVoiceCatalogHandlers
module.exports.normalizeCatalogArgs = normalizeCatalogArgs
