// @ts-check
/**
 * publish-failure-draft — 发布失败自动回存草稿（publish-fail-draft-guard，PRD §4.3 / §5.1）
 *
 * 职责：媒体内容（视频 video_path / 图文 images）发布失败时，把完整内容快照
 * 写入草稿箱，防止内容只存在于内存表单而丢失。去重不在本模块——写入复用
 * draftSave 的内容指纹幂等语义（同内容天然只一条）。
 *
 * 旁路红线：任何失败只 log.warn，绝不冒泡影响发布失败主流程
 * （历史落库 / 失败通知 / 风控挂起均在本模块之前或并行执行）。
 */

// 自动回存草稿的溯源标记（不参与内容指纹；本版不展示，预留 P2 自动草稿角标）
const FAILURE_DRAFT_SOURCE = 'auto_failure'

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * 发布失败任务是否为媒体内容（图片/视频）
 * @param {object} article
 * @returns {boolean}
 */
function isMediaArticle(article) {
  if (isNonEmptyString(article.video_path)) return true
  return Array.isArray(article.images) && article.images.length > 0
}

/**
 * 构造失败回存草稿快照（字段与 usePublishDrafts.buildDraftSnapshot 对齐）
 * @param {object} task
 * @returns {object}
 */
function buildFailureDraftSnapshot(task) {
  const a = task.article
  return {
    id: 'draft_' + Date.now(),
    title: a.title || '',
    content: a.content || '',
    author: a.author || '',
    cover_url: a.cover_url || '',
    cover_path: a.cover_path || '',
    cover_file: a.cover_file || '',
    video_path: a.video_path || '',
    images: Array.isArray(a.images) ? a.images : [],
    image_files: Array.isArray(a.image_files) ? a.image_files : [],
    tags: Array.isArray(a.tags) ? a.tags : [],
    topics: Array.isArray(a.topics) ? a.topics : [],
    mentions: Array.isArray(a.mentions) ? a.mentions : [],
    // 失败回存不带定时：定时由用户恢复草稿后自行设置（定时×草稿互斥不受影响）
    publishTime: '',
    platforms: [task.platform],
    accounts: a.accountId ? { [task.platform]: a.accountId } : {},
    platformOverrides: {},
    source: FAILURE_DRAFT_SOURCE,
  }
}

/**
 * 把草稿快照写入草稿存储（复用 draftSave 的指纹幂等语义）
 * @param {object} draft
 * @param {object} deps
 * @param {string|undefined} ownerSubject - undefined = legacy 模式；空串/null 不应到此处
 * @returns {{ draftId: string, reused: boolean }}
 */
function writeDraft(draft, deps, ownerSubject) {
  const { store } = deps
  const { computeDraftFingerprint } = require('./draft-fingerprint')
  const fp = computeDraftFingerprint(draft)
  const now = new Date().toISOString()

  // 读取现有草稿（owner-scoped 或 legacy），统一为「写者 + 数组」
  let existing
  let persist
  if (ownerSubject !== undefined) {
    const raw = store.getUserSetting('drafts', [], ownerSubject)
    existing = typeof raw === 'string' ? safeParse(raw) : (Array.isArray(raw) ? raw : [])
    persist = (list) => store.setUserSetting('drafts', JSON.stringify(list), ownerSubject)
  } else {
    const raw = store.getSetting('drafts') || '[]'
    existing = typeof raw === 'string' ? safeParse(raw) : (Array.isArray(raw) ? raw : [])
    persist = (list) => store.setSetting('drafts', JSON.stringify(list))
  }

  const idx = existing.findIndex((d) => d && (d._fp === fp || (!d._fp && computeDraftFingerprint(d) === fp)))
  if (idx >= 0) {
    // 复用既有草稿：保留原 id 与 createdAt，刷新内容与 updatedAt
    const merged = { ...existing[idx], ...draft, id: existing[idx].id, createdAt: existing[idx].createdAt, updatedAt: now, _fp: fp }
    existing[idx] = merged
    persist(existing)
    return { draftId: merged.id, reused: true }
  }
  const appended = { ...draft, createdAt: now, updatedAt: now, _fp: fp }
  existing.push(appended)
  persist(existing)
  return { draftId: appended.id, reused: false }
}

/**
 * @param {string} raw
 * @returns {Array}
 */
function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (_) {
    return []
  }
}

/**
 * 发布失败 → 自动回存草稿（资格判定 + 写入，全程不抛出）
 * @param {object} task - taskQueue task:failed 事件载荷
 * @param {object} deps
 * @param {object} deps.store
 * @param {object} [deps.identityService] - 存在即 Logto 模式
 * @param {object} [deps.log] - logger（info/warn）
 * @param {Function} [deps.save] - 测试注入：替代 writeDraft
 * @returns {Promise<{saved: boolean, reused?: boolean, reason?: string}>}
 */
async function saveFailureDraft(task, deps) {
  const { store, identityService, log } = deps
  const logger = log || require('./logger')
  try {
    if (!store || typeof store !== 'object') {
      return { saved: false, reason: 'no_store' }
    }
    if (!task || typeof task !== 'object' || !task.article || typeof task.article !== 'object') {
      return { saved: false, reason: 'no_article' }
    }
    if (!isMediaArticle(task.article)) {
      return { saved: false, reason: 'not_media' }
    }
    // 身份门禁：owner 权威来源是任务固化的 task.owner_subject（发布时刻的登录用户，
    // 与 history.addRecord 同源）。Logto 模式（identityService 存在）下任务缺失
    // owner_subject → fail-closed 跳过，绝不写 legacy 全局命名空间；
    // legacy 模式（无 identityService）按 owner_subject 有无决定 scoped / legacy 写入。
    let ownerSubject = undefined
    const taskOwner = typeof task.owner_subject === 'string' ? task.owner_subject.trim() : ''
    if (identityService && !taskOwner) {
      logger.info('FailureDraftSaver', '发布失败自动存草稿跳过：Logto 模式任务无 owner_subject（fail-closed）')
      return { saved: false, reason: 'no_owner' }
    }
    if (taskOwner) {
      ownerSubject = taskOwner
    }

    const draft = buildFailureDraftSnapshot(task)
    let result
    if (typeof deps.save === 'function') {
      result = await deps.save(draft)
    } else {
      result = writeDraft(draft, deps, ownerSubject)
    }
    logger.info('FailureDraftSaver', '发布失败自动存草稿: taskId=' + (task.id || '') + ' draftId=' + result.draftId + (result.reused ? '（指纹命中复用既有草稿）' : '（新增）'))
    return { saved: true, reused: Boolean(result.reused) }
  } catch (e) {
    logger.warn('FailureDraftSaver', '发布失败自动存草稿失败（不影响主流程）: ' + (e && e.message))
    return { saved: false, reason: 'error' }
  }
}

module.exports = { saveFailureDraft, buildFailureDraftSnapshot, FAILURE_DRAFT_SOURCE }
