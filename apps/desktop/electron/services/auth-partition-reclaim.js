// @ts-check
/**
 * auth-partition-reclaim — 回收「每次打开登录页新建、永不删除」的临时分区
 *
 * 缺陷（#2701）：`openLogin` / `openSavedAccount` / `loginSilent` 每次调用都用
 * `Date.now()` 新建一个 persist 分区（磁盘目录名 `auth-auth-<platform>-<ts>`、
 * `silent-auth-<platform>-<ts>`），而全仓没有任何删除逻辑。本机 debug profile 实测
 * 21 个 `auth-auth-*` 目录共 **436MB**，占整个 `session/Partitions`（476MB）的 92%。
 *
 * 为什么可以删「非最新」那一个（本模块全部判据的地基）：
 * `auth-partition.findAuthPartitionDir` 对每组前缀做 `names.filter(prefix).sort()` 后
 * **只取最后一个**，发布链的两处兜底（`rpa-view-manager` 的 API 轨、`rpa-view-session.
 * _restoreAuthPartitionCookies` 的 RPA 轨）都经它定位。也就是说「较旧的 auth 分区」
 * 从来没有读者 —— 删除它们对读取行为可证明为零影响。因此这里的新旧判定必须与
 * 定位端**同一口径**（字典序 `sort()` 取末位），不得改用 mtime，否则两边规则一漂移，
 * 就会删掉兜底真正在读的那一份。
 *
 * 不能做的事（都是踩过的坑）：
 * - 不删「每组最新」那一份：登录成功的凭证可能只落在这里（kuaishou-w3-live-fix 根因）。
 * - 不碰 `account-*` / `logto-identity` / `rpa-*`：前者是账号标签的长期分区（含真实凭证）。
 * - 不对 `Partitions/` 父目录整体递归删除，且删除前必须确认目标就在该 root 下（R2）。
 * - 不删本进程正持有 Session 对象的分区：目录被 Chromium 打开时删除会写坏。
 * - Windows 上只对 `EPERM`/`EACCES`/`EBUSY` 做短而有界的重试，其余错误原样进日志。
 * - 回收属旁路：任何失败只 warn，不得影响登录与发布。
 */
'use strict'

const fs = require('fs')
const path = require('path')
const { authPartitionName } = require('./auth-view-session')

/**
 * 只回收「每次调用新建、名字里带时间戳」的分区前缀形态。
 * `auth-auth-` 同时覆盖 openLogin（auth-auth-<platform>-<ts>）与 openSavedAccount
 * （auth-auth-saved-<platform>-<ts>）；legacy 单前缀 `auth-<platform>-<ts>` 与
 * `auth-<真实 accountId>` 不在此列——后者可能是在用的账号分区，误删即抹凭证。
 */
const THROWAWAY_PREFIXES = ['auth-auth-', 'silent-auth-']

/** 目录名尾部的 `-<数字时间戳>` 段；去掉它得到「同一组」。 */
const TRAILING_TS_RE = /-\d+$/

/** 与 check-max-lines / Windows 重试口径一致的有界重试。 */
const RM_MAX_RETRIES = 3
const RM_RETRY_DELAY_MS = 100

function isThrowawayPartitionName (name) {
  return THROWAWAY_PREFIXES.some(function (prefix) { return name.startsWith(prefix) })
}

/** 同组键：剥掉尾部时间戳；名字不以 `-<数字>` 结尾时自成一组（绝不与人合批）。 */
function groupKeyOf (name) {
  return name.replace(TRAILING_TS_RE, '')
}

/**
 * 分区根目录清单，与 `auth-partition.findAuthPartitionDir` 的 `roots` 同序同源。
 * @param {string} userDataPath
 * @returns {string[]}
 */
function partitionRoots (userDataPath) {
  return [path.join(userDataPath, 'session', 'Partitions'), path.join(userDataPath, 'Partitions')]
}

