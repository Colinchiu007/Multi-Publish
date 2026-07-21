const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const runtimePath = require('../src/runtime-config-path')

function test(name, fn) {
  try {
    fn()
    console.log('PASS ' + name)
  } catch (error) {
    console.error('FAIL ' + name + ': ' + error.message)
    process.exitCode = 1
  }
}

test('packaged runtime resolves platforms.yaml below resources/config', () => {
  const resourcesPath = path.join('C:\\Program Files', 'Multi-Publish', 'resources')
  assert.strictEqual(
    runtimePath.resolvePlatformConfigPath({ isPackaged: true, resourcesPath, env: {} }),
    path.join(resourcesPath, 'config', 'platforms.yaml'),
  )
})

test('api router reloads a config from the explicit runtime path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'multi-publish-router-'))
  const configPath = path.join(dir, 'platforms.yaml')
  fs.writeFileSync(configPath, 'platforms:\n  test_platform:\n    has_api: true\n', 'utf8')
  const previous = process.env.MULTI_PUBLISH_CONFIG_PATH
  process.env.MULTI_PUBLISH_CONFIG_PATH = configPath
  try {
    const router = require('../src/api-router')
    router.reloadConfig()
    assert.strictEqual(router.shouldUseApi('test_platform'), true)
  } finally {
    if (previous === undefined) delete process.env.MULTI_PUBLISH_CONFIG_PATH
    else process.env.MULTI_PUBLISH_CONFIG_PATH = previous
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

if (process.exitCode) process.exit(process.exitCode)
