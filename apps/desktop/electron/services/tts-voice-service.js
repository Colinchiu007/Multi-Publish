// @ts-check
'use strict'

const {
  CAPABILITY_TYPES,
  getVoiceCapability,
  normalizeVoiceList,
  isSafeCatalogVoice,
} = require('./tts-voice-catalog')

const CATALOG_SCHEMA_VERSION = 2
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000
const MAX_IDENTIFIER_LENGTH = 128
const MAX_VOICE_ID_LENGTH = 256

function safeIdentifier (value, maxLength = MAX_IDENTIFIER_LENGTH) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > maxLength || !/^[a-zA-Z0-9._-]+$/.test(normalized)) return null
  return normalized
}

function success (data) {
  return { code: 0, data }
}

function failure (message, data) {
  return data === undefined ? { code: -1, message } : { code: -1, message, data }
}

function catalogSettingKey (providerId, model) {
  return `tts-voice-catalog:v2:${providerId}:${model}`
}

function preferenceSettingKey (providerId, model) {
  return `tts-voice-preference:v1:${providerId}:${model}`
}

function copyVoice (voice) {
  const result = {
    id: voice.id,
    name: voice.name,
    source: voice.source,
  }
  if (voice.clonePath) result.clonePath = voice.clonePath
  return result
}

function copyCapability (capability) {
  return {
    providerId: capability.providerId,
    model: capability.model,
    type: capability.type,
    canListVoices: capability.canListVoices,
    defaultVoiceId: capability.defaultVoiceId,
    clone: { ...capability.clone },
    reason: capability.reason,
  }
}

function isSafeCatalogCache (value, providerId, model, now) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const allowed = new Set(['version', 'providerId', 'model', 'voices', 'refreshedAt', 'expiresAt'])
  if (Object.keys(value).some((key) => !allowed.has(key))) return false
  if (value.version !== CATALOG_SCHEMA_VERSION || value.providerId !== providerId || value.model !== model) return false
  if (!Number.isFinite(value.refreshedAt) || !Number.isFinite(value.expiresAt) || value.expiresAt <= now) return false
  if (!Array.isArray(value.voices) || !value.voices.every(isSafeCatalogVoice)) return false
  return true
}

function isSafePreference (value, providerId, model, voiceIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const allowed = new Set(['providerId', 'model', 'voiceId', 'selectedAt'])
  if (Object.keys(value).some((key) => !allowed.has(key))) return false
  return value.providerId === providerId && value.model === model &&
    typeof value.voiceId === 'string' && voiceIds.has(value.voiceId) && Number.isFinite(value.selectedAt)
}

function defaultVoiceId (voices, capability) {
  if (capability.defaultVoiceId && voices.some((voice) => voice.id === capability.defaultVoiceId)) {
    return capability.defaultVoiceId
  }
  return voices[0] ? voices[0].id : null
}

class TtsVoiceService {
  /**
   * @param {{
   *   store?: {getUserSetting?: Function, setUserSetting?: Function, getOwnerSubject?: Function},
   *   modelProviderManager?: {callAdapter?: Function, getProvider?: Function},
   *   now?: () => number,
   *   cacheTtlMs?: number,
   *   cloneService?: {listClones?: Function},
   * }} deps
   */
  constructor (deps = {}) {
    this._store = deps.store || null
    this._modelProviderManager = deps.modelProviderManager || null
    this._now = typeof deps.now === 'function' ? deps.now : () => Date.now()
    this._cacheTtlMs = Number.isFinite(deps.cacheTtlMs) && deps.cacheTtlMs > 0
      ? deps.cacheTtlMs
      : DEFAULT_CACHE_TTL_MS
    this._cloneService = deps.cloneService || null
  }

  getCapability (input) {
    const request = this._normalizeRequest(input)
    if (!request) return failure('VOICE_CATALOG_INVALID_ARGUMENTS')
    return success(copyCapability(getVoiceCapability(request.providerId, request.model)))
  }

  async getCatalog (input) {
    const request = this._normalizeRequest(input)
    if (!request) return failure('VOICE_CATALOG_INVALID_ARGUMENTS')

    const ownerSubject = this._captureOwnerSubject()
    if (!ownerSubject) return failure('VOICE_OWNER_UNAVAILABLE')
    return this._getCatalog(request, ownerSubject)
  }

