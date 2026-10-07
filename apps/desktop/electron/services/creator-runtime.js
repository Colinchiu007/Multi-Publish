/**
 * creator-runtime.js — 编排层：把解析、数据访问、失败分级、配额串成可执行流程
 *
 * 前面各模块都是纯逻辑（可被完整单测覆盖），本模块负责**把它们接起来**，
 * 并且接的时候守住三条顺序敏感的不变式：
 *
 *  1. **先 claim 再取正文**：反了就会出现两个 worker 同时抓同一条。
 *  2. **提交带 claim_token**：租约过期被接管后，旧 worker 的迟到提交必须被拒，
 *     否则覆盖新持有者结果（lost update）。
 *  3. **失败必须释放 claim**：只 claim 不释放会让该条永久卡在 collecting，
 *     用户既采不到也看不到失败原因。
 *
 * 所有副作用依赖由外部注入，便于在无网络、无数据库的环境完整测试。
 */

'use strict'

const { classifyFailure, FAILURE_TIERS } = require('./creator-monitor')

const DEFAULT_LEASE_MS = 300000

function nowMs () { return Date.now() }

/** 从 axios/httpx 风格异常里挖出 status + body；拿不到就交给状态码兜底 */
function extractHttp (err) {
  if (!err) return { status: 0, body: null, transportErr: null }
  if (err.code && typeof err.code === 'string' && /^(ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|ECONNREFUSED)$/.test(err.code)) {
    return { status: 0, body: null, transportErr: err }
  }
  const status = (err.response && err.response.status) || err.status || 0
  const body = (err.response && (err.response.data || err.response.json)) || err.body || null
  return { status, body, transportErr: null }
}

function createCreatorRuntime (deps = {}) {
  const {
    store,
    collector,
    now = nowMs,
    leaseMs = DEFAULT_LEASE_MS,
    workerId = `w-${process.pid}`,
  } = deps

  if (!store || !collector) throw new TypeError('creator-runtime 需要 store 与 collector')

  /** 把已分类的失败记到博主上。节流与瞬时不累加连续失败计数。 */
  async function applyFailure (follow, tier) {
    if (!follow) return
    await store.recordFailure(follow.id, tier)
  }

  /**
   * 探测单个博主：取最新作品 → 增量落库 → 更新监控状态。
   * **永不向调用方抛异常**——调度循环会被一次异常打断，导致其余博主全部停摆。
   */
  async function probeCreator (followId) {
    const follow = await store.getFollow(followId)
    if (!follow) return { ok: false, reason: 'follow_not_found' }

    let items
    try {
      items = (await collector.listPosts(follow.external_id)) || []
    } catch (err) {
      const { status, body, transportErr } = extractHttp(err)
      const cls = classifyFailure(status, body, transportErr)
      await applyFailure(follow, cls.tier)
      return { ok: false, tier: cls.tier, reason: cls.reason, fetched: 0, inserted: 0 }
    }

    const payload = items
      .filter(i => i && (i.externalId || i.external_id) && (i.url || i.externalId))
      .map(i => ({
        creatorId: follow.creator_id,
        platform: follow.platform || 'youtube',
        externalId: i.externalId || i.external_id,
        title: i.title || '',
        url: i.url || '',
        thumbnailUrl: i.thumbnailUrl || '',
        publishedAt: i.publishedAt || i.published_at || null,
        transcriptSource: i.transcriptSource || '',
        contentQuality: i.contentQuality || 'unknown',
      }))

    const inserted = payload.length ? await store.upsertDiscoveries(payload) : 0
    await store.recordSuccess(follow.id)
    return { ok: true, fetched: payload.length, inserted }
  }

  /**
   * 采集单条。返回结构里 `superseded` 区分「被他人接管」与「真失败」——
   * 前者不是错误，重试即可；后者需要呈现给用户。
   */
  async function collectOne (discoveryId, knownItem) {
    // ⚠ 必须先拿到 externalId（平台侧作品 ID，如 YouTube videoId）。
    //   误用本地行 id 去请求会拿到「另一个作品」的内容，且不会报错——
    //   与 @handle 静默返回错误频道是同一类 id 混用事故。
    //   knownItem：批量路径已经把行查出来了，直接复用，避免每条再查一次（N+1）。
    const item = knownItem || await store.getDiscovery(discoveryId)
    if (!item) return { collected: false, reason: 'discovery_not_found' }

    const claimed = await store.claimDiscovery(discoveryId, workerId, leaseMs)
    if (!claimed) return { collected: false, reason: 'busy' }

    const token = await store.getClaimToken(discoveryId)
    const externalId = item.externalId || item.external_id
    if (!externalId) {
      await store.markFailed(discoveryId, token, 'missing_external_id')
      return { collected: false, reason: 'missing_external_id' }
    }

    let body
    try {
      body = await collector.collectBody(externalId)
    } catch (err) {
      const { status, body: b, transportErr } = extractHttp(err)
      const cls = classifyFailure(status, b, transportErr)
      // 必须释放 claim，否则该条永久卡在 collecting
      await store.markFailed(discoveryId, token, cls.reason)
      return { collected: false, reason: cls.reason, tier: cls.tier }
    }

    const ok = await store.markCollected(discoveryId, token, body)
    if (!ok) {
      // token 已变 → 被新持有者接管，旧结果不得落库
      return { collected: false, superseded: true, reason: 'claim_superseded' }
    }
    // 最终化任务与业务写入同事务入队；失败可重试，不丢产物
    await store.enqueueOutbox(discoveryId, 'finalize_collected')
    return { collected: true, contentQuality: body && body.contentQuality }
  }

  /** 顺序采集：单条失败不中断其余条目（与真实串行节流一致，便于复现） */
  async function collectBatch (discoveries) {
    const list = Array.isArray(discoveries) ? discoveries : []
    let collected = 0
    let failed = 0
    for (const d of list) {
      const r = await collectOne(d.id, d)
      if (r.collected) collected += 1
      else failed += 1
    }
    return { collected, failed }
  }

  return { probeCreator, collectOne, collectBatch, workerId, FAILURE_TIERS }
}

module.exports = { createCreatorRuntime, extractHttp, DEFAULT_LEASE_MS }