/**
 * 列出某 root 下「可回收」目录：每组只留字典序末位（= 定位端唯一会读的那份）。
 * 纯函数、不碰文件系统写操作，便于逐条加锁。
 * @param {string[]} names root 下的目录名（调用方须已过滤为目录）
 * @param {string[]} [activePartitionNames] 本进程正持有 Session 的分区名，一律跳过
 * @returns {{victims: string[], kept: string[], skippedActive: string[]}}
 */
function planReclaim (names, activePartitionNames) {
  const active = new Set(activePartitionNames || [])
  const groups = new Map()
  for (const name of names) {
    if (!isThrowawayPartitionName(name)) continue
    const key = groupKeyOf(name)
    const bucket = groups.get(key) || []
    bucket.push(name)
    groups.set(key, bucket)
  }
  const victims = []
  const kept = []
  const skippedActive = []
  for (const bucket of groups.values()) {
    bucket.sort()
    const newest = bucket[bucket.length - 1]
    if (active.has(newest)) {
      skippedActive.push(newest)
      kept.push(newest)
    } else {
      kept.push(newest)
    }
    for (const name of bucket) {
      if (name === newest) continue
      if (active.has(name)) skippedActive.push(name)
      else victims.push(name)
    }
  }
  return { victims: victims.sort(), kept: kept.sort(), skippedActive: skippedActive.sort() }
}

/**
 * 执行回收。任何单点失败只落日志，函数不抛。
 * @param {{userDataPath?: string, activePartitionNames?: string[], log?: any, app?: any, fsImpl?: typeof fs}} opts
 * @returns {{scanned:number, removed:string[], kept:string[], errors:number}}
 */
function reclaimStaleAuthPartitions (opts) {
  const o = opts || {}
  const fsx = o.fsImpl || fs
  const log = o.log
  const summary = { scanned: 0, removed: /** @type {string[]} */ ([]), kept: /** @type {string[]} */ ([]), errors: 0 }
  let userDataPath = o.userDataPath
  if (!userDataPath) {
    try {
      const electronApp = o.app || require('electron').app
      userDataPath = electronApp && electronApp.getPath ? electronApp.getPath('userData') : ''
    } catch (_e) { userDataPath = '' }
  }
  if (!userDataPath) return summary

  for (const root of partitionRoots(userDataPath)) {
    let names
    try {
      if (!fsx.existsSync(root)) continue
      names = fsx.readdirSync(root)
    } catch (e) {
      summary.errors += 1
      if (log) log.warn('AuthReclaim', 'partition readdir failed: ' + ((e && e.message) || 'unknown'))
      continue
    }
    /** @type {string[]} */
    let dirs = []
    for (const name of names) {
      try { if (fsx.statSync(path.join(root, name)).isDirectory()) dirs.push(name) } catch (_e) { /* 读不动就跳过该条目 */ }
    }
    summary.scanned += dirs.length
    const plan = planReclaim(dirs, o.activePartitionNames)
    summary.kept = summary.kept.concat(plan.kept)
    // 只删 root 的直接子项：realpath 收口，拒绝任何经 symlink/`..` 逃出 root 的目标。
    let realRoot = root
    try { realRoot = fsx.realpathSync(root) } catch (_e) { /* 无 realpath 时沿用原根 */ }
    for (const name of plan.victims) {
      const target = path.join(root, name)
      let realTarget = target
      try { realTarget = fsx.realpathSync(target) } catch (_e) { realTarget = target }
      if (path.dirname(realTarget) !== realRoot || path.basename(realTarget) !== name) {
        summary.errors += 1
        if (log) log.warn('AuthReclaim', 'refused to delete outside partition root: ' + name)
        continue
      }
      try {
        fsx.rmSync(realTarget, { recursive: true, force: true, maxRetries: RM_MAX_RETRIES, retryDelay: RM_RETRY_DELAY_MS })
        summary.removed.push(name)
      } catch (e) {
        summary.errors += 1
        if (log) log.warn('AuthReclaim', 'partition remove failed ' + name + ': ' + ((e && e.message) || 'unknown'))
      }
    }
  }
  if (summary.removed.length > 0 || summary.errors > 0) {
    if (log) log.info('AuthReclaim', 'auth partition reclaim scanned=' + summary.scanned +
      ' removed=' + summary.removed.length + ' kept=' + summary.kept.length + ' errors=' + summary.errors)
  }
  return summary
}

