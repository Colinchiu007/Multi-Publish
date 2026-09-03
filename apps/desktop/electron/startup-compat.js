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

/**
 * 向上查找共享数据锚点：从 startDir 逐级上溯，寻找
 * `shared-user-data/.shared-data-anchor` 文件。
 *
 * 这是「零环境变量」的强制共享方案：只要开发者在仓库根创建了
 * `shared-user-data/.shared-data-anchor`，无论从哪个环境（WSL/Windows）
 * 启动，应用都会自动使用仓库根的 shared-user-data 作为 userData，
 * 两个环境的模型配置、流水线选项、发布历史天然一致。
 *
 * 锚点缺失 → 返回 null，行为完全回退到默认 userData（不改变既有逻辑）。
 * 打包应用：asar 内不存在锚点文件，自然回退默认行为，对终端用户零影响。
 */
function findSharedUserDataDir (fsImpl, startDir) {
  let dir = startDir
  for (let depth = 0; depth < 8; depth++) {
    const candidate = path.join(dir, 'shared-user-data')
    try {
      if (fsImpl.existsSync(path.join(candidate, '.shared-data-anchor'))) return candidate
    } catch (_) { /* 权限异常等同锚点不存在 */ }
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

function configureUserDataPath ({
  app,
  env = process.env,
  argv = process.argv,
  fsImpl = fs,
  osImpl = os,
  platform = process.platform,
  moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd(),
} = {}) {
  if (!app || typeof app.getPath !== 'function') {
    return { path: null, fallback: false, explicit: false }
  }

  const explicit = getExplicitUserDataDir(env, argv)
  if (explicit) {
    setDataPaths(app, explicit)
    return { path: explicit, fallback: false, explicit: true }
  }

  // 共享数据锚点（优先级仅低于显式环境变量/CLI 参数）：
  // 检测到锚点且目录可写 → 自动启用共享 userData。
  const shared = findSharedUserDataDir(fsImpl, moduleDir)
  if (shared && isWritableDirectory(fsImpl, shared)) {
    setDataPaths(app, shared)
    return { path: shared, fallback: false, explicit: false, shared: true }
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
  const windowsSoftwareDefault = platform === 'win32' && env.ELECTRON_ENABLE_GPU !== '1'
  if (!explicitlyDisabled && !windowsSoftwareDefault && !safeMode) {
    return { disabled: false, reason: null }
  }

  const appendSwitch = app?.commandLine?.appendSwitch
  if (windowsSoftwareDefault && !explicitlyDisabled && !safeMode) {
    if (typeof appendSwitch === 'function') {
      appendSwitch.call(app.commandLine, 'use-gl', 'angle')
      appendSwitch.call(app.commandLine, 'use-angle', 'swiftshader')
    }
    return { disabled: false, reason: 'windows-software' }
  }

  if (typeof appendSwitch === 'function') {
    appendSwitch.call(app.commandLine, 'disable-gpu')
    appendSwitch.call(app.commandLine, 'disable-gpu-compositing')
    if (safeMode) appendSwitch.call(app.commandLine, 'disable-gpu-sandbox')
  }
  if (typeof app?.disableHardwareAcceleration === 'function') {
    app.disableHardwareAcceleration()
  }

  return {
    disabled: true,
    reason: safeMode ? 'safe-mode' : 'explicit',
  }
}

module.exports = {
  configureGraphics,
  configureUserDataPath,
  findSharedUserDataDir,
  getExplicitUserDataDir,
  isWritableDirectory,
}
