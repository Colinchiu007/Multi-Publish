const path = require('path')
const { resolvePlatformConfigPath } = require('../platform-config-path')

describe('platform config runtime path', () => {
  test('packaged runtime reads config from resources', () => {
    const resourcesPath = path.join('C:\\Multi-Publish', 'resources')

    expect(resolvePlatformConfigPath({
      isPackaged: true,
      resourcesPath,
      env: {},
    })).toBe(path.join(resourcesPath, 'config', 'platforms.yaml'))
  })

  test('explicit config path has highest priority', () => {
    const explicitPath = path.join('D:\\config', 'platforms.yaml')

    expect(resolvePlatformConfigPath({
      isPackaged: true,
      resourcesPath: 'C:\\resources',
      env: { MULTI_PUBLISH_CONFIG_PATH: explicitPath },
    })).toBe(explicitPath)
  })

  test('custom project root is supported in development', () => {
    const root = path.join('D:\\deploy', 'multi-publish')

    expect(resolvePlatformConfigPath({
      isPackaged: false,
      env: { MULTI_PUBLISH_ROOT: root },
    })).toBe(path.join(root, 'config', 'platforms.yaml'))
  })

  test('development fallback points to repository config', () => {
    expect(resolvePlatformConfigPath({ isPackaged: false, env: {} })).toBe(
      path.resolve(__dirname, '..', '..', '..', '..', 'config', 'platforms.yaml'),
    )
  })
})
