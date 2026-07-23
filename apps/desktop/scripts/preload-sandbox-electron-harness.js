'use strict'

const http = require('http')
const path = require('path')
const { app, BrowserWindow, ipcMain } = require('electron')
const registerIdentityHandlers = require('../electron/ipc-handlers/identity')

const HARNESS_RESULT_PREFIX = 'PRELOAD_SANDBOX_RESULT:'

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
app.setPath('cache', path.join(userDataDirectory, 'cache'))
app.disableHardwareAcceleration()
app.commandLine.appendSwitch('disable-gpu')

function listen () {
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

function closeServer () {
  if (!verificationServer) return
  const server = verificationServer
  verificationServer = null
  server.close()
  server.closeAllConnections?.()
}

function verifyRendererApi () {
  return verificationWindow.webContents.executeJavaScript(`
    (async () => {
      const api = window.electronAPI
      const identityStateResult = await api?.identityGetState?.()
      const identitySwitchResult = await api?.identitySwitchAccount?.()
      const story2videoCapabilitiesResult = await api?.story2videoCapabilities?.()
      return {
        exposed: typeof api === 'object' && api !== null,
        getVersion: typeof api?.getVersion === 'function',
        publishWechat: typeof api?.publishWechat === 'function',
        story2videoCapabilities: typeof api?.story2videoCapabilities === 'function',
        identityGetState: typeof api?.identityGetState === 'function',
        identitySwitchAccount: typeof api?.identitySwitchAccount === 'function',
        adminHidden: typeof api?.paymentComplete === 'undefined',
        accessLevel: api?.getAccessLevel?.(),
        getVersionResult: await api?.getVersion?.(),
        publishResult: await api?.publishWechat?.({ title: 'sandbox-smoke' }),
        story2videoCapabilitiesResult,
        identityStateResult,
        identityStateJson: JSON.stringify(identityStateResult),
        identitySwitchResult,
        identitySwitchJson: JSON.stringify(identitySwitchResult),
      }
    })()
  `, true)
}

function writeHarnessResult (result) {
  return new Promise((resolve, reject) => {
    process.stdout.write(
      HARNESS_RESULT_PREFIX + JSON.stringify({ sandbox, result }) + '\n',
      (error) => error ? reject(error) : resolve(),
    )
  })
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
ipcMain.handle('story2video:capabilities', async () => ({
  code: 0,
  data: {
    transcription: { available: false },
    remix: { available: false },
  },
}))
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
    await writeHarnessResult(await verifyRendererApi())
    app.quit()
  })
  .catch((error) => {
    console.error('preload sandbox harness 启动失败：', error)
    app.exit(1)
  })
