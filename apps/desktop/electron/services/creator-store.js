/**
 * creator-store.js — 博主采集数据访问层（组合门面）
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
 *
 * ## 为什么拆成三个文件
 *
 * 接线要补 14 个方法，全堆在本文件必破 `check-max-lines` 的 500 行硬限
 * （`NEW_OVER_LIMIT` 对新代码是阻断，不接受挂账）。
 * 现状：账号/关注 → `creator-store.accounts.js`；发现项 + 事务 + 配额 →
 * `creator-store.discoveries.js`；本文件只做组合、共享工具与对外门面。
 * `BEGIN/COMMIT` **只在 discoveries 模块内**（事务边界不可跨文件），
 * accounts 模块自己开的那段事务自成一体。
 *
 * ## 方法面完整性有机器锁
 *
 * `creator-store-surface.test.js` 从两个消费方（`ipc-handlers/creator.js` 与
 * `creator-runtime.js`）的源码里剥掉注释后解析 `store.x(` 调用点，与本文件的
 * 实际导出做集合比对。2026-10-07 的整条接线缺失 14 个方法却「全绿」，
 * 根因就是没有任何锁校验**消费方真正调用了什么**——
 * 那轮锁立刻抓出了手工枚举漏掉的 `recordFailure`/`recordSuccess`/`getClaimToken`。
 */

'use strict'

const crypto = require('crypto')

const { createAccountStore } = require('./creator-store.accounts')
const { createDiscoveryStore } = require('./creator-store.discoveries')

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
  const idFactory = typeof opts.newId === 'function' ? opts.newId : newId
  const exec = (sql, params) => {
    const st = db.prepare(sql)
    if (Array.isArray(params) && typeof st.run === 'function') return st.run(...params)
    return st.run()
  }

  /**
   * 事务控制。**必须抛错**，不能用 exec()。
   *
   * 生产的 `sqlite-wrapper` 没有 `db.run()`，只有 `exec()`，而 `exec()` 会
   * 吞掉异常只记日志 —— 那意味着 `BEGIN IMMEDIATE` 失败时后续所有写入
   * 都会跑在事务外，原子性静默消失，正好毁掉 finalizeCollected 存在的理由。
   * 依次尝试 execOrThrow → exec → run，覆盖真实 wrapper 与裸 sql.js 两种句柄。
   */
  const txn = (sql) => {
    if (typeof db.execOrThrow === 'function') return db.execOrThrow(sql)
    if (typeof db.exec === 'function') return db.exec(sql)
    if (typeof db.run === 'function') return db.run(sql)
    throw new Error('当前 db 句柄不支持事务控制（缺 execOrThrow / exec / run）')
  }
  const ctx = { now, newId: idFactory, exec, changesOf, txn }

  const accounts = createAccountStore(db, ctx)
  const discoveries = createDiscoveryStore(db, ctx)

  /** 待采集计数（角标）。空结果归一为 0，避免 UI 收到 undefined。 */
  function countPending (creatorId) {
    const sql = `SELECT COUNT(*) AS n FROM creator_discoveries
      WHERE collect_state = 'pending'${creatorId ? ' AND creator_id = ?' : ''}`
    const st = db.prepare(sql)
    const rows = creatorId ? st.all(creatorId) : st.all()
    const row = Array.isArray(rows) ? rows[0] : null
    return row && Number.isFinite(Number(row.n)) ? Number(row.n) : 0
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
      const t = now()
      const r = exec(`INSERT OR IGNORE INTO creator_discoveries
          (id, creator_id, platform, external_id, title, url, thumbnail_url,
           published_at, discovered_at, collect_state, transcript_source,
           content_quality, summary, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
      [it.id || idFactory('cd'), it.creatorId, it.platform, it.externalId,
        it.title || '', it.url, it.thumbnailUrl || '', it.publishedAt || null, t,
        it.transcriptSource || '', it.contentQuality || 'unknown',
        it.summary || '', t, t])
      inserted += changesOf(r)
    }
    return inserted
  }

  return {
    // ── 账号与关注 ──
    listCreators: accounts.listCreators,
    listFollowsForQuota: accounts.listFollowsForQuota,
    upsertCreator: accounts.upsertCreator,
    upsertFollow: accounts.upsertFollow,
    getFollow: accounts.getFollow,
    deleteFollow: accounts.deleteFollow,
    setFollowEnabled: accounts.setFollowEnabled,
    recordSuccess: accounts.recordSuccess,
    recordFailure: accounts.recordFailure,

    // ── 发现项与 claim 状态机 ──
    upsertDiscoveries,
    listDiscoveries: discoveries.listDiscoveries,
    getDiscovery: discoveries.getDiscovery,
    skipDiscovery: discoveries.skipDiscovery,
    getClaimToken: discoveries.getClaimToken,
    inspectClaim: discoveries.inspectClaim,
    claimDiscovery: discoveries.claimDiscovery,
    markCollected: discoveries.markCollected,
    markFailed: discoveries.markFailed,
    renewLease: discoveries.renewLease,
    finalizeCollected: discoveries.finalizeCollected,

    // ── 配额 ──
    canSpend: discoveries.canSpend,
    spend: discoveries.spend,
    usedUnits: discoveries.usedUnits,

    countPending,
    newId: idFactory,
  }
}

/** sql.js 的 run() 返回 { changes }；部分替身直接返回数字。归一处理。 */
function changesOf (r) {
  if (r == null) return 0
  if (typeof r === 'number') return r
  if (typeof r.changes === 'number') return r.changes
  return 0
}

module.exports = { createCreatorStore, DEFAULT_LEASE_MS: 300000, DEFAULT_COOLDOWN_MS: 600000 }
