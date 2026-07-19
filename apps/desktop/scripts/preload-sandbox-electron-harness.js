'use strict'

const http = require('http')
const path = require('path')
const { app, BrowserWindow, ipcMain } = require('electron')

const sandboxArgument = process.argv.find((argument) => {
  return argument.startsWith('--preload-sandbox-mode=')
})
const sandbox = !sandboxArgument || sandboxArgument.endsWith('=true')
let verificationServer = null
let verificationWindow = null

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
      resolve(`http://127.0.0.1:${address.port}/`)
    })
  })
}

function closeServer() {
  if (!verificationServer) return
  verificationServer.close()
  verificationServer = null
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

app.on('before-quit', closeServer)
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
    await verificationWindow.loadURL(url)
  })
  .catch((error) => {
    console.error('preload sandbox harness 启动失败：', error)
    process.exitCode = 1
    app.quit()
  })
