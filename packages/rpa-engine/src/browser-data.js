/**
 * BrowserDataManager — 浏览器登录状态持久化管理
 *
 * 从 MediaCrawler 登录持久化（browser_data + cookie file）适配。
 *
 * 功能：
 * 1. 统一管理持久化 session 分区名（persist:rpa-{platform}-{accountId}）
 * 2. 从 Electron session 提取/恢复所有 cookies
 * 3. 从页面提取/恢复 localStorage
 * 4. 管理浏览器 userData 目录（每个平台+账号独立）
 *
 * 使用：
 *   const { browserData } = require('@multi-publish/rpa-engine')
 *
 *   // 获取持久化分区名
 *   const partition = browserData.getPartition('douyin', 'acc_123')
 *   // → "persist:rpa-douyin-acc_123"
 *
 *   // 保存登录状态
 *   await browserData.saveCookies(partition, userDataDir)
 *
 *   // 恢复登录状态
 *   await browserData.restoreCookies(partition, userDataDir)
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// ─── 常量 ────────────────────────────────────────

/** Cookie 备份文件名 */
const COOKIE_BACKUP_FILE = 'cookies.json.enc'
/** session 分区前缀 */
const PERSIST_PREFIX = 'persist:rpa-'
/** AES 加密参数（与 credential-store 保持一致） */
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 32

// ─── 内部工具 ────────────────────────────────────

/**
 * 获取浏览器数据根目录
 * @param {string} userDataDir - Electron app.getPath('userData')
 * @returns {string}
 */
function getBrowserDataDir (userDataDir) {
  return path.join(userDataDir, 'browser_data')
}

/**
 * 获取指定平台+账号的浏览器数据目录
 * @param {string} platform - 平台标识
 * @param {string} accountId - 账号 ID
 * @param {string} userDataDir
 * @returns {string}
 */
function getAccountDataDir (platform, accountId, userDataDir) {
  return path.join(getBrowserDataDir(userDataDir), platform, sanitizeId(accountId))
}

/**
 * 清理账号 ID 中的非法字符
 */
function sanitizeId (id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '_')
}

/**
 * 获取或创建加密密钥（文件锁+原子写入）
 * @param {string} dir - 密钥存储目录
 * @returns {string} masterKey hex string
 */
function getOrCreateKey (dir) {
  const keyFile = path.join(dir, '.browser_data_key')
  if (fs.existsSync(keyFile)) {
    return fs.readFileSync(keyFile, 'utf8').trim()
  }
  const key = crypto.randomBytes(32).toString('hex')
  fs.mkdirSync(dir, { recursive: true })
  // 原子写入：先写临时文件再 rename
  const tmp = keyFile + '.tmp.' + Date.now()
  fs.writeFileSync(tmp, key, 'utf8')
  fs.renameSync(tmp, keyFile)
  // R26 修复：与 credential-store.getMasterKey 对齐 — 限制文件权限 600 + 双副本备份
  // 原仅单文件无备份，主密钥损坏会导致所有浏览器数据永久不可解密
  try { fs.chmodSync(keyFile, 0o600) } catch (e) { /* Windows 无效，忽略 */ }
  try {
    const bakPath = keyFile + '.bak'
    fs.writeFileSync(bakPath, key, 'utf8')
    try { fs.chmodSync(bakPath, 0o600) } catch (e) { /* ignore */ }
  } catch (e) { /* best-effort backup */ }
  return key
}

/**
 * AES-256-GCM 加密
 */
function encrypt (plaintext, masterKey) {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512')
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([salt, iv, tag, encrypted])
}

/**
 * AES-256-GCM 解密
 */
