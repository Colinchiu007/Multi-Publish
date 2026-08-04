// @ts-check
/**
 * 发布历史 — 持久化每次发布记录
 * 使用 JSONL 文件存储，无需额外数据库
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')
const { LEGACY_OWNER_SUBJECT } = require('./store-schema')

const MAX_RECORDS = 500
const TRANSIENT_WINDOWS_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY'])
const ATOMIC_RENAME_RETRY_DELAYS_MS = [20, 40, 80, 160, 320, 640]
const ATOMIC_RENAME_WAIT_BUFFER = new Int32Array(new SharedArrayBuffer(4))

function atomicRenameSync (sourcePath, targetPath) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(sourcePath, targetPath)
      return
    } catch (error) {
      const delayMs = ATOMIC_RENAME_RETRY_DELAYS_MS[attempt]
      const isTransientWindowsLock = process.platform === 'win32' &&
        TRANSIENT_WINDOWS_RENAME_ERRORS.has(error?.code)
      if (!isTransientWindowsLock || delayMs === undefined) throw error
      Atomics.wait(ATOMIC_RENAME_WAIT_BUFFER, 0, 0, delayMs)
    }
  }
}

function normalizeOwnerSubject (ownerSubject) {
  if (typeof ownerSubject !== 'string' || !ownerSubject.trim()) {
    throw new Error('发布历史缺少用户标识')
  }
  return ownerSubject.trim()
}

function resolveOwnerSubject (ownerSubject) {
  if (ownerSubject === undefined) return undefined
  if (ownerSubject === null) return null
  return normalizeOwnerSubject(ownerSubject)
}

function matchesOwner (record, ownerSubject) {
  if (ownerSubject === undefined) {
    // SQLite 迁移会把无身份服务的历史显式标记为 legacy，旧 JSONL 则没有该字段。
    return record.owner_subject === undefined || record.owner_subject === null ||
      record.owner_subject === LEGACY_OWNER_SUBJECT
  }
  return record.owner_subject === ownerSubject
}

function readRecords (ownerSubject) {
  const owner = resolveOwnerSubject(ownerSubject)
  if (owner === null) return []
  const filePath = getHistoryPath()
  if (!fs.existsSync(filePath)) return []

  return fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
    .map(line => {
      try { return JSON.parse(line) } catch { return null }
    })
    .filter(record => record && matchesOwner(record, owner))
}

function getHistoryPath () {
  // 测试时可通过环境变量注入路径，否则使用 Electron 的 userData
  if (process.env.PH_TEST_DATA_DIR) {
    return path.join(process.env.PH_TEST_DATA_DIR, 'publish-history.jsonl')
  }
  const { app } = require('electron')
  const userDataDir = app.getPath('userData')
  return path.join(userDataDir, 'publish-history.jsonl')
}

/**
 * 添加一条发布记录
 */
function addRecord (record, ownerSubject) {
  const owner = resolveOwnerSubject(ownerSubject)
  if (owner === null) return null
  const filePath = getHistoryPath()
  const { owner_subject: _untrustedOwner, ...safeRecord } = record || {}
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...safeRecord,
    ...(owner === undefined ? {} : { owner_subject: owner }),
    timestamp: new Date().toISOString()
  }
  // R14 错误处理：appendFileSync 可能因磁盘满/权限拒绝抛错，与 scheduler.js 一致加 try/catch
  try {
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
  } catch (e) {
    // 记录失败不阻塞发布主流程，仅日志告警
    if (typeof log !== 'undefined' && log.warn) log.warn('PublishHistory', 'appendRecord failed: ' + e.message)
    else console.warn('[PublishHistory] appendRecord failed: ' + e.message)
  }
  return entry
}

/**
 * 查询发布历史
 * @param {object} opts - { platform?, limit?, offset? }
 */
function listRecords (opts = {}, ownerSubject) {
  const { platform, limit = 50, offset = 0 } = opts
  let records = readRecords(ownerSubject)

  if (platform) records = records.filter(r => r.platform === platform)

  const total = records.length
  records = records.reverse().slice(offset, offset + limit)
  return { total, records }
}

/**
 * 获取单条记录
 */
function getRecord (id, ownerSubject) {
  const { records } = listRecords({ limit: MAX_RECORDS }, ownerSubject)
  return records.find(r => r.id === id) || null
}

/**
 * 删除指定用户的发布历史记录。
 * @param {string|string[]} ids
 * @param {string|undefined} ownerSubject
 * @returns {{ deleted: number }}
 */
function deleteRecords (ids, ownerSubject) {
  const owner = resolveOwnerSubject(ownerSubject)
  if (owner === null) return { deleted: 0 }

  const targetIds = new Set((Array.isArray(ids) ? ids : [ids])
    .filter(id => typeof id === 'string')
    .map(id => id.trim())
    .filter(Boolean))
  if (targetIds.size === 0) return { deleted: 0 }

  const filePath = getHistoryPath()
  if (!fs.existsSync(filePath)) return { deleted: 0 }

  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  let deleted = 0
  const kept = []
  for (const line of lines) {
    if (!line.trim()) continue
    let record = null
    try { record = JSON.parse(line) } catch { /* 保留无法解析的历史行 */ }
    if (record && targetIds.has(String(record.id || '')) && matchesOwner(record, owner)) {
      deleted += 1
      continue
    }
    kept.push(line)
  }

  if (deleted === 0) return { deleted: 0 }

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
  try {
    fs.writeFileSync(tmpPath, kept.length ? `${kept.join('\n')}\n` : '', 'utf-8')
    atomicRenameSync(tmpPath, filePath)
  } finally {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath) } catch (_) { /* 保留主错误 */ }
    }
  }
  return { deleted }
}

/**
 * 获取发布统计
 * @returns {object} { total, success, failed, perPlatform, daily }
 */
function getStats (ownerSubject) {
  const records = readRecords(ownerSubject)

  const total = records.length
  const success = records.filter(r => r.success !== false).length
  const failed = total - success

  const perPlatform = {}
  for (const r of records) {
    const p = r.platform || 'unknown'
    if (!perPlatform[p]) perPlatform[p] = { total: 0, success: 0, failed: 0 }
    perPlatform[p].total++
    if (r.success !== false) perPlatform[p].success++
    else perPlatform[p].failed++
  }

  const dailyMap = {}
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = { date: key, total: 0, success: 0 }
  }
  for (const r of records) {
    if (!r.timestamp) continue
    const key = r.timestamp.slice(0, 10)
    if (dailyMap[key]) {
      dailyMap[key].total++
      if (r.success !== false) dailyMap[key].success++
    }
  }

  return {
    total,
    success,
    failed,
    successRate: total > 0 ? Math.round(success / total * 100) : 0,
    perPlatform,
    daily: Object.values(dailyMap)
  }
}

module.exports = { addRecord, listRecords, getRecord, deleteRecords, getStats }
