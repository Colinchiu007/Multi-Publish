// @ts-check
/**
 * auth-partition — API-first 发布链的 Electron auth 分区凭证兜底（D1，kuaishou-w3-live-fix）
 *
 * 根因（01-docs/rpa-api-publish/evidence/api-w3-kuaishou/live-verdict-20260926.md）：
 * 生产 rpa_vm 路由下 authData.cookies 可能为空（快手等平台的登录态只落在登录时的
 * Electron auth 分区，未同步进凭证 store），API-first 分支拼出空串被 adapter
 * fail-closed，发布链 0 步未跑。
 *
 * 本模块只读 auth 分区补 cookie：
 * - selectAuthPartition：分区**选址**（#2734 起改为「按内容择新」，见下）
 * - collectAuthPartitionCookies：读中被平台域过滤 + 同名去重 + 拼 name=value 串
 *
 * 为什么不再是「取字典序末位」（#2734，2026-10-01）：
 * `openLogin` / `openSavedAccount` / `qrcode` 每次都新建一个带 `Date.now()` 的分区，
 * 所以「较新的那一份」完全可能是一次**失败或取消的登录**留下的空壳；而 `close()`
 * 会把刚关闭的分区名当作 active 传给回收端（`reclaimLoginSession`），于是那个空壳
 * 既不会被清也不会被删 —— 旧口径「只读末位」会被它长期遮断：真正持有登录态的较旧
 * 分区仍在盘上，却永远读不到。用户侧症状是「账号明明登录过，发布却报未登录」，
 * 重试和重启都不会好（空壳仍是最新）。
 *
 * 新口径三条，缺一不可：
 *  ① 同组**从新到旧**逐份打开、按 `isPlatformCookieDomain` 判有无该平台 cookie，取第一个命中的；
 *  ② 探测上限 `PROBE_LIMIT`（单一真源在 `auth-partition-reclaim`），**回收端保留数取同一个值**
 *     —— 否则回收会把定位端的候选吃掉，②就是自相矛盾；
 *  ③ 日志必须区分「无候选」/「探过 N 份都没有该平台 cookie」/「探测本身失败」/「兜底自身抛错」，
 *     否则现场无法分辨「真的没登录过」与「被空壳遮断」，这三件事的用户可见症状一模一样。
 *
 * 纪律：绝不写凭证 store；任何异常降级为空结果，由调用方保持既有 fail-closed 语义。
 */
const path = require('path')
const fs = require('fs')
const { session, app } = require('electron')
const log = require('./logger')
const { isPlatformCookieDomain } = require('@multi-publish/shared-utils/src/platform-definitions')
// 回收端是更底层的那一份（只依赖 fs/path/shared-utils）：分区根目录与探测窗口常量都从它取，
// 反向依赖会成环。只读兜底也会实例化 Session ⇒ 必须登记 liveness，否则该目录可能被回收 unlink。
const authReclaim = require('./auth-partition-reclaim')

const PROBE_LIMIT = authReclaim.PROBE_LIMIT
/**
 * 单份探测的硬超时预算（毫秒）。
 *
 * 为什么本次必须自带这一条：#2734 把兜底从「读一份」改成「最多读 PROBE_LIMIT 份」，
 * 于是**同一份挂死的读取从阻塞 1 倍变成阻塞 K 倍**——这是本次改动自己引入的后果，不是既有问题。
 * 口径与回收侧「排队超时＝本轮无结论」一致：超时只让**这一份**记为 failures，整轮继续往旧探，
 * 绝不因为一份读不动就放弃整个兜底，也不无限重试。
 */
const DEFAULT_PROBE_TIMEOUT_MS = 3000

/** 预算可用 MP_AUTH_PARTITION_PROBE_TIMEOUT_MS 覆盖以便排障；非法值（非数字/<=0）回落默认。 */
function resolveProbeTimeoutMs (env) {
  const src = env || process.env
  const raw = src && src.MP_AUTH_PARTITION_PROBE_TIMEOUT_MS
  if (raw === undefined || raw === null || raw === '') return DEFAULT_PROBE_TIMEOUT_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PROBE_TIMEOUT_MS
  return Math.min(n, 60000)
}

