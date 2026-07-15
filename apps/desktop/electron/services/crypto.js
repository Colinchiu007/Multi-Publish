// @ts-check
/**
 * crypto — API Key 加密/解密/遮罩
 *
 * 使用 Electron safeStorage 进行操作系统级加密：
 * - macOS: Keychain
 * - Windows: DPAPI
 * - Linux: libsecret
 *
 * 关键设计决策（审查记录第 17 行）：
 * safeStorage 不可用时拒绝存储 + UI 显示警告（非降级明文）
 * 不使用 Buffer.from 明文降级方案，确保安全合规
 */

let log
try {
  log = require('./logger')
} catch {
  log = { info: () => {}, warn: () => {}, error: () => {} }
}

// 注入的 safeStorage（测试用）；生产环境从 electron 获取
let _injectedSafeStorage = null

/**
 * 注入 safeStorage（测试用）
 * 传 null 清除注入，回退到 electron.safeStorage
 */
function setSafeStorage(safeStorage) {
  _injectedSafeStorage = safeStorage
}

/**
 * 获取 safeStorage 实例
 * 优先使用注入的，其次从 electron 获取
 */
function _getSafeStorage() {
  if (_injectedSafeStorage !== null) return _injectedSafeStorage
  try {
    const { safeStorage } = require('electron')
    return safeStorage
  } catch {
    return null
  }
}

/**
 * 检查 safeStorage 是否可用
 */
function isAvailable() {
  const ss = _getSafeStorage()
  return !!(ss && ss.isEncryptionAvailable && ss.isEncryptionAvailable())
}

/**
 * 将输入转为 Buffer
 * - Buffer 直接返回
 * - string 尝试 base64 解码（加密数据序列化后通常是 base64）
 * - 其他类型转 string 后 base64 解码
 */
function _toBuffer(encrypted) {
  if (Buffer.isBuffer(encrypted)) return encrypted
  if (typeof encrypted === 'string') {
    // 尝试 base64 解码
    return Buffer.from(encrypted, 'base64')
  }
  return Buffer.from(String(encrypted), 'base64')
}

/**
 * 加密 API Key
 * @param {string} apiKey - 明文 API Key
 * @returns {Buffer|null} 加密后的 Buffer，apiKey 为空时返回 null
 * @throws {Error} safeStorage 不可用时抛错（拒绝降级明文）
 */
function encrypt(apiKey) {
  if (!apiKey) return null
  if (!isAvailable()) {
    log.error('ModelProviderCrypto', 'safeStorage not available, refusing to encrypt')
    throw new Error('safeStorage not available — cannot encrypt API Key (refusing plaintext fallback)')
  }
  return _getSafeStorage().encryptString(apiKey)
}

/**
 * 解密 API Key
 * @param {Buffer|string} encrypted - 加密的 Buffer 或 base64 字符串
 * @returns {string} 解密后的明文，encrypted 为空时返回 ''
 * @throws {Error} safeStorage 不可用时抛错（拒绝降级明文）
 */
function decrypt(encrypted) {
  if (!encrypted) return ''
  if (!isAvailable()) {
    log.error('ModelProviderCrypto', 'safeStorage not available, refusing to decrypt')
    throw new Error('safeStorage not available — cannot decrypt API Key (refusing plaintext fallback)')
  }
  const buf = _toBuffer(encrypted)
  try {
    return _getSafeStorage().decryptString(buf)
  } catch (e) {
    log.error('ModelProviderCrypto', 'Decrypt failed: ' + e.message)
    return ''
  }
}

/**
 * 返回遮罩后的 API Key（用于显示，如 sk-****1234）
 * @param {string} apiKey - 明文 API Key
 * @returns {string} 遮罩后的字符串
 */
function mask(apiKey) {
  if (!apiKey || apiKey.length < 8) return '****'
  const prefix = apiKey.substring(0, 4)
  const suffix = apiKey.substring(apiKey.length - 4)
  return prefix + '****' + suffix
}

module.exports = { setSafeStorage, isAvailable, encrypt, decrypt, mask }
