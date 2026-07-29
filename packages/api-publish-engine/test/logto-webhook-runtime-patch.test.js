const assert = require('assert')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')

const patchScriptPath = path.resolve(__dirname, '../../../deploy/logto/patch-webhook-post-retry.cjs')
assert(fs.existsSync(patchScriptPath), '必须提供 fail-closed 的 Logto Webhook POST 重试补丁脚本')

const {
  EXPECTED_RUNTIME_SHA256,
  OLD_RETRY_FRAGMENT,
  NEW_RETRY_FRAGMENT,
  patchWebhookPostRetry,
} = require(patchScriptPath)

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function withFixture(files, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'logto-webhook-retry-'))
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(root, name), content)
    }
    callback(root)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

assert.strictEqual(
  EXPECTED_RUNTIME_SHA256,
  '77441c2d030d064343cfb22aa61b0e0ed45bff8fb33a1d4ce2beed6a8f1c752c',
  '补丁必须绑定已验收的 Logto 1.41.0 运行时文件哈希',
)
assert.strictEqual(OLD_RETRY_FRAGMENT, 'retry: { limit: retries ?? 3 },')
assert.strictEqual(NEW_RETRY_FRAGMENT, 'retry: { limit: retries ?? 3, methods: ["post"] },')

withFixture({
  'main-ABC123.js': `before\n${OLD_RETRY_FRAGMENT}\nafter\n`,
  'main-ABC123.js.map': OLD_RETRY_FRAGMENT,
}, (buildDirectory) => {
  const target = path.join(buildDirectory, 'main-ABC123.js')
  const original = fs.readFileSync(target, 'utf8')
  const result = patchWebhookPostRetry({
    buildDirectory,
    runtimeSha256ForTest: sha256(original),
  })

  assert.strictEqual(result.file, target)
  assert.strictEqual(result.beforeSha256, sha256(original))
  assert.strictEqual(result.afterSha256, sha256(`before\n${NEW_RETRY_FRAGMENT}\nafter\n`))
  assert.strictEqual(fs.readFileSync(target, 'utf8'), `before\n${NEW_RETRY_FRAGMENT}\nafter\n`)
  assert.strictEqual(fs.readFileSync(`${target}.map`, 'utf8'), OLD_RETRY_FRAGMENT,
    '补丁不得误改 source map 或其他构建文件')
})

withFixture({
  'main-FIRST.js': OLD_RETRY_FRAGMENT,
  'main-SECOND.js': 'second runtime',
}, (buildDirectory) => {
  const originalOpenSync = fs.openSync
  let openCalls = 0
  let firstFileDescriptor

  fs.openSync = (...args) => {
    openCalls += 1
    if (openCalls === 2) {
      const error = new Error('simulated second runtime open failure')
      error.code = 'EACCES'
      throw error
    }
    firstFileDescriptor = originalOpenSync(...args)
    return firstFileDescriptor
  }

  try {
    assert.throws(
      () => patchWebhookPostRetry({
        buildDirectory,
        runtimeSha256ForTest: sha256(OLD_RETRY_FRAGMENT),
      }),
      /simulated second runtime open failure/,
      '后续 runtime 打开失败必须中止补丁',
    )
  } finally {
    fs.openSync = originalOpenSync
  }

  assert.strictEqual(openCalls, 2, '测试必须在第二个 runtime 打开时注入失败')
  assert.throws(
    () => fs.fstatSync(firstFileDescriptor),
    (error) => error?.code === 'EBADF',
    '后续 runtime 打开失败时必须关闭此前已经打开的文件描述符',
  )
})

withFixture({
  'main-SYMLINK.js': OLD_RETRY_FRAGMENT,
}, (buildDirectory) => {
  const target = path.join(buildDirectory, 'main-SYMLINK.js')
  const originalLstatSync = fs.lstatSync
  const originalOpenSync = fs.openSync
  let openCalled = false

  fs.lstatSync = (file, options) => {
    const result = originalLstatSync(file, options)
    if (path.resolve(file) === target) {
      return { ...result, isFile: () => false, isSymbolicLink: () => true }
    }
    return result
  }
  fs.openSync = (...args) => {
    openCalled = true
    return originalOpenSync(...args)
  }

  try {
    assert.throws(
      () => patchWebhookPostRetry({
        buildDirectory,
        runtimeSha256ForTest: sha256(OLD_RETRY_FRAGMENT),
      }),
      /运行时路径必须是唯一链接的普通文件/,
      '路径本身是 symlink 时必须在打开前 fail closed',
    )
  } finally {
    fs.lstatSync = originalLstatSync
    fs.openSync = originalOpenSync
  }

  assert.strictEqual(openCalled, false, 'symlink 路径不得传给会跟随链接的 openSync')
})

