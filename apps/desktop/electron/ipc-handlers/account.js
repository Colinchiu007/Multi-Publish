// @ts-check
/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   authViewManager: import('../services/auth-view-manager'),
 *   pythonBridge: import('../services/python-bridge'),
 *   AccountManager: any,
 *   store?: { getSetting?: (key: string) => unknown },
 *   identityService?: { getState: () => unknown },
 *   log: { info: Function, warn: Function, error: Function },
 *   BrowserWindow: typeof import('electron').BrowserWindow
 * }} deps
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { toPublicProxyConfig } = require('../services/proxy-config')
  const { authViewManager, pythonBridge, AccountManager, log, BrowserWindow, store, identityService } = deps

  function getOwnerSubject () {
    if (!identityService) return undefined
    try {
      const state = identityService.getState()
      if (state && typeof state === 'object' && state.user && typeof state.user.sub === 'string' && state.user.sub.trim()) {
        return state.user.sub.trim()
      }
    } catch (_) { /* fail closed below */ }
    return null
  }

  // R51 P1 修复：URL 路径段白名单校验，防止路径注入
  // 仅允许字母/数字/下划线/短横线，拒绝 / ? # .. 等路径操纵字符
  function _isSafePathSegment(s) {
    if (!s || typeof s !== 'string') return false
    return /^[a-zA-Z0-9_-]+$/.test(s)
  }

  const publicAccountFields = [
    'id', 'platform', 'name', 'account_name', 'avatar', 'avatar_url',
    'status', 'is_active', 'is_default', 'has_cookies', 'cookie_count',
    'has_auth_data', 'last_validated', 'created_at', 'updated_at', 'last_used_at', 'auth_method',
    'followers', 'owner', 'publisher', 'last_login_check_at', 'login_check_error', 'status_reason',
  ]

  const publicAccountAliases = {
    followers: ['followers', 'follower_count', 'followers_count', 'fans', 'fans_count', 'fansCount', '粉丝数'],
    owner: ['owner', 'owner_name', 'ownerName', 'account_owner', 'accountOwner', '负责人'],
    publisher: ['publisher', 'publisher_name', 'publisherName', 'publishers', 'publisher_list', 'operator', 'operator_name', 'operatorName', '运营人', '发布人'],
    last_login_check_at: ['last_login_check_at', 'lastLoginCheckAt', 'login_checked_at', 'loginCheckedAt', 'last_checked_at', 'lastCheckedAt', 'checked_at', 'checkedAt'],
    login_check_error: ['login_check_error', 'loginCheckError', 'last_login_error', 'lastLoginError'],
    status_reason: ['status_reason', 'statusReason'],
    last_used_at: ['last_used_at', 'lastUsedAt', 'last_used', 'lastUsed'],
  }
  const publicErrorFields = new Set(['login_check_error', 'status_reason'])

  function toPublicMetadataValue(value) {
    if (value === null || value === undefined) return undefined
    if (Array.isArray(value)) {
      const items = value.map(toPublicMetadataValue).filter(item => item !== undefined)
      return items.length ? items : undefined
    }
    if (typeof value === 'string') return value.trim() || undefined
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value === 'boolean') return value
    if (!value || typeof value !== 'object') return undefined
    for (const key of ['name', 'label', 'nickname', 'value', 'count', 'text']) {
      const nested = toPublicMetadataValue(value[key])
      if (nested !== undefined) return nested
    }
    return undefined
  }

  function toPublicErrorValue(value) {
    const normalized = toPublicMetadataValue(value)
    if (Array.isArray(normalized)) return normalized.map(item => toPublicErrorValue(item))
    if (typeof normalized !== 'string') return normalized
    return normalized
      .replace(/((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|access[_-]?key|app[_-]?secret|session(?:[_-]?id)?|pwd|passwd|token|cookie|password|secret|authorization|令牌|密钥|密码)\s*[:=：]\s*)(?:Bearer\s+)?[^\s,;]+(?:,[^\s,;]+)*/gi, '$1***')
      .replace(/\bBearer\s+[A-Za-z0-9._~-]+(?:,[A-Za-z0-9._~-]+)*/gi, 'Bearer ***')
      .slice(0, 240)
  }

  function normalizePortValue(port) {
    if (typeof port === 'number') {
      const value = Number.isInteger(port) ? port : undefined
      return value !== undefined && value >= 1 && value <= 65535 ? value : undefined
    }
    if (typeof port === 'string' && /^\d+$/.test(port)) {
      const value = Number(port)
      return value >= 1 && value <= 65535 ? value : undefined
    }
    return undefined
  }

  function copyPublicMetadataAliases(source) {
    const normalized = { ...source }
    for (const [canonicalKey, aliases] of Object.entries(publicAccountAliases)) {
      for (const alias of aliases) {
        const value = publicErrorFields.has(canonicalKey)
          ? toPublicErrorValue(source[alias])
          : toPublicMetadataValue(source[alias])
        if (value !== undefined) {
          normalized[canonicalKey] = value
          break
        }
      }
    }
    return normalized
  }

  function toPublicAccount(account) {
    const raw = account && typeof account === 'object' ? account : {}
    // 统一映射后再经过字段白名单，避免把原始响应透传给渲染层。
    const source = copyPublicMetadataAliases({
      ...raw,
      id: raw.id ?? raw.account_id,
    })
    const safeAccount = {}
    for (const key of publicAccountFields) {
      if (source[key] !== undefined) safeAccount[key] = source[key]
    }
    const defaultAccountKey = `default_account:${safeAccount.platform}`
    // 已接入身份服务的 Store 必须只读取当前用户命名空间，不能回退到 legacy 全局值。
    const defaultId = store && typeof store.getUserSetting === 'function'
      ? store.getUserSetting(defaultAccountKey)
      : store && typeof store.getSetting === 'function'
        ? store.getSetting(defaultAccountKey)
        : null
    const publicAccount = {
      ...safeAccount,
      account_name: safeAccount.account_name || safeAccount.name || '',
      status: safeAccount.status || (safeAccount.is_active === false ? 'inactive' : 'active'),
      is_default: Boolean(safeAccount.is_default) || String(defaultId) === String(safeAccount.id),
    }
    if (raw.proxy !== undefined) {
      if (raw.proxy && typeof raw.proxy === 'object' && typeof raw.proxy.configured === 'boolean') {
        publicAccount.proxy = {
          configured: raw.proxy.configured,
          ...(typeof raw.proxy.type === 'string' ? { type: raw.proxy.type } : {}),
          ...(typeof raw.proxy.hostMasked === 'string' ? { hostMasked: raw.proxy.hostMasked } : {}),
          ...(() => { const port = normalizePortValue(raw.proxy.port); return port !== undefined ? { port } : {} })(),
          ...(raw.proxy.hasAuthentication === true ? { hasAuthentication: true } : {}),
          ...(raw.proxy.invalid === true ? { invalid: true } : {}),
        }
      } else {
        try { publicAccount.proxy = toPublicProxyConfig(raw.proxy) }
        catch (_) { publicAccount.proxy = { configured: true, invalid: true } }
      }
    }
    return publicAccount
  }

  ipcMain.handle('accounts:list', withSenderCheck(async () => {
    try {
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
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
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      // R51 P1：platform 用于 URL 拼接，必须校验
      if (!_isSafePathSegment(platform)) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform 参数' }
      const result = await authViewManager.openLogin(platform)
      // 用户关闭登录页签/Esc 取消：控制信号而非凭证数据，不得进入保存流程，也不得弹错误
      if (result && typeof result === 'object' && result.cancelled === true) {
        return { code: 0, cancelled: true, data: { cancelled: true }, message: '登录已取消' }
      }
      // 登录等待超时：返回明确超时错误，不保存凭证
      if (result && typeof result === 'object' && result.timeout === true) {
        return { code: EC.TIMEOUT_ERROR, message: '登录超时，请重试' }
      }
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
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
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
      const result = await authViewManager.loginSilent(
        platform,
        credentials.cookies,
        credentials.localStorage,
        credentials.indexedDB,
      )
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
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      if (!_isSafePathSegment(platform)) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform 参数' }
      const account = await AccountManager.addAccount(platform)
      return { code: 0, data: toPublicAccount(account), message: '账号添加成功' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) } }
  }))

  ipcMain.handle('account:delete', withSenderCheck(async (event, accountId) => {
    try {
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      // R51 P1：accountId 用于 URL 拼接，必须校验
      if (!_isSafePathSegment(accountId)) return { code: EC.VALIDATION_ERROR, message: '缺少或非法 accountId 参数' }
      await AccountManager.deleteAccount(accountId)
      return { code: 0, data: true, message: '账号已删除' }
    }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) } }
  }))

  ipcMain.handle('account:check-login', withSenderCheck(async (event, arg) => {
    try {
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: { valid: false } }
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

  ipcMain.handle('account:set-proxy', withSenderCheck(async (event, arg) => {
    try {
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { accountId, platform, proxy } = arg
      if (!_isSafePathSegment(accountId) || !_isSafePathSegment(platform)) {
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 accountId/platform 参数' }
      }
      const status = await AccountManager.setAccountProxy(accountId, platform, proxy)
      const proxyConfigured = status?.configured === true
      if (!status || typeof status !== 'object') return { code: EC.REQUEST_ERROR, message: '代理状态无效' }
      return { code: 0, data: status, message: proxyConfigured ? '账号代理已保存' : '账号代理已清除' }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('account:list', withSenderCheck(async () => {
    try {
      if (getOwnerSubject() === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      const accounts = await AccountManager.listAccounts()
      return { code: 0, data: Array.isArray(accounts) ? accounts.map(toPublicAccount) : [] }
    }
    catch (e) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: [] } }
  }))
}

module.exports = registerHandlers
