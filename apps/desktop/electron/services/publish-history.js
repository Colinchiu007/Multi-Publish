// @ts-check
/**
 * 发布历史 — 持久化每次发布记录
 * 使用 JSONL 文件存储，无需额外数据库
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')

const MAX_RECORDS = 500

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
function addRecord (record) {
  const filePath = getHistoryPath()
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...record,
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
function listRecords (opts = {}) {
  const { platform, limit = 50, offset = 0 } = opts
  const filePath = getHistoryPath()
  if (!fs.existsSync(filePath)) return { total: 0, records: [] }

  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
  let records = lines.map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)

  if (platform) records = records.filter(r => r.platform === platform)

  const total = records.length
  records = records.reverse().slice(offset, offset + limit)
  return { total, records }
}

/**
 * 获取单条记录
 */
function getRecord (id) {
  const { records } = listRecords({ limit: MAX_RECORDS })
  return records.find(r => r.id === id) || null
}

/**
 * 获取发布统计
 * @returns {object} { total, success, failed, perPlatform, daily }
 */
function getStats () {
  const filePath = getHistoryPath()
  if (!fs.existsSync(filePath)) {
    return { total: 0, success: 0, failed: 0, perPlatform: {}, daily: [] }
  }

  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
  const records = lines.map(l => {
    try { return JSON.parse(l) } catch { return null }
  }).filter(Boolean)

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

module.exports = { addRecord, listRecords, getRecord, getStats }