withFixture({
  'main-RACE.js': `before\n${OLD_RETRY_FRAGMENT}\nafter\n`,
}, (buildDirectory) => {
  const target = path.join(buildDirectory, 'main-RACE.js')
  const original = fs.readFileSync(target, 'utf8')
  const originalLstatSync = fs.lstatSync
  const originalWriteSync = fs.writeSync
  let pathIdentityChecks = 0
  let patchWriteCalls = 0

  fs.lstatSync = (file, options) => {
    const result = originalLstatSync(file, options)
    if (path.resolve(file) === target) {
      pathIdentityChecks += 1
      if (pathIdentityChecks === 2) {
        return new Proxy(result, {
          get(stats, property) {
            return property === 'ino' ? stats.ino + 1n : stats[property]
          },
        })
      }
    }
    return result
  }
  fs.writeSync = (...args) => {
    patchWriteCalls += 1
    return originalWriteSync(...args)
  }

  try {
    assert.throws(
      () => patchWebhookPostRetry({
        buildDirectory,
        runtimeSha256ForTest: sha256(original),
      }),
      /运行时文件在补丁提交前发生变化/,
      '哈希校验后的目标替换必须停止补丁提交',
    )
  } finally {
    fs.lstatSync = originalLstatSync
    fs.writeSync = originalWriteSync
  }

  assert.strictEqual(pathIdentityChecks, 2, '测试必须在提交前注入一次路径身份漂移')
  assert.strictEqual(patchWriteCalls, 0, '路径身份漂移后不得开始任何补丁写入')
  assert.strictEqual(fs.readFileSync(target, 'utf8'), original,
    '路径身份漂移不得修改原运行时文件')
})

withFixture({
  'main-WRITE-FAIL.js': `before\n${OLD_RETRY_FRAGMENT}\nafter\n`,
}, (buildDirectory) => {
  const target = path.join(buildDirectory, 'main-WRITE-FAIL.js')
  const original = fs.readFileSync(target, 'utf8')
  const originalWriteSync = fs.writeSync
  let failureInjected = false

  fs.writeSync = (fileDescriptor, buffer, offset, length, position) => {
    if (!failureInjected && buffer.toString('utf8').includes(NEW_RETRY_FRAGMENT)) {
      failureInjected = true
      originalWriteSync(fileDescriptor, buffer, offset, Math.min(8, length), position)
      const error = new Error('simulated patch staging write failure')
      error.code = 'ENOSPC'
      throw error
    }
    return originalWriteSync(fileDescriptor, buffer, offset, length, position)
  }

  try {
    assert.throws(
      () => patchWebhookPostRetry({
        buildDirectory,
        runtimeSha256ForTest: sha256(original),
      }),
      /simulated patch staging write failure/,
      '临时文件写入失败必须向构建过程传播',
    )
  } finally {
    fs.writeSync = originalWriteSync
  }

  assert(failureInjected, '测试必须真实注入部分写入失败')
  assert.strictEqual(fs.readFileSync(target, 'utf8'), original,
    '部分写入失败后必须恢复原运行时文件')
})

for (const scenario of [
  {
    name: '运行时哈希漂移',
    files: { 'main-HASH.js': `before\n${OLD_RETRY_FRAGMENT}\nafter\n` },
    expectedHash: sha256('different'),
    error: /运行时文件 SHA-256 不匹配/,
  },
  {
    name: '目标片段缺失',
    files: { 'main-MISSING.js': 'no retry fragment' },
    expectedHash: sha256('no retry fragment'),
    error: /必须且只能定位到一个待补丁运行时文件/,
  },
  {
    name: '单文件存在重复目标片段',
    files: { 'main-DUPLICATE.js': `${OLD_RETRY_FRAGMENT}\n${OLD_RETRY_FRAGMENT}` },
    expectedHash: sha256(`${OLD_RETRY_FRAGMENT}\n${OLD_RETRY_FRAGMENT}`),
    error: /目标片段必须且只能出现一次/,
  },
  {
    name: '多个运行时文件均命中',
    files: {
      'main-FIRST.js': OLD_RETRY_FRAGMENT,
      'main-SECOND.js': OLD_RETRY_FRAGMENT,
    },
    expectedHash: sha256(OLD_RETRY_FRAGMENT),
    error: /必须且只能定位到一个待补丁运行时文件/,
  },
  {
    name: '上游已包含补丁',
    files: { 'main-PATCHED.js': NEW_RETRY_FRAGMENT },
    expectedHash: sha256(NEW_RETRY_FRAGMENT),
    error: /必须且只能定位到一个待补丁运行时文件/,
  },
]) {
  withFixture(scenario.files, (buildDirectory) => {
    const before = new Map(
      Object.keys(scenario.files).map((name) => [name, fs.readFileSync(path.join(buildDirectory, name), 'utf8')]),
    )
    assert.throws(
      () => patchWebhookPostRetry({
        buildDirectory,
        runtimeSha256ForTest: scenario.expectedHash,
      }),
      scenario.error,
      scenario.name,
    )
    for (const [name, content] of before) {
      assert.strictEqual(fs.readFileSync(path.join(buildDirectory, name), 'utf8'), content,
        `${scenario.name} 必须在写入前失败`)
    }
  })
}

console.log('  ✅ Logto Webhook POST 重试补丁严格绑定运行时哈希并 fail closed')
