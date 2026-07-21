const path = require('path')

function detectPackagedRuntime () {
  return Boolean(process.versions && process.versions.electron && !process.defaultApp)
}

function resolvePlatformConfigPath (options = {}) {
  const env = options.env || process.env
  const explicitPath = typeof env.MULTI_PUBLISH_CONFIG_PATH === 'string'
    ? env.MULTI_PUBLISH_CONFIG_PATH.trim()
    : ''
  if (explicitPath) return path.resolve(explicitPath)

  const customRoot = typeof env.MULTI_PUBLISH_ROOT === 'string'
    ? env.MULTI_PUBLISH_ROOT.trim()
    : ''
  if (customRoot) return path.join(customRoot, 'config', 'platforms.yaml')

  const packaged = typeof options.isPackaged === 'boolean'
    ? options.isPackaged
    : detectPackagedRuntime()
  const resourcesPath = options.resourcesPath || process.resourcesPath
  if (packaged && resourcesPath) {
    return path.join(resourcesPath, 'config', 'platforms.yaml')
  }

  return path.resolve(__dirname, '..', '..', '..', 'config', 'platforms.yaml')
}

module.exports = { resolvePlatformConfigPath }
