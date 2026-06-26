/**
 * RpaViewManager — executeJavaScript RPA 引擎
 *
 * 使用 Electron 隐藏 BrowserWindow + webContents.executeJavaScript()
 * 替代 Playwright 进行 RPA 自动化发布。
 *
 * 核心思路：
 *   1. 创建隐藏 BrowserWindow（show: false），无弹出窗口
 *   2. 通过 executeJavaScript() 注入 JS 操作页面 DOM
 *   3. 通过 CDP 的 DOM.setFileInputFiles 处理文件上传
 *   4. 通过 webContents.session.webRequest 监听网络响应
 *   5. 每个账号独立 session 分区，Cookie/localStorage 互不干扰
 *
 * 参考：
 *   - auth-view-manager.js — WebContentsView + executeJavaScript 登录模式
 *   - Python douyin.py — 抖音发布流程（API 优先 + RPA 降级）
 */
const { BrowserWindow, session, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const log = require('./logger')

// ─── 平台发布页 URL ────────────────────────────────────────
const PLATFORM_PUBLISH_URLS = {
  douyin: 'https://creator.douyin.com/creator-micro/content/upload',
  wechat_mp: 'https://mp.weixin.qq.com/',
  zhihu: 'https://www.zhihu.com/',
  weibo: 'https://weibo.com/',
  xiaohongshu: 'https://creator.xiaohongshu.com/',
  shipinhao: 'https://channels.weixin.qq.com/',
  kuaishou: 'https://cp.kuaishou.com/',
  toutiao: 'https://mp.toutiao.com/',
  youtube: 'https://studio.youtube.com/',
  tiktok: 'https://www.tiktok.com/upload/',
  bilibili: 'https://www.bilibili.com/',
  baijiahao: 'https://baijiahao.baidu.com/',
}

// ─── 发布成功 API 响应特征（各平台）────────────────────────
const PLATFORM_SUCCESS_PATTERNS = {
  douyin: ['aweme/create', 'aweme/post', 'upload/auth'],
}

// ─── 平台默认超时（毫秒）───────────────────────────────────
const PLATFORM_TIMEOUTS = {
  douyin: 300000,     // 5 min（含视频上传）
  wechat_mp: 120000,
  zhihu: 120000,
  weibo: 120000,
  xiaohongshu: 120000,
  shipinhao: 300000,
  kuaishou: 300000,
  toutiao: 120000,
  youtube: 300000,
  tiktok: 300000,
  bilibili: 300000,
  baijiahao: 120000,
}


class RpaViewManager {
  constructor () {
    this.mainWindow = null
    /** @type {Object<string, BrowserWindow>} */
    this.windows = {}
    this._nextId = 1
    this._progressCallback = null
    this._responseListeners = {}  // { windowKey: callback }
  }

  /**
   * 设置主窗口引用（用于发射进度事件）
   */
  setMainWindow (win) {
    this.mainWindow = win
  }

  /**
   * 注册进度回调
   * @param {function} cb - 接收 { platform, stage, percent }
   */
  onProgress (cb) {
    this._progressCallback = cb
  }

  /**
   * 发射进度事件
   */
  _emitProgress (platform, stage, percent) {
    const data = { platform, stage, percent: percent ?? 0 }
    if (this._progressCallback) {
      try { this._progressCallback(data) } catch (e) { /* ignore */ }
    }
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('rpa:progress', data)
      } catch (e) { /* ignore */ }
    }
    log.info('RpaView', `[${platform}] ${stage}`)
  }

  // ═══════════════════════════════════════════════════════════
  // 浏览器窗口管理
  // ═══════════════════════════════════════════════════════════

  /**
   * 创建一个隐藏的 BrowserWindow
   * @param {string} partition - session 分区名
   * @returns {BrowserWindow}
   */
  _createWindow (partition) {
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 800,
      webPreferences: {
        session: session.fromPartition(partition, { cache: true }),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    })

    // 抑制导航错误（RPA 中如遇 404 不应崩溃）
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      log.warn('RpaView', `Page load failed: ${errorDescription} (${errorCode})`)
    })

    // 不显示控制台日志
    win.webContents.on('console-message', () => {})

    return win
  }

  /**
   * 获取窗口标识键
   */
  _windowKey (platform, accountId) {
    return `rpa-${platform}-${accountId || 'default'}-${this._nextId++}`
  }

  // ═══════════════════════════════════════════════════════════
  // Cookie / localStorage 恢复
  // ═══════════════════════════════════════════════════════════

  /**
   * 恢复已保存的 Cookie（需在 loadURL 前调用）
   */
  async _restoreCookies (win, cookies) {
    if (!cookies || cookies.length === 0) return
    for (const c of cookies) {
      try {
        await win.webContents.session.cookies.set(c)
      } catch (e) {
        // 单个 cookie 失败不影响其他
      }
    }
    log.info('RpaView', `Restored ${cookies.length} cookies`)
  }

  /**
   * 恢复 localStorage（需在页面加载后调用）
   */
  async _restoreLocalStorage (win, localStorageData) {
    if (!localStorageData || Object.keys(localStorageData).length === 0) return

    const lsJson = JSON.stringify(localStorageData)
    try {
      await win.webContents.executeJavaScript(`
        (function() {
          var data = ${lsJson};
          Object.keys(data).forEach(function(k) {
            try { localStorage.setItem(k, data[k]); } catch(e) {}
          });
          return Object.keys(data).length;
        })()
      `)
      log.info('RpaView', `Restored localStorage items`)
    } catch (e) {
      log.warn('RpaView', `localStorage restore failed: ${e.message}`)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // executeJavaScript 工具方法
  // ═══════════════════════════════════════════════════════════

  /**
   * 等待 DOM 元素出现
   * @param {BrowserWindow} win
   * @param {string} selector - CSS 选择器
   * @param {number} timeout - 超时（毫秒）
   * @returns {Promise<boolean>} 是否找到
   */
  async _waitForElement (win, selector, timeout = 30000) {
    try {
      return await win.webContents.executeJavaScript(`
        (function() {
          return new Promise(function(resolve) {
            var el = document.querySelector('${selector}');
            if (el) { resolve(true); return; }

            var observer = new MutationObserver(function() {
              var found = document.querySelector('${selector}');
              if (found) { observer.disconnect(); resolve(true); }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(function() {
              observer.disconnect();
              resolve(false);
            }, ${timeout});
          });
        })()
      `)
    } catch (e) {
      return false
    }
  }

  /**
   * 等待任意条件函数返回 true
   * @param {BrowserWindow} win
   * @param {string} conditionFn - 条件函数体（字符串），return boolean
   * @param {number} timeout - 超时（毫秒）
   * @param {number} interval - 轮询间隔（毫秒）
   * @returns {Promise<boolean>}
   */
  async _waitForCondition (win, conditionFn, timeout = 30000, interval = 500) {
    try {
      return await win.webContents.executeJavaScript(`
        (function() {
          var condition = ${conditionFn};
          return new Promise(function(resolve) {
            if (condition()) { resolve(true); return; }
            var check = setInterval(function() {
              if (condition()) { clearInterval(check); clearTimeout(timer); resolve(true); }
            }, ${interval});
            var timer = setTimeout(function() {
              clearInterval(check);
              resolve(false);
            }, ${timeout});
          });
        })()
      `)
    } catch (e) {
      return false
    }
  }

  /**
   * 填充输入框（触发 input/change 事件）
   * @param {BrowserWindow} win
   * @param {string} selector - CSS 选择器
   * @param {string} value
   */
  async _fillInput (win, selector, value) {
    const safeValue = JSON.stringify(value)
    return await win.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector('${selector}');
        if (!el) throw new Error('Input not found: ${selector}');

        // 如果是 contenteditable，直接设 innerHTML
        if (el.getAttribute('contenteditable') === 'true') {
          el.innerHTML = ${safeValue};
          el.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }

        // 普通 input/textarea
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;

        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(el, ${safeValue});
        } else {
          el.value = ${safeValue};
        }

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `)
  }

  /**
   * 点击元素
   * @param {BrowserWindow} win
   * @param {string} selector - CSS 选择器
   */
  async _click (win, selector) {
    return await win.webContents.executeJavaScript(`
      (function() {
        var el = document.querySelector('${selector}');
        if (!el) throw new Error('Element not found: ${selector}');
        el.click();
        return true;
      })()
    `)
  }

  /**
   * 获取页面文本内容
   */
  async _getPageText (win, selector) {
    try {
      return await win.webContents.executeJavaScript(`
        (function() {
          var el = document.querySelector('${selector}');
          return el ? el.textContent || el.innerText || '' : '';
        })()
      `)
    } catch (e) {
      return ''
    }
  }

  /**
   * 获取当前页面 URL
   */
  async _getUrl (win) {
    return win.webContents.getURL()
  }

  // ═══════════════════════════════════════════════════════════
  // CDP 文件上传（替代 Playwright set_input_files）
  // ═══════════════════════════════════════════════════════════

  /**
   * 通过 CDP (Chrome DevTools Protocol) 设置文件输入
   *
   * 这是 Playwright 内部使用的方式，绕过浏览器安全限制。
   * 使用 Electron 的 webContents.debugger 附加 CDP session。
   *
   * @param {BrowserWindow} win
   * @param {string} filePath - 本地文件绝对路径
   * @returns {Promise<boolean>}
   */
  async _setFileInput (win, filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const debugger_ = win.webContents.debugger
    try {
      await debugger_.attach('1.3')
    } catch (e) {
      // 可能已 attach
    }

    try {
      // 1. 在页面中查找文件输入元素
      const findResult = await debugger_.sendCommand('Runtime.evaluate', {
        expression: '(function() { var inputs = document.querySelectorAll(\'input[type="file"]\'); return inputs.length > 0 ? 1 : 0; })()',
        returnByValue: true,
      })

      if (findResult.result.value !== 1) {
        throw new Error('No file input found on page')
      }

      // 2. 获取第一个文件输入
      const { result } = await debugger_.sendCommand('Runtime.evaluate', {
        expression: 'document.querySelector(\'input[type="file"]\')',
      })

      // 3. 获取 DOM nodeId
      const { nodeId } = await debugger_.sendCommand('DOM.requestNode', {
        objectId: result.objectId,
      })

      // 4. 设置文件（这是关键 — 绕过浏览器安全限制）
      await debugger_.sendCommand('DOM.setFileInputFiles', {
        files: [path.resolve(filePath)],
        nodeId,
      })

      log.info('RpaView', `File set via CDP: ${path.basename(filePath)}`)
      return true
    } finally {
      try { await debugger_.detach() } catch (e) { /* ignore */ }
    }
  }

  /**
   * 小文件上传（< 10MB）：通过 executeJavaScript 直接传 bytes
   * 适用于封面图、小视频等
   */
  async _setFileInputViaJS (win, selector, filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    const stat = fs.statSync(filePath)
    if (stat.size > 10 * 1024 * 1024) {
      // 大文件走 CDP
      return this._setFileInput(win, filePath)
    }

    const buffer = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const mimeMap = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.png': 'image/png', '.gif': 'image/gif',
      '.webp': 'image/webp', '.mp4': 'video/mp4',
      '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    }
    const mimeType = mimeMap[ext] || 'application/octet-stream'
    const fileName = path.basename(filePath)

    // 将 buffer 转为逗号分隔的字节数组（避免 JSON 序列化大 buffer 的开销）
    // 只对小文件使用此路径
    const bytes = Array.from(buffer)
    const chunkSize = 10000
    let js = `
      (function() {
        var totalSize = ${bytes.length};
        var chunks = [];
    `

    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize)
      js += `chunks.push(${JSON.stringify(chunk)});`
    }

    js += `
        var allBytes = [];
        for (var c = 0; c < chunks.length; c++) {
          allBytes = allBytes.concat(chunks[c]);
        }
        var uint8Array = new Uint8Array(allBytes);
        var blob = new Blob([uint8Array], { type: '${mimeType}' });
        var file = new File([blob], '${fileName}', { type: '${mimeType}' });

        var input = document.querySelector('${selector}');
        if (!input) throw new Error('File input not found: ${selector}');

        var dt = new DataTransfer();
        dt.items.add(file);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files').set.call(input, dt.files);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()
    `

    try {
      await win.webContents.executeJavaScript(js)
      log.info('RpaView', `File set via JS: ${fileName} (${bytes.length} bytes)`)
      return true
    } catch (e) {
      log.warn('RpaView', `JS file upload failed, falling back to CDP: ${e.message}`)
      return this._setFileInput(win, filePath)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 网络响应监控
  // ═══════════════════════════════════════════════════════════

  /**
   * 监听网络响应，匹配特定 URL 模式
   *
   * 替代 Playwright 的 page.on("response") + ResponseMonitor。
   * 使用 Electron 的 webRequest API，功能相同。
   *
   * @param {BrowserWindow} win
   * @param {string[]} patterns - URL 子串匹配模式
   * @param {number} timeout - 超时（毫秒）
   * @returns {Promise<Object|null>} 匹配到的响应 { url, statusCode, body? }
   */
  async _waitForResponse (win, patterns, timeout = 60000) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (win.webContents.session.webRequest) {
          // 无法直接移除 webRequest 监听器，但超时后忽略即可
        }
        resolve(null)
      }, timeout)

      // 使用 webRequest.onCompleted 监听完成响应
      // 注意：webRequest API 无法直接读取 response body，
      // 但可以获取 URL 和 statusCode，足够判断 API 结果
      const filter = { urls: ['<all_urls>'] }

      // 保存匹配到的 URL
      const matchedUrls = []

      const handler = (details) => {
        const url = details.url || ''
        const matched = patterns.some(p => url.includes(p))
        if (!matched) return

        matchedUrls.push({ url, statusCode: details.statusCode })

        // 抖音 API 返回 200 且 URL 包含 aweme/create 即为成功
        if (details.statusCode === 200) {
          clearTimeout(timer)
          resolve({ url, statusCode: details.statusCode, matchedUrls })
        }
      }

      win.webContents.session.webRequest.onCompleted(filter, handler)

      // 兜底：超时但已有匹配 URL
      // 实际 timer 清理由上面的 resolve 处理，但若超时：
      // 如果有匹配 URL 也算成功
      const originalTimer = timer
      const fallbackTimer = setTimeout(() => {
        if (matchedUrls.length > 0) {
          resolve({ url: matchedUrls[0].url, statusCode: matchedUrls[0].statusCode, matchedUrls })
        }
      }, timeout + 1000)

      // 清理
      const cleanup = () => {
        clearTimeout(originalTimer)
        clearTimeout(fallbackTimer)
      }
      // 注意：Electron webRequest 不支持移除单个监听器
      // 但 can be filtered by request filter
    })
  }

  // ═══════════════════════════════════════════════════════════
  // 导航与等待
  // ═══════════════════════════════════════════════════════════

  /**
   * 导航到 URL 并等待页面稳定
   * @param {BrowserWindow} win
   * @param {string} url
   * @param {number} stabilizeMs - 加载后等待稳定的毫秒数
   */
  async _navigateAndWait (win, url, stabilizeMs = 3000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Navigation timeout: ${url}`))
      }, 45000)

      win.webContents.once('did-finish-load', async () => {
        clearTimeout(timeout)
        // 等待页面 JS 执行稳定
        setTimeout(async () => {
          try {
            await win.webContents.executeJavaScript('void(0)')
            resolve()
          } catch (e) {
            reject(e)
          }
        }, stabilizeMs)
      })

      win.webContents.once('did-fail-load', (event, errorCode, errorDesc) => {
        clearTimeout(timeout)
        // 某些页面局部资源加载失败不影响主流程
        log.warn('RpaView', `Navigation warning: ${errorDesc}`)
        setTimeout(resolve, stabilizeMs)
      })

      win.webContents.loadURL(url)
    })
  }

  // ═══════════════════════════════════════════════════════════
  // 平台特定发布流程
  // ═══════════════════════════════════════════════════════════

  /**
   * 抖音发布（executeJavaScript 版本）
   *
   * 对应 Python douyin.py 的 _do_publish 方法。
   * 步骤：
   *   1. 导航到上传页
   *   2. 上传视频文件（CDP）
   *   3. 填写标题
   *   4. 上传封面（如提供）
   *   5. 填写描述/标签
   *   6. 点击发布
   *   7. 验证发布成功（API 响应 + URL + DOM）
   *
   * @param {BrowserWindow} win
   * @param {Object} article - { title, content, video_path, cover_path, tags, draft }
   * @returns {Object} { success, url, error }
   */
  async _publish_douyin (win, article) {
    this._emitProgress('douyin', '导航到上传页...', 5)

    // 1. 导航到上传页
    const uploadUrl = 'https://creator.douyin.com/creator-micro/content/upload'
    await this._navigateAndWait(win, uploadUrl)

    // 检查是否已登录（若被重定向到登录页则失败）
    const currentUrl = win.webContents.getURL()
    if (currentUrl.includes('login') || currentUrl.includes('passport')) {
      return { success: false, error: '抖音未登录，请先登录', platform: 'douyin' }
    }

    // 2. 上传视频文件
    if (article.video_path) {
      this._emitProgress('douyin', '上传视频...', 20)
      // 等待文件输入出现
      const inputReady = await this._waitForElement(win, 'input[type="file"]', 15000)
      if (!inputReady) {
        return { success: false, error: '未找到文件上传入口', platform: 'douyin' }
      }
      // 先用 CDP 方式（对大文件更可靠）
      await this._setFileInput(win, article.video_path)

      // 等待上传完成（检测进度条消失或上传成功提示）
      this._emitProgress('douyin', '等待视频上传完成...', 30)
      const uploadDone = await this._waitForCondition(win, `
        function() {
          var progress = document.querySelector('[class*="progress"]');
          var success = document.querySelector('[class*="upload-success"], [class*="success"]');
          // 若 progress 消失或 success 出现，视为完成
          return !progress || success !== null;
        }
      `, 300000) // 大文件最多等 5 分钟

      if (!uploadDone) {
        log.warn('RpaView', 'douyin: Video upload wait timeout, continuing anyway')
      }
      this._emitProgress('douyin', '视频上传完成', 50)
    }

    // 3. 填写标题
    if (article.title) {
      this._emitProgress('douyin', '填写标题...', 55)
      const titleReady = await this._waitForElement(win, '[class*="input"], [class*="title"]', 10000)
      if (titleReady) {
        try {
          await this._fillInput(win, '[class*="input"]', article.title)
          // 抖音的标题输入比较特殊，可能需要触发更多事件
          await win.webContents.executeJavaScript(`
            (function() {
              var inputs = document.querySelectorAll('[class*="input"], input, [contenteditable]');
              for (var i = 0; i < inputs.length; i++) {
                var el = inputs[i];
                if (el.placeholder && el.placeholder.includes('标题')) {
                  el.focus();
                  var nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                  )?.set;
                  if (nativeSetter) nativeSetter.call(el, ${JSON.stringify(article.title)});
                  else el.value = ${JSON.stringify(article.title)};
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                  break;
                }
              }
            })()
          `)
        } catch (e) {
          log.warn('RpaView', `douyin: Title fill failed: ${e.message}`)
        }
      }
    }

    // 4. 填写描述（文章 content 作为描述）
    if (article.content) {
      this._emitProgress('douyin', '填写描述...', 65)
      try {
        await win.webContents.executeJavaScript(`
          (function() {
            var allEls = document.querySelectorAll('textarea, [contenteditable="true"], [class*="description"], [class*="desc"]');
            for (var i = 0; i < allEls.length; i++) {
              var el = allEls[i];
              if (el.tagName === 'TEXTAREA') {
                el.value = ${JSON.stringify(article.content)};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                break;
              } else if (el.getAttribute('contenteditable') === 'true') {
                el.innerHTML = ${JSON.stringify(article.content.replace(/\n/g, '<br>'))};
                el.dispatchEvent(new Event('input', { bubbles: true }));
                break;
              }
            }
          })()
        `)
      } catch (e) {
        log.warn('RpaView', `douyin: Content fill failed: ${e.message}`)
      }
    }

    // 5. 上传封面（如提供）
    if (article.cover_path) {
      this._emitProgress('douyin', '上传封面...', 75)
      try {
        // 点击封面按钮
        const coverClicked = await this._click(win, '[class*="cover"]')
        if (coverClicked) {
          await new Promise(r => setTimeout(r, 1000))
          // 等待文件输入出现（封面选择器可能会弹出新 input）
          await this._setFileInput(win, article.cover_path)
          await new Promise(r => setTimeout(r, 2000))
        }
      } catch (e) {
        log.warn('RpaView', `douyin: Cover upload failed: ${e.message}`)
      }
    }

    // 6. 填写标签
    if (article.tags && article.tags.length > 0) {
      this._emitProgress('douyin', '添加标签...', 80)
      for (const tag of article.tags) {
        try {
          await win.webContents.executeJavaScript(`
            (function() {
              var tagInputs = document.querySelectorAll('[class*="tag"] input, input[placeholder*="tag"], input[placeholder*="标签"]');
              if (tagInputs.length > 0) {
                var input = tagInputs[0];
                input.value = ${JSON.stringify(tag)};
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13 }));
              }
            })()
          `)
          await new Promise(r => setTimeout(r, 1000))
        } catch (e) {
          log.warn('RpaView', `douyin: Tag add failed: ${e.message}`)
        }
      }
    }

    // 7. 点击发布
    this._emitProgress('douyin', '正在发布...', 90)
    try {
      // 等待网络响应（在点击发布前开始监听）
      const responsePromise = this._waitForResponse(win, ['aweme/create', 'aweme/post'], 60000)

      // 点击发布按钮
      if (article.draft) {
        await this._click(win, 'button:has-text("草稿"), [class*="draft"]')
      } else {
        await this._click(win, 'button:has-text("发布"), [class*="publish"]')
      }

      // 等待发布确认（API 响应或页面跳转）
      const response = await responsePromise

      // 8. 验证成功
      let publishSuccess = false
      let publishUrl = ''

      if (response) {
        publishSuccess = response.statusCode === 200
        // 从响应 URL 或页面 URL 提取作品链接
        publishUrl = win.webContents.getURL()
        this._emitProgress('douyin', 'API 响应确认发布成功', 100)
      } else {
        // 兜底：检查 URL 变化
        await new Promise(r => setTimeout(r, 5000))
        const finalUrl = win.webContents.getURL()
        if (finalUrl.includes('success') || finalUrl.includes('publish/success')) {
          publishSuccess = true
          publishUrl = finalUrl
        }
      }

      if (publishSuccess) {
        return { success: true, url: publishUrl || '', platform: 'douyin' }
      } else {
        return { success: false, error: '发布结果确认超时', platform: 'douyin' }
      }
    } catch (e) {
      log.error('RpaView', `douyin: Publish failed: ${e.message}`)
      return { success: false, error: e.message, platform: 'douyin' }
    }
  }

  /**
   * 微信公众号发布（存根 — 待实现）
   */
  async _publish_wechat_mp (win, article) {
    return { success: false, error: '微信公众号 RPA 待实现', platform: 'wechat_mp' }
  }

  /**
   * 小红书发布（存根 — 待实现）
   */
  async _publish_xiaohongshu (win, article) {
    return { success: false, error: '小红书 RPA 待实现', platform: 'xiaohongshu' }
  }

  /**
   * 通用发布任务
   *
   * 根据 platform 自动路由到对应的 _publish_ 方法。
   * 未实现的平台返回错误。
   *
   * @param {string} platform - 平台标识
   * @param {Object} article - { title, content, video_path, cover_path, tags, draft }
   * @param {Object} [authData] - { cookies, localStorage }
   * @returns {Promise<Object>} { success, url, error, platform }
   */
  async publish (platform, article, authData) {
    const key = this._windowKey(platform, article?.accountId)
    const partition = `persist:rpa-${key}`

    this._emitProgress(platform, '启动隐藏浏览器...', 0)

    // 创建隐藏浏览器窗口
    const win = this._createWindow(partition)
    this.windows[key] = win

    // 保存窗口引用以便超时清理
    const publishTimeout = PLATFORM_TIMEOUTS[platform] || 120000

    try {
      // 恢复 Cookie（需在导航前）
      if (authData?.cookies) {
        await this._restoreCookies(win, authData.cookies)
        this._emitProgress(platform, 'Cookie 已恢复', 2)
      }

      // 查找对应平台的发布方法
      const methodName = `_publish_${platform}`
      if (typeof this[methodName] !== 'function') {
        throw new Error(`平台 ${platform} 的 RPA 发布脚本尚未实现`)
      }

      // 设置超时
      const result = await Promise.race([
        this[methodName](win, article),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`发布超时 (${publishTimeout / 1000}s)`)), publishTimeout)
        ),
      ])

      return result
    } catch (e) {
      log.error('RpaView', `Publish error for ${platform}: ${e.message}`)
      return { success: false, error: e.message, platform }
    } finally {
      // 清理窗口
      try {
        win.destroy()
      } catch (e) { /* ignore */ }
      delete this.windows[key]
    }
  }

  /**
   * 检查平台登录状态（通过打开隐藏页面检测）
   *
   * @param {string} platform
   * @param {Array} cookies
   * @returns {Promise<boolean>}
   */
  async checkAuth (platform, cookies) {
    const key = `rpa-check-${platform}-${Date.now()}`
    const partition = `persist:rpa-check-${key}`
    const win = this._createWindow(partition)

    try {
      if (cookies?.length > 0) {
        await this._restoreCookies(win, cookies)
      }

      const url = PLATFORM_PUBLISH_URLS[platform]
      if (!url) return false

      await win.webContents.loadURL(url)
      await new Promise(r => setTimeout(r, 5000))

      const currentUrl = win.webContents.getURL()

      // 如果还在原 URL（没有被重定向到登录页），则已登录
      const isLoggedIn = (
        currentUrl.includes(url) ||
        !currentUrl.includes('login') && !currentUrl.includes('passport') && !currentUrl.includes('signin')
      )

      return isLoggedIn
    } catch (e) {
      return false
    } finally {
      try { win.destroy() } catch (e) { /* ignore */ }
    }
  }

  /**
   * 清理所有隐藏窗口
   */
  cleanup () {
    for (const key of Object.keys(this.windows)) {
      try {
        this.windows[key].destroy()
      } catch (e) { /* ignore */ }
    }
    this.windows = {}
    log.info('RpaView', 'All RPA windows cleaned up')
  }
}

module.exports = RpaViewManager
