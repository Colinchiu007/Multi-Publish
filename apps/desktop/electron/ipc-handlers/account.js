// @ts-check
/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   authViewManager: import('../services/auth-view-manager'),
 *   pythonBridge: import('../services/python-bridge'),
 *   AccountManager: any,
 *   BACKEND_PLATFORMS: Set<string>,
 *   store?: { getSetting?: (key: string) => unknown },
 *   log: { info: Function, warn: Function, error: Function },
 *   BrowserWindow: typeof import('electron').BrowserWindow
 * }} deps
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { authViewManager, pythonBridge, AccountManager, BACKEND_PLATFORMS, log, BrowserWindow, store } = deps

  // R51 P1 修复：URL 路径段白名单校验，防止路径注入
  // 仅允许字母/数字/下划线/短横线，拒绝 / ? # .. 等路径操纵字符
  function _isSafePathSegment(s) {
    if (!s || typeof s !== 'string') return false
    return /^[a-zA-Z0-9_-]+$/.test(s)
  }

  const publicAccountFields = [
    'id', 'platform', 'name', 'account_name', 'avatar', 'avatar_url',
    'status', 'is_active', 'is_default', 'has_cookies', 'cookie_count',
    'has_auth_data', 'last_validated', 'created_at', 'updated_at', 'auth_method',
  ]

  function toPublicAccount(account) {
    const raw = account && typeof account === 'object' ? account : {}
    // 后端登录接口使用 account_id；统一映射后再经过字段白名单，避免把原始响应透传给渲染层。
    const source = {
      ...raw,
      id: raw.id ?? raw.account_id,
    }
    const safeAccount = {}
    for (const key of publicAccountFields) {
      if (source[key] !== undefined) safeAccount[key] = source[key]
    }
    const defaultId = store && typeof store.getSetting === 'function'
      ? store.getSetting(`default_account:${safeAccount.platform}`)
      : null
    return {
      ...safeAccount,
      account_name: safeAccount.account_name || safeAccount.name || '',
      status: safeAccount.status || (safeAccount.is_active === false ? 'inactive' : 'active'),
      is_default: Boolean(safeAccount.is_default) || String(defaultId) === String(safeAccount.id),
    }
  }

  ipcMain.handle('accounts:list', withSenderCheck(async () => {
    try {
      const response = await pythonBridge.requestBackend('GET', '/api/accounts')
      if (response?.code !== 0 || !Array.isArray(response.data)) {
        return { code: response?.code ?? EC.REQUEST_ERROR, message: response?.message || '获取账号列表失败', data: [] }
      }
      const data = response.data.map(toPublicAccount)
      return { code: 0, data }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: [] }
    }
  }))

  ipcMain.handle('auth:open-login', withSenderCheck(async (event, platform) => {
    try {
      // R51 P1：platform 用于 URL 拼接，必须校验
      if (!_isSafePathSegment(platform)) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform 参数' }
      if (BACKEND_PLATFORMS.has(platform)) {
        const result = await pythonBridge.requestBackend('POST', '/api/login', { platform }, 180000)
        if (result.code === 0) {
          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.send('auth:completed', { platform, accountId: result.data?.account_id })
          }
          return {
            code: 0,
            data: toPublicAccount({ ...result.data, platform: result.data?.platform || platform }),
            message: '登录成功',
          }
        }
        return { code: EC.REQUEST_ERROR, message: result.message || '登录失败' }
      }

      const result = await authViewManager.openLogin(platform)
      const savedAccount = await AccountManager.saveCapturedAccount(platform, result)
      const savedAccountId = savedAccount?.id || savedAccount?.accountId
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed() && savedAccountId) {
        win.webContents.send('auth:completed', { platform, accountId: savedAccountId })
      }
      return {
        code: 0,
        data: toPublicAccount({
          ...(savedAccount && typeof savedAccount === 'object' ? savedAccount : {}),
          platform,
          name: result.name,
        }),
        message: '账号添加成功',
      }
    } catch (e) {
      log.error('Auth', 'Login failed for ' + platform + ': ' + (e instanceof Error ? e.message : String(e)))
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('auth:login-silent', withSenderCheck(async (event, arg) => {
    try {
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform, accountId } = arg
      if (!_isSafePathSegment(platform) || !_isSafePathSegment(accountId)) {
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform/accountId 参数' }
      }
      if (Object.prototype.hasOwnProperty.call(arg, 'cookies') || Object.prototype.hasOwnProperty.call(arg, 'localStorage')) {
        return { code: EC.VALIDATION_ERROR, message: '禁止从渲染进程传递账号凭证' }
      }
      const credentials = AccountManager.loadSavedCredentials(accountId, platform)
      if (!credentials) return { code: 0, data: { valid: false, accountName: null } }
      const result = await authViewManager.loginSilent(platform, credentials.cookies, credentials.localStorage)
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: { valid: false, accountName: null } }
    }
  }))

  ipcMain.handle('auth:complete-login', withSenderCheck(async () => {
    try {
      await authViewManager.completeLogin()
      return { code: 0, data: true, message: '正在保存账号' }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('auth:close', withSenderCheck(async () => {
    try {
      authViewManager.close()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('account:add', withSenderCheck(async (event, platform) => {
    try {
      if (!_isSafePathSegment(platform)) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform 参数' }
      const account = await AccountManager.addAccount(platform)
      return { code: 0, data: toPublicAccount(account), message: '账号添加成功' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) } }
  }))

  ipcMain.handle('account:delete', withSenderCheck(async (event, accountId) => {
    try {
      // R51 P1：accountId 用于 URL 拼接，必须校验
      if (!_isSafePathSegment(accountId)) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 accountId 参数' }
      await AccountManager.deleteAccount(accountId)
      return { code: 0, data: true, message: '账号已删除' }
    }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) } }
  }))

  ipcMain.handle('account:check-login', withSenderCheck(async (event, arg) => {
    try {
      // R51 P1：解构保护 + platform 用于 URL 拼接必须校验
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform, accountId } = arg
      if (!_isSafePathSegment(platform) || !_isSafePathSegment(accountId)) {
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform/accountId 参数' }
      }
      const status = await AccountManager.checkLoginStatus(platform, accountId)
      return { code: 0, data: status }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: { valid: false } } }
  }))

  ipcMain.handle('account:list', withSenderCheck(async () => {
    try {
      const accounts = await AccountManager.listAccounts()
      return { code: 0, data: Array.isArray(accounts) ? accounts.map(toPublicAccount) : [] }
    }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: [] } }
  }))
}

module.exports = registerHandlers
