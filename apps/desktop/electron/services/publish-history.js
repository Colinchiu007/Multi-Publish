// @ts-check
/**
 * 发布历史 — 持久化每次发布记录
 * 使用 JSONL 文件存储，无需额外数据库
 */
const fs = require('fs')
const path = require('path')
const log = require('./logger')
const { LEGACY_OWNER_SUBJECT } = require('./store-schema')
const { AUDIT_PATCH_KEYS, normalizeAuditStatus } = require('@multi-publish/shared-utils/src/publish-audit-status')

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
 * 审核状态回写：用监控回调的审核增量更新**原记录**（就地更新，不新增行）。
 *
 * P0-1 背景：此前监控回调走 addRecord 追加**第二条**记录，导致同一次发布在历史里
 * 出现两行（一行 success、一行监控态），且原记录的 success 与审核结论无法关联。
 * 本函数按 id + owner 定位原记录并只合并白名单键（见 AUDIT_PATCH_KEYS）。
 *
 * ⛔ 单向证据规则：`auditStatus` 归一失败（无定论/非法值）直接不改任何字节——
 * 「没拿到新证据」不是反证，不得把既有审核结论抹掉（与 login-state 同族）。
 *
 * @param {string} id 目标记录 id
 * @param {object} patch 审核增量（只取白名单键）
 * @param {string|undefined} ownerSubject
 * @returns {{ updated: boolean, record: object|null }}
 */
function updateRecordAudit (id, patch, ownerSubject) {
  const owner = resolveOwnerSubject(ownerSubject)
  if (owner === null) return { updated: false, record: null }
  const targetId = typeof id === 'string' ? id.trim() : ''
  if (!targetId) return { updated: false, record: null }

  const source = patch && typeof patch === 'object' ? patch : {}
  const auditStatus = normalizeAuditStatus(source.auditStatus)
  if (auditStatus === null) return { updated: false, record: null }

  const filePath = getHistoryPath()
  if (!fs.existsSync(filePath)) return { updated: false, record: null }

  const lines = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
  let updatedRecord = null
  const next = []
  for (const line of lines) {
    if (!line.trim()) continue
    let record = null
    try { record = JSON.parse(line) } catch { /* 保留无法解析的历史行 */ }
    if (
      record && updatedRecord === null &&
      String(record.id || '') === targetId && matchesOwner(record, owner)
    ) {
      updatedRecord = { ...record }
      for (const key of AUDIT_PATCH_KEYS) {
        if (source[key] === undefined) continue
        if (key === 'auditStatus') { updatedRecord.auditStatus = auditStatus; continue }
        updatedRecord[key] = typeof source[key] === 'string' ? source[key] : String(source[key])
      }
      // auditStatus 已归一；确保它一定落库（即使调用方漏传白名单外形态）
      updatedRecord.auditStatus = auditStatus
      next.push(JSON.stringify(updatedRecord))
      continue
    }
    next.push(line)
  }

  if (updatedRecord === null) return { updated: false, record: null }

  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`
  try {
    fs.writeFileSync(tmpPath, next.length ? `${next.join('\n')}\n` : '', 'utf-8')
    atomicRenameSync(tmpPath, filePath)
  } finally {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath) } catch (_) { /* 保留主错误 */ }
    }
  }
  return { updated: true, record: updatedRecord }
}

/**
 * 获取发布统计
 * @returns {object} { total, success, failed, perPlatform, daily }
 */
/**
 * 发布记录的终态分类 —— 统计口径的唯一实现。
 *
 * 为什么不能沿用 `r.success !== false`：两个生产写入点（bootstrap/phase4-events.js 的
 * task:success / task:failed）只写 `status`，**从不写顶层 `success`**，于是「字段不等于 false」
 * 对每一条都成立 ⇒ 失败被算成成功。判据必须读真正被写的那个字段。
 *
 * 第三类必须存在而不是并进任意一侧：publish-monitor 的回写路径会产出 skipped / timeout
 * 形态的记录（实测本机活库 165 条里有 skipped=13、timeout=1），「本轮没有定论」既不是
 * 成功也不是失败，硬塞进任一侧都是在给用户造假数。
 *
 * @param {object} record
 * @returns {'success'|'failed'|'unclassified'}
 */
function classifyPublishStatus (record) {
  const status = record && record.status
  if (status === 'success') return 'success'
  if (status === 'failed') return 'failed'
  return 'unclassified'
}

function getStats (ownerSubject) {
  const records = readRecords(ownerSubject)

  const total = records.length
  // 三档统计共用同一次分类结果：判据若在顶层/分平台/分日各写一遍，
  // 只修顶层就等于没修（本次实测该表达式在原实现里出现三次）。
  const tallyOf = () => ({ total: 0, success: 0, failed: 0, unclassified: 0 })
  const bump = (tally, kind) => { tally[kind] += 1 }
  const toCounts = tally => ({ total: tally.total, success: tally.success, failed: tally.failed, unclassified: tally.unclassified })

  const overall = tallyOf()
  overall.total = total

  const perPlatform = {}
  const dailyMap = {}
  const now = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    dailyMap[key] = Object.assign({ date: key }, tallyOf())
  }

  for (const r of records) {
    const kind = classifyPublishStatus(r)
    bump(overall, kind)

    const p = r.platform || 'unknown'
    if (!perPlatform[p]) perPlatform[p] = tallyOf()
    perPlatform[p].total += 1
    bump(perPlatform[p], kind)

    if (r.timestamp) {
      const day = dailyMap[r.timestamp.slice(0, 10)]
      if (day) {
        day.total += 1
        bump(day, kind)
      }
    }
  }

  // 成功率的分母只有「有定论」的记录：把无定论并进 total 会让成功率随监控回写量漂移，
  // 而有定论为零时返回 0（不是 100）——没有证据就不能报出一个看起来确定的数字。
  const concluded = overall.success + overall.failed

  return {
    total,
    success: overall.success,
    failed: overall.failed,
    unclassified: overall.unclassified,
    successRate: concluded > 0 ? Math.round(overall.success / concluded * 100) : 0,
    perPlatform: Object.fromEntries(Object.entries(perPlatform).map(([k, v]) => [k, toCounts(v)])),
    daily: Object.values(dailyMap).map(v => ({
      date: v.date, total: v.total, success: v.success, failed: v.failed, unclassified: v.unclassified,
    }))
  }
}

module.exports = { addRecord, listRecords, getRecord, deleteRecords, getStats, updateRecordAudit, classifyPublishStatus }
