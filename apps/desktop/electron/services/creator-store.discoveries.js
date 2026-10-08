/**
 * creator-store.discoveries.js — 发现项、终态提交事务与配额账本
 *
 * ## 本文件承载的是评审反复强调的三件事
 *
 * 1. **终态必须同事务**：`markCollected` 与 outbox 入队原本是两次独立 exec，
 *    崩溃即产生「已 collected 但未入队」的漂移。`finalizeCollected` 把
 *    「置终态 → 配额复核 → 写 viral_library → 写 outbox」收进**一个**事务。
 * 2. **outbox 必须去重**：ack 丢失后重发若还能 changes=1，下游会拿到两条
 *    outbox 并重复发布。靠 `UNIQUE(ref_id, kind)` + `INSERT OR IGNORE` 压死。
 * 3. **配额必须在事务内复核**：`canSpend` 预检发生在采集前、`spend` 记账发生在
 *    采集后，两时刻分离；并发下两笔可以双双通过预检后实际超池。
 *    **事务内的复核才是权威**。
 *
 * ## 为什么 ledger 用 INSERT OR IGNORE 而不是裸 INSERT
 *
 * ledger 主键是 `(day, kind, request_sig)`。裸 INSERT 撞唯一约束会**抛异常**，
 * 而我们整段在一个事务里 —— 于是崩溃重发不是「去重」而是「整段回滚失败」。
 * 幂等的前提是 INSERT OR IGNORE，不是主键本身。
 */

'use strict'

const DEFAULT_LEASE_MS = 300000
const DEFAULT_COOLDOWN_MS = 600000
const PROBE_POOL = 1500
const COLLECT_POOL = 200

