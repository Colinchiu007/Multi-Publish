// @ts-check
/**
 * login-status-monitor — 登录状态定期检测（PRD F1.3）
 *
 * 定期遍历 store 中的 accounts，调用 account-manager.checkLoginStatus
 * 检测 Cookie 是否过期。过期的账号 status 标记为 'expired'。
 *
 * 默认间隔 30 分钟，可通过 opts.intervalMs 配置。
 */
const logger = require('./logger')

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000  // 30 分钟

function createLoginStatusMonitor (opts) {
  opts = opts || {}
  const _store = opts.store
  const _accountManager = opts.accountManager
  const _intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS
  const _getMainWin = opts.getMainWin

  let _timer = null
  let _running = false

  function start () {
    if (_timer) return
    if (!_store || !_accountManager) {
      logger.warn('LoginMonitor', 'store 或 accountManager 未注入，跳过启动')
      return
    }
    // 首次延迟 60s 启动，避免与应用启动抢资源
    const _startTimer = setTimeout(_runOnce, 60 * 1000)
    // R28 修复：unref 让定时器不阻止进程退出
    if (_startTimer && _startTimer.unref) _startTimer.unref()
    _timer = setInterval(_runOnce, _intervalMs)
    _timer.unref && _timer.unref()
    logger.info('LoginMonitor', '登录状态定期检测已启动，间隔 ' + (_intervalMs / 60000) + ' 分钟')
  }

  function stop () {
    if (_timer) {
      clearInterval(_timer)
      _timer = null
    }
  }

  async function _runOnce () {
    if (_running) return  // 防止重入
    if (!_store || !_store._ready) return
    _running = true
    try {
      const accounts = _store.listAccounts()
      if (!accounts || accounts.length === 0) return

      let expiredCount = 0
      for (const acc of accounts) {
        try {
          // 仅检测 active 状态的账号，避免对已失效账号重复检测
          if (acc.status && acc.status !== 'active' && acc.status !== 'online') continue
          const result = await _accountManager.checkLoginStatus(acc.platform, acc.id)
          if (result && !result.valid) {
            _store.updateAccount(acc.id, { status: 'expired' })
            expiredCount++
            logger.warn('LoginMonitor', '账号 ' + acc.platform + '/' + (acc.account_name || acc.id) + ' Cookie 已过期：' + result.message)
          }
        } catch (e) {
          // 单个账号检测失败不影响整体
          logger.debug('LoginMonitor', '账号 ' + acc.id + ' 检测异常: ' + e.message)
        }
      }

      if (expiredCount > 0) {
        logger.info('LoginMonitor', '本轮检测完成，' + expiredCount + ' 个账号 Cookie 过期已标记')
        // 通知前端刷新
        const win = _getMainWin && _getMainWin()
        if (win && !win.isDestroyed()) {
          win.webContents.send('account:status-changed', { expiredCount })
        }
      }
    } catch (e) {
      logger.error('LoginMonitor', '登录状态检测循环异常: ' + e.message)
    } finally {
      _running = false
    }
  }

  return { start, stop, _runOnce }
}

module.exports = { createLoginStatusMonitor, DEFAULT_INTERVAL_MS }
