// @ts-check
/**
 * 账号云镜像同步（desktop 侧编排器）
 *
 * 职责：把本机真源账号（元数据 + 本机加密凭证）与业务 API 的云端镜像做双向合并，
 * 并把逐条过程如实广播给渲染层。本模块**不**决定登录态结论——恢复到本机的账号一律
 * unverified，active/expired 只能由本机自己的检测产生（见 docs/adr/0005）。
 *
 * 凭证摘要只在服务端计算。客户端比较的是服务端回传的裁决结果，本机绝不另算一份
 * 规范化摘要：两侧各写一套 normalization 必然漂移，漂移的表现是 unchanged 被误判成
 * 冲突（本仓已有 CJS/ESM 孪生词表漂移的先例，见 AGENTS.md「枚举式黑名单必须配结构化正向契约」）。
 *
 * @typedef {Object} PreparedRow
 * @property {string} accountId 本机真源 id（不跨设备稳定）
 * @property {string} platform
 * @property {?string} platformUid 平台原生主键；null = 本机无法定身份
 * @property {string} displayName
 * @property {string} accountName
 * @property {string} avatar
 * @property {?number} followers
 * @property {boolean} isActive
 * @property {?Object} credential {cookies, localStorage, indexedDB}
 * @property {?string} credentialError
 *
 * @typedef {Object} CloudSyncDeps
 * @property {{ listAccounts: () => Promise<any[]>, addAccount: Function, persistLoginState: Function }} AccountManager
 * @property {{ loadCredential: Function, saveCredential: Function }} credentialStore
 * @property {(platform:string, cookies:any[]) => Promise<{supported:boolean, platformAccountId?:string}>} fetchAccountInfo
 * @property {(platform:string, cookies:any[], extra?:any) => Promise<{supported?:boolean, valid?:boolean, code?:string}>} checkLogin
 * @property {{ request: (o:{subject:string, path:string, body?:any, method?:string, query?:string}) => Promise<any> }} apiClient
 * @property {(payload:any)=>void} [broadcast]
 * @property {(accountId:string, opts?:any) => any} [queueLoginCheck] 恢复后排一次本机检测
 * @property {string} [userDataDir]
 * @property {Record<string,string|undefined>} [env]
 * @property {() => number} [now]
 * @property {{info?:Function, warn?:Function, error?:Function}} [log]
 */

const {
  ACCOUNT_PATH,
  DIGEST_TIMEOUT_MS,
  DISCONNECT_PATH,
  OUTCOME,
  SYNC_PATH,
  TIMEOUT_SENTINEL,
  emptySummary,
  errorMessage,
  finishSummary,
  isTimeout,
  keyOf,
  mapWithConcurrency,
  raceWithTimeout,
  resolveInt,
  unwrapApiResponse,
} = require('./cloud-account-core')

// 凭证冲突裁决独立成模块：它是唯一会改写本机有效凭证的路径（见该文件头注释）。
const { createConflictResolver } = require('./cloud-account-conflict')
const { createRestoreFlow } = require('./cloud-account-restore')


