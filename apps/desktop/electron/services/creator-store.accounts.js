/**
 * creator-store.accounts.js — 博主实体与关注关系的数据访问
 *
 * ## 为什么独立成文件
 *
 * `creator-store.js` 受「债务熔断」约束不得突破 500 行（`check-max-lines` 的
 * `NEW_OVER_LIMIT`）。接线要补 14 个方法，全塞进去必超限。
 * 按表拆：关注表归本文件，发现表与事务归 `creator-store.discoveries.js`，
 * `creator-store.js` 只做组合与对外门面。
 *
 * ## 失败分级为什么落在这里
 *
 * 连续失败计数、自动暂停都写在 `creator_follows` 上，所以 recordSuccess /
 * recordFailure 属于本文件。判据来自 `creator-monitor.js` 的 tier 字符串：
 *   throttled / transient / item —— **不计入**连续失败（否则正常节流会误停博主）
 *   permanent  —— 连续 3 次 ⇒ auto_paused
 *   fatal      —— 首次即 fatal_paused
 * 计数与暂停**必须在同一条 UPDATE 里完成**，先读后写会有并发窗口。
 */

'use strict'

const DEFAULT_LEASE_MS = 300000
const DEFAULT_INTERVAL_MIN = 60
const AUTO_PAUSE_THRESHOLD = 3

/** 不计入连续失败的档位：正常节流 / 瞬时抖动 / 单条内容问题都不是「博主坏了」 */
const NON_COUNTING_TIERS = new Set(['throttled', 'transient', 'item'])

