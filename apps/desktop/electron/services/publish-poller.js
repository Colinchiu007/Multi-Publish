// @ts-nocheck
/**
 * PublishPoller — orchestrator-driven publish poller (Plan B)
 *
 * Polls GET /api/jobs/publish/pending on an interval, downloads video files,
 * delegates RPA publishing to PublisherRouter, and updates task status.
 *
 * Architecture matches existing patterns: keywordMonitor, callbackServer.
 * Integrate in main.js: create instance in app.whenReady(), stop in window-all-closed.
 */

const fs = require('fs')
const path = require('path')
const log = require('./logger')

/**
 * SSRF 防护：校验外部 URL（协议白名单 + 内网 IP 黑名单）
 * 与 url-collector.js / webhook-manager.js 保持一致的校验规则
 */
function _validateExternalUrl (url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch (e) {
    return { ok: false, reason: 'URL 格式不正确' }
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: '仅支持 http/https 协议' }
  }
  const hostname = parsed.hostname.toLowerCase()
  const isInternal = hostname === 'localhost' ||
    hostname === '::1' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    hostname.startsWith('169.254.') ||
    hostname.endsWith('.local')
  if (isInternal) {
    return { ok: false, reason: '不允许访问内网地址' }
  }
  return { ok: true }
}

class PublishPoller {
  /**
   * @param {object} opts
   * @param {string} opts.orchestratorUrl - ECS orchestrator base URL
   * @param {number} opts.pollInterval - polling interval in ms (default 2000)
   * @param {object} opts.publisherRouter - PublisherRouter instance
   * @param {object} opts.rpaViewManager - RpaViewManager instance
   * @param {object} opts.store - Store (SQLite) instance for account loading
   */
  constructor (opts) {
    const Axios = opts.axios || require("axios")
    // R28/R37：默认 30s 超时（API 轮询/状态更新）；视频/封面下载在调用处覆盖为更长超时
    this._axios = Axios.create ? Axios.create({ timeout: 30000 }) : Axios
    // 安全：不再硬编码生产 IP，必须通过 opts 或环境变量提供
    this.orchestratorUrl = opts.orchestratorUrl || process.env.ORCHESTRATOR_URL || ''
    if (!this.orchestratorUrl) {
      log.warn('PublishPoller', 'orchestratorUrl 未配置（set opts.orchestratorUrl 或 ORCHESTRATOR_URL env）')
    }
    this.pollInterval = opts.pollInterval || 2000
    this.publisherRouter = opts.publisherRouter
    this.rpaViewManager = opts.rpaViewManager
    this.store = opts.store
    this._rpaCheck = typeof opts.rpaCheck === 'function' ? opts.rpaCheck : null
    this._timer = null
    this._running = false
  }

  /**
   * Start polling. Idempotent - safe to call multiple times.
   */
  start () {
    if (this._running) return
    this._running = true
    // 递归 setTimeout：确保上一次 _poll 完成后再调度，避免 setInterval 竞态导致重复处理
    const scheduleNext = () => {
      if (!this._running) return
      this._timer = setTimeout(async () => {
        try { await this._poll() } catch (e) { log.warn('PublishPoller', 'poll error: ' + e.message) }
        scheduleNext()
      }, this.pollInterval)
      // R28 修复：unref 让定时器不阻止进程退出
      if (this._timer && this._timer.unref) this._timer.unref()
    }
    scheduleNext()
    log.info('PublishPoller', 'started (interval=' + this.pollInterval + 'ms)')
  }

  /**
   * Stop polling. Idempotent - safe to call multiple times.
   */
  stop () {
    if (!this._running) return
    this._running = false
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    log.info('PublishPoller', 'stopped')
  }

  // Internal

  /**
   * Check if platform supports RPA publishing.
   * @param {string} platform
   * @returns {boolean}
   */
  _isRpaEnabled (platform) {
    if (!this._rpaCheck) return true
    return this._rpaCheck(platform)
  }

  /**
   * Single poll cycle: fetch pending tasks, process each.
   */
  async _poll () {
    try {
      const resp = await this._axios.get(this.orchestratorUrl + '/api/jobs/publish/pending')
      const items = resp.data && resp.data.items
      if (!items || items.length === 0) return

      log.info('PublishPoller', 'found ' + items.length + ' pending task(s)')
      for (const task of items) {
        await this._processTask(task)
      }
    } catch (err) {
      log.warn('PublishPoller', 'poll error: ' + err.message)
    }
  }

