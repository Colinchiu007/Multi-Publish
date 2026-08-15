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