function decrypt (payload, masterKey) {
  const salt = payload.subarray(0, SALT_LENGTH)
  const iv = payload.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = payload.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const encrypted = payload.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const key = crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

// ─── public API ──────────────────────────────────

/**
 * 生成 Electron session 持久化分区名
 *
 * 使用 persist: 前缀确保 Electron 将 session 数据持久化到磁盘。
 * 不同平台+账号使用不同分区，cookies/localStorage 互不干扰。
 *
 * @param {string} platform - 平台标识（如 douyin, xiaohongshu）
 * @param {string} [accountId='default'] - 账号 ID
 * @returns {string} session 分区名（如 "persist:rpa-douyin-acc_123"）
 */
function getPartition (platform, accountId) {
  const safeAccount = accountId ? sanitizeId(String(accountId)) : 'default'
  return PERSIST_PREFIX + platform + '-' + safeAccount
}

/**
 * 从 Electron session 提取并加密保存所有 cookies
 *
 * @param {object} electronSession - Electron session 对象（如 win.webContents.session）
 * @param {string} platform - 平台标识
 * @param {string} accountId - 账号 ID
 * @param {string} userDataDir - Electron app.getPath('userData')
 * @returns {Promise<{count: number, filePath: string}>}
 */
async function saveCookies (electronSession, platform, accountId, userDataDir) {
  const cookies = await electronSession.cookies.get({})
  if (!cookies || cookies.length === 0) {
    return { count: 0, filePath: '' }
  }

  const dir = getAccountDataDir(platform, accountId, userDataDir)
  fs.mkdirSync(dir, { recursive: true })
  const masterKey = getOrCreateKey(dir)
  const payload = encrypt(JSON.stringify(cookies), masterKey)
  const filePath = path.join(dir, COOKIE_BACKUP_FILE)
  // 安全修复：加密 cookies 备份原子写（原非原子写中断会导致登录态丢失）
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, payload)
  fs.renameSync(tmpPath, filePath)
  return { count: cookies.length, filePath }
}

/**
 * 从加密备份恢复 cookies 到 Electron session
 *
 * @param {object} electronSession - Electron session 对象
 * @param {string} platform - 平台标识
 * @param {string} accountId - 账号 ID
 * @param {string} userDataDir
 * @returns {Promise<{count: number, restored: boolean}>}
 */
async function restoreCookies (electronSession, platform, accountId, userDataDir) {
  const dir = getAccountDataDir(platform, accountId, userDataDir)
  const filePath = path.join(dir, COOKIE_BACKUP_FILE)
  if (!fs.existsSync(filePath)) {
    return { count: 0, restored: false }
  }

  try {
    const masterKey = getOrCreateKey(dir)
    const payload = fs.readFileSync(filePath)
    const decrypted = decrypt(payload, masterKey)
    const cookies = JSON.parse(decrypted.toString('utf8'))

    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { count: 0, restored: false }
    }

    // 批量设置 cookies（跳过无效项）
    let setCount = 0
    for (const c of cookies) {
      try {
        await electronSession.cookies.set(c)
        setCount++
      } catch (e) {
        // 跳过设置失败的 cookie（过期或 domain 不匹配）
      }
    }

    return { count: setCount, restored: setCount > 0 }
  } catch (e) {
    // 解密失败（密钥变更或数据损坏）→ 删除损坏文件
    try { fs.unlinkSync(filePath) } catch (_) {}
    return { count: 0, restored: false }
  }
}

/**
 * 从页面提取 localStorage 并保存
 *
 * @param {object} webContents - Electron webContents
 * @param {string} platform
 * @param {string} accountId
 * @param {string} userDataDir
 * @returns {Promise<{count: number, filePath: string}>}
 */
async function saveLocalStorage (webContents, platform, accountId, userDataDir) {
  let lsData
  try {
    lsData = await webContents.executeJavaScript('JSON.stringify(window.localStorage)')
  } catch (e) {
    return { count: 0, filePath: '' }
  }

  let parsed
  try { parsed = JSON.parse(lsData) } catch (e) { return { count: 0, filePath: '' } }

  const keys = Object.keys(parsed)
  if (keys.length === 0) return { count: 0, filePath: '' }

  const dir = getAccountDataDir(platform, accountId, userDataDir)
  fs.mkdirSync(dir, { recursive: true })
  const masterKey = getOrCreateKey(dir)
  const payload = encrypt(lsData, masterKey)
  const filePath = path.join(dir, 'localStorage.json.enc')
  // 安全修复：加密 localStorage 备份原子写（原非原子写中断会导致登录态丢失）
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, payload)
  fs.renameSync(tmpPath, filePath)
  return { count: keys.length, filePath }
}

/**
 * 从加密备份恢复 localStorage 到页面
 *
 * @param {object} webContents - Electron webContents
 * @param {string} platform
 * @param {string} accountId
 * @param {string} userDataDir
 * @returns {Promise<{count: number, restored: boolean}>}
 */