  /**
   * Process a single task: download -> publish -> update status.
   */
  async _processTask (task) {
    const input = task.input_data || {}
    const taskId = task.id
    const platform = input.platform
    const videoUrl = input.video_url

    if (!taskId || !platform || !videoUrl) {
      log.warn('PublishPoller', 'invalid task: ' + JSON.stringify({ id: taskId, platform: platform }))
      return
    }

    // Check RPA routing — skip platforms configured for cloud API
    if (!this._isRpaEnabled(platform)) {
      log.info('PublishPoller', 'skip ' + taskId + ' (platform ' + platform + ': rpa disabled, leave for cloud API)')
      return
    }

    // Mode-based skip — cloud tasks handled by orchestrator background task
    if (input.mode === 'cloud') {
      log.info('PublishPoller', 'skip ' + taskId + ' (mode=cloud, leave for orchestrator background task)')
      return
    }

    // Phase 1: Download video
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'publish_'))
    let videoPath = null
    let coverPath = null

    try {
      await this._updateTaskStatus(taskId, 'downloading', {
        phase: 'download', percent: 10, message: 'Downloading video...',
      })

      // 安全修复：SSRF 防护 — 校验 videoUrl 协议白名单 + 内网 IP 黑名单
      const videoSsrfCheck = _validateExternalUrl(videoUrl)
      if (!videoSsrfCheck.ok) {
        log.warn('PublishPoller', `SSRF blocked for video_url: ${videoSsrfCheck.reason}`)
        await this._updateTaskStatus(taskId, 'failed', { message: 'video_url ' + videoSsrfCheck.reason })
        return
      }

      const parsedUrl = new URL(videoUrl)
      const ext = path.extname(parsedUrl.pathname) || '.mp4'
      videoPath = path.join(tmpDir, 'video' + ext)

      const writer = fs.createWriteStream(videoPath)
      const downloadResp = await this._axios.get(videoUrl, { responseType: 'stream', timeout: 300000 })
      downloadResp.data.pipe(writer)

      await new Promise(function (resolve, reject) {
        writer.on('finish', resolve)
        writer.on('error', reject)
      })

      // Download cover (optional)
      if (input.cover_url) {
        try {
          // 安全修复：SSRF 防护 — 校验 cover_url
          const coverSsrfCheck = _validateExternalUrl(input.cover_url)
          if (!coverSsrfCheck.ok) {
            log.warn('PublishPoller', `SSRF blocked for cover_url: ${coverSsrfCheck.reason}`)
            coverPath = null
          } else {
            const coverExt = path.extname(new URL(input.cover_url).pathname) || '.jpg'
            coverPath = path.join(tmpDir, 'cover' + coverExt)
            const coverWriter = fs.createWriteStream(coverPath)
            const coverResp = await this._axios.get(input.cover_url, { responseType: 'stream', timeout: 60000 })
            coverResp.data.pipe(coverWriter)
            await new Promise(function (resolve, reject) {
              coverWriter.on('finish', resolve)
              coverWriter.on('error', reject)
            })
          }
        } catch (coverErr) {
          log.warn('PublishPoller', 'cover download failed: ' + coverErr.message)
          coverPath = null
        }
      }

      // Phase 2: Update to publishing
      const fileSizeMb = Math.round((fs.statSync(videoPath).size || 0) / 1024 / 1024 * 10) / 10
      await this._updateTaskStatus(taskId, 'publishing', {
        phase: 'publish', percent: 30, message: 'Publishing to ' + platform + ' (' + fileSizeMb + 'MB)...',
      })

      // Phase 3: RPA publish via PublisherRouter
      if (!this.publisherRouter) {
        throw new Error('publisherRouter not configured')
      }

      const publisher = this.publisherRouter.createPublisher(platform, {
        rpaViewManager: this.rpaViewManager,
        store: this.store,
      })

      const publishResult = await publisher.publish({
        article: {
          title: input.title || '',
          content: input.desc || '',
          desc: input.desc || '',
          tags: input.tags || [],
          video_path: videoPath,
          cover_path: coverPath,
          cover_url: coverPath,
        },
      })

      // Phase 4: Update to success
      await this._updateTaskStatus(taskId, 'success', {
        platform: platform,
        publish_id: publishResult.postId || '',
        url: publishResult.url || '',
        file_size_mb: fileSizeMb,
      })

      log.info('PublishPoller', 'published ' + taskId + ' to ' + platform)
    } catch (err) {
      log.error('PublishPoller', 'task ' + taskId + ' failed: ' + err.message)
      try {
        await this._updateTaskStatus(taskId, 'failed', null, err.message)
      } catch (statusErr) {
        log.error('PublishPoller', 'status update failed: ' + statusErr.message)
      }
    } finally {
      try {
        if (videoPath) fs.unlinkSync(videoPath)
        if (coverPath) fs.unlinkSync(coverPath)
        fs.rmdirSync(tmpDir)
      // eslint-disable-next-line no-unused-vars
      } catch (cleanupErr) {
        // ignore cleanup errors
      }
    }
  }

  /**
   * Update task status on orchestrator.
   */
  async _updateTaskStatus (taskId, status, output, error) {
    const body = { status: status }
    if (output) body.output = output
    if (error) body.error = error
    await this._axios.put(this.orchestratorUrl + '/api/jobs/publish/' + taskId + '/status', body)
  }
}

module.exports = PublishPoller
