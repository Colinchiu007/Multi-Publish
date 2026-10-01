/**
 * account-groups-store.js — 账号分组持久化真源的读写与归一（P2-8a 单一实现）
 *
 * 为什么要有这个文件：分组的 CRUD 早已存在（`stores/accounts.js`），但真源是
 * `localStorage`（键 `mp_account_groups`）⇒ 与账号真源不在同一层，换机/清数据即丢。
 * 本模块把它落到**已存在且按用户命名空间隔离**的 settings 面
 * （`ipc-handlers/store.js` 的 `store:get-setting`/`store:set-setting` 会用
 * `_getOwnerSubject()` 走 `getUserSetting/setUserSetting`，键再经 `scopedSettingKey` 加
 * sha256 命名空间），并保持与今日 localStorage 完全一致的「分组对象数组」形状 ——
 * 换形状会让两套归一逻辑并存，两份必然漂移。
 *
 * 三条硬语义（对应 account-groups-store.test.js 的三条主线）：
 * ① 「读不到」≠「没有分组」：api 层的 `storeGetSetting` 会把出错码塌成 `null`，
 *    因此这里必须用**保留信封**的 `storeGetSettingResult`；非 0 码返回 `ok:false`，
 *    调用方据此**拒绝覆盖写盘**（把 AUTH_ERROR 当空组再保存一次就是抹真源）。
 * ② 迁移一次性且非破坏：只把 localStorage 读出来写进真源，**不删**旧键。
 * ③ 校验失败逐条归类出声（`dropped`/`unresolved`），未知账号 id 保留在组里
 *    （用户重新导入账号后应能恢复引用），不得静默丢成员。
 */
import { storeGetSettingResult, storeSetSetting } from '@/api/publisher'

/** 真源键名（owner 命名空间由主进程加，渲染层只写业务键） */
export const ACCOUNT_GROUPS_KEY = 'account_groups'
/** 迁移来源键（localStorage），迁移后保留不删 */
export const LEGACY_ACCOUNT_GROUPS_KEY = 'mp_account_groups'
/** settings 是无模式 KV，不设上限等于给用户一个无界增长文件（先例：useCopyLibrary 的 200） */
export const MAX_ACCOUNT_GROUPS = 50
export const MAX_GROUP_ACCOUNTS = 500
export const GROUP_NAME_MAX = 40

function newGroupId () {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* 非安全上下文退化为下面的计数器 */ }
  return `g_${Date.now().toString(36)}_${(++newGroupId._seq).toString(36)}`
}
newGroupId._seq = 0

function isPlainString (v) {
  return typeof v === 'string'
}

/**
 * 归一 + 校验（PRD §三 1-8）。不抛错：把每条不成立的结果记进返回值，由调用方决定怎么出声。
 * @param {unknown} raw 反序列化后的原始值
 * @param {{knownPlatformIds?: string[], accounts?: Array<{id:string,platform:string}>}} [ctx]
 */
export function normalizeAccountGroups (raw, ctx = {}) {
  const knownPlatformIds = ctx.knownPlatformIds || null
  const accounts = Array.isArray(ctx.accounts) ? ctx.accounts : []
  const accountById = new Map(accounts.map(a => [a.id, a]))
  const dropped = []
  const unresolved = []

  if (!Array.isArray(raw)) {
    return { groups: [], dropped: [], unresolved: [], healed: 0, limitReached: false, invalidShape: true }
  }

  const seenIds = new Set()
  const seenNameKeys = new Set()
  const groups = []
  let healed = 0

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue

    const name = isPlainString(item.name) ? item.name.trim() : ''
    if (!name || name.length > GROUP_NAME_MAX) {
      dropped.push({ id: isPlainString(item.id) ? item.id : null, reason: 'name', value: name })
      continue
    }

    let filter = item.platformFilter || null
    if (filter && knownPlatformIds && !knownPlatformIds.includes(filter)) {
      // 未知平台 id：降级为「全平台」，不得留成一个永远筛不到账号的组
      dropped.push({ id: isPlainString(item.id) ? item.id : null, reason: 'platformFilter', value: filter })
      filter = null
    }

    const nameKey = `${filter || '*'}\u0000${name}`
    if (seenNameKeys.has(nameKey)) {
      dropped.push({ id: isPlainString(item.id) ? item.id : null, reason: 'duplicateName', value: name })
      continue
    }

    let id = isPlainString(item.id) && item.id ? item.id : newGroupId()
    if (seenIds.has(id)) {
      dropped.push({ id, reason: 'duplicateId' })
      id = newGroupId()
    }

    let memberIds
    if (Array.isArray(item.accountIds)) {
      memberIds = [...new Set(item.accountIds.filter(isPlainString))]
    } else {
      // 沿用既有迁移语义：成员列表缺失时按平台筛选回填（不是丢组，也不是清空组）
      memberIds = accounts.filter(a => !filter || a.platform === filter).map(a => a.id)
      healed += 1
    }

    if (memberIds.length > MAX_GROUP_ACCOUNTS) {
      dropped.push({ id, reason: 'membersTruncated', value: memberIds.length })
      memberIds = memberIds.slice(0, MAX_GROUP_ACCOUNTS)
    }

    for (const accountId of memberIds) {
      const account = accountById.get(accountId)
      if (!account || (filter && account.platform !== filter)) unresolved.push(accountId)
    }

    seenIds.add(id)
    seenNameKeys.add(nameKey)
    groups.push({ id, name, platformFilter: filter, accountIds: memberIds })
  }

  const limitReached = groups.length > MAX_ACCOUNT_GROUPS
  return {
    groups: limitReached ? groups.slice(0, MAX_ACCOUNT_GROUPS) : groups,
    dropped,
    unresolved: [...new Set(unresolved)],
    healed,
    limitReached,
    invalidShape: false,
  }
}

