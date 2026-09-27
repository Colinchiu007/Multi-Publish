'use strict'
/**
 * 密钥环 KMS 的加固回归（外部评审 codex 的 4 条 Critical / 2 条 Warning 逐条锁死）
 *
 * 与 `cloud-accounts-keyring-kms.test.js` 的分工：那边证"实现做对了什么"（往返、轮转无损、
 * fail closed 的形状）；这边证"实现不会静默地不做"——四条都是**看起来配置对了、实际降级或损坏**
 * 的形态，共同点是失败时没有任何错误冒出来：
 *
 *   H1 `MP_CLOUD_KMS_KEYRING` 赋了空值 → 被当成"没配" → 静默退回开发单密钥。
 *      PRD §8.4 明令禁止「降级成用固定密钥」，而这条路径正好是它。
 *   H2 临时文件用默认 mode 创建 → Linux umask 022 下 0644 → rename 把权限带到密钥环上
 *      → 同机任意用户可读主密钥环。必须在**创建时**就 0600。
 *   H3 轮转是 read-modify-write，无锁时两个并发轮转后者整把丢掉前者的新密钥
 *      → 那些用被丢的密钥封的信封永久不可解。必须持锁，竞争即失败。
 *   H4 unwrap 出来的明文 DK 副本不清零 → 同一把 DK 在内存里多存一份直到 GC。
 *
 * 文件系统一律 `os.tmpdir()` 下带 PID 的独立目录（AGENTS.md「文件系统测试隔离」）。
 */
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')
const assert = require('node:assert')
const lockfile = require('proper-lockfile')

const {
  createKeyringKms, readKeyringFile, writeKeyringFile, rotateKeyring, KEYRING_ENV,
} = require('../src/cloud-accounts/keyring-kms')
const { createKmsFromEnv } = require('../src/cloud-accounts')
const { createEnvelopeCrypto } = require('../src/cloud-accounts/envelope-crypto')

const KEY_A = crypto.randomBytes(32).toString('hex')
const KEY_B = crypto.randomBytes(32).toString('hex')

function tempDir (t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mp-kms-hard-${process.pid}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

const ringPathOf = (dir, name = 'keyring.json') => path.join(dir, name)

function makeRing (overrides = {}) {
  return Object.assign({ version: 1, activeKeyId: 'k1', keys: { k1: KEY_A } }, overrides)
}

// ───────────────────────── H1：配了但值为空，不得静默降级 ─────────────────────────

test('H1 MP_CLOUD_KMS_KEYRING 存在但值为空白：必须 KMS_CONFIG_INVALID，绝不退回开发单密钥', () => {
  const blanks = ['', '   ', '\t']
  for (const blank of blanks) {
    assert.throws(
      () => createKmsFromEnv({ [KEYRING_ENV]: blank, MP_CLOUD_KMS_LOCAL_KEY: KEY_A }),
      (e) => e.code === 'KMS_CONFIG_INVALID',
      `空白环路径（${JSON.stringify(blank)}）被当成"没配"，于是静默降级成单密钥——PRD §8.4 禁止的正是这个`,
    )
  }

  // 对照：真的没配这个键时，才允许走开发单密钥
  const local = createKmsFromEnv({ MP_CLOUD_KMS_LOCAL_KEY: KEY_A })
  assert.strictEqual(local.provider, 'local')
})

test('H1b 环路径指向不存在的文件：构造期即失败，不留下"能用但每次 503"的半死状态', (t) => {
  const dir = tempDir(t)
  assert.throws(
    () => createKmsFromEnv({ [KEYRING_ENV]: path.join(dir, 'ghost.json') }),
    (e) => e.code === 'KMS_CONFIG_INVALID',
  )
})

// ───────────────────────── H2：密钥环落盘权限 ─────────────────────────

test('H2 写环必须以 0600 创建临时文件（先建后 chmod 会留全局可读窗口，且权限被 rename 带走）', (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)

  const calls = []
  const realOpen = fs.openSync
  fs.openSync = function (file, flags, mode) {
    calls.push({ file: String(file), flags: String(flags || ''), mode })
    return realOpen.apply(fs, arguments)
  }
  t.after(() => { fs.openSync = realOpen })

  writeKeyringFile(p, makeRing())

  const tmpCall = calls.find((c) => c.file.includes('.tmp'))
  assert.ok(tmpCall, '没有走临时文件（就不是原子替换）')
  assert.match(tmpCall.flags, /wx/, "必须用 'wx'：已存在即失败，不覆盖、不追随符号链接")
  // 断言必须钉"传了 mode 且等于 0600"，不能写成 `(mode & 0o077) === 0`：
  // 省略 mode 时实参是 undefined，`undefined & 0o077` 也等于 0，那条断言恒真、抓不到任何回归
  // （本轮反证 K8 实测：删掉 mode 实参后套件仍全绿，就是这个写法造成的）。
  assert.strictEqual(tmpCall.mode, 0o600,
    `临时文件必须以 0o600 创建（实得 ${tmpCall.mode === undefined ? '未传 mode' : '0o' + (tmpCall.mode & 0o777).toString(8)}）`)
  assert.ok(tmpCall.file !== `${p}.tmp`, '临时名必须不可预测（可猜即可被抢占/符号链接诱导）')

  if (process.platform !== 'win32') {
    assert.strictEqual(fs.statSync(p).mode & 0o077, 0o600, 'rename 把临时文件的权限带到目标上：环必须 0600')
  }
})