  async _getCatalog (request, ownerSubject) {

    const capability = getVoiceCapability(request.providerId, request.model)
    const unsupported = this._unsupportedResponse(capability)
    if (unsupported) return unsupported
    if (!this._hasUserSettings()) return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
    if (!this._hasMatchingProvider(request.providerId, request.model)) return failure('VOICE_MODEL_MISMATCH')

    const now = this._now()
    const cacheKey = catalogSettingKey(request.providerId, request.model)
    let cached
    try {
      cached = this._store.getUserSetting(cacheKey, null, ownerSubject)
    } catch (_) {
      return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
    }

    if (!request.refresh && isSafeCatalogCache(cached, request.providerId, request.model, now)) {
      return this._buildCatalogResponse(cached, capability, 'hit', ownerSubject)
    }

    if (!this._modelProviderManager || typeof this._modelProviderManager.callAdapter !== 'function') {
      return failure('VOICE_CATALOG_UNAVAILABLE')
    }

    let adapterResult
    try {
      adapterResult = await this._modelProviderManager.callAdapter(
        request.providerId,
        'listVoices',
        { model: request.model },
      )
    } catch (_) {
      return failure('VOICE_CATALOG_UNAVAILABLE')
    }

    if (!adapterResult || adapterResult.code !== 0 || !Array.isArray(adapterResult.data)) {
      return failure('VOICE_CATALOG_UNAVAILABLE')
    }

    const voices = normalizeVoiceList(adapterResult.data, { source: capability.type })
    const catalog = {
      version: CATALOG_SCHEMA_VERSION,
      providerId: request.providerId,
      model: request.model,
      voices,
      refreshedAt: now,
      expiresAt: now + this._cacheTtlMs,
    }
    try {
      this._store.setUserSetting(cacheKey, catalog, ownerSubject)
    } catch (_) {
      return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
    }
    return this._buildCatalogResponse(catalog, capability, 'refreshed', ownerSubject)
  }

  async selectVoice (input) {
    const request = this._normalizeRequest(input, { requireVoiceId: true })
    if (!request) return failure('VOICE_CATALOG_INVALID_ARGUMENTS')

    const ownerSubject = this._captureOwnerSubject()
    if (!ownerSubject) return failure('VOICE_OWNER_UNAVAILABLE')

    const capability = getVoiceCapability(request.providerId, request.model)
    if (capability.reason === 'model_not_whitelisted') return failure('VOICE_MODEL_MISMATCH')
    const unsupported = this._unsupportedResponse(capability)
    if (unsupported) return unsupported

    const catalogResult = await this._getCatalog({
      providerId: request.providerId,
      model: request.model,
      refresh: false,
    }, ownerSubject)
    if (catalogResult.code !== 0) return catalogResult

    const voiceExists = catalogResult.data.voices.some((voice) => voice.id === request.voiceId)
    if (!voiceExists) return failure('VOICE_NOT_IN_CATALOG')
    try {
      this._store.setUserSetting(preferenceSettingKey(request.providerId, request.model), {
        providerId: request.providerId,
        model: request.model,
        voiceId: request.voiceId,
        selectedAt: this._now(),
      }, ownerSubject)
    } catch (_) {
      return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
    }

    return success({
      ...catalogResult.data,
      selectedVoiceId: request.voiceId,
      preference: 'saved',
    })
  }

  async clearVoicePreference (input) {
    const request = this._normalizeRequest(input)
    if (!request) return failure('VOICE_CATALOG_INVALID_ARGUMENTS')
    const ownerSubject = this._captureOwnerSubject()
    if (!ownerSubject) return failure('VOICE_OWNER_UNAVAILABLE')
    const capability = getVoiceCapability(request.providerId, request.model)
    const unsupported = this._unsupportedResponse(capability)
    if (unsupported) return unsupported
    const catalogResult = await this._getCatalog(request, ownerSubject)
    if (catalogResult.code !== 0) return catalogResult
    try {
      this._store.setUserSetting(preferenceSettingKey(request.providerId, request.model), null, ownerSubject)
    } catch (_) {
      return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
    }
    return success({ ...catalogResult.data, selectedVoiceId: defaultVoiceId(catalogResult.data.voices, capability), preference: 'cleared' })
  }
  _normalizeRequest (input, options = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null
    const providerId = safeIdentifier(input.providerId)
    const model = safeIdentifier(input.model)
    if (!providerId || !model) return null
    if (input.refresh !== undefined && typeof input.refresh !== 'boolean') return null
    const request = { providerId, model, refresh: input.refresh === true }
    if (options.requireVoiceId) {
      const voiceId = safeIdentifier(input.voiceId, MAX_VOICE_ID_LENGTH)
      if (!voiceId) return null
      request.voiceId = voiceId
    }
    return request
  }