function isEnvelope (result) {
  // 只认「带 code 的信封」。没有 code 就等于没读到 —— 包括浏览器 dev server 的 undefined
  return !!result && typeof result === 'object' && typeof result.code === 'number'
}

/**
 * 读分组真源；真源无记录时尝试一次性迁移 localStorage。
 * @returns {Promise<{ok:boolean, reason?:string, groups:Array, dropped:Array, unresolved:Array, migrated:boolean, readFrom:string}>}
 */
export async function loadAccountGroups ({
  read = () => storeGetSettingResult(ACCOUNT_GROUPS_KEY),
  write = (key, value) => storeSetSetting(key, value),
  readLegacy = (key) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(key)),
  warn = (...args) => console.warn(...args),
  ctx = {},
} = {}) {
  let envelope
  try {
    envelope = await read()
  } catch (e) {
    warn('[account-groups] settings read threw, treating as unreadable:', e?.message || e)
    return { ok: false, reason: 'unreadable', groups: [], dropped: [], unresolved: [], migrated: false, readFrom: 'error' }
  }

  if (!isEnvelope(envelope) || envelope.code !== 0) {
    // 非 0 码（含 AUTH_ERROR：未登录/无法识别用户）或根本没有信封（浏览器 dev server 无 electronAPI）
    warn('[account-groups] settings unreadable or owner unresolved, keeping current state and refusing to overwrite', isEnvelope(envelope) ? envelope.code : '<no envelope>')
    return { ok: false, reason: 'unreadable', groups: [], dropped: [], unresolved: [], migrated: false, readFrom: 'unavailable' }
  }

  const data = envelope.data
  if (data !== null && data !== undefined) {
    const normalized = normalizeAccountGroups(data, ctx)
    if (normalized.invalidShape) warn('[account-groups] settings payload has invalid shape, treating whole list as empty (no per-element guessing)')
    return { ok: true, ...normalized, migrated: false, readFrom: 'settings' }
  }

  let legacyRaw = null
  try {
    const rawText = readLegacy(LEGACY_ACCOUNT_GROUPS_KEY)
    legacyRaw = rawText ? JSON.parse(rawText) : null
  } catch (e) {
    warn('[account-groups] legacy localStorage parse failed, skipping migration:', e?.message || e)
  }

  if (!Array.isArray(legacyRaw) || legacyRaw.length === 0) {
    return { ok: true, groups: [], dropped: [], unresolved: [], healed: 0, limitReached: false, invalidShape: false, migrated: false, readFrom: 'empty' }
  }

  const normalized = normalizeAccountGroups(legacyRaw, ctx)
  const saved = await saveAccountGroups({ write, warn }, normalized.groups)
  if (!saved.ok) {
    // 迁移写失败时仍返回内存里的旧数据（用户不该因迁移失败而丢分组），但如实报未落真源
    warn('[account-groups] migration could not be persisted, using legacy value for this session (retry after restart)')
    return { ok: true, ...normalized, migrated: false, pendingMigration: true, readFrom: 'legacy' }
  }
  return { ok: true, ...normalized, migrated: true, readFrom: 'legacy+migrated' }
}

/**
 * 写分组真源。写前脱壳（IPC 结构化克隆不接受 reactive proxy），且失败必须能被界面看见。
 */
export async function saveAccountGroups ({
  write = (key, value) => storeSetSetting(key, value),
  warn = (...args) => console.warn(...args),
} = {}, groups) {
  const plain = JSON.parse(JSON.stringify(Array.isArray(groups) ? groups : []))
  let result
  try {
    result = await write(ACCOUNT_GROUPS_KEY, plain)
  } catch (e) {
    warn('[account-groups] settings write threw:', e?.message || e)
    return { ok: false, reason: 'write-failed' }
  }
  if (!result || typeof result.code !== 'number' || result.code !== 0) {
    warn('[account-groups] settings write not confirmed, UI must show save failure', result && result.code)
    return { ok: false, reason: 'write-failed' }
  }
  return { ok: true }
}
