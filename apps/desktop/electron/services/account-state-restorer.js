/**
 * AccountStateRestorer — 账号登录状态恢复
 * 
 * 基于蚁小二逆向工程的账号状态恢复方案：
 * 1. 保存完整凭证：cookies + localStorage + accountInfo
 * 2. 恢复登录：先注入 cookies，再注入 localStorage，页面自动登录
 * 
 * 文件路径: {userData}/accounts/state.jsonl
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')

const STATE_FILE = 'accounts/state.jsonl'

/**
 * 获取状态文件路径
 */
function getStateFilePath (userDataDir) {
  return path.join(userDataDir, STATE_FILE)
}

/**
 * 初始化状态文件
 */
function init () {
  const filePath = getStateFilePath(process.env.ELECTRON_USER_DATA_DIR || process.cwd())
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '')
  }
}

/**
 * 保存账号凭证
 * 写入一条 JSONL 记录
 * 
 * @param {object} record - {
 *   accountId: string,
 *   platform: string,
 *   platformAccountId: string,
 *   cookies: Array<{name, value, domain, path, ...}>,
 *   localStorage: Object<{key, value}>,
 *   accountInfo: {nickName, avatar, ...},
 *   timestamp: number
 * }
 */
function saveAccountRecord (record) {
  try {
    const filePath = getStateFilePath(process.env.ELECTRON_USER_DATA_DIR || process.cwd())
    const line = JSON.stringify({
      ...record,
      timestamp: Date.now()
    })
    fs.appendFileSync(filePath, line + '\n')
    log.info('AccountStateRestorer', `Saved credentials for ${record.platform}:${record.accountId}`)
  } catch (e) {
    log.error('AccountStateRestorer', `Failed to save account record: ${e.message}`)
  }
}

/**
 * 查询账号记录
 * 
 * @param {string} platform - 平台名
 * @param {string} accountId - 账号ID
 * @returns {object|null} 最近的记录，或 null
 */
function getAccountRecord (platform, accountId) {
  try {
    const filePath = getStateFilePath(process.env.ELECTRON_USER_DATA_DIR || process.cwd())
    if (!fs.existsSync(filePath)) return null
    
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(l => l.trim())
    
    // 从后往前找（最近的记录）
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const record = JSON.parse(lines[i])
        if (record.platform === platform && record.accountId === accountId) {
          return record
        }
      // eslint-disable-next-line no-unused-vars
      } catch (e) { /* skip corrupt line */ }
    }
    return null
  } catch (e) {
    log.error('AccountStateRestorer', `Failed to query account record: ${e.message}`)
    return null
  }
}

/**
 * 删除账号记录
 * 
 * @param {string} platform 
 * @param {string} accountId 
 */
function deleteAccountRecord (platform, accountId) {
  try {
    const filePath = getStateFilePath(process.env.ELECTRON_USER_DATA_DIR || process.cwd())
    if (!fs.existsSync(filePath)) return
    
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(l => l.trim())
    
    // 过滤掉匹配的账号
    const filtered = lines.filter(line => {
      try {
        const record = JSON.parse(line)
        return !(record.platform === platform && record.accountId === accountId)
      } catch {
        return true // keep corrupt lines
      }
    })
    
    fs.writeFileSync(filePath, filtered.join('\n') + (filtered.length ? '\n' : ''))
    log.info('AccountStateRestorer', `Deleted credentials for ${platform}:${accountId}`)
  } catch (e) {
    log.error('AccountStateRestorer', `Failed to delete account record: ${e.message}`)
  }
}

/**
 * 列出所有已登录账号
 * 
 * @returns {Array<{platform, accountId, accountInfo}>}
 */
function listLoggedInAccounts () {
  try {
    const filePath = getStateFilePath(process.env.ELECTRON_USER_DATA_DIR || process.cwd())
    if (!fs.existsSync(filePath)) return []
    
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(l => l.trim())
    
    // 取每个平台最新的记录
    const latestByPlatform = new Map()
    for (const line of lines) {
      try {
        const record = JSON.parse(line)
        if (record.platform && record.accountId) {
          const key = `${record.platform}:${record.accountId}`
          const existing = latestByPlatform.get(key)
          if (!existing || record.timestamp > existing.timestamp) {
            latestByPlatform.set(key, record)
          }
        }
      } catch { /* skip */ }
    }
    
    return Array.from(latestByPlatform.values())
  } catch (e) {
    log.error('AccountStateRestorer', `Failed to list accounts: ${e.message}`)
    return []
  }
}

/**
 * 清理过期记录（保留最近 N 天）
 * 
 * @param {number} days - 保留天数
 */
function purgeExpired (days = 90) {
  try {
    const filePath = getStateFilePath(process.env.ELECTRON_USER_DATA_DIR || process.cwd())
    if (!fs.existsSync(filePath)) return 0
    
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.trim().split('\n').filter(l => l.trim())
    const cutoff = Date.now() - days * 86400000
    
    const valid = lines.filter(line => {
      try {
        const record = JSON.parse(line)
        return record.timestamp >= cutoff
      } catch {
        return true // keep corrupt lines
      }
    })
    
    const purged = lines.length - valid.length
    fs.writeFileSync(filePath, valid.join('\n') + (valid.length ? '\n' : ''))
    
    if (purged > 0) {
      log.info('AccountStateRestorer', `Purged ${purged} expired records (>${days}d)`)
    }
    return purged
  } catch (e) {
    log.error('AccountStateRestorer', `Purge failed: ${e.message}`)
    return 0
  }
}

module.exports = {
  init,
  saveAccountRecord,
  getAccountRecord,
  deleteAccountRecord,
  listLoggedInAccounts,
  purgeExpired
}
