'use strict'

const path = require('path')
const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const registerIdentityHandlers = require('../electron/ipc-handlers/identity')

protocol.registerSchemesAsPrivileged([{
  scheme: 'app',
  privileges: { standard: true, secure: true },
}])

const sandboxArgument = process.argv.find((argument) => {
  return argument.startsWith('--preload-sandbox-mode=')
})
const userDataArgument = process.argv.find((argument) => {
  return argument.startsWith('--preload-sandbox-user-data-dir=')
})
const sandbox = !sandboxArgument || sandboxArgument.endsWith('=true')
const userDataDirectory = userDataArgument?.slice(
  '--preload-sandbox-user-data-dir='.length,
)
let verificationWindow = null

if (!userDataDirectory) {
  throw new Error('preload sandbox harness 缺少隔离用户目录')
}
app.setPath('userData', userDataDirectory)
app.setPath('sessionData', path.join(userDataDirectory, 'session'))
app.setPath('cache', path.join(userDataDirectory, 'cache'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

ipcMain.on('auth:get-access-level', (event) => {
  event.returnValue = 'authenticated'
})
ipcMain.handle('app:get-version', async () => {
  return { code: 0, data: 'preload-sandbox-test' }
})
ipcMain.handle('publish:wechat', async () => {
  return { code: 0, data: { accepted: true } }
})
registerIdentityHandlers(ipcMain)

app.on('window-all-closed', () => app.quit())
app.on('render-process-gone', (_event, webContents, details) => {
  console.error('preload sandbox renderer 异常退出：', {
    reason: details.reason,
    exitCode: details.exitCode,
    url: webContents && typeof webContents.getURL === 'function' ? webContents.getURL() : '',
  })
  })
app.whenReady()
  .then(async () => {
    protocol.handle('app', () => new Response(
      '<!doctype html><html><body>preload-sandbox-smoke</body></html>',
      { headers: { 'content-type': 'text/html' } },
    ))
    verificationWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '..', 'electron', 'preload', 'index.bundle.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox,
      },
    })
    verificationWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
      console.error(`preload sandbox 加载失败：${preloadPath}`, error)
    })
    await verificationWindow.loadURL('app://localhost/index.html')
  })
  .catch((error) => {
    console.error('preload sandbox harness 启动失败：', error)
    process.exitCode = 1
    app.quit()
  })
