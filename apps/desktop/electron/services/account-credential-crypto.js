// @ts-check
/**
 * account-credential-crypto — accounts 表 cookies/localStorage 的加密适配器
 *
 * 复用 credential-store 的 AES-256-GCM + 同一主密钥（{userData}/credentials/.masterkey），
 * 保证账号凭证只有一套加密体系与主密钥事实源（架构重构 Stage -1.1）。
 *
 * 渐进式策略：
 *   - 主密钥可用（safeStorage 正常）→ 新写入只落 cookies_enc/localStorage_enc，
 *     明文列清空；存量明文数据由 Store.migrateAccountCredentials 迁移。
 *   - 主密钥不可用（系统凭据保护缺失 / credential-store fail-closed）→
 *     回退明文列并记录告警，保证老用户与无 safeStorage 环境不丢功能。
 */
const path = require('path')
const credentialStore = require('./credential-store')
const log = require('./logger')

/**
 * 将任意 BLOB 表示归一化为 Buffer（sql.js 返回 Uint8Array，safeStorage 返回 Buffer）
 * @param {Buffer|Uint8Array|ArrayBuffer|null} value
 * @returns {Buffer|null}
 */
function toBuffer (value) {
  if (!value) return null
  if (Buffer.isBuffer(value)) return value
  if (value instanceof ArrayBuffer) return Buffer.from(value)
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  return null
}

/**
 * 创建账号凭证加密适配器
 * @param {{ userDataDir?: string, safeStorage?: object }} [options]
 *   - userDataDir: 自定义用户数据目录（测试用）；缺省取 electron.app.getPath('userData')
 *   - safeStorage: 注入的 safeStorage（测试用）；缺省由 credential-store 从 electron 解析
 * @returns {{
 *   isEncryptionAvailable: () => boolean,
 *   encrypt: (plaintext: unknown) => Buffer|null,
 *   decrypt: (blob: Buffer|Uint8Array|null) => unknown,
 * }}
 */
function createAccountCredentialCrypto (options = {}) {
  const userDataDir = options.userDataDir !== undefined
    ? options.userDataDir
    : (() => {
      try {
        // eslint-disable-next-line global-require
        return require('electron').app.getPath('userData')
      } catch (_) {
        return null
      }
    })()
  const safeStorage = Object.prototype.hasOwnProperty.call(options, 'safeStorage')
    ? options.safeStorage
    : undefined
  const credDir = typeof userDataDir === 'string' && userDataDir
    ? path.join(userDataDir, 'credentials')
    : null

  let masterKey = null
  let masterKeyError = null

  function ensureMasterKey () {
    if (masterKey) return true
    if (!credDir) return false
    try {
      masterKey = credentialStore.getMasterKey(credDir, { safeStorage })
      return true
    } catch (e) {
      masterKeyError = e
      log.warn('AccountCredentialCrypto', '主密钥不可用，账号凭证回退明文存储: ' + e.message)
      return false
    }
  }

  return {
    isEncryptionAvailable () {
      return ensureMasterKey()
    },
    /**
     * 加密 cookies / localStorage。空值返回 null，表示无需加密落盘。
     * @param {unknown} plaintext
     * @returns {Buffer|null}
     */
    encrypt (plaintext) {
      if (plaintext === undefined || plaintext === null) return null
      if (Array.isArray(plaintext) && plaintext.length === 0) return null
      if (typeof plaintext === 'object' && Object.keys(plaintext).length === 0) return null
      if (!ensureMasterKey()) return null
      return credentialStore.encryptData(JSON.stringify(plaintext), masterKey)
    },
    /**
     * 解密 cookies / localStorage。blob 为空返回 null；解密失败（数据损坏/主密钥变更）
     * 返回 null 并记录错误，由调用方回退明文列。
     * @param {Buffer|Uint8Array|null} blob
     * @returns {unknown}
     */
    decrypt (blob) {
      const buf = toBuffer(blob)
      if (!buf || !ensureMasterKey()) return null
      try {
        return credentialStore.decryptData(buf, masterKey)
      } catch (e) {
        log.error('AccountCredentialCrypto', '账号凭证解密失败: ' + (e && e.message))
        return null
      }
    },
  }
}

module.exports = { createAccountCredentialCrypto, toBuffer }
