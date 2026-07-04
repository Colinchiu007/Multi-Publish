// preload.js — Auto-injects flutter-skill bridge into Electron renderer
// Add this to your BrowserWindow webPreferences: { preload: require.resolve('flutter-skill-electron/preload') }

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flutterSkill', {
  health: () => ipcRenderer.invoke('flutter-skill:health'),
  inspect: () => ipcRenderer.invoke('flutter-skill:inspect'),
  tap: (selector) => ipcRenderer.invoke('flutter-skill:tap', { selector }),
  enterText: (selector, text) => ipcRenderer.invoke('flutter-skill:enter_text', { selector, text }),
  screenshot: () => ipcRenderer.invoke('flutter-skill:screenshot'),
  scroll: (dx, dy) => ipcRenderer.invoke('flutter-skill:scroll', { dx, dy }),
  getText: (selector) => ipcRenderer.invoke('flutter-skill:get_text', { selector }),
  findElement: (params) => ipcRenderer.invoke('flutter-skill:find_element', params),
  waitForElement: (selector, timeout) => ipcRenderer.invoke('flutter-skill:wait_for_element', { selector, timeout }),
});

console.log('[flutter-skill] Bridge injected into renderer');
