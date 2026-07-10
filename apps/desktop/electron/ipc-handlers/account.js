// @ts-check
/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{
 *   authViewManager: import('../services/auth-view-manager'),
 *   pythonBridge: import('../services/python-bridge'),
 *   AccountManager: any,
 *   BACKEND_PLATFORMS: Set<string>,
 *   log: { info: Function, warn: Function, error: Function },
 *   BrowserWindow: typeof import('electron').BrowserWindow
 * }} deps
 */
function registerHandlers(ipcMain, deps) {
  const { authViewManager, pythonBridge, AccountManager, BACKEND_PLATFORMS, log, BrowserWindow } = deps

  ipcMain.handle('accounts:list', async () => {
    try {
      return await pythonBridge.requestBackend('GET', '/api/accounts')
    } catch (e) {
      return { code: -1, message: e instanceof Error ? e.message : String(e), data: [] }
    }
  })

  ipcMain.handle('auth:open-login', async (event, platform) => {
    try {
      if (BACKEND_PLATFORMS.has(platform)) {
        const result = await pythonBridge.requestBackend('POST', '/api/login', { platform }, 180000)
        if (result.code === 0) {
          const win = BrowserWindow.getAllWindows()[0]
          if (win && !win.isDestroyed()) {
            win.webContents.send('auth:completed', { platform, accountId: result.data?.account_id })
          }
          return { code: 0, data: result.data, message: '登录成功' }
        }
        return { code: -1, message: result.message || '登录失败' }
      }

      const result = await authViewManager.openLogin(platform)
      const saveResult = await pythonBridge.requestBackend('POST', '/api/accounts', {
        platform,
        name: result.name,
        cookies: result.cookies,
        auth_data: {
          cookies: result.cookies,
          localStorage: result.localStorage || {},
          indexedDB: result.indexedDB || {},
        },
      })
      if (saveResult.code !== 0) {
        throw new Error(saveResult.message || '保存账号失败')
      }

      if (platform === 'bilibili' || platform === 'douyin') {
        try {
          // 安全：orchestratorUrl 必须显式配置，不再硬编码生产 IP
          const orchestratorUrl = process.env.ORCHESTRATOR_URL || ''
          const token = process.env.ORCHESTRATOR_API_KEY || ''
          if (!orchestratorUrl) {
            log.warn('Auth', 'ORCHESTRATOR_URL 未配置，跳过 ' + platform + ' cookie 推送')
          } else if (!token) {
            log.warn('Auth', 'ORCHESTRATOR_API_KEY 未配置，跳过 ' + platform + ' cookie 推送（拒绝无鉴权推送）')
          } else {
          const postData = JSON.stringify({
            cookies: result.cookies.map(/** @param {{ name: string, value: string, domain?: string, path?: string }} c */ (c) => ({
              name: c.name,
              value: c.value,
              domain: c.domain || '.bilibili.com',
              path: c.path || '/',
            })),
            username: result.name || '',
          })
          const url = new URL(orchestratorUrl + '/api/jobs/cookies/' + platform)
          // 动态选择 http/https 模块
          const httpClient = url.protocol === 'https:' ? require('https') : require('http')
          const req = httpClient.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData),
              ...(token ? { 'X-API-Key': token } : {}),
            },
          })
          // R28/R37：超时保护 + 消费响应体，避免 orchestrator 挂起导致 socket 泄漏
          req.setTimeout(15000, () => { req.destroy(new Error('Orchestrator cookie push timed out')) })
          req.on('response', (res) => { res.resume() })  // 消费响应体释放 socket
          req.on('error', (e) => log.warn('Auth', 'Orchestrator cookie push failed: ' + (e instanceof Error ? e.message : String(e))))
          req.write(postData)
          req.end()
          log.info('Auth', 'Pushed ' + platform + ' cookies to orchestrator')
          }
        } catch (e) {
          log.warn('Auth', 'Orchestrator cookie push failed: ' + (e instanceof Error ? e.message : String(e)))
        }
      }
      return { code: 0, data: { ...saveResult.data }, message: '账号添加成功' }
    } catch (e) {
      log.error('Auth', 'Login failed for ' + platform + ': ' + (e instanceof Error ? e.message : String(e)))
      return { code: -1, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('auth:login-silent', async (event, { platform, cookies, localStorage }) => {
    try {
      const result = await authViewManager.loginSilent(platform, cookies, localStorage)
      return { code: 0, data: result }
    } catch (e) {
      return { code: -1, message: e instanceof Error ? e.message : String(e), data: { valid: false, accountName: null } }
    }
  })

  ipcMain.handle('auth:close', async () => {
    try {
      authViewManager.close()
      // R52 修复：统一返回格式，补充 data 字段
      return { code: 0, data: true }
    } catch (e) {
      return { code: -1, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('auth:save-credentials', async (event, { accountId, cookies, localStorage }) => {
    try {
      const result = await pythonBridge.requestBackend('POST', '/api/auth', {
        accountId,
        cookies,
        localStorage,
      })
      return result
    } catch (e) {
      return { code: -1, message: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('account:add', async (event, platform) => {
    try {
      const account = await AccountManager.addAccount(platform)
      return { code: 0, data: account, message: '账号添加成功' }
    } catch (e) { return { code: -1, message: e instanceof Error ? e.message : String(e) } }
  })

  ipcMain.handle('account:delete', async (event, accountId) => {
    try {
      const result = await pythonBridge.requestBackend('DELETE', '/api/accounts/' + accountId)
      if (result.code === 0) return { code: 0, data: true, message: '账号已删除' }
    } catch (_e) { /* fallthrough */ }
    try { await AccountManager.deleteAccount(accountId); return { code: 0, data: true, message: '账号已删除' } }
    catch (e) { return { code: -1, message: e instanceof Error ? e.message : String(e) } }
  })

  ipcMain.handle('account:check-login', async (event, { platform, accountId }) => {
    try {
      if (BACKEND_PLATFORMS.has(platform)) {
        const result = await pythonBridge.requestBackend('GET', '/api/auth-status/' + platform)
        return { code: 0, data: { valid: result.data?.valid === true } }
      }
      const status = await AccountManager.checkLoginStatus(platform, accountId)
      return { code: 0, data: status }
    } catch (e) { return { code: -1, message: e instanceof Error ? e.message : String(e), data: { valid: false } } }
  })

  ipcMain.handle('account:list', async () => {
    try { const accounts = await AccountManager.listAccounts(); return { code: 0, data: accounts } }
    catch (e) { return { code: -1, message: e instanceof Error ? e.message : String(e), data: [] } }
  })
}

module.exports = registerHandlers

