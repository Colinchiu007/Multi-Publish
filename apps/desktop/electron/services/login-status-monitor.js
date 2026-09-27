// @ts-check
/**
 * login-status-monitor — 登录状态定期检测（PRD F1.3）
 *
 * 数据真源（登录态口径统一修复 2026-09-22）：
 *  - 读：account-manager.listAccounts() → Python 后端 accounts.json
 *       （历史实现读 Electron 本地 SQLite store.listAccounts()，两边 accountId
 *        不互通且只剩陈旧孤儿行，等于「检测了个不存在的账号列表」）；
 *  - 写：account-manager.persistLoginState() → 后端 PATCH /api/accounts/{id}
 *       （登录态唯一写者；历史实现 _store.updateAccount() 写进 SQLite，
 *        渲染层再从后端读，写进去的值永远读不到 —— 「一键检测不固化」根因）。
 *
 * 三态语义：checkLoginStatus 返回 valid === undefined 时落 'unverified'
 *（未确认），既不计入失效、也不冒充已登录。
 * 已 'expired' 的账号跳过自动检测（expired 粘滞，只能由手动检测或重新登录清除）。
 *
 * 默认间隔 30 分钟，可通过 opts.intervalMs 配置。
 */
const logger = require('./logger')
// 登录态单向证据规则的唯一实现（本模块曾自持一份 _loginStatusOf，是振荡的三个源头之一）
const { loginStatusTransition } = require('@multi-publish/shared-utils/src/login-state')
// 登录态真源写入的 per-account 串行锁：与 ipc-handlers/account.js、cloud-account-restore.js 同一把
const { withAccountStateLock } = require('./account-state-lock')

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000  // 30 分钟

