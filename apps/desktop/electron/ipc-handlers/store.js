// @ts-check
/**
 * Store IPC handlers
 *
 * 安全：所有渲染进程入口都校验来源，账号查询只返回公开字段。
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { app, store, pythonBridge, identityService } = deps
  const log = deps.log || require('../services/logger')
  const credentialStore = deps.credentialStore || deps.AccountManager?.credentialStore
  const accountStateRestorer = deps.accountStateRestorer || deps.AccountManager?.accountStateRestorer
  const MAX_DRAFTS_BYTES = 2 * 1024 * 1024
  const MAX_DRAFT_ID_LENGTH = 128
  const publicAccountFields = [
    'id', 'platform', 'name', 'account_name', 'username', 'avatar', 'avatar_url',
    'status', 'is_active', 'is_default', 'has_cookies', 'cookie_count',
    'has_auth_data', 'last_validated', 'created_at', 'updated_at', 'auth_method',
  ]
  const rendererAccountUpdateFields = new Set([
    'name', 'account_name', 'avatar', 'avatar_url', 'status', 'is_default',
  ])
  const rendererAccountCreateFields = new Set([
    'id', 'platform', 'name', 'avatar', 'status',
  ])

  /**
   * 从 identityService 提取当前登录用户的 sub（owner_subject）
   * @returns {string|undefined|null}
   *   - string: 当前用户 sub
   *   - undefined: identityService 不存在（legacy 模式，不隔离）
   *   - null: identityService 存在但 sub 缺失（应拒绝访问）
   */
  function _getOwnerSubject() {
    if (!identityService) return undefined
    try {
      const state = identityService.getState()
      if (state && state.user && state.user.sub) return state.user.sub
    } catch (_) { void _ }
    return null
  }

  function requestFailure(operation, error, publicMessage = '请求处理失败') {
    const detail = error && error.message ? error.message : String(error)
    try {
      if (log && typeof log.warn === 'function') log.warn('StoreIPC', `${operation} failed: ${detail}`)
    } catch (_) { /* 日志失败不得覆盖原始请求结果 */ }
    return publicMessage
  }

  function readDraftArray(raw) {
    if (Array.isArray(raw)) return raw.slice()
    if (typeof raw !== 'string' || !raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (_) {
      return []
    }
  }

  function normalizeDraftId(value) {
    if (typeof value !== 'string') return null
    const id = value.trim()
    if (!id || id.length > MAX_DRAFT_ID_LENGTH || /[\u0000-\u001F\u007F]/.test(id)) return null
    return id
  }

  function normalizeDraft(draft) {
    if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null
    const id = normalizeDraftId(draft.id)
    if (!id) return null
    try {
      JSON.stringify(draft)
    } catch (_) {
      return null
    }
    return { ...draft, id }
  }

  function isDraftCollectionWithinLimit(drafts) {
    try {
      return Buffer.byteLength(JSON.stringify(drafts), 'utf8') <= MAX_DRAFTS_BYTES
    } catch (_) {
      return false
    }
  }

  function getDrafts(owner) {
    if (owner !== undefined) {
      if (typeof store.getUserSetting !== 'function') {
        throw new Error('用户隔离草稿存储不可用')
      }
      return readDraftArray(store.getUserSetting('drafts', [], owner))
    }
    return readDraftArray(typeof store.getSetting === 'function' ? store.getSetting('drafts') : [])
  }

  function saveDrafts(owner, drafts) {
    if (owner !== undefined) {
      if (typeof store.setUserSetting !== 'function') {
        throw new Error('用户隔离草稿存储不可用')
      }
      store.setUserSetting('drafts', drafts, owner)
      return
    }
    if (typeof store.setSetting === 'function') store.setSetting('drafts', drafts)
  }

  function toRendererAccountCreate(account) {
    if (!account || typeof account !== 'object' || Array.isArray(account)) return null
    // owner_subject 由主进程身份上下文注入；兼容旧客户端携带该字段，但绝不信任其值。
    const entries = Object.entries(account).filter(([key]) => key !== 'owner_subject')
    if (entries.some(([key]) => !rendererAccountCreateFields.has(key))) return null
    return Object.fromEntries(entries)
  }

  function toPublicAccount(account) {
    const source = account && typeof account === 'object' ? account : {}
    const safeAccount = {}
    for (const key of publicAccountFields) {
      if (source[key] !== undefined) safeAccount[key] = source[key]
    }
    if (Object.prototype.hasOwnProperty.call(source, 'cookies')) {
      const cookies = Array.isArray(source.cookies) ? source.cookies : []
      safeAccount.has_cookies = cookies.length > 0
      safeAccount.cookie_count = cookies.length
    }
    if (Object.prototype.hasOwnProperty.call(source, 'localStorage')) {
      const localStorageData = source.localStorage
      safeAccount.has_auth_data = Boolean(
        localStorageData && typeof localStorageData === 'object' && Object.keys(localStorageData).length > 0,
      )
    }
    return {
      ...safeAccount,
      account_name: safeAccount.account_name || safeAccount.name || '',
      status: safeAccount.status || (safeAccount.is_active === false ? 'inactive' : 'active'),
      is_default: Boolean(safeAccount.is_default),
    }
  }

  function getUserDataDir() {
    if (typeof deps.userDataDir === 'string' && deps.userDataDir) return deps.userDataDir
    try { return app && typeof app.getPath === 'function' ? app.getPath('userData') : null } catch (_) { return null }
  }

  ipcMain.handle('store:add-account', withSenderCheck((_, account) => {
    try {
      const safeAccount = toRendererAccountCreate(account)
      if (!safeAccount) {
        return { code: EC.VALIDATION_ERROR, message: '账号创建仅支持公开字段' }
      }
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      if (owner !== undefined) {
        const ok = store.addAccount(safeAccount, owner)
        return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok }
      }
      const ok = store.addAccount(safeAccount)
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:add-account', e) }
    }
  }))

  ipcMain.handle('store:get-account', withSenderCheck((_, id) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const account = owner !== undefined ? store.getAccount(id, owner) : store.getAccount(id)
      return { code: account ? 0 : EC.NOT_FOUND, data: account ? toPublicAccount(account) : null }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:get-account', e) }
    }
  }))

  ipcMain.handle('store:list-accounts', withSenderCheck((_, platform) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      const accounts = owner !== undefined ? store.listAccounts(platform, owner) : store.listAccounts(platform)
      return { code: 0, data: accounts.map(toPublicAccount) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:list-accounts', e), data: [] }
    }
  }))

  ipcMain.handle('store:delete-account', withSenderCheck((_, id) => {
    try {
      if (id === null || id === undefined || id === '') {
        return { code: EC.VALIDATION_ERROR, message: '账号不能为空' }
      }
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const account = owner !== undefined ? store.getAccount(id, owner) : store.getAccount(id)
      if (!account) return { code: EC.NOT_FOUND, message: '账号不存在' }
      const platform = account.platform || ''
      const userDataDir = getUserDataDir()
      if (credentialStore && credentialStore.deleteCredential) {
        if (!userDataDir) return { code: EC.REQUEST_ERROR, message: '无法解析账号凭据目录' }
        const hasCredential = typeof credentialStore.hasCredential === 'function'
          ? credentialStore.hasCredential(id, userDataDir, owner === undefined ? undefined : owner)
          : true
        const deleteArgs = owner !== undefined ? [id, userDataDir, owner] : [id, userDataDir]
        if (hasCredential && credentialStore.deleteCredential(...deleteArgs) !== true) {
          return { code: EC.REQUEST_ERROR, message: '删除账号加密凭据失败' }
        }
      }
      const deleted = owner !== undefined ? store.deleteAccount(id, owner) : store.deleteAccount(id)
      if (!deleted) return { code: EC.REQUEST_ERROR, message: '删除账号失败' }
      if (accountStateRestorer && accountStateRestorer.deleteAccountRecordsById) {
        try {
          if (owner !== undefined) accountStateRestorer.deleteAccountRecordsById(id, owner)
          else accountStateRestorer.deleteAccountRecordsById(id)
        } catch (e) { /* 公开状态清理不覆盖删除结果 */ }
      } else if (accountStateRestorer && accountStateRestorer.deleteAccountRecord) {
        try {
          if (owner !== undefined) {
            accountStateRestorer.deleteAccountRecord(platform, id, owner, userDataDir)
          } else {
            accountStateRestorer.deleteAccountRecord(platform, id)
          }
        } catch (e) { /* 兼容旧实现 */ }
      }
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:delete-account', e) }
    }
  }))

  ipcMain.handle('store:set-default-account', withSenderCheck(async (_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform, accountId } = arg
      if (typeof platform !== 'string' || !platform.trim() || accountId === null || accountId === undefined || accountId === '') {
        return { code: EC.VALIDATION_ERROR, message: '平台和账号不能为空' }
      }
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const updated = owner !== undefined
        ? store.setDefaultAccount(platform, accountId, owner)
        : store.setDefaultAccount(platform, accountId)
      if (!updated) {
        if (!pythonBridge || typeof pythonBridge.requestBackend !== 'function') {
          return { code: EC.VALIDATION_ERROR, message: '账号不存在或不属于指定平台' }
        }
        const response = await pythonBridge.requestBackend('GET', '/api/accounts')
        const matched = response?.code === 0 && Array.isArray(response.data) && response.data.some(account =>
          String(account.id) === String(accountId) && account.platform === platform
        )
        if (!matched) return { code: EC.VALIDATION_ERROR, message: '账号不存在或不属于指定平台' }
      }
      if (owner !== undefined && typeof store.setUserSetting === 'function') {
        store.setUserSetting(`default_account:${platform}`, String(accountId), owner)
      } else if (typeof store.setSetting === 'function') {
        store.setSetting(`default_account:${platform}`, String(accountId))
      }
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:set-default-account', e) }
    }
  }))

  ipcMain.handle('store:get-default-account', withSenderCheck((_, platform) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const account = owner !== undefined ? store.getDefaultAccount(platform, owner) : store.getDefaultAccount(platform)
      return { code: account ? 0 : EC.NOT_FOUND, data: account ? toPublicAccount(account) : null }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:get-default-account', e) }
    }
  }))

  ipcMain.handle('store:update-account', withSenderCheck((_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id, fields } = arg
      if (id === null || id === undefined || id === '') return { code: EC.VALIDATION_ERROR, message: '账号不能为空' }
      if (!fields || typeof fields !== 'object' || Array.isArray(fields) || Object.keys(fields).length === 0) {
        return { code: EC.VALIDATION_ERROR, message: '缺少可更新字段' }
      }
      const safeFields = Object.fromEntries(
        Object.entries(fields).filter(([key]) => rendererAccountUpdateFields.has(key)),
      )
      if (Object.keys(safeFields).length === 0) {
        return { code: EC.VALIDATION_ERROR, message: '没有可更新的账号字段' }
      }
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const account = owner !== undefined ? store.getAccount(id, owner) : store.getAccount(id)
      if (!account) return { code: EC.NOT_FOUND, message: '账号不存在' }
      const updated = owner !== undefined
        ? store.updateAccount(id, safeFields, owner)
        : store.updateAccount(id, safeFields)
      if (!updated) return { code: EC.VALIDATION_ERROR, message: '没有可更新的账号字段' }
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:update-account', e) }
    }
  }))

  ipcMain.handle('store:add-publish-record', withSenderCheck((_, record) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const id = owner !== undefined ? store.addPublishRecord(record, owner) : store.addPublishRecord(record)
      return { code: id ? 0 : EC.REQUEST_ERROR, data: { id } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:add-publish-record', e) }
    }
  }))

  ipcMain.handle('store:list-publish-history', withSenderCheck((_, opts) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: { total: 0, records: [] } }
      const result = owner !== undefined ? store.listPublishHistory(opts, owner) : store.listPublishHistory(opts)
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:list-publish-history', e), data: { total: 0, records: [] } }
    }
  }))

  ipcMain.handle('store:get-publish-stats', withSenderCheck(() => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: { total: 0, success: 0, failed: 0, byPlatform: {} } }
      const result = owner !== undefined ? store.getPublishStats(owner) : store.getPublishStats()
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:get-publish-stats', e), data: { total: 0, success: 0, failed: 0, byPlatform: {} } }
    }
  }))

  ipcMain.handle('store:add-scheduled-task', withSenderCheck((_, task) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const id = owner !== undefined ? store.addScheduledTask(task, owner) : store.addScheduledTask(task)
      return { code: id ? 0 : EC.REQUEST_ERROR, data: { id } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:add-scheduled-task', e) }
    }
  }))

  ipcMain.handle('store:list-scheduled-tasks', withSenderCheck(() => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      const tasks = owner !== undefined ? store.listScheduledTasks(owner) : store.listScheduledTasks()
      return { code: 0, data: tasks }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:list-scheduled-tasks', e), data: [] }
    }
  }))

  ipcMain.handle('store:delete-task', withSenderCheck((_, id) => {
    try {
      if (id === null || id === undefined || id === '') {
        return { code: EC.VALIDATION_ERROR, message: '任务 ID 不能为空' }
      }
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      let deleted
      if (owner !== undefined) {
        deleted = store.deleteTask(id, owner)
      } else {
        deleted = store.deleteTask(id)
      }
      if (!deleted) {
        if (owner !== undefined) return { code: EC.NOT_FOUND, data: false, message: '定时任务不存在' }
        return { code: EC.NOT_FOUND, message: '定时任务不存在' }
      }
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:delete-task', e) }
    }
  }))

  ipcMain.handle('store:get-setting', withSenderCheck((_, key) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      if (owner !== undefined && typeof store.getUserSetting === 'function') {
        return { code: 0, data: store.getUserSetting(key, null, owner) }
      }
      return { code: 0, data: store.getSetting(key) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:get-setting', e) }
    }
  }))

  ipcMain.handle('store:set-setting', withSenderCheck((_, key, value) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      if (owner !== undefined && typeof store.setUserSetting === 'function') {
        store.setUserSetting(key, value, owner)
      } else {
        store.setSetting(key, value)
      }
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:set-setting', e) }
    }
  }))

  ipcMain.handle('store:list-callback-logs', withSenderCheck((_, limit) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      const data = owner !== undefined ? store.listCallbackLogs(limit, owner) : store.listCallbackLogs(limit)
      return { code: 0, data }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('store:list-callback-logs', e), data: [] }
    }
  }))

  // ─── 草稿箱 IPC handlers（蚁小二复用）─────────────────
  ipcMain.handle('draftSave', withSenderCheck((_, draft) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
        return { code: EC.VALIDATION_ERROR, message: '草稿格式无效' }
      }
      const normalizedDraft = normalizeDraft(draft)
      if (!normalizedDraft) {
        return { code: EC.VALIDATION_ERROR, message: draft.id === undefined ? '草稿 ID 无效' : '草稿格式无效' }
      }
      const drafts = getDrafts(owner)
      const now = new Date().toISOString()
      const idx = drafts.findIndex(item => item && item.id === normalizedDraft.id)
      if (idx >= 0) {
        drafts[idx] = { ...drafts[idx], ...normalizedDraft, updatedAt: now }
      } else {
        drafts.push({ ...normalizedDraft, createdAt: now, updatedAt: now })
      }
      if (!isDraftCollectionWithinLimit(drafts)) {
        return { code: EC.VALIDATION_ERROR, message: '草稿内容过大' }
      }
      saveDrafts(owner, drafts)
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('draftSave', e, '草稿保存失败') }
    }
  }))

  ipcMain.handle('draftList', withSenderCheck(() => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: [] }
      return { code: 0, data: getDrafts(owner) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('draftList', e, '草稿读取失败'), data: [] }
    }
  }))

  ipcMain.handle('draftDelete', withSenderCheck((_, draftId) => {
    try {
      const owner = _getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const id = normalizeDraftId(draftId)
      if (!id) return { code: EC.VALIDATION_ERROR, message: '草稿 ID 无效' }
      const filtered = getDrafts(owner).filter(item => item && item.id !== id)
      saveDrafts(owner, filtered)
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: requestFailure('draftDelete', e, '草稿删除失败') }
    }
  }))
}

module.exports = registerHandlers

