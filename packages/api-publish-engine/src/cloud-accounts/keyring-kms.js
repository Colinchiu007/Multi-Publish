'use strict'
/**
 * keyring-kms.js — 生产可用的 KMS 实现：文件密钥环（ADR-0003 后果段、OPS §5 未执行项）。
 *
 * 为什么不是"再加一个环境变量"：`createLocalKms` 把主密钥钉在单个 `MP_CLOUD_KMS_LOCAL_KEY` 上，
 * 于是**换密钥 = 报废库里每一份既有信封**（`unwrap` 认证失败 ⇒ KMS_UNAVAILABLE ⇒ 下行逐条
 * undecryptable），而凭证不可恢复，用户只能全部重新扫码。本模块把主密钥从"一个值"变成
 * "一组带 id 的值 + 一个 active 指针"，并把所用密钥的 id **写进信封自己**，因此：
 *   * 新写入用 `activeKeyId`；
 *   * 旧信封按自己登记的 id 解密，轮转后依然解得开；
 *   * 轮转 = 追加一把 + 移指针，**从不删除旧密钥**（删了就是在销毁数据）。
 *
 * 为什么用文件而不是云 KMS（Vault / 阿里云 KMS）：本仓的部署形态是单台 ECS + Docker Compose，
 * 引入云 KMS 需要新增第三方依赖、长期凭证与网络出口，而 AGENTS.md 的原则是「能不用第三方服务
 * 就不用」；且 `KMS 抽象层` 只有 `{ wrap, unwrap }` 两个方法——真接云 KMS 时换掉本模块即可，
 * `envelope-crypto.js` 一行都不用改（`cloud-accounts-keyring-kms.test.js` 里有一条接口同形断言
 * 把这个边界钉住）。**这是刻意留的接缝，不是"以后再说"**。
 *
 * 安全边界（不得放松）：
 *   1. AAD 仍然绑业务 `keyId`（`user:${userId}`），所以一份信封不能跨归属解；密钥环的 id 只决定
 *      用哪把主密钥，不构成第二层归属隔离，两者不得混为一谈。
 *   2. 环文件缺失 / JSON 坏 / `activeKeyId` 不在 `keys` 里 / 密钥不是 32 字节 hex ⇒ **构造期**
 *      抛 `KMS_CONFIG_INVALID`。不许"先起来再在首次使用时炸"：那时现场只剩一个 503，
 *      没人知道是配置问题。
 *   3. 主密钥明文一律不进返回值、错误信息或 `describe()`；底层报错只作不可枚举 cause。
 *   4. 落盘走原子替换（`../atomic-rename`），失败的轮转必须原样保留旧环。
 */
const crypto = require('crypto')
const fs = require('fs')
const lockfile = require('proper-lockfile')

const { accountError, isPlainObject } = require('./validate-account')
const { writeFileAtomicSync } = require('../atomic-rename')

/** 服务端读这个环境变量决定用密钥环而不是本地单密钥。 */
const KEYRING_ENV = 'MP_CLOUD_KMS_KEYRING'

const DATA_KEY_BYTES = 32
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16
const MASTER_KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/
/** 密钥 id 只允许可打印的安全字符，且不得含路径分隔符——它会出现在信封字节里。 */
const KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,64}$/
const SUPPORTED_RING_VERSION = 1
const ID_LEN_BYTES = 1
const MAX_KEY_ID_LENGTH = 64

function configInvalid (detail) {
  return accountError('KMS_CONFIG_INVALID', 503, detail || 'KMS_CONFIG_INVALID')
}

/** hex 形态的环 → 运行期用的 Buffer 形态（转换只在这一处发生）。 */
function toMasterKeyMap (keys) {
  return new Map(Object.entries(keys).map(([id, hex]) => [id, Buffer.from(hex, 'hex')]))
}

function kmsUnavailable (cause) {
  const error = accountError('KMS_UNAVAILABLE', 503)
  // 底层报错常含路径/句柄，只作为不可枚举 cause 留给日志，不外泄给调用方（同 envelope-crypto）
  if (cause) Object.defineProperty(error, 'cause', { value: cause, enumerable: false })
  return error
}

/**
 * 校验并归一化一份密钥环，返回**仍是 hex 字符串**的形态（可直接再写盘）。
 * 不在这里转 Buffer：Buffer 走 JSON.stringify 会变成 `{"type":"Buffer","data":[...]}`，
 * 写出去的环下一行就读不回来了。**转 Buffer 只发生在 createKeyringKms 里。**
 * **不回显原文**：坏文件的内容可能部分就是密钥。
 * @param {unknown} raw
 * @param {string} [origin] 仅用于错误里指出"哪一份配置"，不含密钥值
 */
