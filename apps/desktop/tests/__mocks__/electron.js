/**
 * Electron mock — 用于非 Electron 环境的模块解析测试
 * 只 mock 最小接口，让 require() 能通过即可
 */
module.exports = {
  app: {
    getPath: () => '/tmp',
    getVersion: () => '1.2.0',
    on: () => {},
    whenReady: () => Promise.resolve(),
    quit: () => {},
  },
  BrowserWindow: class {
    constructor() { this.webContents = { on: () => {}, loadURL: () => {} } }
    loadURL() {}
    on() {}
    close() {}
    static getAllWindows() { return [] }
    static getFocusedWindow() { return null }
  },
  ipcMain: {
    handle: () => {},
    on: () => {},
  },
  ipcRenderer: {
    invoke: () => Promise.resolve(),
    on: () => {},
  },
  session: {
    defaultSession: { cookies: { get: () => Promise.resolve([]) } },
    fromPartition: () => ({ cookies: { get: () => Promise.resolve([]) } }),
  },
  dialog: {
    showSaveDialog: () => Promise.resolve({ canceled: false, filePath: '' }),
    showOpenDialog: () => Promise.resolve({ canceled: false, filePaths: [] }),
  },
  shell: { openExternal: () => {} },
  Notification: class { show() {} },
  clipboard: { readText: () => '' },
  nativeImage: { createFromPath: () => ({ isEmpty: () => false }) },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { width: 1920, height: 1080 } }),
    getAllDisplays: () => [],
  },
  Menu: { setApplicationMenu: () => {}, buildFromTemplate: () => ({ popup: () => {} }) },
  Tray: class {
    setToolTip() {}
    setContextMenu() {}
    on() {}
    isDestroyed() { return false }
    destroy() {}
    displayBalloon() {}
  },
  BrowserView: class {
    setBounds() {}
    setBackgroundColor() {}
    get webContents() { return { on: () => {}, loadURL: () => {} } }
  },
  globalShortcut: { register: () => true, unregisterAll: () => {} },
  powerSaveBlocker: { start: () => 1, stop: () => {} },
  net: { request: () => ({ on: () => {}, end: () => {} }) },
  protocol: { registerHttpProtocol: () => {}, registerFileProtocol: () => {} },
}
