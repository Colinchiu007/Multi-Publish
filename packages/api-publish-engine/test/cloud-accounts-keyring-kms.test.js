'use strict'
/**
 * 生产 KMS：文件密钥环实现（keyring-kms.js）的回归测试
 *
 * 对应 OPS §5「生产 KMS 实现：仓库内只有 createLocalKms（开发/测试用），生产实现尚未编写。
 * 在这一项落地前，本特性不得对真实用户开启」，以及 ADR-0003 的后果段。
 *
 * 本文件最要紧的一条是**轮转回归**：`createLocalKms` 的主密钥来自单个环境变量，换掉它 = 库里
 * 每一份既有信封永久解不开（`unwrap` 认证失败 ⇒ KMS_UNAVAILABLE ⇒ 下行逐条 undecryptable）。
 * 那意味着全量凭证报废，而凭证不可恢复 —— 用户只能全部重新扫码。所以密钥环的契约不是
 * "能加密解密"，而是「**在 active 已经切到新密钥之后，用旧 keyId 封的信封仍然必须解得开**」，
 * 且这件事要用**真** envelope-crypto 跑一整轮（encryptCredential → 轮转 → decryptCredential），
 * 不得只测本模块自己的 wrap/unwrap。依据 AGENTS.md「跨包上行契约必须有一把拿真校验器 +
 * 真加密器的锁」——同族纪律，换了被验对象。
 *
 * 其余按 fail closed 的四类前提：环文件缺失 / JSON 坏 / active 不在 keys / 密钥不是 32 字节 hex
 * ——构造期一律抛 KMS_CONFIG_INVALID，不允许"先起来再在首次使用时炸"，因为那时现场只剩
 * 503 而没人知道是配置问题。
 *
 * 文件系统一律落在 `os.tmpdir()` 下带 PID/随机后缀的目录（AGENTS.md「文件系统测试隔离」），
 * 用例结束删除；禁止把可写状态落到仓库内。
 */
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('node:test')
const assert = require('node:assert')

const {
  createKeyringKms,
  readKeyringFile,
  writeKeyringFile,
  rotateKeyring,
  KEYRING_ENV,
} = require('../src/cloud-accounts/keyring-kms')
const { createEnvelopeCrypto } = require('../src/cloud-accounts/envelope-crypto')

const KEY_A = crypto.randomBytes(32).toString('hex')
const KEY_B = crypto.randomBytes(32).toString('hex')