function assertRingShape (raw, origin) {
  const where = origin ? ` (${origin})` : ''
  if (!isPlainObject(raw)) throw configInvalid(`KMS_KEYRING_SHAPE_INVALID${where}`)
  if (raw.version !== SUPPORTED_RING_VERSION) throw configInvalid(`KMS_KEYRING_VERSION_UNSUPPORTED${where}`)
  if (!isPlainObject(raw.keys) || Object.keys(raw.keys).length === 0) {
    throw configInvalid(`KMS_KEYRING_EMPTY${where}`)
  }
  const keys = {}
  for (const [id, value] of Object.entries(raw.keys)) {
    if (!KEY_ID_PATTERN.test(id)) throw configInvalid(`KMS_KEYRING_KEY_ID_INVALID${where}`)
    if (typeof value !== 'string' || !MASTER_KEY_HEX_PATTERN.test(value.trim())) {
      // 只报 id，绝不报值
      throw configInvalid(`KMS_KEYRING_MASTER_KEY_INVALID:${id}${where}`)
    }
    keys[id] = value.trim().toLowerCase()
  }
  const activeKeyId = typeof raw.activeKeyId === 'string' ? raw.activeKeyId.trim() : ''
  if (!KEY_ID_PATTERN.test(activeKeyId) || !Object.prototype.hasOwnProperty.call(keys, activeKeyId)) {
    throw configInvalid(`KMS_KEYRING_ACTIVE_KEY_MISSING${where}`)
  }
  return { version: SUPPORTED_RING_VERSION, activeKeyId, keys }
}