function createDiscoveryStore (db, ctx) {
  const { now, newId, exec, changesOf, txn } = ctx

  function all (sql, params) {
    const st = db.prepare(sql)
    return Array.isArray(params) ? st.all(...params) : st.all()
  }
  function one (sql, params) {
    const rows = all(sql, params)
    return Array.isArray(rows) ? (rows[0] || null) : null
  }
  function run (sql, params) { return exec(sql, params) }
  const rowsOf = (r) => (Array.isArray(r) ? r : [])

  /** 今天的 YYYY-MM-DD（本地时区；配额按自然日重置） */
  function today () {
    const d = new Date(now())
    const p = (n) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }

  // ── 发现项读取 ──────────────────────────────────────────────

  /**
   * 分页查询。角标口径由调用方保证：只统计 pending **且**所属 follow enabled=1，
   * 这里负责 state / creatorId 过滤与稳定排序（published_at 倒序 + id 兜底，
   * 否则同秒发布的两条顺序不稳定，翻页会漏/重）。
   */
  function listDiscoveries (o) {
    const where = []
    const params = []
    if (o && o.creatorId) { where.push('creator_id = ?'); params.push(o.creatorId) }
    if (o && o.state) { where.push('collect_state = ?'); params.push(o.state) }
    const limit = Number.isInteger(o && o.limit) && o.limit > 0 ? o.limit : 50
    const offset = Number.isInteger(o && o.offset) && o.offset >= 0 ? o.offset : 0
    const sql = `SELECT * FROM creator_discoveries
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY COALESCE(published_at, discovered_at) DESC, id ASC
        LIMIT ? OFFSET ?`
    return rowsOf(all(sql, [...params, limit, offset]))
  }

  function getDiscovery (discoveryId) {
    return one('SELECT * FROM creator_discoveries WHERE id = ?', [discoveryId])
  }

  /**
   * 跳过一条。仅 pending/failed 可跳；已是终态（collected/skipped）时
   * 返回 invalid_state 而不是静默成功 —— 静默会让 UI 显示「已跳过」而实际没变。
   */
  function skipDiscovery (discoveryId) {
    const r = run(`UPDATE creator_discoveries
        SET collect_state = 'skipped', updated_at = ?
      WHERE id = ? AND collect_state IN ('pending', 'failed')`,
    [now(), discoveryId])
    if (changesOf(r) > 0) return { ok: true }
    const exists = getDiscovery(discoveryId)
    return { ok: false, reason: exists ? 'invalid_state' : 'not_found' }
  }

  /**
   * 读当前 claim 代次。**返回标量 token**，不是对象 ——
   * `creator-runtime.js` 把它直接当 SQL 参数传给 markFailed/finalizeCollected，
   * 这里一旦改成对象就会在 bind 时炸掉（表现为 changes 恒 0，错误被
   * sqlite-wrapper 吞掉，症状离根因很远）。
   *
   * 三分支诊断（幂等重发 / 被他人接管 / 代次丢失）需要 claimed_by 与 state，
   * 那由 inspectClaim 单独提供，不在本方法的返回里混。
   */
  function getClaimToken (discoveryId) {
    const row = one(
      'SELECT claim_token FROM creator_discoveries WHERE id = ?',
      [discoveryId]
    )
    return row ? row.claim_token : null
  }

  /**
   * claim 现状快照，供「幂等重发 / 被他人接管 / 代次丢失」三分支判据使用。
   * 与 getClaimToken 刻意分开：前者是标量（SQL 参数），后者是诊断信息。
   * 一次读出三列——分两次读会出现读到不同代的撕裂。
   */
  function inspectClaim (discoveryId) {
    const row = one(
      'SELECT claim_token, claimed_by, collect_state FROM creator_discoveries WHERE id = ?',
      [discoveryId]
    )
    return row ? { token: row.claim_token, claimedBy: row.claimed_by, state: row.collect_state } : null
  }

  // ── claim 状态机（沿用既有 fencing 契约）──────────────────────

  function claimDiscovery (discoveryId, workerId, leaseMs = DEFAULT_LEASE_MS) {
    const r = run(`UPDATE creator_discoveries
        SET collect_state = 'collecting', claim_token = claim_token + 1,
            claimed_by = ?, lease_expires_at = ?, attempt_count = attempt_count + 1,
            updated_at = ?
      WHERE id = ?
        AND collect_state IN ('pending', 'failed')
        AND (claimed_by IS NULL OR lease_expires_at IS NULL OR lease_expires_at < ?)
        AND (retry_after_at IS NULL OR retry_after_at <= ?)`,
    [workerId, now() + leaseMs, now(), discoveryId, now(), now()])
    return changesOf(r) > 0
  }

  function markFailed (discoveryId, claimToken, message, o = {}) {
    const cooldown = typeof o.cooldownMs === 'number' ? o.cooldownMs : DEFAULT_COOLDOWN_MS
    const r = run(`UPDATE creator_discoveries
        SET collect_state = 'failed', last_error = ?, claimed_by = '',
            lease_expires_at = NULL, retry_after_at = ?, updated_at = ?
      WHERE id = ? AND claim_token = ? AND collect_state = 'collecting'`,
    [String(message || '').slice(0, 500), now() + cooldown, now(), discoveryId, claimToken])
    return changesOf(r) > 0
  }

  function renewLease (discoveryId, workerId, claimToken, leaseMs = DEFAULT_LEASE_MS) {
    const r = run(`UPDATE creator_discoveries SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND claim_token = ? AND claimed_by = ? AND collect_state = 'collecting'`,
    [now() + leaseMs, now(), discoveryId, claimToken, workerId])
    return changesOf(r) > 0
  }

  // ── 配额账本 ────────────────────────────────────────────────

  /**
   * 当日已用 units。**唯一基准**，预检与事务内复核都读它。
   * 按日按 kind 的全局池；`request_sig` 让同一次采集重发不重复计费。
   */
  function usedUnits (kind, day = today()) {
    const row = one(
      'SELECT COALESCE(SUM(units), 0) AS n FROM collection_quota_ledger WHERE day = ? AND kind = ?',
      [day, kind]
    )
    return row && Number.isFinite(Number(row.n)) ? Number(row.n) : 0
  }

  /** 只读预检：超池即拒，**不写 ledger**（拒绝必须零副作用） */
  function canSpend (kind, units, pool) {
    const limit = typeof pool === 'number' ? pool : (kind === 'probe' ? PROBE_POOL : COLLECT_POOL)
    const used = usedUnits(kind)
    return { ok: used + units <= limit, used, limit, projected: used + units }
  }

  /**
   * 账本写入。**必须 INSERT OR IGNORE**：主键撞了要当「已计过」处理，
   * 裸 INSERT 会抛异常并把外层事务整段带崩，崩溃重发就从去重变成失败。
   */
  function spend (kind, units, requestSig, day = today()) {
    run(`INSERT OR IGNORE INTO collection_quota_ledger
          (day, kind, units, request_sig, created_at)
        VALUES (?, ?, ?, ?, ?)`,
    [day, kind, units, requestSig, now()])
    return usedUnits(kind, day)
  }

  // ── 终态提交：唯一的 outbox 写入口 ────────────────────────────

  /**
   * 采集成功的唯一提交路径（PRD §3.1）。**不再有第二条 outbox 写路径** ——
   * 双写路径必然语义漂移，所以独立的 enqueueOutbox 不进对外门面。
   *
   * @returns {{outcome:'collected'|'superseded'|'claim_lost', outboxId?:string, quota?:number}}
   */
  function finalizeCollected (discoveryId, claimToken, body) {
    txn('BEGIN IMMEDIATE')
    try {
      // ① 置终态。代次不符 ⇒ 立即 ROLLBACK 返回，绝不继续写 outbox，
      //    否则会留下一条指向「并非本持有者采集成功」的孤儿行。
      const upd = run(`UPDATE creator_discoveries
          SET collect_state = 'collected', collected_at = ?, claimed_by = '',
              lease_expires_at = NULL, retry_after_at = NULL, last_error = '',
              content_quality = COALESCE(?, content_quality), updated_at = ?
        WHERE id = ? AND claim_token = ? AND collect_state = 'collecting'`,
      [now(), (body && body.contentQuality) || null, now(), discoveryId, claimToken])

      if (changesOf(upd) === 0) {
        txn('ROLLBACK')
        // 分流：claim_token 已推进且持有者不是空 ⇒ 被他人接管
        const cur = inspectClaim(discoveryId)
        if (cur && cur.state === 'collecting' && cur.claimedBy) {
          return { outcome: 'superseded', current: cur }
        }
        if (cur && cur.state === 'collected') return { outcome: 'collected', replay: true }
        return { outcome: 'claim_lost', current: cur }
      }

      const item = getDiscovery(discoveryId)
      if (!item) { txn('ROLLBACK'); return { outcome: 'claim_lost', reason: 'not_found' } }

      // ② 配额**事务内**复核（唯一权威）。预检只负责快失败。
      const units = 1
      const pre = canSpend('collect', units)
      if (!pre.ok) { txn('ROLLBACK'); return { outcome: 'quota_exceeded', quota: pre } }
      spend('collect', units, discoveryId)

      // ③ 采集结果落 viral_library。partial 唯一索引 (platform, external_id)
      //    且 WHERE external_id <> ''：软删只改 collect_state、不清 external_id，
      //    所以「重关注同一内容」仍命中忽略，不会产生第二份资产。
      let insertedAsset = false
      if (body && (body.content || body.transcriptSource)) {
        const ins = run(`INSERT OR IGNORE INTO viral_library
            (id, platform, title, url, content, external_id, creator_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [newId('vl'), item.platform || 'youtube', item.title || '', item.url || '',
          String(body.content || ''), item.external_id, item.creator_id, now(), now()])
        insertedAsset = changesOf(ins) > 0
      }

      // ④ 仅当资产真正新增才入 outbox。否则「二次采集被忽略」会与
      //    「outbox 照写」矛盾，导致分发侧对同一份内容输出两次。
      if (insertedAsset) {
        run(`INSERT OR IGNORE INTO collection_outbox
              (id, kind, ref_id, payload_json, state, retry_count, created_at, updated_at)
            VALUES (?, 'finalize_collected', ?, ?, 'pending', 0, ?, ?)`,
        [newId('ob'), discoveryId, JSON.stringify({ discoveryId, url: item.url || '' }), now(), now()])
      }

      txn('COMMIT')
      return { outcome: 'collected', insertedAsset }
    } catch (e) {
      try { txn('ROLLBACK') } catch (_) { /* 回滚失败保留原始错误 */ }
      throw e
    }
  }

  return {
    listDiscoveries,
    getDiscovery,
    skipDiscovery,
    getClaimToken,
    inspectClaim,
    claimDiscovery,
    markCollected: (id, token) => finalizeCollected(id, token, null),
    markFailed,
    renewLease,
    usedUnits,
    canSpend,
    spend,
    finalizeCollected,
  }
}

module.exports = { createDiscoveryStore, PROBE_POOL, COLLECT_POOL }