/** 每个用例一套独立临时目录，结束即删。 */
function tempDir (t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mp-keyring-${process.pid}-`))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return dir
}

function ringPath (dir, name = 'kms-keyring.json') {
  return path.join(dir, name)
}

function makeRing (overrides = {}) {
  return Object.assign({ version: 1, activeKeyId: 'k1', keys: { k1: KEY_A } }, overrides)
}

const CREDENTIAL = { cookies: [{ name: 'sid', value: 'sess-1' }], localStorage: {} }

// ─────────────────────────── 构造期 fail closed ───────────────────────────

test('密钥环缺失/为空/active 不在 keys：构造期即 KMS_CONFIG_INVALID，不留到首次使用才炸', (t) => {
  const dir = tempDir(t)
  const missing = ringPath(dir, 'missing.json')

  assert.throws(() => createKeyringKms({ filePath: missing }), (e) => e.code === 'KMS_CONFIG_INVALID')
  assert.throws(() => createKeyringKms({ ring: { version: 1, activeKeyId: 'k1', keys: {} } }),
    (e) => e.code === 'KMS_CONFIG_INVALID')
  assert.throws(() => createKeyringKms({ ring: makeRing({ activeKeyId: 'ghost' }) }),
    (e) => e.code === 'KMS_CONFIG_INVALID', 'active 指向不存在的密钥必须拒绝')
  assert.throws(() => createKeyringKms({ ring: makeRing({ keys: { k1: 'tooshort' } }) }),
    (e) => e.code === 'KMS_CONFIG_INVALID')
  assert.throws(() => createKeyringKms({ ring: makeRing({ keys: { k1: 'AB' } }) }),
    (e) => e.code === 'KMS_CONFIG_INVALID', '必须是 32 字节 hex（64 个十六进制字符）')
})

test('环文件 JSON 损坏：报配置无效而不是崩在解析栈上，也不得把原文回显进错误', (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  fs.writeFileSync(p, '{ this is not json', 'utf8')
  assert.throws(() => createKeyringKms({ filePath: p }), (e) => {
    assert.match(e.code, /^KMS_CONFIG_INVALID$|^KMS_UNAVAILABLE$/)
    assert.ok(!e.message.includes('{ this is not json'), '错误信息不得回显文件原文')
    return true
  })
})

test('主密钥明文不得出现在任何返回值、错误信息或 describe() 里', (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })
  const summary = JSON.stringify(kms.describe())
  assert.ok(!summary.includes(KEY_A), 'describe() 泄漏主密钥')
  assert.deepEqual(JSON.parse(summary).keyIds, ['k1'], 'describe() 必须只暴露形状')
  // 注意：不要写 `!JSON.stringify(kms).includes(KEY_A)` 这种断言——KMS 对象只有函数属性，
  // JSON.stringify 结果是 `{}`，该断言恒真、什么都没守住（外部评审 I6）。
})

// ─────────────────────────── wrap / unwrap 基本合同 ───────────────────────────

test('wrap → unwrap 往返成立，且同一明文密钥两次 wrap 的密文不同（IV 每次新生）', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })
  const dataKey = crypto.randomBytes(32)

  const w1 = await kms.wrap(dataKey, 'user:u1')
  const w2 = await kms.wrap(dataKey, 'user:u1')
  assert.notStrictEqual(w1.toString('base64'), w2.toString('base64'), 'IV 复用 = 同一 DK 两次封成同一串')
  assert.ok(Buffer.isBuffer(w1))
  assert.deepStrictEqual(await kms.unwrap(w1, 'user:u1'), dataKey)
  assert.deepStrictEqual(await kms.unwrap(w2, 'user:u1'), dataKey)
})

test('AAD 绑业务 keyId：为 user:A 封的信封不得被 user:B 解出（跨归属隔离）', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })
  const wrapped = await kms.wrap(crypto.randomBytes(32), 'user:A')

  await assert.rejects(() => kms.unwrap(wrapped, 'user:B'), (e) => e.code === 'KMS_UNAVAILABLE')
})

test('信封里登记的密钥不在环上：KMS_UNAVAILABLE，不得静默返回空 Buffer', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing({ activeKeyId: 'k2', keys: { k2: KEY_B } }))
  const kms = createKeyringKms({ filePath: p })

  // 先造一份"曾经由 k1 封过"的信封（用 k1 在环上的实例），再把它拿到只剩 k2 的实例上解
  writeKeyringFile(p, makeRing({ activeKeyId: 'k1', keys: { k1: KEY_A } }))
  const old = createKeyringKms({ filePath: p })
  const wrappedByK1 = await old.wrap(crypto.randomBytes(32), 'user:u9')

  writeKeyringFile(p, makeRing({ activeKeyId: 'k2', keys: { k2: KEY_B } }))
  const after = createKeyringKms({ filePath: p })
  await assert.rejects(() => after.unwrap(wrappedByK1, 'user:u9'), (e) => e.code === 'KMS_UNAVAILABLE')
})

test('非 Buffer / 长度不足的 unwrap 输入与非法 dataKey 的 wrap 一律 KMS_UNAVAILABLE 抛出', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })

  await assert.rejects(() => kms.unwrap(Buffer.from('tiny'), 'user:u1'), (e) => e.code === 'KMS_UNAVAILABLE')
  await assert.rejects(() => kms.unwrap('not-a-buffer', 'user:u1'), (e) => e.code === 'KMS_UNAVAILABLE')
  await assert.rejects(() => kms.wrap(crypto.randomBytes(16), 'user:u1'), (e) => e.code === 'KMS_UNAVAILABLE')
  await assert.rejects(() => kms.wrap(crypto.randomBytes(32), ''), (e) => e.code === 'KMS_UNAVAILABLE')
})

// ─────────────────────────── 轮转：本文件存在的理由 ───────────────────────────

test('轮转后用**真** envelope-crypto 跑一整轮：旧信封必须仍解得开', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())

  const triple = { userId: 'u1', platform: 'douyin', platformUid: 'uid-1' }

  // 第一轮：k1 在 active 位上加密一份凭证
  const before = createEnvelopeCrypto({ kms: createKeyringKms({ filePath: p }) })
  const envelope = await before.encryptCredential({ ...triple, credential: CREDENTIAL })
  assert.deepStrictEqual(await before.decryptCredential(envelope, triple), CREDENTIAL)

  // 轮转：新增 k2 并把它设为 active，k1 保留（解旧数据要用）
  const rotated = await rotateKeyring({ filePath: p, newKeyId: 'k2' })
  assert.strictEqual(rotated.activeKeyId, 'k2')
  assert.deepStrictEqual(rotated.keyIds, ['k1', 'k2'], '轮转不得删掉旧密钥')
  assert.ok(!JSON.stringify(rotated).includes(KEY_A) && !JSON.stringify(rotated).includes(KEY_B),
    '轮转的返回值不得携带任何密钥材料')

  // 关键断言：新实例（active 已是 k2）解**旧**信封
  const after = createEnvelopeCrypto({ kms: createKeyringKms({ filePath: p }) })
  assert.deepStrictEqual(await after.decryptCredential(envelope, triple), CREDENTIAL,
    'active 切换后旧信封解不开 = 全量凭证报废，这正是密钥环要防的事故')

  // 新写一份必须走 k2，且两份都还能解
  const fresh = await after.encryptCredential({ ...triple, credential: { cookies: [], localStorage: {} } })
  assert.deepStrictEqual(await after.decryptCredential(fresh, triple), { cookies: [], localStorage: {} })
  assert.deepStrictEqual(await after.decryptCredential(envelope, triple), CREDENTIAL)
})

test('轮转不重写既有信封也能继续服务：摘要与 AAD 绑定不受影响', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const triple = { userId: 'sub-7', platform: 'zhihu', platformUid: 'z-7' }
  const cryptoBefore = createEnvelopeCrypto({ kms: createKeyringKms({ filePath: p }) })
  const envelope = await cryptoBefore.encryptCredential({ ...triple, credential: CREDENTIAL })

  await rotateKeyring({ filePath: p, newKeyId: 'k2' })
  const cryptoAfter = createEnvelopeCrypto({ kms: createKeyringKms({ filePath: p }) })

  // verifyDataKey 是「服务端能否重新解出这把 DK」的探针，轮转后对旧信封必须仍为 true
  assert.strictEqual(await cryptoAfter.verifyDataKey(envelope.encryptedDataKey, { userId: triple.userId }), true)
})

test('rotateKeyring：同名密钥 id 复用必须拒绝；环文件缺失不凭空造出一份', async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())

  await assert.rejects(() => rotateKeyring({ filePath: p, newKeyId: 'k1' }), (e) => e.code === 'KMS_CONFIG_INVALID')
  await assert.rejects(() => rotateKeyring({ filePath: ringPath(dir, 'nope.json') }), (e) => e.code === 'KMS_CONFIG_INVALID')

  const before = readKeyringFile(p)
  try {
    await rotateKeyring({ filePath: p, newKeyId: 'k1' })
  } catch (_) { /* 预期失败 */ }
  assert.deepStrictEqual(readKeyringFile(p), before, '失败的轮转必须原样保留原环（不得留半成品）')
  assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.lock')), [], '失败后不得留下死锁目录')
})

test('写入密钥环是原子替换：中途失败时原文件字节不变', (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  const original = makeRing()
  writeKeyringFile(p, original)

  // rename 失败（目标目录不存在）时必须把临时文件清掉且原文件仍是原来那份
  assert.throws(() => writeKeyringFile(path.join(dir, 'no-such-dir', 'ring.json'), makeRing()))
  assert.deepStrictEqual(readKeyringFile(p), original)
  assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.includes('.tmp')), [], '临时文件不得残留')
})

test('密钥环与本地单密钥 KMS 的接口同形：替换实现不得要求改 envelope-crypto', (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ filePath: p })
  assert.strictEqual(typeof kms.wrap, 'function')
  assert.strictEqual(typeof kms.unwrap, 'function')
  assert.strictEqual(kms.wrap.length >= 2 && kms.unwrap.length >= 2, true)
})

test('环境变量指定环路径：KEYRING_ENV 存在即生效，不存在时不影响显式 filePath', (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const kms = createKeyringKms({ env: { [KEYRING_ENV]: p } })
  assert.strictEqual(kms.activeKeyId(), 'k1')
  assert.strictEqual(KEYRING_ENV, 'MP_CLOUD_KMS_KEYRING')
})

// ─────────────────────────── 提供方选择口径（唯一实现） ───────────────────────────

test(`createKmsFromEnv：配了 ${'MP_CLOUD_KMS_KEYRING'} 就走密钥环，没配才退回开发单密钥，两者都没有即配置无效`, (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing())
  const { createKmsFromEnv } = require('../src/cloud-accounts')

  const picked = createKmsFromEnv({ MP_CLOUD_KMS_KEYRING: p })
  assert.strictEqual(picked.provider, 'keyring')
  assert.strictEqual(picked.kms.activeKeyId(), 'k1')
  assert.strictEqual(picked.kms.describe().provider, 'keyring')

  // 退回本机单密钥：只在显式配了合法 32 字节 hex 时才可用
  const local = createKmsFromEnv({ MP_CLOUD_KMS_LOCAL_KEY: KEY_A })
  assert.strictEqual(local.provider, 'local')

  assert.throws(() => createKmsFromEnv({}), (e) => e.code === 'KMS_CONFIG_INVALID',
    '两个都没配必须构造期失败，不得留到首次使用时才炸')
  assert.throws(() => createKmsFromEnv({ MP_CLOUD_KMS_KEYRING: path.join(dir, 'ghost.json') }),
    (e) => e.code === 'KMS_CONFIG_INVALID', '环路径指向不存在的文件必须当场失败')
  // 密钥环优先：两个都配时用环（口径只有一处实现，调用点不得各写一份判断）
  assert.strictEqual(createKmsFromEnv({ MP_CLOUD_KMS_KEYRING: p, MP_CLOUD_KMS_LOCAL_KEY: KEY_A }).provider, 'keyring')
})

test(`环里的一份密钥被换掉后，之前封的数据解不开——这正是必须轮转而不是改值的理由`, async (t) => {
  const dir = tempDir(t)
  const p = ringPath(dir)
  writeKeyringFile(p, makeRing({ activeKeyId: 'k1', keys: { k1: KEY_A } }))
  const kms = createKeyringKms({ filePath: p })
  const wrapped = await kms.wrap(crypto.randomBytes(32), 'user:u1')

  // 直接把同一个 id 的值换掉（= 旧的本机单密钥轮转方式）：信封立刻报废
  writeKeyringFile(p, makeRing({ activeKeyId: 'k1', keys: { k1: KEY_B } }))
  const replaced = createKeyringKms({ filePath: p })
  await assert.rejects(() => replaced.unwrap(wrapped, 'user:u1'), (e) => e.code === 'KMS_UNAVAILABLE')
})