function createLoginStatusMonitor (opts) {
  opts = opts || {}
  const _store = opts.store
  const _accountManager = opts.accountManager
  const _intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS
  // 取锁等待上限（默认走锁自身的 30s）：必须显式可注入，否则测试无法在秒级内证明
  // 「等锁超时不会把 _running 永久卡住」。
  const _lockWaitMs = Number(opts.lockWaitTimeoutMs) > 0 ? Number(opts.lockWaitTimeoutMs) : undefined
  const _getMainWin = opts.getMainWin

  let _timer = null
  let _startTimer = null
  let _running = false

  function start () {
    if (_timer) return
    if (!_store || !_accountManager) {
      logger.warn('LoginMonitor', 'store 或 accountManager 未注入，跳过启动')
      return
    }
    // 首次延迟 60s 启动，避免与应用启动抢资源
    _startTimer = setTimeout(_runOnce, 60 * 1000)
    // R28 修复：unref 让定时器不阻止进程退出
    if (_startTimer && _startTimer.unref) _startTimer.unref()
    _timer = setInterval(_runOnce, _intervalMs)
    _timer.unref && _timer.unref()
    logger.info('LoginMonitor', '登录状态定期检测已启动，间隔 ' + (_intervalMs / 60000) + ' 分钟')
  }

  function stop () {
    // m-2 修复：stop 时一并清理 _startTimer，避免 start 后 60s 内 stop 仍触发一次 _runOnce
    if (_startTimer) {
      clearTimeout(_startTimer)
      _startTimer = null
    }
    if (_timer) {
      clearInterval(_timer)
      _timer = null
    }
  }

  async function _runOnce () {
    if (_running) return // 防止重入
    if (!_store || !_store._ready) return
    if (!_accountManager || typeof _accountManager.listAccounts !== 'function') return
    _running = true
    try {
      // 账号真源 = 后端 accounts.json；store（SQLite）只用于就绪门禁，不再作为账号列表来源。
      const accounts = await _accountManager.listAccounts()
      if (!Array.isArray(accounts) || accounts.length === 0) return

      let expiredCount = 0
      let changedCount = 0
      for (const acc of accounts) {
        if (!acc || !acc.platform || !acc.id) continue
        // 仅检测「尚未确认失效」的账号：active / online / unverified / 后端无 status。
        // expired 属粘滞态，自动循环不擅自翻案，避免与手动一键检测结论互相拉扯。
        const current = acc.status
        if (current && current !== 'active' && current !== 'online' && current !== 'unverified') continue
        try {
          logger.info('LoginMonitor', 'checking ' + acc.platform + ':' + (acc.name || acc.account_name || acc.id) + ' (current status=' + (current || '?') + ')')
          // 整段（读凭证 → 检测 → 写结论）在 per-account 串行锁内：本模块由 setInterval 自己起来，
          // 不经过渲染层任何按钮，所以云端恢复覆盖凭证的窗口只能在这里挡。
          const turn = await withAccountStateLock(acc.id, () => _checkAndPersist(acc), { waitTimeoutMs: _lockWaitMs })
          if (!turn.persisted) continue
          changedCount++
          if (turn.next === 'expired') expiredCount++
          logger.info('LoginMonitor', '账号 ' + acc.platform + '/' + (acc.account_name || acc.id) + ' 登录态已固化为 ' + turn.next + (turn.result && turn.result.code ? ' code=' + turn.result.code : ''))
        } catch (e) {
          // 单个账号检测失败不影响整体；取锁等待超时也走这里（有界等待，绝不无限等）
          logger.warn('LoginMonitor', (e && e.code === 'ACCOUNT_LOCK_WAIT_TIMEOUT' ? '账号 ' + acc.id + ' 等锁超时，本轮跳过: ' : '账号 ' + acc.id + ' 检测异常: ') + (e && e.message ? e.message : String(e)))
        }
      }

      if (changedCount > 0) {
        logger.info('LoginMonitor', '本轮检测完成，' + changedCount + ' 个账号登录态发生变化已固化（其中 expired ' + expiredCount + ' 个）')
        // 通知前端刷新（恢复为 active 同样需要刷新，不能只在失效时通知）
        const win = _getMainWin && _getMainWin()
        if (win && !win.isDestroyed()) {
          win.webContents.send('account:status-changed', { expiredCount, changedCount })
        }
      }
    } catch (e) {
      logger.error('LoginMonitor', '登录状态检测循环异常: ' + e.message)
    } finally {
      _running = false
    }
  }

  /**
   * 一次「检测 → 判定 → 回写」的完整回合，整体处于该账号的串行锁内。
   * 返回 persisted=false 表示本轮不计数（无定论 / 结论未变 / 回写失败），失败原因各自已落日志。
   * @param {any} acc 真源快照（进入本轮循环时取到的那份）
   * @param {string|undefined} current 该快照的 status
   */
  async function _checkAndPersist (acc) {
    const result = await _accountManager.checkLoginStatus(acc.platform, acc.id)
    const definitive = Boolean(result && (result.valid === true || result.valid === false))
    let effective = acc
    // 单向证据规则：无定论（含超时/异常）返回 null = 本轮不改写真源，也不广播
    let next = _loginStatusTransition(result, acc)
    if (!definitive) {
      // 无定论时的「保持还是降级」取决于**此刻**的现状，而 `acc` 是取锁前拍的全量快照。
      // 期间别的写者（批量检测 / 云端恢复）可能已经改写结论：拿旧快照猜现状会把刚写下的
      // `expired` 覆盖成 `unverified` —— 负向证据被抹掉，正是「登录态只被正/负证据改写」的反例。
      const fresh = await _readCurrentRow(acc.id)
      if (fresh) {
        effective = fresh
        next = _loginStatusTransition(result, fresh)
      }
    }
    logger.info('LoginMonitor', 'result ' + acc.platform + ':' + acc.id + ' valid=' + (result && result.valid) + ' -> ' + next + ' code=' + (result && result.code) + (result && result.valid !== true ? ' error=' + ((result && (result.error || result.message)) || '') : ''))
    // 无新证据或结论未变都不回写：后者是原注释的既有约束，前者终结 active↔unverified 振荡
    if (next === null || next === effective.status) return { result, next, persisted: false }
    const validatedAt = new Date().toISOString()
    const persisted = await _persist(acc, next, validatedAt)
    if (!persisted || !persisted.ok) {
      logger.warn('LoginMonitor', '账号 ' + acc.platform + '/' + acc.id + ' 登录态固化失败 status=' + next + ' reason=' + ((persisted && persisted.reason) || 'unknown'))
      return { result, next, persisted: false }
    }
    return { result, next, persisted: true }
  }

  /**
   * 重读该账号在真源里的此刻状态（只在无定论分支调用，一次全量列表）。
   * 读不到就返回 null = 沿用旧快照，绝不因为"读失败"就猜一个值写进去。
   */
  async function _readCurrentRow (accountId) {
    try {
      const rows = await _accountManager.listAccounts()
      if (!Array.isArray(rows)) return null
      return rows.find((r) => r && r.id === accountId) || null
    } catch (e) {
      logger.warn('LoginMonitor', '重读真源现状失败 accountId=' + accountId + ' message=' + (e && e.message ? e.message : String(e)))
      return null
    }
  }

  /**
   * 本轮检测 → 应写入的登录态（null = 不改写）。现状与最近定论时间都取自真源快照，
   * 因此无定论时能保持 active/expired，超龄的 active 才降级。
   * @param {any} result
   * @param {object} acc 后端 accounts.json 的账号快照
   */
  function _loginStatusTransition (result, acc) {
    return loginStatusTransition({
      result,
      currentStatus: acc.status,
      lastValidated: acc.last_validated,
    })
  }

  /** 登录态唯一写者：失败不抛异常，返回 { ok, reason } 供上层记录。 */
  async function _persist (acc, status, validatedAt) {
    if (typeof _accountManager.persistLoginState !== 'function') {
      return { ok: false, reason: 'persistLoginState-unavailable' }
    }
    try {
      return await _accountManager.persistLoginState(acc.id, acc.platform, status, validatedAt)
    } catch (e) {
      return { ok: false, reason: 'persist-threw', message: e && e.message ? e.message : String(e) }
    }
  }

  return { start, stop, _runOnce }
}

module.exports = { createLoginStatusMonitor, DEFAULT_INTERVAL_MS }