test('H2b 环文件名里的随机后缀每次不同（同一目录连续写两次不互相抢占）', (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  const seen = new Set()
  const realOpen = fs.openSync
  fs.openSync = function (file, flags, mode) {
    if (String(file).includes('.tmp')) seen.add(String(file))
    return realOpen.apply(fs, arguments)
  }
  t.after(() => { fs.openSync = realOpen })
  writeKeyringFile(p, makeRing())
  writeKeyringFile(p, makeRing({ activeKeyId: 'k1', keys: { k1: KEY_A, k2: KEY_B } }))
  assert.strictEqual(seen.size, 2, `临时名必须不可预测，实得 ${[...seen].join(' | ')}`)
})

// ───────────────────────── H3：轮转必须持锁 ─────────────────────────

test('H3 环已被别的轮转锁住时：本次轮转失败且**一个字节都不改**（并发轮转丢密钥 = 永久不可解）', async (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  writeKeyringFile(p, makeRing())
  const before = fs.readFileSync(p, 'utf8')

  const release = await lockfile.lock(p, { realpath: false, stale: 30000 })
  t.after(() => release())

  await assert.rejects(() => rotateKeyring({ filePath: p, newKeyId: 'k2' }),
    (e) => e.code === 'KMS_CONFIG_INVALID' && /LOCKED/.test(e.message),
    '竞争必须 fail closed，不能排队猜谁更新')
  assert.strictEqual(fs.readFileSync(p, 'utf8'), before, '被拒的轮转不得改动原环')
})

test('H3b 两次轮转串行执行时，第二次的环里仍含第一次的密钥（读的是最新那份）', async (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  writeKeyringFile(p, makeRing())

  const first = await rotateKeyring({ filePath: p, newKeyId: 'k2' })
  const second = await rotateKeyring({ filePath: p, newKeyId: 'k3' })
  assert.deepStrictEqual(second.keyIds, ['k1', 'k2', 'k3'], `轮转不得丢历史密钥，实得 ${JSON.stringify(second.keyIds)}`)
  assert.strictEqual(second.activeKeyId, 'k3')
})

// ───────────────────────── H4：DK 明文副本必须清零 ─────────────────────────

