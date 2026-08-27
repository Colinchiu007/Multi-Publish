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

  // 统一 IPC 日志：账号管理路径（模块 AccountIPC），含平台/账号/耗时，敏感字段经 toPublicErrorValue 脱敏
  function ipcLog(level, channel, stage, detail) {
    if (log && typeof log[level] === 'function') {
      log[level]('AccountIPC', `${channel} ${stage}${detail ? ' :: ' + detail : ''}`)
    }
  }

  function safeAccountSummary(account) {
    if (!account || typeof account !== 'object') return 'account=<缺失>'
    const parts = []
    if (typeof account.id === 'string' && account.id) parts.push(`id=${account.id}`)
    if (typeof account.accountId === 'string' && account.accountId) parts.push(`accountId=${account.accountId}`)
    if (typeof account.platform === 'string' && account.platform) parts.push(`platform=${account.platform}`)
    if (typeof account.name === 'string' && account.name) parts.push(`name="${account.name.slice(0, 30)}"`)
    if (!parts.length) parts.push('无关键字段')
    return parts.join(' | ')
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
    const startedAt = Date.now()
    ipcLog('info', 'accounts:list', 'enter', `owner=${getOwnerSubject() ?? '<未登录>'}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'accounts:list', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      }
      const response = await pythonBridge.requestBackend('GET', '/api/accounts')
      if (response?.code !== 0 || !Array.isArray(response.data)) {
        ipcLog('warn', 'accounts:list', 'backend-failed', `code=${response?.code} message=${response?.message} 耗时=${Date.now() - startedAt}ms`)
        return { code: response?.code ?? EC.REQUEST_ERROR, message: response?.message || '获取账号列表失败', data: [] }
      }
      const data = response.data.map(toPublicAccount)
      ipcLog('info', 'accounts:list', 'ok', `count=${data.length} platforms=[${data.map((a) => a.platform).filter((v, i, arr) => arr.indexOf(v) === i).join(',')}] 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data }
    } catch (e) {
      ipcLog('error', 'accounts:list', 'error', `message=${e instanceof Error ? e.message : String(e)} 耗时=${Date.now() - startedAt}ms`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: [] }
    }
  }))

  ipcMain.handle('auth:open-login', withSenderCheck(async (event, platform) => {
    const startedAt = Date.now()
    ipcLog('info', 'auth:open-login', 'enter', `platform=${platform}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'auth:open-login', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      }
      // R51 P1：platform 用于 URL 拼接，必须校验
      if (!_isSafePathSegment(platform)) {
        ipcLog('warn', 'auth:open-login', 'validation-failed', `platform=${platform}`)
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform 参数' }
      }
      const result = await authViewManager.openLogin(platform)
      // 用户关闭登录页签/Esc 取消：控制信号而非凭证数据，不得进入保存流程，也不得弹错误
      if (result && typeof result === 'object' && result.cancelled === true) {
        ipcLog('info', 'auth:open-login', 'cancelled', `platform=${platform} 耗时=${Date.now() - startedAt}ms`)
        return { code: 0, cancelled: true, data: { cancelled: true }, message: '登录已取消' }
      }
      // 登录等待超时：返回明确超时错误，不保存凭证
      if (result && typeof result === 'object' && result.timeout === true) {
        ipcLog('warn', 'auth:open-login', 'timeout', `platform=${platform} 耗时=${Date.now() - startedAt}ms`)
        return { code: EC.TIMEOUT_ERROR, message: '登录超时，请重试' }
      }
      const savedAccount = await AccountManager.saveCapturedAccount(platform, result)
      const savedAccountId = savedAccount?.id || savedAccount?.accountId
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed() && savedAccountId) {
        win.webContents.send('auth:completed', { platform, accountId: savedAccountId })
      }
      ipcLog('info', 'auth:open-login', 'ok', `platform=${platform} accountId=${savedAccountId} 耗时=${Date.now() - startedAt}ms`)
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
      ipcLog('error', 'auth:open-login', 'error', `platform=${platform} message=${e instanceof Error ? e.message : String(e)} 耗时=${Date.now() - startedAt}ms`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('auth:login-silent', withSenderCheck(async (event, arg) => {
    const startedAt = Date.now()
    ipcLog('info', 'auth:login-silent', 'enter', `platform=${arg?.platform} accountId=${arg?.accountId}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'auth:login-silent', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      }
      if (!arg || typeof arg !== 'object') {
        ipcLog('warn', 'auth:login-silent', 'validation-failed', '缺少参数对象')
        return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      }
      const { platform, accountId } = arg
      if (!_isSafePathSegment(platform) || !_isSafePathSegment(accountId)) {
        ipcLog('warn', 'auth:login-silent', 'validation-failed', `platform=${platform} accountId=${accountId}`)
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform/accountId 参数' }
      }
      if (Object.prototype.hasOwnProperty.call(arg, 'cookies') || Object.prototype.hasOwnProperty.call(arg, 'localStorage')) {
        ipcLog('warn', 'auth:login-silent', 'validation-failed', '禁止从渲染进程传递账号凭证')
        return { code: EC.VALIDATION_ERROR, message: '禁止从渲染进程传递账号凭证' }
      }
      const credentials = AccountManager.loadSavedCredentials(accountId, platform)
      if (!credentials) {
        ipcLog('warn', 'auth:login-silent', 'no-credentials', `platform=${platform} accountId=${accountId} 耗时=${Date.now() - startedAt}ms`)
        return { code: 0, data: { valid: false, accountName: null } }
      }
      const result = await authViewManager.loginSilent(
        platform,
        credentials.cookies,
        credentials.localStorage,
        credentials.indexedDB,
      )
      ipcLog('info', 'auth:login-silent', 'ok', `platform=${platform} accountId=${accountId} valid=${result?.valid} 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: result }
    } catch (e) {
      ipcLog('error', 'auth:login-silent', 'error', `platform=${arg?.platform} accountId=${arg?.accountId} message=${e instanceof Error ? e.message : String(e)}`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: { valid: false, accountName: null } }
    }
  }))

  ipcMain.handle('auth:complete-login', withSenderCheck(async () => {
    const startedAt = Date.now()
    ipcLog('info', 'auth:complete-login', 'enter', '')
    try {
      await authViewManager.completeLogin()
      ipcLog('info', 'auth:complete-login', 'ok', `耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: true, message: '正在保存账号' }
    } catch (e) {
      ipcLog('error', 'auth:complete-login', 'error', `message=${e instanceof Error ? e.message : String(e)}`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('auth:close', withSenderCheck(async () => {
    const startedAt = Date.now()
    ipcLog('info', 'auth:close', 'enter', '')
    try {
      authViewManager.close()
      ipcLog('info', 'auth:close', 'ok', `耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: true }
    } catch (e) {
      ipcLog('error', 'auth:close', 'error', `message=${e instanceof Error ? e.message : String(e)}`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('account:add', withSenderCheck(async (event, platform) => {
    const startedAt = Date.now()
    ipcLog('info', 'account:add', 'enter', `platform=${platform}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'account:add', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      }
      if (!_isSafePathSegment(platform)) {
        ipcLog('warn', 'account:add', 'validation-failed', `platform=${platform}`)
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform 参数' }
      }
      const account = await AccountManager.addAccount(platform)
      ipcLog('info', 'account:add', 'ok', `${safeAccountSummary(account)} 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: toPublicAccount(account), message: '账号添加成功' }
    } catch (e) { ipcLog('error', 'account:add', 'error', `platform=${platform} message=${e instanceof Error ? e.message : String(e)}`); return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) } }
  }))

  ipcMain.handle('account:delete', withSenderCheck(async (event, accountId) => {
    const startedAt = Date.now()
    ipcLog('info', 'account:delete', 'enter', `accountId=${accountId}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'account:delete', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      }
      // R51 P1：accountId 用于 URL 拼接，必须校验
      if (!_isSafePathSegment(accountId)) {
        ipcLog('warn', 'account:delete', 'validation-failed', `accountId=${accountId}`)
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 accountId 参数' }
      }
      await AccountManager.deleteAccount(accountId)
      ipcLog('info', 'account:delete', 'ok', `accountId=${accountId} 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: true, message: '账号已删除' }
    }
    catch (e) { ipcLog('error', 'account:delete', 'error', `accountId=${accountId} message=${e instanceof Error ? e.message : String(e)}`); return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) } }
  }))

  ipcMain.handle('account:check-login', withSenderCheck(async (event, arg) => {
    const startedAt = Date.now()
    ipcLog('info', 'account:check-login', 'enter', `platform=${arg?.platform} accountId=${arg?.accountId}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'account:check-login', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: { valid: false } }
      }
      // R51 P1：解构保护 + platform 用于 URL 拼接必须校验
      if (!arg || typeof arg !== 'object') {
        ipcLog('warn', 'account:check-login', 'validation-failed', '缺少参数对象')
        return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      }
      const { platform, accountId } = arg
      if (!_isSafePathSegment(platform) || !_isSafePathSegment(accountId)) {
        ipcLog('warn', 'account:check-login', 'validation-failed', `platform=${platform} accountId=${accountId}`)
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 platform/accountId 参数' }
      }
      const status = await AccountManager.checkLoginStatus(platform, accountId)
      ipcLog('info', 'account:check-login', 'ok', `platform=${platform} accountId=${accountId} valid=${status?.valid} 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: status }
    } catch (e) { ipcLog('error', 'account:check-login', 'error', `platform=${arg?.platform} accountId=${arg?.accountId} message=${e instanceof Error ? e.message : String(e)}`); return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: { valid: false } } }
  }))

  ipcMain.handle('account:set-proxy', withSenderCheck(async (event, arg) => {
    const startedAt = Date.now()
    ipcLog('info', 'account:set-proxy', 'enter', `platform=${arg?.platform} accountId=${arg?.accountId}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'account:set-proxy', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      }
      if (!arg || typeof arg !== 'object') {
        ipcLog('warn', 'account:set-proxy', 'validation-failed', '缺少参数对象')
        return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      }
      const { accountId, platform, proxy } = arg
      if (!_isSafePathSegment(accountId) || !_isSafePathSegment(platform)) {
        ipcLog('warn', 'account:set-proxy', 'validation-failed', `platform=${platform} accountId=${accountId}`)
        return { code: EC.VALIDATION_ERROR, message: '缺少或非法 accountId/platform 参数' }
      }
      const status = await AccountManager.setAccountProxy(accountId, platform, proxy)
      const proxyConfigured = status?.configured === true
      if (!status || typeof status !== 'object') {
        ipcLog('warn', 'account:set-proxy', 'invalid-status', `platform=${platform} accountId=${accountId}`)
        return { code: EC.REQUEST_ERROR, message: '代理状态无效' }
      }
      ipcLog('info', 'account:set-proxy', 'ok', `platform=${platform} accountId=${accountId} configured=${proxyConfigured} 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data: status, message: proxyConfigured ? '账号代理已保存' : '账号代理已清除' }
    } catch (e) {
      ipcLog('error', 'account:set-proxy', 'error', `platform=${arg?.platform} accountId=${arg?.accountId} message=${e instanceof Error ? e.message : String(e)}`)
      return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }
    }
  }))

  ipcMain.handle('account:list', withSenderCheck(async () => {
    const startedAt = Date.now()
    ipcLog('info', 'account:list', 'enter', `owner=${getOwnerSubject() ?? '<未登录>'}`)
    try {
      if (getOwnerSubject() === null) {
        ipcLog('warn', 'account:list', 'auth-failed', '无法识别当前用户')
        return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      }
      const accounts = await AccountManager.listAccounts()
      const data = Array.isArray(accounts) ? accounts.map(toPublicAccount) : []
      ipcLog('info', 'account:list', 'ok', `count=${data.length} platforms=[${data.map((a) => a.platform).filter((v, i, arr) => arr.indexOf(v) === i).join(',')}] 耗时=${Date.now() - startedAt}ms`)
      return { code: 0, data }
    }
    catch (e) { ipcLog('error', 'account:list', 'error', `message=${e instanceof Error ? e.message : String(e)}`); return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e), data: [] } }
  }))
}

module.exports = registerHandlers
