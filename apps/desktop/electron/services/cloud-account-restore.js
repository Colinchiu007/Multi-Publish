// @ts-check
/**
 * 下行链路的唯一落点：从云端取一份凭证，并把它安全地安放到本机（PRD §5.4 / §7.3）。
 *
 * 单独成模块的理由不是"文件太长"，而是这三件事共享一条**顺序不变量**：
 *   凭证未落盘 → 不得声称账号可用；落盘成功 → 必须把登录态打回 unverified 并排一次本机检测。
 * 这条不变量若散落在上行编排器里，最容易被后来的改动顺手合并成
 * 「先建号再顺手存凭证」，那正是 `AGENTS.md` 固化顺序条目要拦的半成功形态。
 * 上行编排器只负责"什么时候需要恢复"，"怎么恢复"由本文件回答。
 */
const {
  OUTCOME,
  SYNC_PATH,
  TIMEOUT_SENTINEL,
  errorMessage,
  isTimeout,
  keyOf,
  raceWithTimeout,
} = require('./cloud-account-core')

/**
 * @param {Object} deps
 * @property {(subject:string, path:string, options?:any) => Promise<any>} callApi 已剥信封的云端调用出口
 * @property {{ addAccount: Function, persistLoginState: Function }} AccountManager
 * @property {{ saveCredential: Function }} credentialStore
 * @property {(accountId:string, opts:any) => any} [queueLoginCheck]
 * @property {string} userDataDir
 * @property {() => number} now
 * @property {(level:string, stage:string, detail?:string) => void} log
 * @property {number} accountTimeoutMs
 */
