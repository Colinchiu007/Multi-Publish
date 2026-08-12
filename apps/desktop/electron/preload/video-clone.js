// @ts-check
/**
 * 视频克隆 preload API（切片 4b）
 * window.electronAPI.videoClone.{ run, cancel, editReport, regenerate, onProgress }
 */
const { ipcRenderer } = require('electron')

function createVideoCloneApi(ipcRendererRef = ipcRenderer) {
  return {
    videoClone: {
      run: (request) => ipcRendererRef.invoke('video-clone:run', request),
      cancel: (runId) => ipcRendererRef.invoke('video-clone:cancel', { runId }),
      editReport: (report, patch) => ipcRendererRef.invoke('video-clone:report:edit', { report, patch }),
      regenerate: (runId) => ipcRendererRef.invoke('video-clone:report:regenerate', { runId }),
      onProgress: (cb) => {
        const listener = (_event, evt) => { try { cb(evt) } catch { /* 回调异常忽略 */ } }
        ipcRendererRef.on('video-clone:progress', listener)
        return () => ipcRendererRef.removeListener('video-clone:progress', listener)
      },
    },
  }
}

module.exports = { createVideoCloneApi }
