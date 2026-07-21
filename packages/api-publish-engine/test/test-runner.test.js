const assert = require('assert')
const path = require('path')
const test = require('node:test')
const packageJson = require('../package.json')
const { classifyTestFiles, resolveVitestCli, runAllTests, runProcess } = require('../scripts/run-tests')

test('API 发布引擎使用跨平台测试 runner，不依赖 shell 展开 glob', () => {
  assert.strictEqual(packageJson.scripts.test, 'node scripts/run-tests.js')
})

test('runner 将 Vitest globals 文件和可直接执行文件分组', () => {
  assert.deepStrictEqual(classifyTestFiles([
    'C:/repo/test/signer.test.js',
    'C:/repo/test/logto-auth.test.js',
  ]), {
    direct: ['C:/repo/test/logto-auth.test.js'],
    vitest: ['C:/repo/test/signer.test.js'],
  })
})

test('runner 从 Vitest 包入口解析跨平台 CLI 路径', () => {
  const packageEntry = path.join('C:', 'repo', 'node_modules', 'vitest', 'index.cjs')
  assert.strictEqual(
    resolveVitestCli(() => packageEntry),
    path.join(path.dirname(packageEntry), 'vitest.mjs'),
  )
})

test('runner 为每个子进程设置超时并把启动错误视为失败', () => {
  let options
  const ok = runProcess(process.execPath, ['example.test.js'], {
    timeoutMs: 4321,
    spawnSync(_command, _args, receivedOptions) {
      options = receivedOptions
      return { status: null, error: new Error('spawn failed') }
    },
  })

  assert.strictEqual(ok, false)
  assert.strictEqual(options.timeout, 4321)
})

test('runner 执行全部分组并聚合任一子进程失败', () => {
  const calls = []
  const status = runAllTests({
    files: [
      'C:/repo/test/logto-auth.test.js',
      'C:/repo/test/entitlement.test.js',
      'C:/repo/test/signer.test.js',
    ],
    vitestCli: 'C:/repo/node_modules/vitest/vitest.mjs',
    stdio: 'ignore',
    spawnSync(command, args) {
      calls.push({ command, args })
      return { status: args.some((argument) => String(argument).includes('entitlement.test.js')) ? 1 : 0 }
    },
  })

  assert.strictEqual(status, 1)
  assert.strictEqual(calls.length, 3)
  assert(calls[2].args.includes('C:/repo/test/signer.test.js'))
})
