/**
 * 发布历史 — 持久化每次发布记录
 * 使用 JSONL 文件存储，无需额外数据库
 */
const fs = require('fs')
const path = require('path')
const { app } = require('electron')

const MAX_RECORDS = 500

function getHistoryPath () {
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
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8')
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

module.exports = { addRecord, listRecords, getRecord }