'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')

function getExplicitUserDataDir (env, argv) {
  const configured = typeof env.ELECTRON_USER_DATA_DIR === 'string'
    ? env.ELECTRON_USER_DATA_DIR.trim()
    : ''
  if (configured) return configured

  const argument = argv.find((value) => value.startsWith('--user-data-dir='))
  const fromArgument = argument ? argument.slice('--user-data-dir='.length).trim() : ''
  return fromArgument || null
}

function isWritableDirectory (fsImpl, directory) {
  try {
    fsImpl.mkdirSync(directory, { recursive: true })
    fsImpl.accessSync(directory, fsImpl.constants.W_OK)
    return true
  } catch {
    return false
  }
}

function setDataPaths (app, userDataDir) {
  if (typeof app.setPath !== 'function') return
  app.setPath('userData', userDataDir)
  app.setPath('sessionData', path.join(userDataDir, 'session'))
  app.setPath('cache', path.join(userDataDir, 'cache'))
}

function configureUserDataPath ({
  app,
  env = process.env,
  argv = process.argv,
  fsImpl = fs,
  osImpl = os,
  platform = process.platform,
} = {}) {
  if (!app || typeof app.getPath !== 'function') {
    return { path: null, fallback: false, explicit: false }
  }

  const explicit = getExplicitUserDataDir(env, argv)
  if (explicit) {
    setDataPaths(app, explicit)
    return { path: explicit, fallback: false, explicit: true }
  }

  const current = app.getPath('userData')
  if (typeof app.setPath !== 'function') {
    return { path: current, fallback: false, explicit: false }
  }

  if (isWritableDirectory(fsImpl, current)) {
    setDataPaths(app, current)
    return { path: current, fallback: false, explicit: false }
  }

  const localRoot = typeof env.LOCALAPPDATA === 'string' && env.LOCALAPPDATA.trim()
    ? env.LOCALAPPDATA
    : platform === 'win32'
      ? path.join(osImpl.homedir(), 'AppData', 'Local')
      : osImpl.tmpdir()
  const fallback = path.join(localRoot, 'Multi-Publish', 'user-data')

  if (!isWritableDirectory(fsImpl, fallback)) {
    throw new Error(`无法写入 Electron userData 目录：${current}；备用目录也不可写：${fallback}`)
  }

  setDataPaths(app, fallback)
  return { path: fallback, fallback: true, explicit: false, previousPath: current }
}

function configureGraphics ({
  app,
  env = process.env,
  platform = process.platform,
} = {}) {
  const explicitlyDisabled = env.ELECTRON_DISABLE_GPU === '1'
  const safeMode = env.ELECTRON_GPU_SAFE_MODE === '1'
  const windowsSafeDefault = platform === 'win32' && env.ELECTRON_ENABLE_GPU !== '1'
  if (!explicitlyDisabled && !windowsSafeDefault && !safeMode) {
    return { disabled: false, reason: null }
  }

  const appendSwitch = app?.commandLine?.appendSwitch
  if (typeof appendSwitch === 'function') {
    appendSwitch.call(app.commandLine, 'disable-gpu')
    appendSwitch.call(app.commandLine, 'disable-gpu-compositing')
    appendSwitch.call(app.commandLine, 'use-gl', 'swiftshader')
    appendSwitch.call(app.commandLine, 'use-angle', 'swiftshader')
    if (safeMode) appendSwitch.call(app.commandLine, 'disable-gpu-sandbox')
  }
  if (typeof app?.disableHardwareAcceleration === 'function') {
    app.disableHardwareAcceleration()
  }

  return {
    disabled: true,
    reason: safeMode ? 'safe-mode' : explicitlyDisabled ? 'explicit' : 'windows-default',
  }
}

module.exports = {
  configureGraphics,
  configureUserDataPath,
  getExplicitUserDataDir,
  isWritableDirectory,
}