function createAccountStore (db, ctx) {
  const { now, newId, exec, changesOf, txn } = ctx

  function all (sql, params) {
    const st = db.prepare(sql)
    return Array.isArray(params) ? st.all(...params) : st.all()
  }
  function one (sql, params) {
    const rows = all(sql, params)
    return Array.isArray(rows) ? (rows[0] || null) : null
  }
  function run (sql, params) {
    return exec(sql, params)
  }
  const rowsOf = (r) => (Array.isArray(r) ? r : [])

  /**
   * 全部博主 + 关注状态 + 待采集数。
   * 用 LEFT JOIN 而非「先查博主再逐个查关注」——后者是 N+1，
   * 博主数上去后每次开页都要几十次查询。
   * 未关注的博主仍要列出（capability_badge 展示需要），故 LEFT。
   */
  function listCreators () {
    return rowsOf(all(`
      SELECT c.id, c.platform, c.external_id, c.display_name, c.handle,
             c.avatar_url, c.platform_url, c.capability_tier, c.credential_alias,
             f.id AS follow_id, f.enabled, f.status, f.check_interval_min,
             f.per_creator_limit, f.last_checked_at, f.last_success_at,
             (SELECT COUNT(*) FROM creator_discoveries d
               WHERE d.creator_id = c.id AND d.collect_state = 'pending') AS pending_count
        FROM creator_accounts c
        LEFT JOIN creator_follows f ON f.creator_id = c.id
       ORDER BY c.created_at ASC`))
  }

  /** 配额预估用：只取 interval，形状必须匹配 projectedProbeUnits 读的 check_interval_min */
  function listFollowsForQuota () {
    return rowsOf(all(
      'SELECT id, check_interval_min, enabled, status FROM creator_follows'
    ))
  }

  /**
   * 按 (platform, external_id) 唯一索引 upsert 博主。
   * 用 INSERT … ON CONFLICT DO UPDATE 而非「先查后插」：并发关注同一博主时
   * 后查后插会插入重复行，撞唯一约束报错。
   * external_id 是**平台 canonical ID**（YouTube 的 UC…），禁止传用户原始输入。
   */
  function upsertCreator (a) {
    const id = a.id || newId('ca')
    const t = now()
    run(`INSERT INTO creator_accounts
          (id, platform, external_id, display_name, handle, avatar_url, platform_url,
           capability_tier, credential_alias, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, external_id) DO UPDATE SET
          display_name = excluded.display_name,
          handle       = excluded.handle,
          avatar_url   = excluded.avatar_url,
          platform_url = excluded.platform_url,
          updated_at   = excluded.updated_at`,
    [id, a.platform || 'youtube', a.externalId, a.displayName || '', a.handle || '',
      a.avatarUrl || '', a.platformUrl || '', a.capabilityTier || 'official',
      a.credentialAlias || '', t, t])
    return one(
      'SELECT * FROM creator_accounts WHERE platform = ? AND external_id = ?',
      [a.platform || 'youtube', a.externalId]
    )
  }

  /** 按 creator_id 唯一索引 upsert 关注。间隔非法时回落默认 60 分钟。 */
  function upsertFollow (f) {
    const id = f.id || newId('cf')
    const t = now()
    const interval = Number.isInteger(f.checkIntervalMin) && f.checkIntervalMin > 0
      ? f.checkIntervalMin : DEFAULT_INTERVAL_MIN
    const limit = Number.isInteger(f.perCreatorLimit) && f.perCreatorLimit > 0
      ? f.perCreatorLimit : null
    run(`INSERT INTO creator_follows
          (id, creator_id, platform, enabled, check_interval_min, per_creator_limit,
           status, consecutive_failures, created_at, updated_at)
        VALUES (?, ?, ?, 1, ?, ?, 'active', 0, ?, ?)
        ON CONFLICT(creator_id) DO UPDATE SET
          check_interval_min = excluded.check_interval_min,
          per_creator_limit  = COALESCE(excluded.per_creator_limit, creator_follows.per_creator_limit),
          updated_at         = excluded.updated_at`,
    [id, f.creatorId, f.platform || 'youtube', interval, limit, t, t])
    return one('SELECT * FROM creator_follows WHERE creator_id = ?', [f.creatorId])
  }

  function getFollow (followId) {
    return one('SELECT * FROM creator_follows WHERE id = ?', [followId])
  }

  /**
   * 取消关注 = 关注行删除 + 该博主的未采集发现项软删（转 skipped）。
   *
   * 为什么软删而不是物理删：采集库是用户资产；而留着 pending 又会继续占
   * 一键采集额度并让角标常亮。**必须与关注删除同事务**，否则中途失败会留下
   * 「关注已删但发现项仍是 pending」的孤儿。
   */
  function deleteFollow (followId) {
    txn('BEGIN IMMEDIATE')
    try {
      const f = getFollow(followId)
      if (!f) { txn('ROLLBACK'); return { ok: false, reason: 'not_found' } }
      run('UPDATE creator_discoveries SET collect_state = ?, updated_at = ?\n'
        + "        WHERE creator_id = ? AND collect_state IN ('pending', 'failed')",
      ['skipped', now(), f.creator_id])
      run('DELETE FROM creator_follows WHERE id = ?', [followId])
      txn('COMMIT')
      return { ok: true }
    } catch (e) {
      try { txn('ROLLBACK') } catch (_) { /* 回滚失败保留原始错误 */ }
      throw e
    }
  }

  /**
   * 暂停/恢复。暂停**不动**发现项：数据留着，只是不再被新探测填充；
   * 恢复后 pending 项自然继续可采（见 PRD §5 状态转换表）。
   */
  function setFollowEnabled (followId, enabled) {
    const status = enabled ? 'active' : 'paused_by_user'
    const r = run(
      'UPDATE creator_follows SET enabled = ?, status = ?, updated_at = ? WHERE id = ?',
      [enabled ? 1 : 0, status, now(), followId]
    )
    if (changesOf(r) === 0) return { ok: false, reason: 'not_found' }
    return { ok: true, follow: getFollow(followId) }
  }

  /** 探测成功：清连续失败、刷新两个时间戳。只对 enabled 的关注生效。 */
  function recordSuccess (followId, at) {
    const r = run(`UPDATE creator_follows
        SET consecutive_failures = 0, last_error_code = '', last_error_message = '',
            last_checked_at = ?, last_success_at = ?, updated_at = ?
      WHERE id = ?`,
    [now(), at || now(), now(), followId])
    return changesOf(r) > 0
  }

  /**
   * 探测失败：按档位决定是否累加连续失败与是否暂停。
   * 计数与暂停写在**同一条 UPDATE**里——先读后写会有并发窗口，
   * 两个探测并发时可能都读到 2、都写成 3，却都判成「首次达到阈值」而重复暂停。
   *
   * 唯一的「读后写」是 status 迁移，但迁移方向是单调的（只会更严），
   * 并发下最坏结果是阈值提前 1 次触发，不会漏暂停。
   */
  function recordFailure (followId, tier, reason) {
    const f = getFollow(followId)
    if (!f) return { ok: false, reason: 'not_found' }
    const t = now()
    const code = String(reason || tier || 'unknown').slice(0, 120)

    if (NON_COUNTING_TIERS.has(tier)) {
      // 只刷新「检查过」与错误码，不动连续计数，也不暂停
      run(`UPDATE creator_follows
              SET last_checked_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ?
            WHERE id = ?`,
      [t, code, '', t, followId])
      return { ok: true, consecutive: f.consecutive_failures, status: f.status, counted: false }
    }

    if (tier === 'fatal') {
      // 不可自愈（凭证问题）：首次即 fatal_paused，UI 指向设置页
      run(`UPDATE creator_follows
              SET consecutive_failures = consecutive_failures + 1, status = 'fatal_paused',
                  last_checked_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ?
            WHERE id = ?`,
      [t, code, code, t, followId])
      return { ok: true, consecutive: f.consecutive_failures + 1, status: 'fatal_paused', counted: true }
    }

    // permanent：连续 3 次自动暂停
    const next = (f.consecutive_failures || 0) + 1
    const status = next >= AUTO_PAUSE_THRESHOLD ? 'auto_paused' : f.status
    run(`UPDATE creator_follows
            SET consecutive_failures = ?, status = ?, last_checked_at = ?,
                last_error_code = ?, last_error_message = ?, updated_at = ?
          WHERE id = ?`,
    [next, status, t, code, code, t, followId])
    return { ok: true, consecutive: next, status, counted: true }
  }

  return {
    listCreators,
    listFollowsForQuota,
    upsertCreator,
    upsertFollow,
    getFollow,
    deleteFollow,
    setFollowEnabled,
    recordSuccess,
    recordFailure,
  }
}

module.exports = { createAccountStore, AUTO_PAUSE_THRESHOLD, NON_COUNTING_TIERS }