/**
 * 给单次探测加硬上限。两个坑必须同时避开：
 * 两条都在测：① 迟到 reject 不得变成 unhandledRejection —— 由 `Promise.race` 自身对两路都挂订阅来保证
 *    由 `Promise.race` 对两路都挂订阅来保证（不是靠额外的 catch）；② 先到先回必须 clearTimeout，
 *    否则留下的定时器会在 race 结束后再 reject 一次，既污染日志又在测试里留下悬挂句柄。
 */
function withProbeTimeout (pending, ms, label) {
  const task = Promise.resolve(pending)
  let timer = null
  const budget = new Promise(function (_resolve, reject) {
    timer = setTimeout(function () {
      reject(new Error('probe timeout after ' + ms + 'ms: ' + label))
    }, ms)
  })
  // 迟到 reject 不会变成 unhandledRejection：`Promise.race` 对两路都挂了订阅，
  // 而 race 结束后再 reject 的那一路已经被处理过。因此这里**不需要**额外的 catch 兜接
  // （写过，M13 实测摘掉它测试照绿，说明它是装饰；换成「不把 task 交进 race」的实现形态
  //  才会漏，那条反证见 auth-partition.test.js 的 unhandledRejection 用例）。
  return Promise.race([task, budget]).finally(function () { clearTimeout(timer) })
}

/** 与回收端同序同源的根目录清单。 */
function candidateRoots (userDataPath) {
  return authReclaim.partitionRoots(userDataPath)
}

/**
 * 列出该账号/该平台在**探测窗口内**的候选分区名，按字典序**从新到旧**。
 * 前缀优先级沿用既有口径：`auth-{accountId}` / `account-{accountId}` 先于平台级前缀，
 * 命中一组即锁定该组（不与平台级前缀混排，避免把别的账号的分区当兜底源）。
 * @param {string} platform
 * @param {string|null|undefined} accountId
 * @param {string} [userDataPath] 测试注入点；默认 app.getPath('userData')
 * @param {{readdirSync?:Function, statSync?:Function, existsSync?:Function}} [fsImpl]
 * @returns {string[]}
 */
function listAuthPartitionCandidates (platform, accountId, userDataPath, fsImpl) {
  const fsx = fsImpl || fs
  const rootBase = userDataPath || (app && app.getPath ? app.getPath('userData') : '')
  if (!rootBase) return []
  const prefixes = []
  if (typeof accountId === 'string' && accountId) {
    prefixes.push('auth-' + accountId)
    prefixes.push('account-' + accountId)
  }
  prefixes.push('auth-auth-' + platform + '-')
  prefixes.push('auth-' + platform + '-')
  for (const root of candidateRoots(rootBase)) {
    if (!fsx.existsSync(root)) continue
    let names
    try { names = fsx.readdirSync(root) } catch (_e) { continue }
    for (const prefix of prefixes) {
      const candidates = names
        .filter(function (name) { return String(name).startsWith(prefix) })
        .filter(function (name) {
          try { return fsx.statSync(path.join(root, name)).isDirectory() } catch (_e) { return false }
        })
        .sort()
      if (candidates.length > 0) {
        return candidates.slice(-PROBE_LIMIT).reverse()
      }
    }
  }
  return []
}

/**
 * 默认读取器：实例化该分区的 Session 并取全部 cookie（只读）。
 * 先登记 liveness 再 fromPartition —— 否则随后的目录回收可能 unlink 正被 Chromium 持有的存储目录（#2701）。
 * @param {string} partitionName
 * @returns {Promise<any[]>}
 */
function readPartitionCookies (partitionName) {
  authReclaim.noteLivePartition(partitionName)
  return session.fromPartition('persist:' + partitionName).cookies.get({})
}

/**
 * 按内容选出可用作凭证兜底的分区。
 * @param {string} platform
 * @param {string|null|undefined} accountId
 * @param {{log?:any, readCookies?:Function, candidates?:string[], userDataPath?:string, fsImpl?:any}} [opts]
 * @returns {Promise<{partition:string|null, cookies:any[], probed:string[], reason:'found'|'no-candidate'|'all-empty'|'probe-failed'}>}
 */
