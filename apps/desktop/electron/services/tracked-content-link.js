/**
 * tracked-content-link.js — 发布历史 ↔ tracked_content 的关联回填（P2-6 第二刀）
 *
 * 为什么要有这个文件：`tracked_content.publish_history_id` 自诞生起就是全 NULL——
 * 写入点 `bootstrap/phase4-events.js` 的 `addTrackedContent({...})` 从未传这个键，
 * 而渲染层 `PublishHistory.vue` 的表现列靠它 join 快照，于是「回采在跑、历史页恒空」。
 *
 * 一条不可让的语义（命名陷阱）：这一列存的是**发布任务 id（task.id）**，
 * 不是发布历史行自己的 `entry.id`。判据来自读侧既有契约
 * `byTask.get(String(record.taskId || record.id))`；写侧若"顾名思义"去存 entry.id，
 * 修完仍然恒空。`tracked-content-link.test.js` 与 `phase4-events-tracked-content.test.js`
 * 把这句钉住（后者从真入口进、用真库跑，并把读侧那段投影逐字搬进断言）。
 *
 * 回填的四条边界（宁缺毋滥：把 27 行接对，比把 70 行接错有价值）：
 *  ① 只补 `publish_history_id IS NULL` 的行；② `(platform, post_id)` 在同归属下**恰好命中 1 条**才补；
 *  ③ `post_id` 为空不参与；④ 归属无法判定（tracked 行 owner 为 NULL）不补。
 * 存储层还另有一道 SQL 级 `WHERE publish_history_id IS NULL`，即使判据层出错也不会覆盖既有值。
 */
const { LEGACY_OWNER_SUBJECT } = require('./store-schema')

/**
 * 历史扫描上限。`publish-history.js` 的 `listRecords` 默认 limit=50，
 * 直接沿用会把"存量 70 行只读到 50 条历史"当成"没有可回填的"——必须显式抬高并如实报截断。
 */
const TRACKED_LINK_HISTORY_SCAN_LIMIT = 5000

/**
 * 归属归桶：历史侧（JSONL）没有 owner 字段时属"无身份服务时代的 legacy"，
 * 存储侧则把同一种情况显式写成 LEGACY_OWNER_SUBJECT（或空串）。两侧必须折成同一个桶，
 * 否则未登录态的数据永远接不上。tracked 行的 owner 为 NULL/undefined 是**另一种**情况：
 * 那表示这行无法判定归属，一律不补（判据 ④）。
 * @returns {string|null} null = 无法判定归属
 */
function ownerBucket (value, side) {
  if (value === undefined || value === null) {
    return side === 'history' ? LEGACY_OWNER_SUBJECT : null
  }
  const s = String(value).trim()
  if (!s) return side === 'history' ? LEGACY_OWNER_SUBJECT : null
  return s
}

function historyKey (owner, platform, postId) {
  return `${owner}\u0000${platform}\u0000${postId}`
}

/**
 * 纯判据：把候选行与历史记录折成「该写什么」的计划，不碰库、不碰 Electron。
 * @param {{trackedRows?:Array, historyRecords?:Array}} input
 * @returns {{plans:Array<{trackedId:string,publishHistoryId:string}>, diagnostics:object}}
 */
function planPublishHistoryLinks (input) {
  const { trackedRows = [], historyRecords = [], historyTotal } = input || {}
  const diagnostics = {
    scanned: trackedRows.length,
    linked: 0,
    alreadyLinked: 0,
    skippedEmptyPostId: 0,
    ambiguous: 0,
    unmatched: 0,
    unowned: 0,
    historySkipped: 0,
    // 截断如实报出：历史只读回一部分时，"其余存量"不能读成"不存在"
    historyTotal: Number.isFinite(historyTotal) ? historyTotal : historyRecords.length,
    historyTruncated: Number.isFinite(historyTotal) ? historyTotal > historyRecords.length : false,
  }

  // 按 (归属, 平台, 作品 id) 建索引；同一 key 挂**多个不同 taskId** ⇒ 歧义，不猜。
  // 归属进键是刻意的：不同用户发同一作品不该互相制造歧义。
  // taskId 用 Set 去重：审核回写等同一任务可能留下多行历史，按行数判歧义会把可回填的误判成猜不出。
  const index = new Map()
  for (const record of historyRecords) {
    if (!record || typeof record !== 'object') { diagnostics.historySkipped++; continue }
    // 关联来源限定为成功发布。task:failed 同样会写历史（当前 result:null ⇒ 无 postId），
    // 但"当前不会发生"不是判据 —— QM-6 后端轴 B1。
    if (record.status !== 'success') { diagnostics.historySkipped++; continue }
    const taskId = record.taskId
    const platform = record.platform
    const postId = record.result && record.result.postId
    if (typeof taskId !== 'string' || !taskId.trim()) { diagnostics.historySkipped++; continue }
    if (typeof platform !== 'string' || !platform.trim()) { diagnostics.historySkipped++; continue }
    if (typeof postId !== 'string' || !postId.trim()) { diagnostics.historySkipped++; continue }
    const owner = ownerBucket(record.owner_subject, 'history')
    const key = historyKey(owner, platform.trim(), postId.trim())
    const set = index.get(key)
    if (set) set.add(taskId.trim())
    else index.set(key, new Set([taskId.trim()]))
  }

  const plans = []
  for (const row of trackedRows) {
    if (!row || typeof row !== 'object') { diagnostics.unowned++; continue }
    if (row.publish_history_id) { diagnostics.alreadyLinked++; continue }

    const postId = row.post_id
    if (typeof postId !== 'string' || !postId.trim()) { diagnostics.skippedEmptyPostId++; continue }

    const owner = ownerBucket(row.owner_subject, 'tracked')
    if (owner === null) { diagnostics.unowned++; continue }

    const entry = index.get(historyKey(owner, String(row.platform || '').trim(), postId.trim()))
    const hits = entry ? [...entry] : []
    if (hits.length === 0) { diagnostics.unmatched++; continue }
    if (hits.length > 1) { diagnostics.ambiguous++; continue }

    plans.push({ trackedId: String(row.id), publishHistoryId: hits[0] })
    diagnostics.linked++
  }

  return { plans, diagnostics }
}

