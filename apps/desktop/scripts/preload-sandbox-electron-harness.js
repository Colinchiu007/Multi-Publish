'use strict'

const http = require('http')
const path = require('path')
const { app, BrowserWindow, ipcMain } = require('electron')
const registerIdentityHandlers = require('../electron/ipc-handlers/identity')

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
let verificationServer = null
let verificationWindow = null

if (!userDataDirectory) {
  throw new Error('preload sandbox harness 缺少隔离用户目录')
}
app.setPath('userData', userDataDirectory)
app.setPath('sessionData', path.join(userDataDirectory, 'session'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

function listen() {
  return new Promise((resolve, reject) => {
    verificationServer = http.createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><html><body>preload-sandbox-smoke</body></html>')
    })
    verificationServer.once('error', reject)
    verificationServer.listen(0, '127.0.0.1', () => {
      verificationServer.removeListener('error', reject)
      const address = verificationServer.address()
      process.env.DEV_SERVER_PORT = String(address.port)
      resolve(`http://127.0.0.1:${address.port}/`)
    })
  })
}

function closeServer() {
  if (!verificationServer) return
  const server = verificationServer
  verificationServer = null
  server.close()
  server.closeAllConnections?.()
}

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

app.on('before-quit', closeServer)
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
    const url = await listen()
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
    await verificationWindow.loadURL(url)
  })
  .catch((error) => {
    console.error('preload sandbox harness 启动失败：', error)
    process.exitCode = 1
    app.quit()
  })
