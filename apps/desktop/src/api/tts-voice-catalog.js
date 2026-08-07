/**
 * Renderer ↔ preload 的 TTS 音色目录 API。
 * 该模块不直接触碰 Electron IPC，只调用固定的 contextBridge 表面。
 */

function getTtsVoiceApi () {
  if (typeof window === 'undefined' || !window.electronAPI) return null
  const api = window.electronAPI.ttsVoice
  if (!api || typeof api !== 'object') return null
  return api
}

function toPlainIpcValue (value) {
  if (value === null || typeof value !== 'object') return value
  try {
    return JSON.parse(JSON.stringify(value))
  } catch (_) {
    return null
  }
}

function unavailable (data = undefined) {
  return data === undefined
    ? { code: -1, message: 'TTS_VOICE_API_UNAVAILABLE' }
    : { code: -1, message: 'TTS_VOICE_API_UNAVAILABLE', data }
}

function invalidArguments () {
  return { code: -1, message: 'TTS_VOICE_INVALID_ARGUMENTS' }
}

async function callTtsVoiceApi (method, input, fallbackData) {
  const api = getTtsVoiceApi()
  if (!api || typeof api[method] !== 'function') return unavailable(fallbackData)
  const plainInput = toPlainIpcValue(input)
  if (!plainInput || typeof plainInput !== 'object' || Array.isArray(plainInput)) return invalidArguments()
  try {
    return await api[method](plainInput)
  } catch (_) {
    return unavailable(fallbackData)
  }
}

export function getTtsVoiceCatalog (input) {
  return callTtsVoiceApi('catalog', input, { voices: [] })
}

export function getTtsVoiceCapability (input) {
  return callTtsVoiceApi('capability', input, null)
}

export function selectTtsVoice (input) {
  return callTtsVoiceApi('select', input, null)
}


export function clearTtsVoicePreference (input) {
  return callTtsVoiceApi('clearPreference', input, null)
}
