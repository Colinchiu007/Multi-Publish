'use strict'

function createTtsVoiceCloneApi (ipcRenderer) {
  return {
    ttsVoiceClone: {
      requirements: (input) => ipcRenderer.invoke('tts-voice-clone:requirements', input),
      chooseSamples: (input) => ipcRenderer.invoke('tts-voice-clone:choose-samples', input),
      list: (input) => ipcRenderer.invoke('tts-voice-clone:list', input),
      add: (input) => ipcRenderer.invoke('tts-voice-clone:add', input),
      deleteClone: (input) => ipcRenderer.invoke('tts-voice-clone:delete', input),
      rename: (input) => ipcRenderer.invoke('tts-voice-clone:rename', input),
    },
  }
}

module.exports = { createTtsVoiceCloneApi }
