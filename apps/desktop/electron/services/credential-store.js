// @ts-check
/**
 * CredentialStore — 凭证双层存储
 * 
 * 基于蚁小二逆向工程的 CookieContainer 双层架构：
 * 
 * 第一层：Session Cookie（Electron session.fromPartition）
 *   - 每个账号独立 session 分区 persist:auth-{accountId}
 *   - Cookie 自动持久化到 Electron 磁盘
 * 
 * 第二层：应用层凭证（localStorage + accountInfo）
 *   - 从 webview 中提取 localStorage 键值对
 *   - 保存账号信息（昵称、头像等）
 *   - 使用 AES-256-GCM 加密存储
 * 
 * 文件路径: {userData}/credentials/{accountId}.json.enc
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const log = require('./logger')

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 32

/**
 * 派生 AES-256 密钥
 */
function deriveKey (masterKey, salt) {
  return crypto.pbkdf2Sync(masterKey, salt, 100000, KEY_LENGTH, 'sha512')
}

/**
 * 获取或创建主密钥
 */
function getMasterKey (credDir) {
  const keyFile = path.join(credDir, '.masterkey')
  let masterKey
  if (fs.existsSync(keyFile)) {
    masterKey = fs.readFileSync(keyFile, 'utf8').trim()
  } else {
    masterKey = crypto.randomBytes(32).toString('hex')
    fs.mkdirSync(credDir, { recursive: true })
    // 修复 P5：主密钥原子写（原 writeFileSync 中断会导致所有凭证永久不可解密）
    const tmpPath = keyFile + '.tmp'
    fs.writeFileSync(tmpPath, masterKey, 'utf8')
    fs.renameSync(tmpPath, keyFile)
    // 安全：限制主密钥文件权限为 600（仅所有者可读写）
    try { fs.chmodSync(keyFile, 0o600) } catch (e) { /* Windows 无效，忽略 */ }
    // 备份主密钥（双副本，防止单文件损坏导致全部凭证不可解密）
    try {
      const bakPath = keyFile + '.bak'
      fs.writeFileSync(bakPath, masterKey, 'utf8')
      try { fs.chmodSync(bakPath, 0o600) } catch (e) { /* ignore */ }
    } catch (e) { /* best-effort backup */ }
  }
  return masterKey
}

/**
 * 加密
 */
function encryptData (plaintext, masterKey) {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = deriveKey(masterKey, salt)
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()
  
  return Buffer.concat([salt, iv, tag, encrypted])
}

/**
 * 解密
 */
function decryptData (payload, masterKey) {
  const salt = payload.subarray(0, SALT_LENGTH)
  const iv = payload.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = payload.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  const encrypted = payload.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
  
  const key = deriveKey(masterKey, salt)
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ])
  return JSON.parse(decrypted.toString('utf8'))
}

/**
 * 获取凭证存储目录
 */
function getCredentialDir (userDataDir) {
  return path.join(userDataDir, 'credentials')
}

/**
 * 获取凭证文件路径
 * 安全：校验 accountId 不含路径穿越序列（防止 ../../etc/passwd）
 */
function getCredentialFilePath (accountId, credDir) {
  if (!accountId || typeof accountId !== 'string' || accountId.includes('..') || accountId.includes('/') || accountId.includes('\\') || accountId.includes(path.sep)) {
    throw new Error('Invalid accountId: must not contain path separators or traversal sequences')
  }
  return path.join(credDir, `${accountId}.json.enc`)
}

/**
 * 保存账号凭证（localStorage + accountInfo）
 * 
 * @param {string} accountId - 唯一账号标识
 * @param {object} data - {
 *   localStorage: {key: value, ...},
 *   accountInfo: {nickName, avatar, platformAccountId, ...}
 * }
 * @param {string} userDataDir
 */
function saveCredential (accountId, data, userDataDir) {
  try {
    const credDir = getCredentialDir(userDataDir)
    const masterKey = getMasterKey(credDir)
    const payload = encryptData(JSON.stringify(data), masterKey)

    const filePath = getCredentialFilePath(accountId, credDir)
    // 安全：原子写（写临时文件后 rename），防止崩溃中断损坏凭证文件
    const tmpPath = filePath + '.tmp.' + process.pid
    fs.writeFileSync(tmpPath, payload)
    fs.renameSync(tmpPath, filePath)
    log.info('CredentialStore', `Saved credentials for account: ${accountId}`)
  } catch (e) {
    log.error('CredentialStore', `Failed to save credentials for ${accountId}: ${e.message}`)
  }
}

/**
 * 加载账号凭证
 * 
 * @param {string} accountId
 * @param {string} userDataDir
 * @returns {object|null} {localStorage, accountInfo} 或 null
 */
function loadCredential (accountId, userDataDir) {
  try {
    const credDir = getCredentialDir(userDataDir)
    const filePath = getCredentialFilePath(accountId, credDir)
    
    if (!fs.existsSync(filePath)) return null
    
    const masterKey = getMasterKey(credDir)
    const payload = fs.readFileSync(filePath)
    return decryptData(payload, masterKey)
  } catch (e) {
    log.error('CredentialStore', `Failed to load credentials for ${accountId}: ${e.message}`)
    return null
  }
}

/**
 * 删除账号凭证
 */
function deleteCredential (accountId, userDataDir) {
  try {
    const credDir = getCredentialDir(userDataDir)
    const filePath = getCredentialFilePath(accountId, credDir)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
      log.info('CredentialStore', `Deleted credentials for account: ${accountId}`)
      return true
    }
    return false
  } catch (e) {
    log.error('CredentialStore', `Failed to delete credentials for ${accountId}: ${e.message}`)
    return false
  }
}

/**
 * 列出所有已保存凭证的账号
 */
function listAccounts (userDataDir) {
  try {
    const credDir = getCredentialDir(userDataDir)
    if (!fs.existsSync(credDir)) return []
    
    return fs.readdirSync(credDir)
      .filter(f => f.endsWith('.json.enc'))
      .map(f => f.replace('.json.enc', ''))
  } catch (e) {
    log.error('CredentialStore', `Failed to list accounts: ${e.message}`)
    return []
  }
}

/**
 * 检查账号是否有凭证
 */
function hasCredential (accountId, userDataDir) {
  const credDir = getCredentialDir(userDataDir)
  return fs.existsSync(getCredentialFilePath(accountId, credDir))
}

module.exports = {
  getMasterKey,
  getCredentialFilePath,
  getCredentialDir,
  saveCredential,
  loadCredential,
  deleteCredential,
  listAccounts,
  hasCredential
}
