/**
 * creator-store.js — 博主采集数据访问层
 *
 * 只封装**并发安全与幂等**相关的写操作；读路径保持薄封装。
 * 之所以把这些集中在一处：它们各自都是「写错不报错、只在下个请求才显形」
 * 的操作，散落到各处必然出现某条路径忘了带 fencing 条件。
 *
 * ## fencing 为什么必需
 *
 * claim + lease 只保证「同一时刻只有一个活跃持有者」。但租约过期后新 worker
 * 接管并推进了 claim_token，此时**旧 worker 仍在跑**，它完成时若无条件 UPDATE，
 * 会把新持有者的结果覆盖掉（lost update），且两人都可能往 viral_library 插入。
 * 因此所有行内变更与副作用提交都必须带 `AND claim_token = ?`，
 * changes=0 即表示「代次已过期，放弃提交」。
 */

'use strict'

const crypto = require('crypto')

const DEFAULT_LEASE_MS = 300000        // 5 分钟
const DEFAULT_COOLDOWN_MS = 600000     // 10 分钟

function nowMs () { return Date.now() }

function newId (prefix) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`
}

/**
 * @param {object} db    sql.js Database 句柄
 * @param {{now?: Function, uuid?: Function}} [opts]
 */
function createCreatorStore (db, opts = {}) {
  const now = typeof opts.now === 'function' ? opts.now : nowMs
  const exec = (sql, params) => {
    const st = db.prepare(sql)
    if (Array.isArray(params) && typeof st.run === 'function') return st.run(...params)
    return st.run()
  }

  /** 抢占采集权。互斥靠单条 UPDATE 完成，绝不先查后改。 */
  function claimDiscovery (discoveryId, workerId, leaseMs = DEFAULT_LEASE_MS) {
    const sql = `UPDATE creator_discoveries
        SET collect_state   = 'collecting',
            claim_token     = claim_token + 1,
            claimed_by      = ?,
            lease_expires_at= ?,
            attempt_count   = attempt_count + 1,
            updated_at      = ?
      WHERE id = ?
        AND collect_state IN ('pending', 'failed')
        AND (claimed_by IS NULL OR lease_expires_at IS NULL OR lease_expires_at < ?)
        AND (retry_after_at IS NULL OR retry_after_at <= ?)`
    const r = exec(sql, [
      workerId, now() + leaseMs, now(), discoveryId, now(), now(),
    ])
    return changesOf(r) > 0
  }

  /** 提交采集成功。**必须**匹配 claim_token，否则拒绝覆盖新持有者。 */
  function markCollected (discoveryId, claimToken, extra = {}) {
    const sql = `UPDATE creator_discoveries
        SET collect_state  = 'collected',
            collected_at   = ?,
            claimed_by     = '',
            lease_expires_at = NULL,
            retry_after_at = NULL,
            last_error     = '',
            updated_at     = ?
      WHERE id = ? AND claim_token = ? AND collect_state = 'collecting'`
    const r = exec(sql, [now(), now(), discoveryId, claimToken])
    void extra
    return changesOf(r) > 0
  }

  /**
   * 提交采集失败。同样必须匹配 claim_token。
   * 失败后写 retry_after_at 形成冷却，避免坏内容被自动流程无限重试。
   */
  function markFailed (discoveryId, claimToken, message, o = {}) {
    const cooldown = typeof o.cooldownMs === 'number' ? o.cooldownMs : DEFAULT_COOLDOWN_MS
    const sql = `UPDATE creator_discoveries
        SET collect_state   = 'failed',
            last_error      = ?,
            claimed_by      = '',
            lease_expires_at= NULL,
            retry_after_at  = ?,
            updated_at      = ?
      WHERE id = ? AND claim_token = ? AND collect_state = 'collecting'`
    const r = exec(sql, [String(message || '').slice(0, 500), now() + cooldown, now(), discoveryId, claimToken])
    return changesOf(r) > 0
  }

  /**
   * 续租。**必须**匹配 claim_token：否则旧 worker 能给新持有者的租约续命，
   * 让真正在干活的新 worker 反而被判定为租约过期。
   */
  function renewLease (discoveryId, workerId, claimToken, leaseMs = DEFAULT_LEASE_MS) {
    const sql = `UPDATE creator_discoveries
        SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND claim_token = ? AND claimed_by = ? AND collect_state = 'collecting'`
    const r = exec(sql, [now() + leaseMs, now(), discoveryId, claimToken, workerId])
    return changesOf(r) > 0
  }

  /**
   * 批量写入发现项。**必须**依赖唯一索引 (platform, external_id) 的
   * INSERT OR IGNORE，而不是「先查后插」——后者在并发探测下必然插入重复行。
   * @returns {number} 本次真正新增的行数（changes 之和）
   */
  function upsertDiscoveries (items) {
    const list = Array.isArray(items) ? items : []
    let inserted = 0
    for (const it of list) {
      const sql = `INSERT OR IGNORE INTO creator_discoveries
          (id, creator_id, platform, external_id, title, url, thumbnail_url,
           published_at, discovered_at, collect_state, transcript_source,
           content_quality, summary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
      const t = now()
      const r = exec(sql, [
        it.id || newId('cd'), it.creatorId, it.platform, it.externalId,
        it.title || '', it.url, it.thumbnailUrl || '', it.publishedAt || null, t,
        it.transcriptSource || '', it.contentQuality || 'unknown',
        it.summary || '', t, t,
      ])
      inserted += changesOf(r)
    }
    return inserted
  }

  /** 待采集计数（角标）。空结果归一为 0，避免 UI 收到 undefined。 */
  function countPending (creatorId) {
    const sql = `SELECT COUNT(*) AS n FROM creator_discoveries
      WHERE collect_state = 'pending'${creatorId ? ' AND creator_id = ?' : ''}`
    const st = db.prepare(sql)
    const rows = creatorId ? st.all(creatorId) : st.all()
    const row = Array.isArray(rows) ? rows[0] : null
    return row && Number.isFinite(Number(row.n)) ? Number(row.n) : 0
  }

  return {
    claimDiscovery,
    markCollected,
    markFailed,
    renewLease,
    upsertDiscoveries,
    countPending,
    newId,
  }
}

/** sql.js 的 run() 返回 { changes }；部分替身直接返回数字。归一处理。 */
function changesOf (r) {
  if (r == null) return 0
  if (typeof r === 'number') return r
  if (typeof r.changes === 'number') return r.changes
  return 0
}

module.exports = { createCreatorStore, DEFAULT_LEASE_MS, DEFAULT_COOLDOWN_MS }