function createCloudAccountSync (deps) {
  const {
    AccountManager, credentialStore, fetchAccountInfo, checkLogin, apiClient,
    broadcast = () => {}, queueLoginCheck = null, userDataDir = '', env = {},
    now = () => Date.now(), log: logSink = null,
  } = deps || {}

  const concurrency = resolveInt(env.MP_CLOUD_SYNC_CONCURRENCY, 3, 1, 8)
  const accountTimeoutMs = resolveInt(env.MP_CLOUD_SYNC_ACCOUNT_TIMEOUT_MS, 20000, 1000, 120000)
  const totalBudgetMs = resolveInt(env.MP_CLOUD_SYNC_TOTAL_TIMEOUT_MS, 180000, 5000, 600000)

  const { resolveCredentialConflict } = createConflictResolver({ checkLogin, accountTimeoutMs })

  let running = false
  let abortRequested = false

  function log (level, stage, detail) {
    const sink = logSink && logSink[level]
    if (typeof sink !== 'function') return
    try { sink('CloudSync', `cloud-account-sync ${stage}${detail ? ' :: ' + detail : ''}`) } catch (_) { /* 日志不得影响同步 */ }
  }

  function send (payload) {
    try { broadcast(payload) } catch (_) { /* 广播失败不阻断同步 */ }
  }

  function assertReady () {
    if (!apiClient || typeof apiClient.request !== 'function') {
      throw Object.assign(new Error('云端同步客户端未就绪'), { code: 'BUSINESS_USER_REPOSITORY_NOT_CONFIGURED' })
    }
    if (!credentialStore || typeof credentialStore.loadCredential !== 'function' || typeof credentialStore.saveCredential !== 'function') {
      throw Object.assign(new Error('凭证存储不可用'), { code: 'CREDENTIAL_STORE_UNAVAILABLE' })
    }
    if (!AccountManager || typeof AccountManager.listAccounts !== 'function') {
      throw Object.assign(new Error('账号真源不可用'), { code: 'ACCOUNT_MANAGER_UNAVAILABLE' })
    }
  }

  /**
   * 唯一的云端出入口。返回**已剥信封的 payload**（`total` / `results` / `accounts` / `credentials`…），
   * 所以本文件里所有调用点都按业务字段读，不必各自记得 `body.data`。
   */
  function callApi (subject, path, options) {
    return Promise.resolve(apiClient.request({ subject, path, ...(options || {}) })).then(unwrapApiResponse)
  }

  // ── 摘要：弹窗先看到的"共 xx 个" ──────────────────────────────────
  async function digest (subject) {
    assertReady()
    let cloud = null
    let reachable = true
    let errorCode = null
    try {
      const got = await raceWithTimeout(callApi(subject, ACCOUNT_PATH, { method: 'GET' }), DIGEST_TIMEOUT_MS, TIMEOUT_SENTINEL)
      if (isTimeout(got)) { reachable = false; errorCode = 'SYNC_TIMEOUT' }
      else if (got && got.__cloudSyncError) { reachable = false; errorCode = got.__cloudSyncError }
      else cloud = got
    } catch (e) {
      reachable = false
      errorCode = errorMessage(e)
    }

    let localCount = 0
    try {
      const accounts = await Promise.resolve(AccountManager.listAccounts())
      localCount = Array.isArray(accounts) ? accounts.filter((a) => a && a.id && a.platform).length : 0
    } catch (e) {
      log('warn', 'local-list-failed', errorMessage(e))
    }

    const data = {
      total: cloud && Number.isFinite(cloud.total) ? cloud.total : 0,
      byPlatform: cloud && Array.isArray(cloud.byPlatform) ? cloud.byPlatform : [],
      tombstones: cloud && Number.isFinite(cloud.tombstones) ? cloud.tombstones : 0,
      localCount,
      reachable,
      errorCode,
    }
    // 读不到与"云端为空"是两种界面文案，不可互相冒充（PRD §10.2 / §11）
    if (!reachable) { data.total = 0; data.byPlatform = []; data.tombstones = 0 }
    return { code: 0, data }
  }

  // ── 本机行准备：凭证 + 平台原生 uid ───────────────────────────────
  async function loadLocalRow (account, subject) {
    const row = {
      accountId: account.id,
      platform: account.platform,
      platformUid: typeof account.platform_account_id === 'string' && account.platform_account_id.trim()
        ? account.platform_account_id.trim() : null,
      displayName: account.name || '',
      accountName: account.account_name || '',
      avatar: account.avatar || '',
      followers: Number.isSafeInteger(account.followers) && account.followers >= 0 ? account.followers : null,
      isActive: account.is_active !== false,
      // 本机凭证「上次被证明可用」的时刻（accounts.json 的 last_validated）。
      // 它只用于服务端判「云端 vs 本机哪份凭证较新」以回传 credentialFreshness，
      // 服务端落库的 credential_updated_at 一律取服务端此刻 —— 客户端报的时间戳不得成为存储值，
      // 否则谁都能把自己的时钟写成「最新」从而覆盖别人的有效凭证。
      credentialUpdatedAt: typeof account.last_validated === 'string' ? account.last_validated : null,
      credential: null,
      credentialError: null,
    }

    let stored
    try {
      stored = await Promise.resolve(credentialStore.loadCredential(account.id, userDataDir, subject))
    } catch (e) {
      row.credentialError = 'CREDENTIAL_LOAD_FAILED'
      log('warn', 'credential-load-failed', `platform=${row.platform} accountId=${row.accountId} message=${errorMessage(e)}`)
      return row
    }
    const cookies = stored && Array.isArray(stored.cookies) ? stored.cookies : []
    if (!cookies.length) {
      // 无凭证 = 本机从未真正登录成功过（或历史半成功），不上行也不冒充可用
      row.credentialError = 'CHECK_LOGIN_NO_CREDENTIAL'
      return row
    }
    row.credential = stored

    if (!row.platformUid) {
      // 二级补齐：拿 cookie 调平台 user-info 接口取原生 uid（与竞品同构的做法）
      const info = await raceWithTimeout(
        Promise.resolve(fetchAccountInfo(row.platform, cookies)).catch((e) => ({ __cloudSyncError: errorMessage(e) })),
        accountTimeoutMs, TIMEOUT_SENTINEL,
      )
      if (!isTimeout(info) && info && typeof info.platformAccountId === 'string' && info.platformAccountId.trim()) {
        row.platformUid = info.platformAccountId.trim()
      } else {
        log('warn', 'uid-extract-miss', `platform=${row.platform} accountId=${row.accountId} reason=${isTimeout(info) ? 'timeout' : (info && info.__cloudSyncError) || 'no-uid-in-response'}`)
      }
    }
    return row
  }

  // ── 上行 ────────────────────────────────────────────────────────
  function toUpsertPayload (row) {
    return {
      platform: row.platform,
      platformUid: row.platformUid,
      displayName: row.displayName,
      accountName: row.accountName,
      avatar: row.avatar,
      followers: row.followers,
      isActive: row.isActive,
      credential: row.credential,
      credentialUpdatedAt: row.credentialUpdatedAt || null,
    }
  }

  // 下行链路（取凭证 → 建号 → 存凭证 → 打回 unverified → 排检测）整体在 cloud-account-restore.js：
  // 那里守着「凭证未落盘不得声称可用」这条顺序不变量，本编排器只决定什么时候需要恢复。
  const {
    fetchCloudCredential, applyCredentialLocally, restoreToLocal,
  } = createRestoreFlow({
    callApi, AccountManager, credentialStore, queueLoginCheck, userDataDir, now, log, accountTimeoutMs,
  })

  // ── 主流程 ──────────────────────────────────────────────────────
  async function sync (subject) {
    if (running) return { code: 409, errorCode: 'CLOUD_SYNC_IN_PROGRESS', data: emptySummary() }
    try { assertReady() } catch (e) { return { code: 503, errorCode: errorMessage(e), data: emptySummary() } }

    running = true
    abortRequested = false
    const startedAt = now()
    const summary = emptySummary()

    try {
      const accounts = await Promise.resolve(AccountManager.listAccounts())
      const locals = Array.isArray(accounts) ? accounts.filter((a) => a && a.id && a.platform) : []
      const prepared = new Array(locals.length).fill(null)

      await mapWithConcurrency(locals, concurrency, async (account, index) => {
        if (abortRequested) return
        send({ phase: 'start', rowKey: String(account.id), index: index + 1, total: locals.length, platform: account.platform, accountId: account.id, name: account.name || '' })
        const row = await raceWithTimeout(
          Promise.resolve(loadLocalRow(account, subject)).catch((e) => ({ __cloudSyncError: errorMessage(e) })),
          accountTimeoutMs, TIMEOUT_SENTINEL,
        )
        if (isTimeout(row) || !row) {
          prepared[index] = null
          summary.failed += 1
          summary.items.push({ accountId: account.id, platform: account.platform, name: account.name || '', outcome: OUTCOME.FAILED, code: 'SYNC_BUDGET_EXCEEDED' })
          send({ phase: 'done', rowKey: String(account.id), index: index + 1, total: locals.length, platform: account.platform, accountId: account.id, name: account.name || '', outcome: OUTCOME.FAILED, code: 'SYNC_BUDGET_EXCEEDED' })
          return
        }
        if (row.__cloudSyncError) {
          prepared[index] = null
          summary.failed += 1
          summary.items.push({ accountId: account.id, platform: account.platform, name: account.name || '', outcome: OUTCOME.FAILED, code: row.__cloudSyncError })
          send({ phase: 'done', rowKey: String(account.id), index: index + 1, total: locals.length, platform: account.platform, accountId: account.id, name: account.name || '', outcome: OUTCOME.FAILED, code: row.__cloudSyncError })
          return
        }
        prepared[index] = row
      })

      const rows = prepared.filter(Boolean)
      // 墓碑命中与身份不明在本机侧先分池，不必问服务端
      const uploadable = rows.filter((r) => r.platformUid && !r.credentialError)
      const blockedByUid = rows.filter((r) => !r.platformUid && !r.credentialError)
      const credentialMissing = rows.filter((r) => r.credentialError)
      blockedByUid.forEach((r) => {
        summary.uidUnavailable += 1
        summary.items.push({ accountId: r.accountId, platform: r.platform, name: r.displayName, outcome: OUTCOME.UID_UNAVAILABLE, code: 'ACCOUNT_UID_INVALID' })
      })
      credentialMissing.forEach((r) => {
        summary.failed += 1
        summary.items.push({ accountId: r.accountId, platform: r.platform, name: r.displayName, outcome: OUTCOME.FAILED, code: r.credentialError })
      })

      // 云端全集既是墓碑来源，也是恢复来源。**读不到 ≠ 云端什么都没有**：
      // 空墓碑集合会让已在云端被标删的账号被本机重新上行（复活），正是 ADR-0005 要拦的形态；
      // 而信封破坏（CLOUD_ENVELOPE_INVALID）若被 .catch 吞成 null，这条防线就只是装饰。
      const cloudRaw = await raceWithTimeout(
        callApi(subject, ACCOUNT_PATH, { method: 'GET', query: 'view=full' }),
        accountTimeoutMs, TIMEOUT_SENTINEL,
      )
      const cloudFullErr = isTimeout(cloudRaw) ? 'SYNC_TIMEOUT'
        : (!cloudRaw || cloudRaw.__cloudSyncError) ? ((cloudRaw && cloudRaw.__cloudSyncError) || 'CLOUD_STATE_UNAVAILABLE') : null
      const cloudFull = cloudFullErr ? null : cloudRaw
      const tombstoneKeys = new Set()

      const toUpload = []
      if (cloudFullErr) {
        // 判不出墓碑集合 ⇒ 一条都不上行，也不做恢复（拿不到云端全集）；本机数据原样不动。
        log('warn', 'cloud-state-unavailable', `code=${cloudFullErr}`)
        summary.errorCode = cloudFullErr
        uploadable.forEach((r) => {
          summary.failed += 1
          summary.items.push({ accountId: r.accountId, platform: r.platform, name: r.displayName, outcome: OUTCOME.FAILED, code: cloudFullErr })
          send({ phase: 'done', rowKey: String(r.accountId), platform: r.platform, accountId: r.accountId, name: r.displayName, outcome: OUTCOME.FAILED, code: cloudFullErr })
        })
      } else {
        for (const t of (Array.isArray(cloudFull && cloudFull.tombstones) ? cloudFull.tombstones : [])) {
          tombstoneKeys.add(keyOf(t.platform, t.platformUid))
        }
        uploadable.forEach((r) => {
          if (tombstoneKeys.has(keyOf(r.platform, r.platformUid))) {
            summary.skipped += 1
            summary.items.push({ accountId: r.accountId, platform: r.platform, name: r.displayName, outcome: OUTCOME.SKIPPED_TOMBSTONE })
            return
          }
          toUpload.push(r)
        })
      }

      // 一次性 PUT，由服务端逐条裁决 created/updated/unchanged/conflict/rejected
      let results = []
      if (toUpload.length) {
        const put = await raceWithTimeout(
          callApi(subject, ACCOUNT_PATH, { method: 'PUT', body: { accounts: toUpload.map(toUpsertPayload) } }),
          Math.max(accountTimeoutMs, totalBudgetMs - (now() - startedAt)), TIMEOUT_SENTINEL,
        )
        if (isTimeout(put) || !put || put.__cloudSyncError) {
          summary.errorCode = isTimeout(put) ? 'SYNC_BUDGET_EXCEEDED' : put && put.__cloudSyncError
          toUpload.forEach((r) => {
            summary.failed += 1
            summary.items.push({ accountId: r.accountId, platform: r.platform, name: r.displayName, outcome: OUTCOME.FAILED, code: summary.errorCode })
          })
        } else {
          results = Array.isArray(put.results) ? put.results : []
        }
      }

      const rowByKey = new Map(toUpload.map((r) => [keyOf(r.platform, r.platformUid), r]))
      const outcomeToCounter = { [OUTCOME.CREATED]: 'created', [OUTCOME.UPDATED]: 'updated', [OUTCOME.UNCHANGED]: 'unchanged' }
      for (const res of results) {
        const row = rowByKey.get(keyOf(res.platform, res.platformUid))
        if (!row) continue
        if (res.outcome === 'conflict') {
          const outcome = await settleConflict(subject, row, res)
          summary.conflicts += 1
          summary.items.push({ accountId: row.accountId, platform: row.platform, name: row.displayName, outcome })
          send({ phase: 'done', rowKey: String(row.accountId), platform: row.platform, accountId: row.accountId, name: row.displayName, outcome })
          continue
        }
        if (res.outcome === 'rejected') {
          summary.failed += 1
          summary.items.push({ accountId: row.accountId, platform: row.platform, name: row.displayName, outcome: OUTCOME.FAILED, code: res.errorCode || 'ACCOUNT_REJECTED' })
          send({ phase: 'done', rowKey: String(row.accountId), platform: row.platform, accountId: row.accountId, name: row.displayName, outcome: OUTCOME.FAILED, code: res.errorCode })
          continue
        }
        const counter = outcomeToCounter[res.outcome]
        if (counter) summary[counter] += 1
        else { summary.failed += 1; summary.items.push({ accountId: row.accountId, platform: row.platform, name: row.displayName, outcome: OUTCOME.FAILED, code: res.errorCode || 'CLOUD_RESULT_MISSING' }); continue }
        summary.items.push({ accountId: row.accountId, platform: row.platform, name: row.displayName, outcome: res.outcome, code: res.errorCode })
        send({ phase: 'done', rowKey: String(row.accountId), platform: row.platform, accountId: row.accountId, name: row.displayName, outcome: res.outcome, code: res.errorCode })
      }

      // 云端有、本机无 → 恢复
      const localKeys = new Set(rows.filter((r) => r.platformUid).map((r) => keyOf(r.platform, r.platformUid)))
      const cloudAccounts = cloudFull && Array.isArray(cloudFull.accounts) ? cloudFull.accounts : []
      const toRestore = cloudAccounts.filter((c) => c.platform && c.platformUid
        && !localKeys.has(keyOf(c.platform, c.platformUid))
        && !tombstoneKeys.has(keyOf(c.platform, c.platformUid)))
      for (const [i, c] of toRestore.entries()) {
        if (abortRequested) break
        // 恢复项此刻还没有本機 accountId（正是这次恢复才创建的），
        // 所以行键只能用云端身份 (platform, platformUid)：start 与 done 必须取到同一个值，
        // 否则一条恢复会在界面上裂成两行。
        const rowKey = 'restore:' + c.platform + ':' + c.platformUid
        send({ phase: 'start', rowKey, index: i + 1, total: toRestore.length, platform: c.platform, name: c.displayName || c.accountName || '' })
        const result = await raceWithTimeout(
          Promise.resolve(restoreToLocal(subject, c, startedAt)).catch((e) => ({ outcome: OUTCOME.FAILED, code: errorMessage(e) })),
          accountTimeoutMs, TIMEOUT_SENTINEL,
        )
        const settled = isTimeout(result) ? { outcome: OUTCOME.FAILED, code: 'SYNC_BUDGET_EXCEEDED' } : result
        if (settled.outcome === OUTCOME.RESTORED) summary.restored += 1
        else summary.failed += 1
        summary.items.push({ accountId: settled.accountId || null, platform: c.platform, name: c.displayName || '', outcome: settled.outcome, code: settled.code })
        send({ phase: 'done', rowKey, index: i + 1, total: toRestore.length, platform: c.platform, accountId: settled.accountId || null, name: c.displayName || '', outcome: settled.outcome, code: settled.code })
      }

      summary.queuedCheck = summary.items.filter((i) => i.outcome === OUTCOME.RESTORED).length
      summary.elapsedMs = now() - startedAt
      summary.aborted = abortRequested
      if (now() - startedAt > totalBudgetMs && !summary.errorCode) summary.errorCode = 'SYNC_BUDGET_EXCEEDED'
      finishSummary(summary)
      log('info', 'summary', `created=${summary.created} updated=${summary.updated} unchanged=${summary.unchanged} restored=${summary.restored} skipped=${summary.skipped} conflicts=${summary.conflicts} invalid=${summary.invalid} uidUnavailable=${summary.uidUnavailable} failed=${summary.failed} aborted=${summary.aborted}`)
      return { code: 0, data: summary }
    } catch (e) {
      const code = errorMessage(e)
      log('error', 'failed', code)
      summary.errorCode = code
      summary.failed += 1
      summary.elapsedMs = now() - startedAt
      finishSummary(summary)
      return { code: 500, errorCode: code, data: summary }
    } finally {
      running = false
    }
  }

  /**
   * 服务端只报「有差异」，哪一份胜出必须由本机实测决定（PRD §5.5）。
   * 返回逐条结果枚举，并把胜出的一方落到正确位置。
   */
  async function settleConflict (subject, row, res) {
    const slot = await fetchCloudCredential(subject, row.platform, row.platformUid)
    // 传输层无结论 / 云端有这一行却解不开：都**不是**「云端凭证失效」的反证，本轮不裁决。
    // 若把它们当成 null 交给裁决，verdict 会判云端 invalid，两份都"失效"的假结论就由此产生。
    if (!slot || slot.status === 'undecryptable') {
      log('warn', 'conflict-cloud-no-evidence',
        `platform=${row.platform} reason=${!slot ? 'transport' : slot.errorCode}`)
      return OUTCOME.CONFLICT_UNRESOLVED
    }
    // 'ok' 给凭证本体；'missing'/'empty' 给 null —— 后者是**负向证据**（云端那份确实没有可用 cookie），
    // 与"没问到/解不开"必须分开，否则一次本可收敛的冲突会被永久钉成"未判定"。
    const cloudCredential = slot.status === 'ok' ? slot.credential : null
    const cloudNewer = res && res.credentialFreshness === 'cloud'
    const resolution = await resolveCredentialConflict(row.platform, row.credential, cloudCredential, cloudNewer)

    if (resolution.winner === 'cloud') {
      const applied = await applyCredentialLocally(subject, row.accountId, resolution.credential, row.platform)
      if (!applied) return OUTCOME.FAILED
      await callApi(subject, ACCOUNT_PATH, { method: 'PUT', body: { accounts: [{ ...toUpsertPayload({ ...row, credential: resolution.credential }), force: 'cloud-wins' }] } })
        .catch((e) => log('warn', 'conflict-cloud-put-failed', errorMessage(e)))
      return OUTCOME.CONFLICT_CLOUD
    }
    if (resolution.invalid) {
      // 两份都明确失效：本机原样保留，如实告诉用户需要重新登录（不静默丢弃）
      return OUTCOME.INVALID_CREDENTIAL
    }
    if (resolution.winner === 'keep-local') {
      // 两份都无定论：本机原样保留，且**不发这次 PUT**。
      // 带 force:'local-wins' 回写等于用「没验出来」这份未证实的证据去授权覆盖云端凭证，
      // 直接违反单向证据规则（没拿到新证据不是反证）；而服务端在无 force 时只会回 conflict，
      // 这一趟请求除了把 last_validated 之外什么都没改，属纯冗余写。下一轮同步会重新实测。
      return OUTCOME.CONFLICT_UNRESOLVED
    }
    // 本机较新且有效 → 上行覆盖云端
    await callApi(subject, ACCOUNT_PATH, { method: 'PUT', body: { accounts: [{ ...toUpsertPayload(row), force: 'local-wins' }] } })
      .catch((e) => log('warn', 'conflict-local-put-failed', errorMessage(e)))
    return OUTCOME.CONFLICT_LOCAL
  }

  function disconnect (subject, confirm) {
    if (confirm !== 'cloud') return Promise.resolve({ code: 400, errorCode: 'DISCONNECT_CONFIRMATION_REQUIRED' })
    try { assertReady() } catch (e) { return Promise.resolve({ code: 503, errorCode: errorMessage(e) }) }
    return callApi(subject, DISCONNECT_PATH, { method: 'POST', body: { confirm } })
      .then((data) => ({ code: 0, data }))
      .catch((e) => ({ code: 500, errorCode: errorMessage(e) }))
  }

  return {
    digest, sync, disconnect,
    requestAbort: () => { if (!running) return false; abortRequested = true; return true },
    isRunning: () => running,
    OUTCOME,
  }
}

module.exports = { createCloudAccountSync, OUTCOME, keyOf, TIMEOUT_SENTINEL }