  _hasUserSettings () {
    return Boolean(this._store) && typeof this._store.getUserSetting === 'function' &&
      typeof this._store.setUserSetting === 'function'
  }

  _captureOwnerSubject () {
    if (!this._store || typeof this._store.getOwnerSubject !== 'function') return null
    try {
      const ownerSubject = this._store.getOwnerSubject()
      return typeof ownerSubject === 'string' && ownerSubject ? ownerSubject : null
    } catch (_) {
      return null
    }
  }

  _hasMatchingProvider (providerId, model) {
    if (!this._modelProviderManager || typeof this._modelProviderManager.getProvider !== 'function') return true
    try {
      const provider = this._modelProviderManager.getProvider(providerId)
      if (!provider || (provider.category && provider.category !== 'tts')) return false
      if (!Array.isArray(provider.models) || provider.models.length === 0) return true
      return provider.models.includes(model)
    } catch (_) {
      return false
    }
  }

  _unsupportedResponse (capability) {
    if (capability.canListVoices) return null
    if (capability.reason === 'model_not_whitelisted') return failure('VOICE_MODEL_MISMATCH')
    return failure('VOICE_CATALOG_UNSUPPORTED', { capability: copyCapability(capability) })
  }

  async _buildCatalogResponse (catalog, capability, cache, ownerSubject) {
    const voices = catalog.voices.map(copyVoice)
    if (this._cloneService && typeof this._cloneService.listClones === 'function') {
      try {
        const clones = await this._cloneService.listClones({ providerId: catalog.providerId, model: catalog.model })
        if (clones?.code === 0 && Array.isArray(clones.data?.voices)) {
          for (const clone of clones.data.voices) {
            if (clone?.source === CAPABILITY_TYPES.USER_CLONE && typeof clone.id === 'string' && typeof clone.name === 'string' && !voices.some((voice) => voice.id === clone.id)) voices.push({ id: clone.id, name: clone.name, source: CAPABILITY_TYPES.USER_CLONE })
          }
        }
      } catch (_) { void 0 }
    }
    const voiceIds = new Set(voices.map((voice) => voice.id))
    let preference
    try {
      preference = this._store.getUserSetting(preferenceSettingKey(catalog.providerId, catalog.model), null, ownerSubject)
    } catch (_) {
      return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
    }

    let selectedVoiceId
    if (isSafePreference(preference, catalog.providerId, catalog.model, voiceIds)) {
      selectedVoiceId = preference.voiceId
    } else {
      selectedVoiceId = defaultVoiceId(voices, capability)
      if (selectedVoiceId && preference !== null && preference !== undefined) {
        try {
          this._store.setUserSetting(preferenceSettingKey(catalog.providerId, catalog.model), {
            providerId: catalog.providerId,
            model: catalog.model,
            voiceId: selectedVoiceId,
            selectedAt: this._now(),
          }, ownerSubject)
        } catch (_) {
          return failure('VOICE_PREFERENCE_STORE_UNAVAILABLE')
        }
      }
    }

    return success({
      providerId: catalog.providerId,
      model: catalog.model,
      voices,
      selectedVoiceId,
      refreshedAt: catalog.refreshedAt,
      expiresAt: catalog.expiresAt,
      cache,
      capability: copyCapability(capability),
    })
  }
}

module.exports = {
  CATALOG_SCHEMA_VERSION,
  DEFAULT_CACHE_TTL_MS,
  catalogSettingKey,
  preferenceSettingKey,
  TtsVoiceService,
}
