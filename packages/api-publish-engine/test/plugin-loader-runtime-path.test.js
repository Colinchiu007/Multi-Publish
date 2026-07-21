const assert = require('assert')
const path = require('path')
const PluginLoader = require('../src/plugin-loader')

function test(name, fn) {
  try {
    fn()
    console.log('PASS ' + name)
  } catch (error) {
    console.error('FAIL ' + name + ': ' + error.message)
    process.exitCode = 1
  }
}

test('packaged Electron uses the user data plugin directory', () => {
  const userData = path.join('C:\\Users', 'demo', 'AppData', 'Roaming', 'Multi-Publish')
  const runtimeOptions = {
    app: { getPath: () => userData },
    env: {},
    moduleDir: path.join('C:\\resources', 'app.asar', 'node_modules', 'api', 'src'),
  }
  const resolved = PluginLoader.resolvePluginsDir(runtimeOptions)
  const loader = new PluginLoader(null, runtimeOptions)

  assert.strictEqual(resolved, path.join(userData, 'plugins'))
  assert.strictEqual(loader._pluginsDir, path.join(userData, 'plugins'))
})

test('explicit plugin directory has priority', () => {
  const explicitPath = path.join('D:\\data', 'plugins')
  const resolved = PluginLoader.resolvePluginsDir({
    app: { getPath: () => 'C:\\user-data' },
    env: { MULTI_PUBLISH_PLUGINS_DIR: explicitPath },
    moduleDir: 'C:\\resources\\app.asar\\node_modules\\api\\src',
  })

  assert.strictEqual(resolved, explicitPath)
})

if (process.exitCode) process.exit(process.exitCode)
