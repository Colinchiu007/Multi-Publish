/**
 * QrCodeLogin — 二维码扫码登录管理器
 *
 * 基于 WebviewManager/WebContentsView，扩展扫码登录流程：
 *   1. 打开平台登录页
 *   2. 自动检测页面中的二维码元素
 *   3. 提取二维码图片 → 发送到渲染进程展示
 *   4. 检测登录完成 → 提取凭证 → 保存
 *
 * 适用平台：微信公众号、视频号等微信生态（仅支持扫码登录的平台）
 *
 * 技术方案：
 *   使用 executeJavaScript 周期性扫描页面 DOM，
 *   检测 <img> 元素中带 QR/scan/qrcode 特征或大于 100x100 的图片
 */
const { WebContentsView, session, ipcMain } = require('electron')
const path = require('path')
const log = require('./logger')
const { PLATFORM_LOGIN_URLS, QR_CODE_PLATFORMS } = require('@multi-publish/shared-utils/src/platform-definitions')

// 各平台登录页 URL → @multi-publish/shared-utils/src/platform-definitions
// 支持二维码登录的平台由 QR_CODE_PLATFORMS 定义

// QR 码检测间隔
const QR_SCAN_INTERVAL_MS = 2000
const QR_REFRESH_INTERVAL_MS = 30000  // 微信码 30s 过期刷新

class QrCodeLogin {
  constructor () {
    this.mainWindow = null
    this.currentView = null
    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null
    this._scanTimer = null
    this._lastQrHash = null
  }

  setMainWindow (win) {
    this.mainWindow = win
  }

  /**
   * 打开扫码登录
   * @param {string} platform
   * @param {number} timeout - 超时(ms)，默认 5 分钟
   * @returns {Promise<{cookies: Array, name: string, accountId: string}>}
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
      this._lastQrHash = null

      // 创建隔离 Session
      const authSession = session.fromPartition(`persist:auth-${accountId}`, { cache: true })

      // 创建 WebContentsView
      const view = new WebContentsView({
        webPreferences: {
          session: authSession,
          preload: path.join(__dirname, 'auth-qrcode-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        }
      })
      this.currentView = view

      // 定位到窗口中央
      this._positionView()

      // 添加到主窗口
      this.mainWindow.contentView.addChildView(view)
      view.setVisible(true)

      // 导航到登录页
      view.webContents.loadURL(loginUrl)

      // 页面加载后开始检测 QR 码
      view.webContents.on('did-finish-load', () => {
        log.info('QrCodeLogin', `Page loaded for ${platform}, starting QR detection`)
        this._startQrDetection()
      })

      // 监听导航检测登录完成
      view.webContents.on('did-navigate', (event, url) => {
        this._checkLoginCompleted(url)
      })

      // 监听同页面内导航
      view.webContents.on('did-navigate-in-page', (event, url) => {
        // SPA 应用不触发 did-navigate，这里只做 URL 变化记录
        log.debug('QrCodeLogin', `In-page nav: ${url}`)
      })

      // 超时
      if (timeout > 0) {
        this._loginTimeout = setTimeout(() => {
          this.close()
          reject(new Error(`${platform} 扫码登录超时（${Math.round(timeout / 1000 / 60)} 分钟）`))
        }, timeout)
      }

      // 通知渲染进程
      this.mainWindow.webContents.send('qrcode:opened', { platform, accountId })

      log.info('QrCodeLogin', `Opened QR login for ${platform} (${accountId})`)
    })
  }

  /**
   * 定位 View 到窗口中央
   */
  _positionView () {
    if (!this.currentView || !this.mainWindow) return
    const bounds = this.mainWindow.getBounds()
    const viewWidth = Math.min(420, bounds.width - 40)
    const viewHeight = Math.min(560, bounds.height - 100)
    const x = Math.max(0, Math.floor((bounds.width - viewWidth) / 2))
    const y = 56 + Math.max(0, Math.floor((bounds.height - 56 - viewHeight) / 2))
    this.currentView.setBounds({ x, y, width: viewWidth, height: viewHeight })
  }

