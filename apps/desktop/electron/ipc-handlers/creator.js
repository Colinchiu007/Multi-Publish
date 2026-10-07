// @ts-check
/**
 * creator IPC handlers — 博主监控与采集的主进程入口
 *
 * 本层只做三件事，**不承载业务逻辑**：
 *   1. 入参校验（越早拒绝越省资源，且能在产生副作用前失败）
 *   2. 调用 creator-* 服务并把领域错误映射成 UI 可消费的形状
 *   3. 依赖缺失时**降级返回**而不是不注册通道
 *
 * 第 3 点沿用 automation IPC 的既有教训：handler 不注册时，渲染层会收到
 * Electron 原生的 "No handler registered for 'creator:collect'"——那句话
 * 对用户毫无意义。统一返回 { code, reason }，让 UI 能显示「服务未就绪」。
 *
 * 通道全部在 license-access-control 中登记为 public，与既有采集通道一致。
 */

const {
  COLLECT_DEFAULTS,
  resolveEffectiveLimit,
  planCollect,
  ClampError,
} = require('../services/creator-limits')

const { CREATOR_INPUT_ERRORS } = require('../services/creator-collector')

// 显式 sender 守卫。**必须字面出现在每个注册点的实参里**：
// check-ipc-sender-guard 的 GUARD_PATTERNS 只对 `ipcMain.handle(通道, <实参文本>)`
// 的实参文本做正则匹配，不解析局部 helper 的定义——把守卫藏进 `wrap` 里
// 会被判成「注入咽喉点」而非显式守卫，既过不了占比门禁，也丢掉了纵深防御。
const { withSenderCheck } = require('./helpers')

/** 领域错误 → UI 形状。排查方向不同的错误 MUST 分开，不要合并成一句话。 */
function toIpcError (err) {
  if (err instanceof ClampError) {
    return { code: -11, reason: err.code, message: err.message, max: err.max, count: err.count }
  }
  const code = err && err.code
  // 本特性所有领域错误都以 creator: 前缀标识（输入类见 CREATOR_INPUT_ERRORS，
  // 其余为 discovery_not_found / follow_not_found / quota_would_exceed 等）。
  // **必须整类透传**：只映射输入类枚举会让其余原因落进通用分支丢失 reason，
  // 而「格式不对」「作品不存在」「配额不足」排查方向完全不同。
  if (typeof code === 'string' && code.startsWith('creator:')) {
    return { code: -12, reason: code, message: (err && err.message) || '' }
  }
  return { code: -1, reason: 'creator:failed', message: (err && err.message) || '操作失败' }
}

function requireString (payload, key, { max = 512 } = {}) {
  const v = payload && payload[key]
  if (typeof v !== 'string' || !v.trim()) {
    const e = new Error('缺少必要参数')
    e.code = CREATOR_INPUT_ERRORS.INVALID_INPUT
    throw e
  }
  if (v.trim().length > max) {
    const e = new Error('参数过长')
    e.code = CREATOR_INPUT_ERRORS.INVALID_INPUT
    throw e
  }
  return v.trim()
}

