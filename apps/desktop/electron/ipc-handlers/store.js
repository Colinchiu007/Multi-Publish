// @ts-check
/**
 * Store IPC handlers
 *
 * 安全：写操作通过 withSenderCheck 校验来源，只读操作不加校验避免过度验证
 */
function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  const { store, credentialStore, accountStateRestorer, identityService, app, userDataDir } = deps

  function currentOwnerSubject() {
    if (!identityService) return undefined
    const state = identityService.getState()
    const subject = state && state.user && state.user.sub
    if (typeof subject !== 'string' || !subject.trim()) {
      const error = new Error('登录会话缺少用户标识')
      error.isOwnerAuthError = true
      throw error
    }
    return subject.trim()
  }

  function errorCode(error) {
    return error && error.isOwnerAuthError ? EC.AUTH_ERROR : EC.REQUEST_ERROR
  }

  function callStoreWithOwner(methodName, args) {
    const owner = currentOwnerSubject()
    return owner === undefined
      ? store[methodName](...args)
      : store[methodName](...args, owner)
  }

  function callStoreForOwner(methodName, args, owner) {
    return owner === undefined
      ? store[methodName](...args)
      : store[methodName](...args, owner)
  }

  function getUserSetting(key, defaultValue) {
    const owner = currentOwnerSubject()
    if (owner === undefined) return store.getSetting(key) ?? defaultValue
    if (typeof store.getUserSetting === 'function') {
      return store.getUserSetting(key, defaultValue, owner)
    }
    return store.getSetting(key) || defaultValue
  }

  function setUserSetting(key, value) {
    const owner = currentOwnerSubject()
    if (owner === undefined) {
      store.setSetting(key, value)
      return
    }
    if (typeof store.setUserSetting === 'function') {
      store.setUserSetting(key, value, owner)
      return
    }
    store.setSetting(key, value)
  }

  function credentialUserDataDir() {
    if (typeof userDataDir === 'string' && userDataDir) return userDataDir
    if (app && typeof app.getPath === 'function') return app.getPath('userData')
    return null
  }

  ipcMain.handle('store:add-account', withSenderCheck((_, account) => {
    try {
      const ok = callStoreWithOwner('addAccount', [account])
      return { code: ok ? 0 : EC.REQUEST_ERROR, data: ok }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:get-account', (_, id) => {
    try {
      const account = callStoreWithOwner('getAccount', [id])
      return { code: account ? 0 : EC.NOT_FOUND, data: account }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  })

  ipcMain.handle('store:list-accounts', (_, platform) => {
    try {
      return { code: 0, data: callStoreWithOwner('listAccounts', [platform]) }
    } catch (e) {
      return { code: errorCode(e), message: e.message, data: [] }
    }
  })

  ipcMain.handle('store:delete-account', withSenderCheck((_, id) => {
    try {
      const owner = currentOwnerSubject()
      const account = callStoreForOwner('getAccount', [id], owner)
      const deleted = callStoreForOwner('deleteAccount', [id], owner)
      if (account === null || deleted === false) return { code: EC.NOT_FOUND, data: false }
      // 修复 P2：级联清理凭证和登录状态（原仅删 accounts 表，孤儿数据残留）
      if (credentialStore && credentialStore.deleteCredential) {
        const targetUserDataDir = credentialUserDataDir()
        if (!targetUserDataDir) throw new Error('缺少 Electron userData 路径，无法安全删除凭证')
        try { credentialStore.deleteCredential(String(id), targetUserDataDir, owner) } catch (e) { /* best-effort */ }
      }
      if (account && account.platform && accountStateRestorer && accountStateRestorer.deleteAccountRecord) {
        try {
          accountStateRestorer.deleteAccountRecord(
            account.platform,
            String(id),
            owner,
            credentialUserDataDir(),
          )
        } catch (e) { /* best-effort */ }
      }
      return { code: 0, data: true }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:set-default-account', withSenderCheck((_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { platform, accountId } = arg
      const updated = callStoreWithOwner('setDefaultAccount', [platform, accountId])
      return updated === false
        ? { code: EC.NOT_FOUND, data: false }
        : { code: 0, data: true }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:get-default-account', (_, platform) => {
    try {
      const account = callStoreWithOwner('getDefaultAccount', [platform])
      return { code: account ? 0 : EC.NOT_FOUND, data: account }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  })

  ipcMain.handle('store:update-account', withSenderCheck((_, arg) => {
    try {
      // R51 P1：解构保护
      if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      const { id, fields } = arg
      const updated = callStoreWithOwner('updateAccount', [id, fields])
      return updated === false
        ? { code: EC.NOT_FOUND, data: false }
        : { code: 0, data: true }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:add-publish-record', withSenderCheck((_, record) => {
    try {
      const id = callStoreWithOwner('addPublishRecord', [record])
      return { code: id ? 0 : EC.REQUEST_ERROR, data: { id } }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:list-publish-history', (_, opts) => {
    try {
      return { code: 0, data: callStoreWithOwner('listPublishHistory', [opts]) }
    } catch (e) {
      return { code: errorCode(e), message: e.message, data: { total: 0, records: [] } }
    }
  })

  ipcMain.handle('store:get-publish-stats', () => {
    try {
      return { code: 0, data: callStoreWithOwner('getPublishStats', []) }
    } catch (e) {
      return { code: errorCode(e), message: e.message, data: { total: 0, success: 0, failed: 0, byPlatform: {} } }
    }
  })

  ipcMain.handle('store:add-scheduled-task', withSenderCheck((_, task) => {
    try {
      const id = callStoreWithOwner('addScheduledTask', [task])
      return { code: id ? 0 : EC.REQUEST_ERROR, data: { id } }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:list-scheduled-tasks', () => {
    try {
      return { code: 0, data: callStoreWithOwner('listScheduledTasks', []) }
    } catch (e) {
      return { code: errorCode(e), message: e.message, data: [] }
    }
  })

  ipcMain.handle('store:delete-task', withSenderCheck((_, id) => {
    try {
      const deleted = callStoreWithOwner('deleteTask', [id])
      return deleted === false
        ? { code: EC.NOT_FOUND, data: false }
        : { code: 0, data: true }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:get-setting', (_, key) => {
    try {
      return { code: 0, data: getUserSetting(key, null) }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  })

  ipcMain.handle('store:set-setting', withSenderCheck((_, key, value) => {
    try {
      setUserSetting(key, value)
      return { code: 0, data: true }
    } catch (e) {
      return { code: errorCode(e), message: e.message }
    }
  }))

  ipcMain.handle('store:list-callback-logs', (_, limit) => {
    try {
      return { code: 0, data: store.listCallbackLogs(limit) }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  // ─── 草稿箱 IPC handlers（蚁小二复用）─────────────────
  ipcMain.handle('draftSave', withSenderCheck((_, draft) => {
    try {
      // 草稿存储在 store settings 中（JSON 数组）
      const raw = getUserSetting('drafts', []) || []
      const drafts = typeof raw === 'string' ? JSON.parse(raw) : raw
      const idx = drafts.findIndex(d => d.id === draft.id)
      if (idx >= 0) {
        drafts[idx] = { ...draft, updatedAt: new Date().toISOString() }
      } else {
        drafts.push({ ...draft, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      }
      setUserSetting('drafts', JSON.stringify(drafts))
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))

  ipcMain.handle('draftList', () => {
    try {
      const raw = getUserSetting('drafts', []) || []
      const drafts = typeof raw === 'string' ? JSON.parse(raw) : raw
      return { code: 0, data: drafts }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: [] }
    }
  })

  ipcMain.handle('draftDelete', withSenderCheck((_, draftId) => {
    try {
      const raw = getUserSetting('drafts', []) || []
      const drafts = typeof raw === 'string' ? JSON.parse(raw) : raw
      const filtered = drafts.filter(d => d.id !== draftId)
      setUserSetting('drafts', JSON.stringify(filtered))
      return { code: 0, data: true }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message }
    }
  }))
}

module.exports = registerHandlers