async function selectAuthPartition (platform, accountId, opts) {
  const o = opts || {}
  const logx = o.log || log
  const read = o.readCookies || readPartitionCookies
  const probeTimeoutMs = Number.isFinite(o.probeTimeoutMs) ? o.probeTimeoutMs : resolveProbeTimeoutMs(o.env)
  const candidates = o.candidates || listAuthPartitionCandidates(platform, accountId, o.userDataPath, o.fsImpl)
  const none = { partition: null, cookies: [], probed: [], reason: /** @type {'no-candidate'} */ ('no-candidate') }
  if (!candidates || candidates.length === 0) return none

  const probed = []
  let failures = 0
  for (const name of candidates) {
    probed.push(name)
    let cookies
    try {
      cookies = await withProbeTimeout(read(name), probeTimeoutMs, name)
    } catch (e) {
      failures += 1
      logx.warn('AuthPartition', '[' + platform + '] partition probe failed, keep looking older: '
        + name + ' err=' + ((e && e.message) || 'unknown'))
      continue
    }
    const usable = Array.isArray(cookies)
      ? cookies.filter(function (c) { return c && isPlatformCookieDomain(platform, c.domain) }).length
      : 0
    if (usable > 0) {
      return { partition: name, cookies: Array.isArray(cookies) ? cookies : [], probed, reason: 'found' }
    }
  }
  // 「全都读到了、但都没有该平台 cookie」与「一份都没读成功」必须分开：
  // 后者是宿主/文件锁问题，把它写成 all-empty 会引导排障者去找一个不存在的「未登录」原因。
  return {
    partition: null,
    cookies: [],
    probed,
    reason: failures === probed.length ? 'probe-failed' : 'all-empty',
  }
}

/**
 * 只读 auth 分区 cookie，按平台域过滤 + 同名去重后拼 name=value 串。
 * @param {string} platform
 * @param {string|null|undefined} accountId
 * @param {object} [opts] 透传给 selectAuthPartition 的注入点
 * @returns {Promise<{cookieString: string, partition: string|null, count: number, reason: 'found'|'no-candidate'|'all-empty'|'probe-failed'|'error', probed: string[]>}}
 */
async function collectAuthPartitionCookies (platform, accountId, opts) {
  const empty = { cookieString: '', partition: null, count: 0, reason: 'no-candidate', probed: [] }
  try {
    const sel = await selectAuthPartition(platform, accountId, opts)
    if (!sel.partition) {
      if (sel.reason === 'no-candidate') {
        log.warn('AuthPartition', '[' + platform + '] no auth partition candidate for accountId=' + (accountId || '(none)'))
      } else {
        log.warn('AuthPartition', '[' + platform + '] auth partition fallback unusable: reason=' + sel.reason
          + ' probed=' + sel.probed.length + ' [' + sel.probed.join(', ') + ']')
      }
      return Object.assign({}, empty, { reason: sel.reason, probed: sel.probed })
    }
    /** @type {Map<string, string>} */
    const byName = new Map()
    for (const c of sel.cookies || []) {
      if (!c || typeof c.name !== 'string' || typeof c.value !== 'string') continue
      if (typeof c.domain !== 'string' || !c.domain) continue
      if (!isPlatformCookieDomain(platform, c.domain)) continue
      byName.set(c.name, c.value) // 同名去重：后出现（更具体域）的值优先
    }
    const cookieString = Array.from(byName.entries()).map(([k, v]) => k + '=' + v).join('; ')
    log.info('AuthPartition', '[' + platform + '] read ' + byName.size + ' cookies from auth partition '
      + sel.partition + ' (probed=' + sel.probed.length + ')')
    return { cookieString, partition: sel.partition, count: byName.size, reason: sel.reason, probed: sel.probed }
  } catch (e) {
    log.warn('AuthPartition', '[' + platform + '] auth partition cookie read failed: reason=error '
      + ((e && e.message) || 'unknown'))
    return Object.assign({}, empty, { reason: 'error' })
  }
}

module.exports = {
  PROBE_LIMIT,
  DEFAULT_PROBE_TIMEOUT_MS,
  resolveProbeTimeoutMs,
  listAuthPartitionCandidates,
  selectAuthPartition,
  collectAuthPartitionCookies,
}