/**
 * 延迟执行，不阻塞登录首屏与调用方；失败只 warn。
 * @param {any} opts
 */
function scheduleReclaim (opts) {
  setImmediate(function () {
    try { reclaimStaleAuthPartitions(opts) } catch (e) {
      const log = (opts && opts.log) || null
      if (log) log.warn('AuthReclaim', 'reclaim threw: ' + ((e && e.message) || 'unknown'))
    }
  })
}

/**
 * 未取到凭证的会话就地清空分区（Cookie/localStorage/IndexedDB/缓存）。
 * 进程内安全动作，替代「直接删目录」——后者在 Session 对象仍存活时会写坏磁盘状态。
 * @param {any} partitionSession Electron Session（须有 clearStorageData/clearCache）
 * @param {any} log
 * @returns {Promise<boolean>} true = 已清空
 */
function wipeSessionStorage (partitionSession, log) {
  if (!partitionSession || typeof partitionSession.clearStorageData !== 'function') {
    if (log) log.warn('AuthReclaim', 'session wipe skipped: clearStorageData unavailable')
    return Promise.resolve(false)
  }
  const tasks = [partitionSession.clearStorageData()]
  if (typeof partitionSession.clearCache === 'function') tasks.push(partitionSession.clearCache())
  return Promise.all(tasks).then(function () { return true }).catch(function (e) {
    if (log) log.warn('AuthReclaim', 'session wipe failed: ' + ((e && e.message) || 'unknown'))
    return false
  })
}

/**
 * 登录会话分区目录名——与 `auth-view-session.createSession` 共用同一实现，
 * 两处各写一份必然漂移（回收端认错了名字就等于永不回收）。
 * @param {string|null|undefined} accountId
 * @returns {string|null}
 */
function partitionNameOf (accountId) {
  if (typeof accountId !== 'string' || !accountId) return null
  return authPartitionName(accountId)
}

/**
 * 「本轮已取到凭证并入库」的会话分区名单。发布链的磁盘兜底（`collectAuthPartitionCookies`
 * 走 `findAuthPartitionDir`，只读每组字典序末位）可能正依赖成功登录那一份，
 * 所以只有**未取证**的会话才允许就地清存储。进程级集合，随会话名增长，量级可忽略。
 * @type {Set<string>}
 */
const capturedPartitions = new Set()

function markCaptured (accountId) {
  const name = partitionNameOf(accountId)
  if (name) capturedPartitions.add(name)
  return name
}

function hasCapturedPartition (accountId) {
  const name = partitionNameOf(accountId)
  return Boolean(name && capturedPartitions.has(name))
}

/**
 * 登录会话终态的回收动作：未取证的会话就地清空（进程内安全），
 * 目录本体交给 scheduleReclaim 按「非最新即删」回收。属旁路，任何失败只留日志。
 * @param {{accountId?: string|null, session?: any, captured?: boolean, log?: any, activePartitionNames?: string[]}} opts
 */
function reclaimLoginSession (opts) {
  const o = opts || {}
  const log = o.log
  const name = partitionNameOf(o.accountId)
  if (!name) {
    if (log) log.warn('AuthReclaim', 'no partition to reclaim: accountId missing')
    scheduleReclaim({ activePartitionNames: o.activePartitionNames || [] })
    return null
  }
  const captured = o.captured === true || capturedPartitions.has(name)
  if (!captured) void wipeSessionStorage(o.session, log)
  scheduleReclaim({ activePartitionNames: [name] })
  return name
}

module.exports = {
  THROWAWAY_PREFIXES,
  partitionNameOf,
  isThrowawayPartitionName,
  groupKeyOf,
  partitionRoots,
  planReclaim,
  markCaptured,
  hasCapturedPartition,
  reclaimStaleAuthPartitions,
  scheduleReclaim,
  wipeSessionStorage,
  reclaimLoginSession,
}