test('H4 KMS unwrap 交出的明文 DK，在解完之后必须被就地清零（不留第二份内存副本）', async (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })

  // 记住 KMS 实际返回的那个 Buffer 身份，事后检查它的内容——只看"有没有调 fill"是测不出来的
  const returned = []
  const spyingKms = {
    wrap: async (dk, keyId) => kms.wrap(dk, keyId),
    unwrap: async (edk, keyId) => {
      const value = await kms.unwrap(edk, keyId)
      returned.push(value)
      return value
    },
  }
  const envelopeCrypto = createEnvelopeCrypto({ kms: spyingKms })
  const triple = { userId: 'u-hard', platform: 'douyin', platformUid: 'uid-hard' }
  const envelope = await envelopeCrypto.encryptCredential({ ...triple, credential: { cookies: [{ name: 'a', value: 'b' }], localStorage: {} } })
  assert.deepStrictEqual(await envelopeCrypto.decryptCredential(envelope, triple), { cookies: [{ name: 'a', value: 'b' }], localStorage: {} })

  assert.strictEqual(returned.length, 1)
  assert.ok(returned[0].every((byte) => byte === 0),
    'unwrap 返回的明文 DK 副本仍留在内存里（同一把密钥多存一份直到 GC）')
})

// ───────────────────────── 信封前缀字节边界 ─────────────────────────

test('信封前缀被截断 / idLen 越界 / 尾部各段缺失：一律 KMS_UNAVAILABLE，绝不返回半解的 Buffer', async (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })
  const good = await kms.wrap(crypto.randomBytes(32), 'user:u1')

  const cases = {
    '空 Buffer': Buffer.alloc(0),
    '只有长度字节': Buffer.from([4]),
    'idLen=0': Buffer.concat([Buffer.from([0]), crypto.randomBytes(40)]),
    'idLen 声明超出实际长度': Buffer.concat([Buffer.from([80]), crypto.randomBytes(20)]),
    '合法 id 但缺 iv/tag/ct': Buffer.concat([Buffer.from([2]), Buffer.from('k1'), Buffer.alloc(4)]),
    '合法 id + iv 但缺 tag': Buffer.concat([Buffer.from([2]), Buffer.from('k1'), Buffer.alloc(20)]),
    '前缀字节被改成不存在的 key id': Buffer.concat([Buffer.from([2]), Buffer.from('k9'), good.subarray(3)]),
  }
  for (const [name, buffer] of Object.entries(cases)) {
    await assert.rejects(() => kms.unwrap(buffer, 'user:u1'),
      (e) => e.code === 'KMS_UNAVAILABLE',
      `${name} 必须被拒（返回部分解出的 Buffer 是最坏的失败形态）`)
  }
})

test('合法信封的 id 前缀长度必须与 keyId 实际字节数一致（读回原 id，不靠猜）', async (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  writeKeyringFile(p, makeRing({ activeKeyId: 'k-2026-10-name', keys: { 'k-2026-10-name': KEY_A } }))
  const kms = createKeyringKms({ filePath: p })
  const dk = crypto.randomBytes(32)
  const wrapped = await kms.wrap(dk, 'user:u2')
  assert.strictEqual(wrapped[0], Buffer.from('k-2026-10-name').length)
  assert.deepStrictEqual(await kms.unwrap(wrapped, 'user:u2'), dk)
})

// ───────────────────────── 生效时机（运维最容易误判的一条） ─────────────────────────

test('已构造的 KMS 实例缓存 active：轮转后**旧实例仍用旧 key 封装**，新实例才用新 key（需重启）', async (t) => {
  const dir = tempDir(t)
  const p = ringPathOf(dir)
  writeKeyringFile(p, makeRing())
  const running = createKeyringKms({ filePath: p })

  await rotateKeyring({ filePath: p, newKeyId: 'k2' })

  const wrappedByRunning = await running.wrap(crypto.randomBytes(32), 'user:u3')
  assert.strictEqual(wrappedByRunning.subarray(1, 1 + wrappedByRunning[0]).toString('utf8'), 'k1',
    '正在运行的进程应继续用旧 active（这是"重启才切换"的实现事实）')

  const restarted = createKeyringKms({ filePath: p })
  const wrappedByNew = await restarted.wrap(crypto.randomBytes(32), 'user:u3')
  assert.strictEqual(wrappedByNew.subarray(1, 1 + wrappedByNew[0]).toString('utf8'), 'k2')

  // 而且旧实例封的东西在新实例里照样解得开（不删旧 key 的唯一理由）
  assert.deepStrictEqual(await restarted.unwrap(wrappedByRunning, 'user:u3'),
    await running.unwrap(wrappedByRunning, 'user:u3'))
})