/** 读环文件并校验；缺失/坏文件一律 KMS_CONFIG_INVALID（fail closed，不降级）。 */
function readKeyringFile (filePath) {
  let text
  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    throw configInvalid(`KMS_KEYRING_UNREADABLE:${error && error.code ? error.code : 'unknown'}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (_) {
    throw configInvalid('KMS_KEYRING_JSON_INVALID')
  }
  const ring = assertRingShape(parsed, filePath)
  // 归一化后仍是 hex 字符串，调用方可以直接再写回去
  return ring
}

/** 原子写环文件；校验失败时不落盘。 */
function writeKeyringFile (filePath, ring) {
  const normalized = assertRingShape(ring)
  const payload = JSON.stringify({
    version: normalized.version,
    activeKeyId: normalized.activeKeyId,
    keys: normalized.keys,
  }, null, 2)
  writeFileAtomicSync(filePath, payload)
  return normalized
}

/**
 * 新密钥 id 的可用性校验（形状 + 不与既有 id 撞名）。
 * `rotateKeyring` 与运维 CLI 的 `--dry-run` 共用这一把口径：演练必须和真实轮转同样严格，
 * 否则"演练通过、真跑失败"会在生产上把一次计划内轮转变成计划外事故。
 */
function assertNewKeyIdUsable (newKeyId, existingKeys) {
  if (typeof newKeyId !== 'string' || !KEY_ID_PATTERN.test(newKeyId)) throw configInvalid('KMS_KEYRING_NEW_KEY_ID_INVALID')
  if (Object.prototype.hasOwnProperty.call(existingKeys, newKeyId)) {
    throw configInvalid(`KMS_KEYRING_KEY_ID_EXISTS:${newKeyId}`)
  }
  return newKeyId
}

/**
 * 轮转：追加一把新主密钥并把 active 指针移过去。**旧密钥全部保留**——它们是解开既有信封的唯一途径。
 *
 * 「读环 → 校验 id → 生成密钥 → 原子写」是一个 read-modify-write，**必须持锁**：两个并发轮转各自
 * 基于同一份旧环生成新环，后一次 rename 会把前一次的新密钥整把丢掉；若服务在覆盖之前已经加载并用它
 * 写过信封，那些信封从此永久不可解（凭证不可恢复）。锁失败一律不写（fail closed）。
 * 口径沿用 `api-key-manager` 的 writer lock：`retries: 0`（竞争就失败，不排队猜谁更新）、
 * `stale: 30s`（进程被杀不留死锁）。
 *
 * 返回**不含任何密钥材料**的形状：把整份 ring 交回调用方，等于给未来的日志埋一个
 * 「一行 JSON.stringify 就把主密钥全打出来」的坑。
 * @param {{ filePath: string, newKeyId: string, randomBytes?: (n:number)=>Buffer }} options
 * @returns {Promise<{activeKeyId: string, keyIds: string[]}>}
 */
async function rotateKeyring (options = {}) {
  const { filePath, newKeyId } = options
  if (typeof filePath !== 'string' || !filePath) throw configInvalid('KMS_KEYRING_PATH_REQUIRED')
  if (!fs.existsSync(filePath)) throw configInvalid('KMS_KEYRING_UNREADABLE:ENOENT')

  let release
  try {
    release = await lockfile.lock(filePath, { realpath: false, retries: 0, stale: 30000, update: 10000 })
  } catch (error) {
    if (error && error.code === 'ELOCKED') throw configInvalid('KMS_KEYRING_LOCKED')
    throw error
  }
  try {
    const current = readKeyringFile(filePath)
    assertNewKeyIdUsable(newKeyId, current.keys)
    const randomBytes = options.randomBytes || crypto.randomBytes
    const material = randomBytes(DATA_KEY_BYTES)
    if (!Buffer.isBuffer(material) || material.length !== DATA_KEY_BYTES) throw configInvalid('KMS_KEYRING_RANDOM_BYTES_UNAVAILABLE')
    const next = {
      version: current.version,
      activeKeyId: newKeyId,
      keys: Object.assign({}, current.keys, { [newKeyId]: material.toString('hex') }),
    }
    material.fill(0)
    writeKeyringFile(filePath, next)
    return { activeKeyId: next.activeKeyId, keyIds: Object.keys(next.keys).sort() }
  } finally {
    try { await release() } catch (_) { /* 释放失败不影响已写好的环 */ }
  }
}

/**
 * `createKeyringKms({ filePath | ring | env, randomBytes })` → `{ wrap, unwrap, activeKeyId, describe }`
 * 与 `createLocalKms` 同形（KMS 抽象层只有这两个方法），因此 `envelope-crypto.js` 不需要知道换过实现。
 */
function createKeyringKms (options = {}) {
  const env = options.env || process.env
  const filePath = typeof options.filePath === 'string' && options.filePath.trim()
    ? options.filePath.trim()
    : String((env && env[KEYRING_ENV]) || '').trim()

  let activeKeyId
  /** @type {Map<string, Buffer>} */
  let masterKeys
  if (options.ring !== undefined) {
    const ring = assertRingShape(options.ring, 'inline ring')
    activeKeyId = ring.activeKeyId
    masterKeys = toMasterKeyMap(ring.keys)
  } else {
    if (!filePath) throw configInvalid('KMS_KEYRING_PATH_MISSING')
    const ring = assertRingShape(readKeyringFile(filePath), filePath)
    activeKeyId = ring.activeKeyId
    masterKeys = toMasterKeyMap(ring.keys)
  }

  function readRandomBytes (size) {
    const source = options.randomBytes || crypto.randomBytes
    const value = source(size)
    if (!Buffer.isBuffer(value) || value.length !== size) throw kmsUnavailable(new Error('random bytes unavailable'))
    return value
  }

  /** 信封自描述：`[idLen:1][keyId][iv:12][tag:16][ct]`——不另设列也能按 id 找回主密钥。 */
  async function wrap (dataKey, keyId) {
    if (!Buffer.isBuffer(dataKey) || dataKey.length !== DATA_KEY_BYTES) throw kmsUnavailable(new Error('invalid data key'))
    if (typeof keyId !== 'string' || !keyId) throw kmsUnavailable(new Error('invalid key id'))
    const master = masterKeys.get(activeKeyId)
    if (!master) throw kmsUnavailable(new Error('active key missing from ring'))
    const idBuf = Buffer.from(activeKeyId, 'utf8')
    if (idBuf.length > MAX_KEY_ID_LENGTH) throw kmsUnavailable(new Error('key id too long'))
    const iv = readRandomBytes(IV_BYTES)
    const cipher = crypto.createCipheriv('aes-256-gcm', master, iv)
    cipher.setAAD(Buffer.from(keyId, 'utf8'))
    const ciphertext = Buffer.concat([cipher.update(dataKey), cipher.final()])
    return Buffer.concat([Buffer.from([idBuf.length]), idBuf, iv, cipher.getAuthTag(), ciphertext])
  }

  async function unwrap (wrapped, keyId) {
    if (!Buffer.isBuffer(wrapped)) throw kmsUnavailable(new Error('invalid wrapped key'))
    const idLen = wrapped.length >= 1 ? wrapped[0] : 0
    const offset = ID_LEN_BYTES + idLen
    if (!idLen || idLen > MAX_KEY_ID_LENGTH || wrapped.length <= offset + IV_BYTES + AUTH_TAG_BYTES) {
      throw kmsUnavailable(new Error('invalid wrapped key'))
    }
    const keyIdName = wrapped.subarray(ID_LEN_BYTES, offset).toString('utf8')
    const master = masterKeys.get(keyIdName)
    if (!KEY_ID_PATTERN.test(keyIdName) || !master) throw kmsUnavailable(new Error('unknown kms key id'))
    if (typeof keyId !== 'string' || !keyId) throw kmsUnavailable(new Error('invalid key id'))
    const iv = wrapped.subarray(offset, offset + IV_BYTES)
    const tag = wrapped.subarray(offset + IV_BYTES, offset + IV_BYTES + AUTH_TAG_BYTES)
    const ciphertext = wrapped.subarray(offset + IV_BYTES + AUTH_TAG_BYTES)
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', master, iv)
      decipher.setAAD(Buffer.from(keyId, 'utf8'))
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(ciphertext), decipher.final()])
    } catch (error) {
      throw kmsUnavailable(error)
    }
  }

  return {
    wrap,
    unwrap,
    activeKeyId: () => activeKeyId,
    /** 只给运维看形状，绝不含主密钥。 */
    describe: () => ({ provider: 'keyring', activeKeyId, keyIds: [...masterKeys.keys()].sort(), keyCount: masterKeys.size }),
  }
}

module.exports = {
  createKeyringKms,
  readKeyringFile,
  writeKeyringFile,
  assertNewKeyIdUsable,
  rotateKeyring,
  assertRingShape,
  KEYRING_ENV,
}