const ZERO = {
  ok: false, scanned: 0, linked: 0, ambiguous: 0, unmatched: 0, alreadyLinked: 0,
  skippedEmptyPostId: 0, unowned: 0, historySkipped: 0, historyTotal: 0, historyTruncated: false,
  writesAttempted: 0, writeFailed: 0,
}

/**
 * 编排：读候选 → 判据 → 逐行写。全程旁路——任何失败只出声，绝不冒泡影响发布主流程。
 *
 * `ok` 是给调用方决定"要不要 latch"的：读候选抛错 ⇒ ok=false ⇒ 同一次接线里
 * 下次发布还会再试一次（QM-6 后端轴 B2/W2：一次抛错就把回填永久关掉，
 * 表现为"这次启动的存量永远没补"，而日志只有一条 warn）。
 * store 方法缺席 ⇒ 也是 ok=false，但那是结构性条件，调用方照样可以重试——
 * 每轮只多一条 warn，比"永久静默"更容易被发现。
 * @param {{store:object, historyRecords:Array, historyTotal?:number, ownerSubject?:string, log?:object, limit?:number}} deps
 */
function linkExistingTrackedContent (deps) {
  const store = deps && deps.store
  const historyRecords = (deps && deps.historyRecords) || []
  const log = (deps && deps.log) || require('./logger')
  const limit = (deps && deps.limit) || TRACKED_LINK_HISTORY_SCAN_LIMIT
  const ownerSubject = deps && Object.prototype.hasOwnProperty.call(deps, 'ownerSubject')
    ? deps.ownerSubject : undefined

  if (!store || typeof store.listUnlinkedTrackedForBackfill !== 'function' ||
      typeof store.setTrackedPublishHistoryId !== 'function') {
    log.warn('PerformanceLoop', 'tracked-content link backfill unavailable: store methods missing')
    return { ...ZERO }
  }

  let trackedRows
  try {
    // 归属交给存储层过滤：判据层的分桶是第二道，不是唯一一道
    trackedRows = store.listUnlinkedTrackedForBackfill(limit, ownerSubject)
  } catch (e) {
    log.warn('PerformanceLoop', 'tracked-content link backfill read failed: ' + (e && e.message))
    return { ...ZERO }
  }

  const { plans, diagnostics } = planPublishHistoryLinks({
    trackedRows, historyRecords, historyTotal: deps && deps.historyTotal,
  })

  let writesAttempted = 0
  let writeFailed = 0
  let linked = 0
  for (const plan of plans) {
    writesAttempted++
    let ok
    try {
      ok = store.setTrackedPublishHistoryId(plan.trackedId, plan.publishHistoryId) === true
    } catch (e) {
      ok = false
      log.warn('PerformanceLoop', 'tracked-content link write threw for ' + plan.trackedId + ': ' + (e && e.message))
    }
    if (ok) linked++
    else writeFailed++
  }

  // 稳态（零候选、零歧义、未截断）不得每次启动都写一行 info——那会把真实事件埋进噪声里。
  if (linked > 0 || diagnostics.ambiguous > 0 || writeFailed > 0 || diagnostics.historyTruncated) {
    log.info('PerformanceLoop',
      `tracked-content history links: linked=${linked}/${diagnostics.scanned} scanned ` +
      `ambiguous=${diagnostics.ambiguous} unmatched=${diagnostics.unmatched} ` +
      `writeFailed=${writeFailed} historySkipped=${diagnostics.historySkipped} ` +
      `truncated=${diagnostics.historyTruncated ? 1 : 0} historyTotal=${diagnostics.historyTotal}`)
  }

  return { ...diagnostics, ok: true, linked, writesAttempted, writeFailed }
}

module.exports = {
  planPublishHistoryLinks,
  linkExistingTrackedContent,
  TRACKED_LINK_HISTORY_SCAN_LIMIT,
}