  /**
   * 启动 QR 码定时检测
   */
  _startQrDetection () {
    this._stopQrDetection()
    this._scanTimer = setInterval(() => {
      this._detectQrCodeOnce()
    }, QR_SCAN_INTERVAL_MS)
  }

  _stopQrDetection () {
    if (this._scanTimer) {
      clearInterval(this._scanTimer)
      this._scanTimer = null
    }
  }

  /**
   * 通过 executeJavaScript 检测页面中的二维码
   */
  async _detectQrCodeOnce () {
    const view = this.currentView
    if (!view || view.webContents.isDestroyed()) return

    try {
      const result = await view.webContents.executeJavaScript(`
        (function() {
          // 策略1: 找包含 QR/qrcode/scan 关键字的 <img>
          let imgs = document.querySelectorAll('img');
          for (let i = 0; i < imgs.length; i++) {
            let src = (imgs[i].src || '').toLowerCase();
            if (
              src.indexOf('qrcode') !== -1 ||
              src.indexOf('qr_') !== -1 ||
              src.indexOf('/qr/') !== -1 ||
              src.indexOf('scan') !== -1 ||
              src.indexOf('login_qr') !== -1
            ) {
              if (imgs[i].naturalWidth > 80 && imgs[i].naturalHeight > 80) {
                return { type: 'img', src: imgs[i].src, width: imgs[i].naturalWidth, height: imgs[i].naturalHeight };
              }
            }
          }

          // 策略2: 找页面中最大的 <img>（登录页通常中间的二维码最大）
          let largest = null;
          let maxArea = 0;
          for (let i = 0; i < imgs.length; i++) {
            let w = imgs[i].naturalWidth || imgs[i].width || 0;
            let h = imgs[i].naturalHeight || imgs[i].height || 0;
            let area = w * h;
            if (area > maxArea && area > 5000) {  // > 70x70
              maxArea = area;
              largest = { type: 'img', src: imgs[i].src, width: w, height: h };
            }
          }

          // 策略3: 找 canvas 元素（有些平台通过 canvas 绘制二维码）
          let canvases = document.querySelectorAll('canvas');
          for (let i = 0; i < canvases.length; i++) {
            if (canvases[i].width > 80 && canvases[i].height > 80) {
              try {
                let dataUrl = canvases[i].toDataURL('image/png');
                return { type: 'canvas', src: dataUrl, width: canvases[i].width, height: canvases[i].height };
              } catch (e) { /* ignore */ }
            }
          }

          return largest ? largest : null;
        })()
      `)

      if (result && result.src) {
        // 去重（相同 URL 不重复发送）
        const hash = result.src.slice(0, 100)
        if (hash !== this._lastQrHash) {
          this._lastQrHash = hash
          // 通知渲染进程展示二维码
          if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send('qrcode:detected', {
              platform: this.currentPlatform,
              accountId: this.currentAccountId,
              image: result,
              timestamp: Date.now(),
            })
          }
          log.info('QrCodeLogin', `QR code detected for ${this.currentPlatform}: ${result.type} ${result.width}x${result.height}`)
        }
      }
    } catch (e) {
      // executeJavaScript 可能因页面跳转失败，静默忽略
      log.debug('QrCodeLogin', `QR detection error: ${e.message}`)
    }
  }

  /**
   * 检测登录是否完成
   */
  _checkLoginCompleted (url) {
    // 微信生态登录完成: 进入管理后台
    const patterns = {
      wechat_mp: ['cgi-bin/home', 'cgi-bin/appmsg', 'cgi-bin/token'],
      tencent_video: ['channels.weixin.qq.com/home', 'channels.weixin.qq.com/dashboard'],
      zhihu: ['zhihu.com/creator', 'zhihu.com/'],
      weibo: ['weibo.com/u/', 'weibo.com/my'],
      toutiao: ['mp.toutiao.com/profile'],
    }

    const platformPatterns = patterns[this.currentPlatform]
    if (!platformPatterns) return

    const matched = platformPatterns.some(p => url.includes(p))
    if (!matched) return

    log.info('QrCodeLogin', `Login completed for ${this.currentPlatform}: ${url}`)

    this._stopQrDetection()

    // 等待页面稳定后提取凭证
    setTimeout(async () => {
      try {
        const authData = await this._extractAuthData()
        this._onLoginSuccess(authData)
      } catch (e) {
        log.error('QrCodeLogin', `Extract auth failed: ${e.message}`)
        this._onLoginSuccess({ cookies: [], localStorage: {}, accountName: this.currentPlatform })
      }
    }, 2000)
  }

  /**
   * 提取登录凭证
   */
  async _extractAuthData () {
    const view = this.currentView
    if (!view || view.webContents.isDestroyed()) {
      throw new Error('浏览器已关闭')
    }

    // Cookie
    const cookies = await view.webContents.session.cookies.get({})

    // localStorage
    let localStorage = {}
    try {
      localStorage = await view.webContents.executeJavaScript(`
        (function() {
          let result = {};
          for (let i = 0; i < localStorage.length; i++) {
            let key = localStorage.key(i);
            if (key.startsWith('__') || key === 'devtools') continue;
            try { result[key] = localStorage.getItem(key); } catch (e) { /* ignore */ }
          }
          return result;
        })()
      `)
    } catch (e) {
      log.warn('QrCodeLogin', `localStorage extract failed: ${e.message}`)
    }

    // 账号名称
    let accountName = this.currentPlatform
    try {
      const title = await view.webContents.getTitle()
      if (title) accountName = `${this.currentPlatform} (${title.slice(0, 20)})`
    } catch (e) { /* ignore */ }

    return { cookies, localStorage, accountName }
  }

  /**
   * 登录成功处理
   */
  _onLoginSuccess (authData) {
    if (this._loginTimeout) {
      clearTimeout(this._loginTimeout)
      this._loginTimeout = null
    }

    const { cookies, localStorage, accountName } = authData
    log.info('QrCodeLogin', `Login success: ${cookies.length} cookies, account: ${accountName}`)

    // 通知渲染进程
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('qrcode:completed', {
        platform: this.currentPlatform,
        accountId: this.currentAccountId,
        accountName,
        cookies,
        localStorage,
      })
    }

    // resolve
    if (this._resolveLogin) {
      this._resolveLogin({ cookies, name: accountName, accountId: this.currentAccountId })
    }

    this._resolveLogin = null
    this._rejectLogin = null
    this.close()
  }

  /**
   * 窗口大小变化时重新定位
   */
  _onWindowResize () {
    if (!this.mainWindow || !this.currentView) return
    this._positionView()
  }

  /**
   * 关闭
   */
  close () {
    this._stopQrDetection()
    if (this._loginTimeout) {
      clearTimeout(this._loginTimeout)
      this._loginTimeout = null
    }

    if (this.currentView) {
      try { this.mainWindow.contentView.removeChildView(this.currentView) } catch (e) { /* ignore */ }
      try { this.currentView.webContents.close() } catch (e) { /* ignore */ }
      try { this.currentView.webContents.destroy() } catch (e) { /* ignore */ }
      this.currentView = null
    }

    this.currentPlatform = null
    this.currentAccountId = null
    this._resolveLogin = null
    this._rejectLogin = null
    this._lastQrHash = null

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('qrcode:closed')
    }
    log.info('QrCodeLogin', 'Closed')
  }

  /**
   * 注册 IPC handlers
   */
  registerIpcHandlers () {
    ipcMain.handle('auth:open-qrcode-login', async (event, platform) => {
      try {
        const result = await this.openLogin(platform)
        return { code: 0, data: result, message: '扫码登录成功' }
      } catch (e) {
        log.error('QrCodeLogin', `Login failed: ${e.message}`)
        return { code: -1, message: e.message }
      }
    })

    ipcMain.handle('auth:qrcode-close', () => {
      this.close()
      return { code: 0 }
    })
  }
}

module.exports = QrCodeLogin
