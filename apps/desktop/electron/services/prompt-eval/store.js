// @ts-check
/**
 * PromptEval 持久化（store）
 * 结构：<userData>/prompt-eval/{index.json, records/<id>.json, reports/<id>.md}
 * 原子写：tmp + rename；Windows 瞬时锁错误（EPERM/EACCES/EBUSY）有界重试 ≤3 次。
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const RETRYABLE_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
const MAX_RETRIES = 3
const RETRY_DELAYS = [50, 100, 200]

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createPromptEvalStore ({ userDataDir, log, fsImpl }) {
  const f = { ...fs, ...(fsImpl || {}) }
  const rootDir = path.join(userDataDir, 'prompt-eval')
  const recordsDir = path.join(rootDir, 'records')
  const reportsDir = path.join(rootDir, 'reports')
  const indexFile = path.join(rootDir, 'index.json')
  const logger = log || { info: () => {}, warn: () => {}, error: () => {} }

  function ensureDirs () {
    f.mkdirSync(recordsDir, { recursive: true })
    f.mkdirSync(reportsDir, { recursive: true })
  }

  function writeFileAtomic (file, data) {
    ensureDirs()
    const tmp = file + '.tmp-' + process.pid + '-' + crypto.randomBytes(4).toString('hex')
    try {
      f.writeFileSync(tmp, data, 'utf8')
    } catch (writeError) {
      try { f.unlinkSync(tmp) } catch (_) { /* 清理失败忽略 */ }
      throw writeError
    }
    let lastError
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        f.renameSync(tmp, file)
        return
      } catch (e) {
        lastError = e
        if (!RETRYABLE_CODES.has(e && e.code)) break
        if (attempt < MAX_RETRIES) sleepSync(RETRY_DELAYS[attempt] || 200)
      }
    }
    try { f.unlinkSync(tmp) } catch (_) { /* 清理临时文件失败忽略 */ }
    throw lastError || new Error('atomic write failed')
  }

  // 同步 sleep（测试友好，避免 store API 变 async）
  function sleepSync (ms) {
    const end = Date.now() + ms
    while (Date.now() < end) { /* busy-wait 仅用于 Windows 锁退避（≤200ms） */ }
  }

  function idFor (record) {
    return record && typeof record.id === 'string' && record.id ? record.id
      : 'eval-' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14) + '-' + crypto.randomBytes(4).toString('hex')
  }

  function readIndex () {
    try {
      if (!f.existsSync(indexFile)) return { records: [] }
      const parsed = JSON.parse(f.readFileSync(indexFile, 'utf8'))
      if (parsed && Array.isArray(parsed.records)) return parsed
      return { records: [] }
    } catch (_) {
      return { records: [] }
    }
  }

  function writeIndex (index) {
    writeFileAtomic(indexFile, JSON.stringify(index, null, 2))
  }

  function save ({ record, markdown }) {
    const id = idFor(record)
    ensureDirs()
    writeFileAtomic(path.join(recordsDir, id + '.json'), JSON.stringify(record, null, 2))
    writeFileAtomic(path.join(reportsDir, id + '.md'), markdown || '# ' + id + '\n')
    const index = readIndex()
    const idx = { id, mediaType: record.mediaType || 'image', overallScore: record.overallScore, grade: record.grade || '', evaluatedAt: record.evaluatedAt || null, imageCount: record.imageCount || 0 }
    const existing = index.records.findIndex(r => r.id === id)
    if (existing >= 0) index.records[existing] = idx
    else index.records.push(idx)
    writeIndex(index)
    return { id }
  }

  function listRecords () {
    let index = readIndex()
    // 索引自愈：扫描 records/，补回缺失记录
    let changed = false
    if (f.existsSync(recordsDir)) {
      const onDisk = f.readdirSync(recordsDir).filter(n => n.endsWith('.json')).map(n => n.slice(0, -5))
      const known = new Set(index.records.map(r => r.id))
      for (const id of onDisk) {
        if (!known.has(id)) {
          const rec = getRecord(id)
          if (rec) {
            index.records.push({ id, mediaType: rec.mediaType || 'image', overallScore: rec.overallScore, grade: rec.grade || '', evaluatedAt: rec.evaluatedAt || null, imageCount: rec.imageCount || 0 })
            changed = true
          }
        }
      }
      // 移除磁盘上已不存在的索引项
      const valid = new Set(onDisk)
      const filtered = index.records.filter(r => valid.has(r.id))
      if (filtered.length !== index.records.length) {
        index.records = filtered
        changed = true
      }
    }
    if (changed) writeIndex(index)
    return index.records.sort((a, b) => String(b.evaluatedAt || '').localeCompare(String(a.evaluatedAt || '')))
  }

  const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,100}$/

  function assertSafeId (id) {
    const s = String(id)
    if (!SAFE_ID_RE.test(s)) {
      const error = new Error('EVAL_RECORD_NOT_FOUND: 非法记录 ID: ' + s)
      error.code = 'EVAL_RECORD_NOT_FOUND'
      throw error
    }
    return s
  }

  function getRecord (id) {
    assertSafeId(id)
    const file = path.join(recordsDir, id + '.json')
    if (!f.existsSync(file)) return null
    try {
      return JSON.parse(f.readFileSync(file, 'utf8'))
    } catch (_) {
      return null
    }
  }

  function getReportPath (id) {
    return path.join(reportsDir, String(id) + '.md')
  }

  function deleteRecord (id) {
    const safeId = assertSafeId(id)
    const file = path.join(recordsDir, safeId + '.json')
    const report = path.join(reportsDir, safeId + '.md')
    if (!f.existsSync(file)) {
      const error = new Error('EVAL_RECORD_NOT_FOUND: 评估记录不存在: ' + id)
      error.code = 'EVAL_RECORD_NOT_FOUND'
      throw error
    }
    try {
      f.unlinkSync(file)
      if (f.existsSync(report)) f.unlinkSync(report)
    } catch (e) {
      const error = new Error('EVAL_STORE_WRITE_FAILED: 删除评估记录失败: ' + (e && e.message ? e.message : String(e)))
      error.code = 'EVAL_STORE_WRITE_FAILED'
      throw error
    }
    const index = readIndex()
    index.records = index.records.filter(r => r.id !== id)
    writeIndex(index)
    return true
  }

  return {
    rootDir,
    recordsDir,
    reportsDir,
    indexFile,
    save,
    listRecords,
    getRecord,
    getReportPath,
    deleteRecord,
    writeFileAtomic,
  }
}

module.exports = { createPromptEvalStore }


