/**
 * usePublishGroupApply.js — 「按组添加」的选中集写入判据（P2-8b 唯一实现）
 *
 * 为什么单独一个文件、而且是纯函数：
 * - 判据要能被 `Publish.vue` 之外的消费者复用（未来自动化任务按组下发目标），
 *   写进组件就变成第二份口径（本仓「同一判据被抄成三遍」的事故族已证）。
 * - 全部依赖以注入方式传入，因此分类、顺序、幂等三条锁可在无 Vue、无 IPC 的环境里直接测。
 *
 * 两条不可违反的顺序约束（成因见 PRD §二）：
 * 1. **先平台后账号，且在同一同步段内**：`usePlatformSelection.js:139-142` 的 reconcile
 *    会删除「不在 selectedPlatforms 里的平台键」，只写账号等于白写；
 *    而 `:126-130` 会给「已选平台但选中集为空」回填默认账号，所以两步之间**不得插入任何一帧**
 *    （await / nextTick 都会让默认账号凭空挤进来）。本文件由源码锁守住。
 * 2. **可用性一律问 isAccountAvailable**：它内部经 `getAccounts` 走 `isAccountActive`，
 *    是「不可勾选 / 不作默认回填 / 已选中自动剔除」三条语义共用的那个判定，禁止在此另写一份。
 *
 * 返回值的分类互斥且穷尽：`added + already + skipped === 去重后的成员数`，
 * 上层提示文字只能读这几个数，不得再自行推断。
 */

const REASON_MISSING = 'missing'
const REASON_INACTIVE = 'inactive'
const REASON_PLATFORM_MISMATCH = 'platformMismatch'
const REASON_UNKNOWN_PLATFORM = 'unknown-platform'

function emptyResult (extra) {
  return { ok: true, added: [], already: [], skipped: [], platforms: [], ...extra }
}

/**
 * @param {object} group 归一后的分组对象（`normalizeAccountGroups` 的元素）
 * @param {{
 *   resolveAccount: (accountId: string) => {id?: string, platform?: string} | null,
 *   isAccountAvailable: (platformId: string, accountId: string) => boolean,
 *   isPlatformSelected: (platformId: string) => boolean,
 *   isAccountSelected: (platformId: string, accountId: string) => boolean,
 *   selectPlatform: (platformId: string) => void,
 *   selectAccount: (platformId: string, accountId: string) => void,
 * }} deps
 * @returns {{ok:boolean, reason?:string, added:Array<{platformId:string,accountId:string}>,
 *            already:Array<{platformId:string,accountId:string}>,
 *            skipped:Array<{accountId:string,reason:string,platform?:string}>,
 *            platforms:string[]}}
 */
export function applyAccountGroup (group, deps) {
  if (!group || typeof group !== 'object') {
    return emptyResult({ ok: false, reason: 'invalid-group' })
  }
  // 成员列表必须是数组。缺失时**不**按平台回填：那是真源读侧（normalizeAccountGroups）
  // 的 healed 语义，走到这里还拿到非数组说明消费者绕过了归一，
  // 此时"当成全部账号"会把用户没放进组里的号也发出去。
  const rawIds = Array.isArray(group.accountIds) ? group.accountIds : null
  if (!rawIds || rawIds.length === 0) {
    return emptyResult({ ok: false, reason: 'empty-group' })
  }

  const ids = [...new Set(rawIds.filter(id => typeof id === 'string' && id))]
  if (ids.length === 0) {
    return emptyResult({ ok: false, reason: 'empty-group' })
  }

  const result = emptyResult({})
  const enabledNow = new Set()

  for (const accountId of ids) {
    const account = deps.resolveAccount(accountId)
    if (!account) {
      result.skipped.push({ accountId, reason: REASON_MISSING })
      continue
    }
    const platformId = typeof account.platform === 'string' ? account.platform : ''
    if (!platformId) {
      result.skipped.push({ accountId, reason: REASON_UNKNOWN_PLATFORM })
      continue
    }
    if (group.platformFilter && platformId !== group.platformFilter) {
      // 组成员与组的平台筛选自相矛盾（真源被外部改写过才会这样）。写进 platformId 桶
      // 等于替用户改了组语义，写进 platformFilter 桶等于凭空选一个用户没这个号的平台，
      // 两头都不做：如实跳过并带上实测平台，供提示文字定位。
      result.skipped.push({ accountId, reason: REASON_PLATFORM_MISMATCH, platform: platformId })
      continue
    }
    if (!deps.isAccountAvailable(platformId, accountId)) {
      result.skipped.push({ accountId, reason: REASON_INACTIVE })
      continue
    }
    if (deps.isAccountSelected(platformId, accountId)) {
      result.already.push({ platformId, accountId })
      continue
    }

    if (!deps.isPlatformSelected(platformId) && !enabledNow.has(platformId)) {
      deps.selectPlatform(platformId)
      enabledNow.add(platformId)
      result.platforms.push(platformId)
    }
    deps.selectAccount(platformId, accountId)
    result.added.push({ platformId, accountId })
  }

  return result
}

/**
 * 分组状态里「可以让用户操作」的那几档。
 * `stores/accounts.js:246` 在 `ok:false` 时把状态置为 `unreadable` 却**不清空** `groups`
 * （那是 P2-8a 的"读不到 ≠ 没有，不得用空数组抹真源"），所以只判 `groups.length` 会把
 * 上一轮遗留的组当成当前可操作的组 —— 未登录时点下去，加进去的是别的身份的分组。
 * `save-failed` / `pending-migration` 仍可操作：本刀只写选中集，不写分组真源。
 */
const GROUP_STATUS_RENDERABLE = new Set(['ok', 'pending-migration', 'save-failed'])

export function pickVisibleGroups (groups, status) {
  if (!GROUP_STATUS_RENDERABLE.has(status)) return []
  return Array.isArray(groups) ? groups : []
}

/**
 * 把组换成 chip 需要的展示数据（`可添加/成员`）。判据与 `applyAccountGroup` 同源，
 * 否则会出现"显示 3 个、点下去只加 1 个"的口径分裂。
 */
export function buildGroupPickerItems (groups, deps) {
  return (Array.isArray(groups) ? groups : []).map(group => {
    const { total, applicable } = countGroupApplicable(group, deps)
    return { id: group.id, name: group.name, total, applicable }
  })
}

export function countGroupApplicable (group, deps) {
  if (!group || typeof group !== 'object' || !Array.isArray(group.accountIds)) return { total: 0, applicable: 0 }
  const ids = [...new Set(group.accountIds.filter(id => typeof id === 'string' && id))]
  let applicable = 0
  for (const accountId of ids) {
    const account = deps.resolveAccount(accountId)
    if (!account || typeof account.platform !== 'string' || !account.platform) continue
    if (group.platformFilter && account.platform !== group.platformFilter) continue
    if (!deps.isAccountAvailable(account.platform, accountId)) continue
    applicable += 1
  }
  return { total: ids.length, applicable }
}
