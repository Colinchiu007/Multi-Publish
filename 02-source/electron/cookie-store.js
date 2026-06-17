const fs = require('fs')
const path = require('path')
const log = require('./logger')
const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 32

/**
 * 从应用主密钥派生 AES-256 密钥
 * @param {string} masterKey - 主密钥（存储在 userData 中）
 * @param {Buffer} salt - 随机盐
 * @returns {Buffer} 派生密钥
 */
function deriveKey (masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512')
}

/**
 * 获取或创建主密钥
 */
function getMasterKey (cookieDir) {
  const keyFile = path.join(cookieDir, '.masterkey')
  let masterKey
  if (fs.existsSync(keyFile)) {
    masterKey = fs.readFileSync(keyFile, 'utf8').trim()
  } else {
    masterKey = crypto.randomBytes(32).toString('hex')
    fs.mkdirSync(cookieDir, { recursive: true })
    fs.writeFileSync(keyFile, masterKey, 'utf8')
  }
  return masterKey
}

/**
 * 获取 Cookie 存储目录
 */
function getCookieDir (userDataDir) {
  return path.join(userDataDir, 'cookies')
}

/**
 * 加密 cookie 数据并保存到文件
 * @param {string} platform - 平台标识 (如 wechat_mp)
 * @param {Array} cookies - Playwright cookie 数组
 * @param {string} userDataDir - Electron userData 目录
 */
function saveCookies (platform, cookies, userDataDir) {
  const cookieDir = getCookieDir(userDataDir)
  const masterKey = getMasterKey(cookieDir)

  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = deriveKey(masterKey, salt)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const plaintext = JSON.stringify(cookies)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()

  // 格式: salt(32) + iv(16) + tag(16) + encrypted
  const payload = Buffer.concat([salt, iv, tag, encrypted])

  fs.mkdirSync(cookieDir, { recursive: true })
  fs.writeFileSync(path.join(cookieDir, `${platform}.enc`), payload)
}

/**
 * 从文件加载并解密 cookie 数据
 * @param {string} platform - 平台标识
 * @param {string} userDataDir - Electron userData 目录
 * @returns {Array|null} Playwright cookie 数组，或 null
 */
function loadCookies (platform, userDataDir) {
  const cookieFile = path.join(getCookieDir(userDataDir), `${platform}.enc`)
  if (!fs.existsSync(cookieFile)) return null

  const masterKey = getMasterKey(getCookieDir(userDataDir))
  const payload = fs.readFileSync(cookieFile)

  // 解析格式: salt(32) + iv(16) + tag(16) + encrypted
  const salt = payload.subarray(0, SALT_LENGTH)
  const iv = payload.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = payload.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const encrypted = payload.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  const key = deriveKey(masterKey, salt)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  try {
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])
    return JSON.parse(decrypted.toString('utf8'))
  } catch (e) {
    console.error(`[CookieStore] Failed to decrypt ${platform} cookies:`, e.message)
    return null
  }
}

function deleteCookies (platform, userDataDir) {
  const cookieFile = path.join(getCookieDir(userDataDir), `${platform}.enc`)
  if (fs.existsSync(cookieFile)) {
    fs.unlinkSync(cookieFile)
    return true
  }
  return false
}

module.exports = {
  saveCookies,
  loadCookies,
  deleteCookies
}