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
// 登录态真源写入的 per-account 串行锁：与 login-status-monitor / ipc-handlers/account.js 同一把。
// 恢复侧是「改数据」的那一侧，锁必须包住「覆盖凭证 + 打回 unverified」整段。
const { withAccountStateLock } = require('./account-state-lock')

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

  /**
   * 把一份凭证落到本机（覆盖同名账号的本机凭证），并强制本机自证。
   *
   * 覆盖凭证 + 回写 unverified **必须落在同一个 per-account 串行临界区里**：否则一次基于旧凭证、
   * 仍在途的检测会把刚打回的 unverified 重新写成 active，本机这份从未验证过的凭证就显示已登录。
   * 收尾的本机检测排队 MUST 留在临界区之外——它走同一把锁去检测同一个账号，写进来即自死锁
   * （`cloud-account-restore.test.js` 用 `accountStateLockHeld` 当场断言它在锁外，重构时别挪）。
   */
  async function applyCredentialLocally (subject, accountId, credential, platform) {
    const written = await withAccountStateLock(accountId, async () => {
      try {
        await Promise.resolve(credentialStore.saveCredential(accountId, credential, userDataDir, subject))
      } catch (e) {
        log('warn', 'credential-apply-failed', `platform=${platform} accountId=${accountId} message=${errorMessage(e)}`)
        return 'CREDENTIAL_PERSIST_FAILED'
      }
      // 状态回写失败**不能算这次覆盖成功**：真源里可能还留着上一次的 active，于是"本机这份从未
      // 验证过的凭证"继续显示已登录——正是本锁要消灭的那个形态。AGENTS.md 也写着固化失败不得冒充。
      return (await markRestoredStatus(accountId, platform)) ? '' : 'RESTORE_STATUS_PERSIST_FAILED'
    })
    if (written) return { applied: false, code: written, queuedCheck: false }
    const queuedCheck = await queueLocalAttestation(accountId, platform)
    return { applied: true, code: '', queuedCheck }
  }

  /**
   * 恢复到本机 / 被云端凭证覆盖后的统一状态回写：status 强制 unverified（不继承云端结论），
   * last_validated 取本机此刻。
   *
   * ⚠️ 参数口径必须与 `AccountManager.persistLoginState(accountId, platform, status, validatedAt)`
   * 的**位置签名**一致。本仓曾按 `{status, lastValidated}` 对象形调用：真实现把第二个实参当 platform、
   * 第三个（undefined）当 status，一律判 `invalid-status` 直接返回而不写后端，又因返回值被丢弃而
   * 只在异常时才落日志 —— 于是「恢复即 unverified」这条契约在生产里从未生效，而测试夹具
   * （`cloud-account-sync.test.js` 的 `persistLoginState: (accountId, patch)`）把同一个错误形状
   * 断言成了契约，全绿躺了一整轮。失败现在必须出声（依据 AGENTS.md「固化失败不得冒充成功」）。
   */
  async function markRestoredStatus (accountId, platform) {
    let result
    try {
      result = await Promise.resolve(AccountManager.persistLoginState(
        accountId, platform, 'unverified', new Date(now()).toISOString(),
      ))
    } catch (e) {
      log('warn', 'restore-status-failed', `platform=${platform} accountId=${accountId} message=${errorMessage(e)}`)
      return false
    }
    if (!result || result.ok !== true) {
      log('warn', 'restore-status-failed', `platform=${platform} accountId=${accountId} reason=${(result && result.reason) || 'unknown'}`)
      return false
    }
    return true
  }

  /**
   * 恢复后排一次本机自证检测（锁外调用，理由见 applyCredentialLocally）。
   * 返回**是否真的排上了**：生产接线目前没注入 `queueLoginCheck`
   * （`ipc-handlers/cloud-account.js` 未传），所以 `false` 是常态——恢复后的自证由下一次
   * 定期检测（默认 30 分钟）收口。摘要里的 `queuedCheck` 必须如实反映这一点，
   * 拿 restored 数充当它等于界面在凭空许诺"已安排检测"。
   */
  async function queueLocalAttestation (accountId, platform) {
    if (typeof queueLoginCheck !== 'function') return false
    try {
      await Promise.resolve(queueLoginCheck(accountId, { platform, reason: 'cloud-restored' }))
      return true
    } catch (e) {
      log('warn', 'restore-check-queue-failed', `accountId=${accountId} message=${errorMessage(e)}`)
      return false
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
    // 顺序不可颠倒：凭证未落盘不得声称该账号可用（AGENTS.md 固化顺序）。
    // 与 applyCredentialLocally 共用同一把 per-account 锁，回滚留在锁外（它不写登录态真源）。
    const written = await withAccountStateLock(accountId, async () => {
      try {
        await Promise.resolve(credentialStore.saveCredential(accountId, credential, userDataDir, subject))
      } catch (e) {
        log('warn', 'restore-credential-failed', `platform=${cloudAccount.platform} accountId=${accountId} message=${errorMessage(e)}`)
        return 'CREDENTIAL_PERSIST_FAILED'
      }
      return (await markRestoredStatus(accountId, cloudAccount.platform)) ? '' : 'RESTORE_STATUS_PERSIST_FAILED'
    })
    if (written) {
      // 回滚：不留"有账号无凭证"的僵尸（它会永久占住合并键，使那一份云端凭证再也恢复不到）。
      // 状态没写成同样属于半成功——该账号既没被本机自证、真源里也没有可信结论，
      // 报失败比报"恢复成功但状态未知"诚实，用户重试也比继续用更安全。
      const rolledBack = await rollbackCreated(subject, accountId, cloudAccount)
      return {
        outcome: OUTCOME.FAILED,
        code: written,
        // 回滚失败时才把 accountId 带出去（本机确实还残留一个账号，排障需要它）
        accountId: rolledBack ? null : accountId,
      }
    }
    const queuedCheck = await queueLocalAttestation(accountId, cloudAccount.platform)
    return { outcome: OUTCOME.RESTORED, accountId, queuedCheck, elapsedMs: now() - startedAt }
  }

  return { fetchCloudCredential, applyCredentialLocally, restoreToLocal }
}

module.exports = { createRestoreFlow }