function registerHandlers (ipcMain, deps) {
  const {
    creatorStore,      // creator-store 实例
    creatorCollector,  // resolveChannelId / listPosts
    creatorMonitor,    // probeCreator / classifyFailure 等
    creatorQuota,      // { probePool, collectPool, canSpend, spend }
    log,
  } = deps || {}

  // 降级注册同样要守卫：不能出现「服务缺失时反而无守卫」的旁路。
  // 形参刻意叫 ch 而不是 channel：check-ipc-sender-guard 对**动态**通道名按
  // 实参表达式文本生成标签（`<expr:ch>`），automation.js:35 用的也是 `channel`，
  // 同名会被判成「同一通道重复注册且守卫状态不一致」而报 ERROR。
  const degraded = (ch) => ipcMain.handle(ch, withSenderCheck(() => ({
    code: -1,
    reason: 'service-unavailable',
    message: '博主监控服务未就绪，请在设置中检查依赖与凭证',
    channel: ch,
  })))

  const wrap = (fn) => async (_evt, payload) => {
    try {
      return await fn(payload || {})
    } catch (err) {
      if (log && log.warn) log.warn('[ipc:creator]', (err && err.message) || String(err))
      return toIpcError(err)
    }
  }

  // ── 依赖缺失：仍注册通道，返回可消费的降级结果 ──────────────────
  if (!creatorStore || !creatorCollector || !creatorMonitor) {
    log && log.error && log.error('Creator', 'creator services not provided — handlers in degraded mode')
    for (const ch of [
      'creator:list', 'creator:follow', 'creator:unfollow', 'creator:toggle',
      'creator:check-now', 'creator:discoveries', 'creator:collect',
      'creator:collect-one', 'creator:skip-one', 'creator:send-to-writer',
    ]) degraded(ch)
    return
  }

  // ── 博主列表（含待采集角标） ─────────────────────────────────
  ipcMain.handle('creator:list', withSenderCheck(wrap(async () => {
    const creators = await creatorStore.listCreators()
    const items = []
    for (const c of creators) {
      items.push({ ...c, pendingCount: creatorStore.countPending(c.id) })
    }
    return { code: 0, items, totalPending: items.reduce((s, x) => s + x.pendingCount, 0) }
  })))

  // ── 关注博主 ────────────────────────────────────────────────
  ipcMain.handle('creator:follow', withSenderCheck(wrap(async (payload) => {
    const input = requireString(payload, 'input')

    // 配额校验 MUST 在写库之前：超限时拒绝且不产生任何行
    if (creatorQuota) {
      const pool = typeof creatorQuota.probePool === 'number' ? creatorQuota.probePool : 1500
      const existing = await creatorStore.listFollowsForQuota()
      const interval = payload.checkIntervalMin || 60
      creatorMonitor.assertQuotaFits(existing, pool, { check_interval_min: interval })
    }

    // 先解析成 canonical ID 再落库——绝不把用户输入当 external_id 存
    const channelId = await creatorCollector.resolveChannelId(input)
    const creator = await creatorStore.upsertCreator({
      platform: 'youtube',
      externalId: channelId,
      displayName: payload.displayName || '',
      handle: payload.handle || '',
      avatarUrl: '',
      platformUrl: `https://www.youtube.com/channel/${channelId}`,
    })
    const follow = await creatorStore.upsertFollow({
      creatorId: creator.id,
      checkIntervalMin: payload.checkIntervalMin || 60,
      perCreatorLimit: payload.perCreatorLimit ?? null,
    })
    return { code: 0, creator, follow }
  })))

  // ── 取消关注 / 暂停恢复 ─────────────────────────────────────
  ipcMain.handle('creator:unfollow', withSenderCheck(wrap(async (payload) => {
    const followId = requireString(payload, 'followId', { max: 64 })
    await creatorStore.deleteFollow(followId)
    return { code: 0 }
  })))

  ipcMain.handle('creator:toggle', withSenderCheck(wrap(async (payload) => {
    const followId = requireString(payload, 'followId', { max: 64 })
    const follow = await creatorStore.setFollowEnabled(followId, !!payload.enabled)
    return { code: 0, follow }
  })))

  // ── 立即检查 ────────────────────────────────────────────────
  ipcMain.handle('creator:check-now', withSenderCheck(wrap(async (payload) => {
    const followId = requireString(payload, 'followId', { max: 64 })
    const r = await creatorMonitor.probeCreator(followId, { manual: true })
    return { code: 0, ...r }
  })))

  // ── 发现列表 ────────────────────────────────────────────────
  ipcMain.handle('creator:discoveries', withSenderCheck(wrap(async (payload) => {
    const limit = Number.isInteger(payload.limit) ? payload.limit : 50
    const offset = Number.isInteger(payload.offset) ? payload.offset : 0
    const items = await creatorStore.listDiscoveries({
      creatorId: payload.creatorId || null,
      state: payload.state || 'pending',
      limit, offset,
    })
    return { code: 0, items, limit, offset }
  })))

  // ── 批量采集 ────────────────────────────────────────────────
  ipcMain.handle('creator:collect', withSenderCheck(wrap(async (payload) => {
    const follow = await creatorStore.getFollow(requireString(payload, 'followId', { max: 64 }))
    if (!follow) {
      const e = new Error('关注项不存在')
      e.code = 'creator:follow_not_found'
      throw e
    }
    const effectiveLimit = resolveEffectiveLimit(follow.per_creator_limit)

    // 默认数量取「一键采集」通道的 5；手动批量通道会显式传 50
    const count = payload.count ?? COLLECT_DEFAULTS.oneClick

    const pending = await creatorStore.listDiscoveries({
      creatorId: follow.creator_id, state: 'pending', limit: effectiveLimit, offset: 0,
    })

    // 超限在此抛错，此时尚未发起任何采集请求 —— 零副作用
    const plan = planCollect({ pending, count, effectiveLimit })

    const r = await creatorMonitor.collectBatch({
      creatorId: follow.creator_id,
      discoveries: plan.selected,
      effectiveLimit,
    })
    return {
      code: 0,
      collected: r.collected,
      failed: r.failed,
      remain: plan.remain,
      truncated: plan.truncated,
      available: plan.available,
      max: effectiveLimit,
    }
  })))

  // ── 单条采集：零填参，不受数量上限约束，但仍受配额约束 ────────
  ipcMain.handle('creator:collect-one', withSenderCheck(wrap(async (payload) => {
    const discoveryId = requireString(payload, 'discoveryId', { max: 64 })
    const r = await creatorMonitor.collectOne(discoveryId)
    return { code: 0, ...r }
  })))

  ipcMain.handle('creator:skip-one', withSenderCheck(wrap(async (payload) => {
    const discoveryId = requireString(payload, 'discoveryId', { max: 64 })
    await creatorStore.skipDiscovery(discoveryId)
    return { code: 0 }
  })))

  // ── 送入 AI 写作 ────────────────────────────────────────────
  // 复用既有 full-auto-pipeline 的 collect → rewrite → create 三段，**不执行 publish**
  // （非目标 N1：不做一键搬运发布）。幂等键见下，避免同一内容反复点重复消耗 LLM 额度。
  ipcMain.handle('creator:send-to-writer', withSenderCheck(wrap(async (payload) => {
    const discoveryId = requireString(payload, 'discoveryId', { max: 64 })
    const pipeline = deps.fullAutoPipeline
    if (!pipeline || typeof pipeline.startRun !== 'function') {
      return { code: -1, reason: 'pipeline-unavailable', message: 'AI 写作流水线未就绪' }
    }
    const item = await creatorStore.getDiscovery(discoveryId)
    if (!item) {
      const e = new Error('作品不存在')
      e.code = 'creator:discovery_not_found'
      throw e
    }
    // 幂等：同一份内容（id + updated_at）重复点击返回同一个 runId，而不是重复起跑
    const sig = `${item.id}:${item.updated_at || item.collected_at || ''}`
    const started = await pipeline.startRun({
      urls: [item.url].filter(Boolean),
      sourceType: 'url',
      stages: { collect: false, rewrite: true, create: true, publish: false },
      idempotencyKey: `creator:${sig}`,
    })
    if (!started || started.success === false) {
      return { code: -1, reason: 'writer-start-failed', message: (started && started.error) || 'AI 写作启动失败' }
    }
    return { code: 0, runId: started.runId, idempotencyKey: `creator:${sig}` }
  })))
}

module.exports = { registerHandlers, toIpcError, COLLECT_DEFAULTS }