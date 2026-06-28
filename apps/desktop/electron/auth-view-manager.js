/**
 * AuthViewManager — WebContentsView 内嵌浏览器登录管理器
 *
 * 替换 Playwright 弹出窗口登录，使用 Electron WebContentsView
 * 将登录页面直接嵌入到应用窗口内，提升用户体验
 *
 * 架构：
 *   Login:   WebContentsView (内嵌，体验好)
 *   Publish: Playwright (保留，RPA 自动化)
 *   Cookie 桥接: WebContentsView 提取 → Python API 保存 → Playwright 加载
 */
const { BrowserWindow, WebContentsView, session, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')

// 平台登录 URL 映射
const PLATFORM_LOGIN_URLS = {
  wechat_mp: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/signin',
  weibo: 'https://weibo.com/login',
  douyin: 'https://www.douyin.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  tencent_video: 'https://channels.weixin.qq.com/',
  kuaishou: 'https://cp.kuaishou.com/',
  toutiao: 'https://mp.toutiao.com/',
  bilibili: 'https://passport.bilibili.com/login',
  youtube: 'https://studio.youtube.com/',
  tiktok: 'https://www.tiktok.com/upload/',
}

// 各平台登录成功后 URL 特征（用于检测登录完成）
const PLATFORM_LOGIN_SUCCESS_PATTERNS = {
  wechat_mp: ['cgi-bin/home', 'cgi-bin/appmsg'],
  zhihu: ['zhihu.com'],
  weibo: ['weibo.com/home', 'weibo.com/u/'],
  douyin: ['douyin.com'],
  xiaohongshu: ['creator.xiaohongshu.com'],
  tencent_video: ['channels.weixin.qq.com'],
  kuaishou: ['cp.kuaishou.com'],
  toutiao: ['mp.toutiao.com'],
  bilibili: ['www.bilibili.com/'],
  youtube: ['studio.youtube.com'],
  tiktok: ['tiktok.com'],
}

const SIDEBAR_WIDTH = 280

class AuthViewManager {
  constructor () {
    this.mainWindow = null
    this.currentView = null
    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow (win) {
    this.mainWindow = win
  }

  /**
   * 创建隔离的 Session 分区
   * 每个账号独立分区，Cookie/localStorage 互不干扰
   */
  _createSession (accountId) {
    const partition = `persist:auth-${accountId}`
    return session.fromPartition(partition, { cache: true })
  }

  /**
   * 打开内嵌浏览器进行登录
   * @param {string} platform - 平台标识
   * @param {number} timeout - 超时时间(ms)
   * @returns {Promise<{cookies: Array, name: string}>}
   */
  openLogin (platform, timeout = 300000) {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) {
        reject(new Error('主窗口未初始化'))
        return
      }

      const loginUrl = PLATFORM_LOGIN_URLS[platform]
      if (!loginUrl) {
        reject(new Error(`不支持的平台: ${platform}`))
        return
      }

      const accountId = `auth-${platform}-${Date.now()}`
      this.currentPlatform = platform
      this.currentAccountId = accountId
      this._resolveLogin = resolve
      this._rejectLogin = reject

      // 创建隔离 Session
      const authSession = this._createSession(accountId)

      // 创建 WebContentsView
      const view = new WebContentsView({
        webPreferences: {
          session: authSession,
          preload: path.join(__dirname, 'auth-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        }
      })

      this.currentView = view

      // 计算主窗口内容区域位置（顶部导航 56px）
      const bounds = this.mainWindow.getBounds()
      this._positionView(bounds)

      // 添加到主窗口
      this.mainWindow.contentView.addChildView(view)
      view.setVisible(true)

      // 导航到登录页
      view.webContents.loadURL(loginUrl)

      // Escape 键关闭登录视图
      const escHandler = (event, input) => {
        if (input && input.type === 'keyDown' && input.key === 'Escape') {
          this.close()
          if (this._resolveLogin) {
            this._resolveLogin({ cancelled: true })
            this._resolveLogin = null
          }
        }
      }
      view.webContents.on("before-input-event", escHandler)
      this._escHandler = escHandler
      this._escView = view

      // URL pattern 检测（备用）
      view.webContents.on('did-navigate', (event, url) => {
        this._checkLoginCompleted(url)
      })

      // CDP 网络拦截（主检测方式，蚁小二方案）
      try {
        view.webContents.debugger.attach()
        view.webContents.debugger.sendCommand('Fetch.enable', {
          patterns: [
            { urlPattern: '*passport.bilibili.com/login*', resourceType: 'XHR', requestStage: 'Response' },
            { urlPattern: '*passport.bilibili.com/x/passport-login/web/*', resourceType: 'XHR', requestStage: 'Response' },
          ]
        })
        view.webContents.debugger.on('message', async (_, method, params) => {
          if (method !== 'Fetch.requestPaused') return
          try {
            const { body, base64Encoded } = await view.webContents.debugger.sendCommand(
              'Fetch.getResponseBody', { requestId: params.requestId }
            )
            const data = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString() : body)
            // B站 API 登录成功信号
            if ((data.code === 0 && data.data && (data.data.isLogin === true || data.data.dedeUserID || data.data.mid || data.data.access_token)) || data.data?.isLogin === true) {
              log.info('AuthView', 'CDP detected B站 login success')
              if (this._resolveLogin) {
                setTimeout(async () => {
                  try {
                    const authData = await this._extractAuthData()
                    this._onLoginSuccess(authData)
                  } catch (e) {
                    this._onLoginSuccess({ cookies: [], localStorage: {}, accountName: this.currentPlatform })
                  }
                }, 1000)
              }
            }
          } catch (e) { /* ignore parse errors */ }
          try {
            await view.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId: params.requestId })
          } catch (e) { /* ignore */ }
        })
      } catch (e) {
        log.warn('AuthView', 'CDP attach failed, falling back to URL pattern: ' + e.message)
      }

      // 监听同页面内导航（SPA 应用）
      view.webContents.on('did-navigate-in-page', (event, url) => {
        this._checkLoginCompleted(url)
      })

      // 监听页面标题变化（备用检测）
      view.webContents.on('page-title-updated', (event, title) => {
        log.debug('AuthView', `Title: ${title}`)
      })

      // 超时处理
      if (timeout > 0) {
        this._loginTimeout = setTimeout(() => {
          this.close()
          reject(new Error(`${platform} 登录超时（${Math.round(timeout / 1000 / 60)} 分钟）`))
        }, timeout)
      }

      // 通知渲染进程
      this.mainWindow.webContents.send('auth:view-opened', { platform, accountId })

      log.info('AuthView', `Opened login for ${platform} (${accountId})`)
    })
  }

  /**
   * 定位 View 到主窗口中央区域
   */
  _positionView (bounds) {
    if (!this.currentView) return
    // 顶部留 56px 给导航栏
    const x = SIDEBAR_WIDTH
    const y = 120
    this.currentView.setBounds({ x, y, width: bounds.width - SIDEBAR_WIDTH, height: bounds.height - 120 })
    // 背景色 — WebContentsView 本身就有 setBackgroundColor
    if (typeof this.currentView.setBackgroundColor === 'function') {
      this.currentView.setBackgroundColor('#ffffff')
    }
  }

  /**
   * 窗口大小变化时重新定位
   */
  _onWindowResize () {
    if (!this.mainWindow || !this.currentView) return
    const bounds = this.mainWindow.getBounds()
    this._positionView(bounds)
  }

  /**
   * 检测登录是否完成
   */
  _checkLoginCompleted (url) {
    if (!this.currentPlatform || !this._resolveLogin) return

    const patterns = PLATFORM_LOGIN_SUCCESS_PATTERNS[this.currentPlatform]
    if (!patterns) return

    const matched = patterns.some(p => url.includes(p))
    if (!matched) return

    log.info('AuthView', `Login detected for ${this.currentPlatform}: ${url}`)

    // 等待页面稳定
    setTimeout(async () => {
      try {
        const authData = await this._extractAuthData()
        this._onLoginSuccess(authData)
      } catch (e) {
        log.error('AuthView', `Extract auth failed: ${e.message}`)
        // 即使提取失败，也认为登录成功了（至少有 Cookie）
        this._onLoginSuccess({ cookies: [], localStorage: {}, accountName: this.currentPlatform })
      }
    }, 2000)
  }

  /**
   * 提取登录凭证（Cookie + localStorage + 账号名）
   */
  async _extractAuthData () {
    const view = this.currentView
    if (!view || view.webContents.isDestroyed()) {
      throw new Error('浏览器已关闭')
    }

    // 提取 Cookie
    const cookies = await view.webContents.session.cookies.get({})

    // 提取 localStorage
    let localStorage = {}
    try {
      localStorage = await view.webContents.executeJavaScript(`
        (function() {
          var result = {};
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key.startsWith('__') || key === 'devtools') continue;
            try { result[key] = localStorage.getItem(key); } catch(e) {}
          }
          return result;
        })()
      `)
    } catch (e) {
      log.warn('AuthView', `localStorage extract failed: ${e.message}`)
    }

    // 提取 IndexedDB（关键：抖音等平台的签名密钥存储在这里）
    let indexedDB = {}
    try {
      indexedDB = await view.webContents.executeJavaScript(`
        (async function() {
          var result = {};
          try {
            var dbs = await indexedDB.databases();
            for (var dbInfo of dbs) {
              var db = await new Promise(function(resolve, reject) {
                var req = indexedDB.open(dbInfo.name);
                req.onsuccess = function() { resolve(req.result); };
                req.onerror = function() { reject(req.error); };
              });
              for (var storeName of db.objectStoreNames) {
                try {
                  var store = db.transaction(storeName, 'readonly').objectStore(storeName);
                  var items = await new Promise(function(resolve, reject) {
                    var req = store.getAll();
                    req.onsuccess = function() { resolve(req.result); };
                    req.onerror = function() { reject(req.error); };
                  });
                  if (items.length > 0) result[dbInfo.name + '/' + storeName] = items;
                } catch(e) {}
              }
              db.close();
            }
          } catch(e) {}
          return result;
        })()
      `);
    } catch (e) {
      log.warn('AuthView', `IndexedDB extract failed: ${e.message}`)
    }

    // 提取账号名称
    let accountName = this.currentPlatform
    try {
      // 尝试通过 B站 API 获取真实用户名
      if (this.currentPlatform === 'bilibili') {
        const navData = await view.webContents.executeJavaScript(
          'fetch("https://api.bilibili.com/x/web-interface/nav").then(r=>r.json()).then(d=>({uname:d.data?.uname||"",isLogin:d.data?.isLogin||false}))'
        )
        if (navData && navData.isLogin && navData.uname) {
          accountName = this.currentPlatform + ' (' + navData.uname + ')'
        }
      } else {
        const title = await view.webContents.getTitle()
        if (title) accountName = this.currentPlatform + ' (' + title.slice(0, 20) + ')'
      }
    } catch (e) { /* ignore */ }

    return { cookies, localStorage, indexedDB, accountName }
  }

  /**
   * 登录成功处理
   */
  async _onLoginSuccess (authData) {
    if (this._loginTimeout) {
      clearTimeout(this._loginTimeout)
      this._loginTimeout = null
    }

    const { cookies, localStorage, accountName } = authData

    log.info('AuthView', `Login success for ${this.currentPlatform}: ${cookies.length} cookies`)

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('auth:completed', {
        platform: this.currentPlatform,
        accountId: this.currentAccountId,
        accountName,
        cookies,
        localStorage,
      })
    }

    // resolve Promise
    if (this._resolveLogin) {
      this._resolveLogin({ cookies, name: accountName, accountId: this.currentAccountId })
    }

    // 清理
    this._resolveLogin = null
    this._rejectLogin = null
    // 蚁小二模式：fire-and-forget 关闭，不阻塞当前调用栈
    // 避免 CDP 回调内同步 IPC 导致死锁
    void this.close()
  }

  /**
   * 关闭内嵌浏览器
   */
  close () {
    if (this._loginTimeout) {
      clearTimeout(this._loginTimeout)
      this._loginTimeout = null
    }

    if (this.currentView) {
      try {
        this.currentView.webContents.close()
      // 移除 Escape 监听
      if (this._escView && this._escView.webContents) {
        this._escView.webContents.removeListener("before-input-event", this._escHandler)
      }
      this._escHandler = null
      this._escView = null
      } catch (e) { /* ignore */ }
      this.currentView = null
    }

    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('auth:view-closed')
    }

    log.info('AuthView', 'View closed')
  }

  /**
   * 恢复已保存的账号（打开内嵌浏览器加载已保存的 Cookie）
   */
  async openSavedAccount (platform, accountId, cookies, localStorage) {
    if (!this.mainWindow) return

    const loginUrl = PLATFORM_LOGIN_URLS[platform]
    if (!loginUrl) return

    this.currentPlatform = platform
    this.currentAccountId = accountId

    const authSession = this._createSession(accountId)

    // 先恢复 Cookie
    if (cookies && cookies.length > 0) {
      try {
        await authSession.cookies.set(cookies)
      } catch (e) {
        // Cookie 可能是数组格式，需要逐个设置
        for (const c of cookies) {
          try { await authSession.cookies.set(c) } catch (e2) { /* ignore invalid cookie */ }
        }
      }
    }

    const view = new WebContentsView({
      webPreferences: {
        session: authSession,
        preload: path.join(__dirname, 'auth-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    })

    this.currentView = view
    const bounds = this.mainWindow.getBounds()
    this._positionView(bounds)
    this.mainWindow.contentView.addChildView(view)
    view.setVisible(true)
    view.webContents.loadURL(loginUrl)

      // Escape 键关闭登录视图
      const escHandler = (event, input) => {
        if (input && input.type === 'keyDown' && input.key === 'Escape') {
          this.close()
          if (this._resolveLogin) {
            this._resolveLogin({ cancelled: true })
            this._resolveLogin = null
          }
        }
      }
      view.webContents.on("before-input-event", escHandler)
      this._escHandler = escHandler
      this._escView = view

    // 恢复 localStorage（需要页面加载后才能注入）
    if (localStorage && Object.keys(localStorage).length > 0) {
      view.webContents.on('did-finish-load', async () => {
        try {
          await view.webContents.executeJavaScript(`
            (function() {
              var data = ${JSON.stringify(localStorage)};
              Object.keys(data).forEach(function(k) {
                try { localStorage.setItem(k, data[k]); } catch(e) {}
              });
            })()
          `)
        } catch (e) { /* ignore */ }
      })
    }

    this.mainWindow.webContents.send('auth:view-opened', { platform, accountId })
    log.info('AuthView', `Opened saved account ${accountId}`)
  }
/**
   * 静默登录验证（隐藏浏览器窗口）
   *
   * 使用 BrowserWindow + show: false 在不显示窗口的情况下
   * 恢复已保存的登录态、验证登录是否有效。
   *
   * 适用于：
   *   1. 启动时后台验证所有账号的登录状态
   *   2. 发布前的静默登录态检查
   *   3. Cookie/localStorage 批量恢复校验
   *
   * @param {string} platform - 平台标识
   * @param {Array} cookies - 已保存的 Cookie
   * @param {Object} [localStorage] - 已保存的 localStorage 数据
   * @returns {Promise<{valid: boolean, accountName: string|null}>}
   */
  async loginSilent (platform, cookies, localStorage) {
    const loginUrl = PLATFORM_LOGIN_URLS[platform]
    if (!loginUrl) {
      return { valid: false, accountName: null }
    }

    const win = new BrowserWindow({
      show: false,
      width: 1024,
      height: 768,
      webPreferences: {
        session: session.fromPartition(`persist:silent-auth-${platform}-${Date.now()}`, { cache: true }),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    try {
      // 恢复 Cookie（必须在导航前）
      if (cookies && cookies.length > 0) {
        for (const c of cookies) {
          try { await win.webContents.session.cookies.set(c) } catch (e) { /* skip invalid */ }
        }
      }

      // 导航到平台登录 URL
      await win.webContents.loadURL(loginUrl)
      await new Promise(r => setTimeout(r, 3000))

      // 恢复 localStorage（需等页面加载完毕）
      if (localStorage && Object.keys(localStorage).length > 0) {
        const lsJson = JSON.stringify(localStorage)
        try {
          await win.webContents.executeJavaScript(`
            (function() {
              var data = ${lsJson};
              Object.keys(data).forEach(function(k) {
                try { localStorage.setItem(k, data[k]); } catch(e) {}
              });
            })()
          `)
        } catch (e) { /* ignore */ }
      }

      // 等待页面跳转稳定
      await new Promise(r => setTimeout(r, 2000))

      // 检查当前 URL 判断登录状态
      const currentUrl = win.webContents.getURL()
      const patterns = PLATFORM_LOGIN_SUCCESS_PATTERNS[platform]
      const isValid = patterns
        ? patterns.some(p => currentUrl.includes(p))
        : !currentUrl.includes('login') && !currentUrl.includes('passport') && !currentUrl.includes('signin')

      // 尝试获取账号名
      let accountName = null
      try {
        accountName = await win.webContents.getTitle()
      } catch (e) { /* ignore */ }

      return { valid: isValid, accountName }
    } catch (e) {
      log.warn('AuthView', `Silent login failed for ${platform}: ${e.message}`)
      return { valid: false, accountName: null }
    } finally {
      try { win.destroy() } catch (e) { /* ignore */ }
    }
  }
}

module.exports = AuthViewManager