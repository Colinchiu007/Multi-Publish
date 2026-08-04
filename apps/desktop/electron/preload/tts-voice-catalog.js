'use strict'

/**
 * 独立 TTS 音色目录 preload API。
 * 聚合入口通过展开返回值接入 `window.electronAPI`；这里只暴露固定通道，
 * 不提供通用 invoke 或克隆文件上传入口。
 */
function createTtsVoiceCatalogApi (ipcRenderer) {
  return {
    ttsVoice: {
      catalog: (input) => ipcRenderer.invoke('tts-voice:catalog', input),
      capability: (input) => ipcRenderer.invoke('tts-voice:capability', input),
      select: (input) => ipcRenderer.invoke('tts-voice:select', input),
      clearPreference: (input) => ipcRenderer.invoke('tts-voice:clear-preference', input),
    },
  }
}

module.exports = { createTtsVoiceCatalogApi }
