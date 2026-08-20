/**
 * Shared, renderer-only history ordering and filtering contracts.
 *
 * History records come from more than one persistence path, so this module
 * deliberately accepts both camelCase and snake_case timestamps and never
 * mutates the caller's array.
 */
export const HISTORY_TIME_KEYS = Object.freeze([
  'updatedAt',
  'updated_at',
  'completedAt',
  'completed_at',
  'endedAt',
  'ended_at',
  'createdAt',
  'created_at',
])

const CREATION_TIME_KEYS = Object.freeze(['createdAt', 'created_at'])
const IDENTITY_KEYS = Object.freeze(['id', 'projectId', 'runId'])

function parseHistoryTime (value) {
  // null means "field missing/invalid"; a finite number (including epoch 0)
  // and a parseable ISO string are valid effective times.
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string' && value.trim() === '') return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    // Accept seconds and milliseconds while keeping the public contract
    // explicit about finite epoch values.
    const milliseconds = Math.abs(value) < 1e11 ? value * 1000 : value
    return Number.isFinite(milliseconds) ? milliseconds : null
  }

  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function firstValidTime (item, keys) {
  if (!item || typeof item !== 'object') return 0
  for (const key of keys) {
    const parsed = parseHistoryTime(item[key])
    if (parsed !== null) return parsed
  }
  return 0
}

export function historyEffectiveTime (item) {
  return firstValidTime(item, HISTORY_TIME_KEYS)
}

export function latestHistoryTimestamp (...items) {
  let latest = null
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    for (const key of HISTORY_TIME_KEYS) {
      const parsed = parseHistoryTime(item[key])
      if (parsed !== null && (latest === null || parsed > latest)) latest = parsed
    }
  }
  return latest === null ? null : new Date(latest).toISOString()
}

function historyCreatedTime (item) {
  return firstValidTime(item, CREATION_TIME_KEYS)
}

function historyStableIdentity (item) {
  if (!item || typeof item !== 'object') return ''
  for (const key of IDENTITY_KEYS) {
    const value = item[key]
    if (value !== null && value !== undefined && String(value).trim() !== '') return String(value)
  }
  return ''
}

export function compareHistoryItems (a, b, aIndex = 0, bIndex = 0) {
  const effectiveDelta = historyEffectiveTime(b) - historyEffectiveTime(a)
  if (effectiveDelta !== 0) return effectiveDelta

  const createdDelta = historyCreatedTime(b) - historyCreatedTime(a)
  if (createdDelta !== 0) return createdDelta

  const identityDelta = historyStableIdentity(a).localeCompare(historyStableIdentity(b))
  return identityDelta !== 0 ? identityDelta : aIndex - bIndex
}

export function sortHistoryByEffectiveTime (items) {
  if (!Array.isArray(items)) return []
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compareHistoryItems(left.item, right.item, left.index, right.index))
    .map(entry => entry.item)
}

export function filterHistoryByStatus (items, status = 'all') {
  const list = Array.isArray(items) ? items : []
  const filtered = status === 'all'
    ? list
    : list.filter(item => item && item.status === status)
  return sortHistoryByEffectiveTime(filtered)
}

export function historyStatusCounts (items) {
  const counts = { all: 0, running: 0, paused: 0, failed: 0, completed: 0, cancelled: 0 }
  for (const item of Array.isArray(items) ? items : []) {
    counts.all += 1
    if (Object.prototype.hasOwnProperty.call(counts, item?.status)) counts[item.status] += 1
  }
  return counts
}

export function historyDisplayTime (item) {
  return historyEffectiveTime(item)
}

/**
 * 内容政策/需要用户输入类失败的统一门控关键字（与主进程 pipeline-engine.js
 * resumeOrchestration 的判定对齐）：命中即判定为不可原样恢复，必须修改文案后重新生成。
 * content 与 policy 之间允许空格/下划线/连字符或不带分隔符（content policy / content_policy /
 * content-policy / contentpolicy 均命中）。
 */
export const RESUME_BLOCKING_ERROR_PATTERN = /内容政策|needs_user_input|content[_\-\s]?policy|可能需要修改文案|repeatedly returned no result|多次未返回结果/i

/**
 * 内容政策/需用户输入的具体原因子集（不含 empty_result 短语）。
 * 历史页「场景提取」与「内容政策拦截」提示条用它判定，避免把多次空结果失败
 * （服务波动/账号问题）误标为内容安全审查（2026-08-16 复审解耦）。
 */
export const CONTENT_POLICY_ERROR_PATTERN = /内容政策|needs_user_input|content[_\-\s]?policy|可能需要修改文案/i

// 从内容政策子集派生，保证场景提取关键字清单单一来源（含中文「内容政策」变体），不会漂移。
const POLICY_SCENE_PATTERN = new RegExp(`Image\\s+#(\\d+)[^;]*?(?:${CONTENT_POLICY_ERROR_PATTERN.source})`, 'gi')

function compressSceneRanges (sceneNumbers) {
  const sorted = [...sceneNumbers].sort((a, b) => a - b)
  const parts = []
  let rangeStart = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i += 1) {
    const current = sorted[i]
    if (current === prev + 1) {
      prev = current
      continue
    }
    parts.push(prev === rangeStart ? String(rangeStart) : rangeStart + '-' + prev)
    if (current !== undefined) {
      rangeStart = current
      prev = current
    }
  }
  return parts
}

/**
 * 从失败错误文本中提取「内容政策拦截」的具体场景号。
 * 规则：仅统计 Image #N 段内命中门控关键字的失败项（瞬时失败如 aborted 不计入）；
 * 升序、去重。
 * @param {string|undefined|null} error - 历史任务的原始错误文本
 * @returns {number[]} 例如 [49, 73, 74]；无命中返回 []
 */
export function collectContentPolicySceneNumbers (error) {
  const raw = String(error || '')
  if (!raw) return []
  const sceneNumbers = new Set()
  POLICY_SCENE_PATTERN.lastIndex = 0
  let match
  while ((match = POLICY_SCENE_PATTERN.exec(raw)) !== null) {
    const scene = Number(match[1])
    if (Number.isInteger(scene) && scene > 0) sceneNumbers.add(scene)
  }
  return [...sceneNumbers].sort((a, b) => a - b)
}

/**
 * 将政策场景号序列化为结果页 focusScenes 路由 query（逗号分隔、区间展开逐号）。
 * @param {string|undefined|null} error - 历史任务的原始错误文本
 * @returns {string} 例如 '49,73,74'；无命中返回 ''
 */
export function policySceneQuery (error) {
  return collectContentPolicySceneNumbers(error).join(',')
}

/**
 * 将政策场景号压缩为可读字符串。
 * 连续区间压缩为 a-b。
 * @param {string|undefined|null} error - 历史任务的原始错误文本
 * @param {string} [locale] - 'zh'（默认，顿号分隔）或 'en'（逗号分隔）
 * @returns {string} 例如 '#49、#73-77'；无命中返回 ''
 */
export function contentPolicyScenes (error, locale = 'zh') {
  const sceneNumbers = collectContentPolicySceneNumbers(error)
  if (sceneNumbers.length === 0) return ''
  const separator = String(locale || '').trim().toLowerCase().startsWith('en') ? ', ' : '、'
  return '#' + compressSceneRanges(sceneNumbers).join(separator + '#')
}