function createRestoreFlow (deps) {
  const {
    callApi, AccountManager, credentialStore, queueLoginCheck,
    userDataDir = '', now, log, accountTimeoutMs,
  } = deps || {}

  /**
   * 取一份云端凭证，**如实区分四种结局**（返回 null 与返回空凭证是两件事）：
   *   * `null`                     —— 传输层无结论（超时 / 请求失败）
   *   * `{status:'ok'}`            —— 拿到可用凭证
   *   * `{status:'missing'}`       —— 云端没有这一行
   *   * `{status:'undecryptable'}` —— 云端有这一行但服务端解不开（KMS 轮转、密文损坏）
   *
   * 拆开是为了不违反单向证据规则：裁决处若把「解不开」当成「云端凭证已失效」，
   * 就会凭一次服务端内部错误把用户的账号判成「两份都失效，请重新登录」。
   */
  async function fetchCloudCredential (subject, platform, platformUid) {
    const got = await raceWithTimeout(
      callApi(subject, SYNC_PATH, { method: 'POST', body: { keys: [{ platform, platformUid }] } }),
      accountTimeoutMs, TIMEOUT_SENTINEL,
    )
    if (isTimeout(got) || !got || got.__cloudSyncError) return null
    const list = Array.isArray(got.credentials) ? got.credentials : []
    const hit = list.find((c) => keyOf(c.platform, c.platformUid) === keyOf(platform, platformUid))
    if (!hit) return { status: 'missing' }
    if (hit.errorCode || !hit.credential || typeof hit.credential !== 'object') {
      return { status: 'undecryptable', errorCode: hit.errorCode || 'CREDENTIAL_DECRYPT_FAILED' }
    }
    // 解出来了但一份 cookie 都没有：这是**负向证据**（云端那份确实不可用），
    // 不得与"服务端解不开"混为一谈 —— 混了就把一次可收敛的冲突永久钉成"未判定"。
    if (!Array.isArray(hit.credential.cookies) || !hit.credential.cookies.length) return { status: 'empty' }
    return { status: 'ok', credential: hit.credential }
  }

  /** 把一份凭证落到本机（覆盖同名账号的本机凭证），并强制本机自证 */
  async function applyCredentialLocally (subject, accountId, credential, platform) {
    try {
      await Promise.resolve(credentialStore.saveCredential(accountId, credential, userDataDir, subject))
    } catch (e) {
      log('warn', 'credential-apply-failed', `platform=${platform} accountId=${accountId} message=${errorMessage(e)}`)
      return false
    }
    await markNeedLocalAttestation(accountId, platform)
    return true
  }

  /**
   * 恢复到本机 / 被云端凭证覆盖后的统一收尾：
   * status 强制 unverified（不继承云端结论）、last_validated 取本机此刻且标 restored 来源
   * （不参与 7 天超龄锚点），然后排一次本机检测。
   */
  async function markNeedLocalAttestation (accountId, platform) {
    try {
      await Promise.resolve(AccountManager.persistLoginState(accountId, {
        status: 'unverified',
        lastValidated: new Date(now()).toISOString(),
        validationOrigin: 'restored',
      }))
    } catch (e) {
      log('warn', 'restore-status-failed', `platform=${platform} accountId=${accountId} message=${errorMessage(e)}`)
    }
    if (typeof queueLoginCheck === 'function') {
      try { await Promise.resolve(queueLoginCheck(accountId, { platform, reason: 'cloud-restored' })) } catch (e) {
        log('warn', 'restore-check-queue-failed', `accountId=${accountId} message=${errorMessage(e)}`)
      }
    }
  }

  /** 恢复失败时把「为什么」如实带到行上，而不是统一塞 CREDENTIAL_UNAVAILABLE。 */
  function restoreFailureCode (slot) {
    if (!slot) return 'SYNC_TIMEOUT'
    if (slot.status === 'undecryptable') return slot.errorCode || 'CREDENTIAL_DECRYPT_FAILED'
    if (slot.status === 'empty') return 'CREDENTIAL_EMPTY'
    return 'CREDENTIAL_UNAVAILABLE'
  }

  /**
   * 凭证没存上就删掉刚建出来的账号：留一个"有账号、无凭证"的僵尸，
   * 下一轮它既不会被恢复（合并键已在本机存在）也不会被上行（读不到凭证），
   * 于是每次同步都固定报一条失败 —— 而那一份云端凭证明明还在，只是永远取不到。
   */
  async function rollbackCreated (subject, accountId, cloudAccount) {
    if (typeof AccountManager.deleteAccount !== 'function') {
      log('warn', 'restore-rollback-unavailable', `accountId=${accountId}`)
      return false
    }
    try {
      await Promise.resolve(AccountManager.deleteAccount(accountId, { ownerSubject: subject }))
      return true
    } catch (e) {
      log('warn', 'restore-rollback-failed', `platform=${cloudAccount.platform} accountId=${accountId} message=${errorMessage(e)}`)
      return false
    }
  }

  async function restoreToLocal (subject, cloudAccount, startedAt) {
    const slot = await fetchCloudCredential(subject, cloudAccount.platform, cloudAccount.platformUid)
    const credential = slot && slot.status === 'ok' ? slot.credential : null
    if (!credential) {
      return { outcome: OUTCOME.FAILED, code: restoreFailureCode(slot) }
    }
    let created
    try {
      created = await Promise.resolve(AccountManager.addAccount({
        platform: cloudAccount.platform,
        name: cloudAccount.displayName || cloudAccount.accountName || '',
        account_name: cloudAccount.accountName || '',
        platform_account_id: cloudAccount.platformUid || '',
        followers: typeof cloudAccount.followers === 'number' ? cloudAccount.followers : null,
        avatar: cloudAccount.avatar || '',
        is_active: cloudAccount.isActive !== false,
        // 跨设备恢复的凭证来自云端镜像，不经本机登录捕获 → 弱证据，不得固化 active
        loginVerified: false,
      }))
    } catch (e) {
      return { outcome: OUTCOME.FAILED, code: errorMessage(e) }
    }
    const accountId = created && created.data && created.data.id
    if (!accountId) {
      return { outcome: OUTCOME.FAILED, code: (created && (created.errorCode || created.message)) || 'ACCOUNT_CREATE_FAILED' }
    }
    // 顺序不可颠倒：凭证未落盘不得声称该账号可用（AGENTS.md 固化顺序）
    try {
      await Promise.resolve(credentialStore.saveCredential(accountId, credential, userDataDir, subject))
    } catch (e) {
      log('warn', 'restore-credential-failed', `platform=${cloudAccount.platform} accountId=${accountId} message=${errorMessage(e)}`)
      // 回滚：不留"有账号无凭证"的僵尸（它会永久占住合并键，使那一份云端凭证再也恢复不到）
      const rolledBack = await rollbackCreated(subject, accountId, cloudAccount)
      return {
        outcome: OUTCOME.FAILED,
        code: 'CREDENTIAL_PERSIST_FAILED',
        // 回滚失败时才把 accountId 带出去（本机确实还残留一个账号，排障需要它）
        accountId: rolledBack ? null : accountId,
      }
    }
    await markNeedLocalAttestation(accountId, cloudAccount.platform)
    return { outcome: OUTCOME.RESTORED, accountId, elapsedMs: now() - startedAt }
  }

  return { fetchCloudCredential, applyCredentialLocally, markNeedLocalAttestation, restoreToLocal }
}

module.exports = { createRestoreFlow }
