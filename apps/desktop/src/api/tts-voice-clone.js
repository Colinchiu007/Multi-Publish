function getTtsVoiceCloneApi () {
  if (typeof window === 'undefined' || !window.electronAPI) return null
  const api = window.electronAPI.ttsVoiceClone
  return api && typeof api === 'object' ? api : null
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
    ? { code: -1, message: 'TTS_VOICE_CLONE_API_UNAVAILABLE' }
    : { code: -1, message: 'TTS_VOICE_CLONE_API_UNAVAILABLE', data }
}

function invalidArguments () {
  return { code: -1, message: 'TTS_VOICE_CLONE_INVALID_ARGUMENTS' }
}

async function callTtsVoiceCloneApi (method, input, fallbackData) {
  const api = getTtsVoiceCloneApi()
  if (!api || typeof api[method] !== 'function') return unavailable(fallbackData)
  const plainInput = toPlainIpcValue(input)
  if (!plainInput || typeof plainInput !== 'object' || Array.isArray(plainInput)) return invalidArguments()
  try {
    return await api[method](plainInput)
  } catch (_) {
    return unavailable(fallbackData)
  }
}

export function getTtsVoiceCloneRequirements (input) {
  return callTtsVoiceCloneApi('requirements', input, null)
}

export function chooseTtsVoiceCloneSamples (input) {
  return callTtsVoiceCloneApi('chooseSamples', input, { paths: [] })
}

export function listTtsVoiceClones (input) {
  return callTtsVoiceCloneApi('list', input, { voices: [] })
}

export function addTtsVoiceClone (input) {
  return callTtsVoiceCloneApi('add', input, null)
}

export function deleteTtsVoiceClone (input) {
  return callTtsVoiceCloneApi('deleteClone', input, null)
}

export function renameTtsVoiceClone (input) {
  return callTtsVoiceCloneApi('rename', input, null)
}