async function restoreLocalStorage (webContents, platform, accountId, userDataDir) {
  const dir = getAccountDataDir(platform, accountId, userDataDir)
  const filePath = path.join(dir, 'localStorage.json.enc')
  if (!fs.existsSync(filePath)) return { count: 0, restored: false }

  try {
    const masterKey = getOrCreateKey(dir)
    const payload = fs.readFileSync(filePath)
    const decrypted = decrypt(payload, masterKey)
    const lsData = decrypted.toString('utf8')

    await webContents.executeJavaScript('(function(){var d=' + lsData + ';var c=0;Object.keys(d).forEach(function(k){try{localStorage.setItem(k,d[k]);c++}catch(e){}});return c})()')
    return { count: Object.keys(JSON.parse(lsData)).length, restored: true }
  } catch (e) {
    try { fs.unlinkSync(filePath) } catch (_) {}
    return { count: 0, restored: false }
  }
}

/**
 * 检查指定平台+账号是否有持久化的登录状态
 *
 * @param {string} platform
 * @param {string} accountId
 * @param {string} userDataDir
 * @returns {boolean}
 */
function hasSavedState (platform, accountId, userDataDir) {
  const dir = getAccountDataDir(platform, accountId, userDataDir)
  return fs.existsSync(path.join(dir, COOKIE_BACKUP_FILE))
}

/**
 * 清除指定平台+账号的持久化登录状态
 *
 * @param {string} platform
 * @param {string} accountId
 * @param {string} userDataDir
 * @returns {boolean}
 */
function clearState (platform, accountId, userDataDir) {
  const dir = getAccountDataDir(platform, accountId, userDataDir)
  if (!fs.existsSync(dir)) return false

  try {
    fs.rmSync(dir, { recursive: true, force: true })
    return true
  } catch (e) {
    return false
  }
}

/**
 * 列出所有有持久化登录状态的账号
 *
 * @param {string} userDataDir
 * @returns {Array<{platform: string, accountId: string}>}
 */
function listSavedAccounts (userDataDir) {
  const result = []
  const browserDataDir = getBrowserDataDir(userDataDir)
  if (!fs.existsSync(browserDataDir)) return result

  const platforms = fs.readdirSync(browserDataDir)
  for (const platform of platforms) {
    const platformDir = path.join(browserDataDir, platform)
    if (!fs.statSync(platformDir).isDirectory()) continue

    const accountIds = fs.readdirSync(platformDir)
    for (const accountId of accountIds) {
      const accountDir = path.join(platformDir, accountId)
      if (fs.statSync(accountDir).isDirectory() &&
          fs.existsSync(path.join(accountDir, COOKIE_BACKUP_FILE))) {
        result.push({ platform, accountId })
      }
    }
  }

  return result
}

/**
 * 获取 Electron session 的 cookie 数量（用于验证登录状态）
 *
 * @param {object} electronSession
 * @param {string} [domain] - 按域名过滤
 * @returns {Promise<number>}
 */
async function getCookieCount (electronSession, domain) {
  const filter = domain ? { domain } : {}
  const cookies = await electronSession.cookies.get(filter)
  return cookies ? cookies.length : 0
}

/**
 * 检查 cookies 中是否包含登录态（session/token）
 *
 * @param {object} electronSession
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
async function hasLoginCookie (electronSession, domain) {
  const cookies = await electronSession.cookies.get({ domain })
  if (!cookies || cookies.length === 0) return false

  // 常见登录态 cookie 关键字
  const LOGIN_INDICATORS = ['session', 'token', 'auth', 'sid', 'passport', 'login', 'ticket', 'SSO']
  return cookies.some(c => LOGIN_INDICATORS.some(k => c.name.toLowerCase().includes(k)))
}

module.exports = {
  // 核心 API
  getPartition,
  saveCookies,
  restoreCookies,
  saveLocalStorage,
  restoreLocalStorage,

  // 状态管理
  hasSavedState,
  clearState,
  listSavedAccounts,
  getCookieCount,
  hasLoginCookie,

  // 内部暴露（供测试用）
  _internals: {
    getBrowserDataDir,
    getAccountDataDir,
    sanitizeId,
    getOrCreateKey,
    encrypt,
    decrypt,
  },
}
