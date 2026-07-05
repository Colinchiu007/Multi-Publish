/**
 * CloudPublisher — Orchestrator HTTP client for cloud-based publishing (F13)
 *
 * Communicates with platform-orchestrator's publish endpoints to submit
 * and track video publish tasks running on the ECS server.
 *
 * IPC handlers (registered via registerIpcHandlers):
 *   cloud-publisher:submit     → submitTask
 *   cloud-publisher:list-tasks → listTasks
 *   cloud-publisher:get-task   → getTask
 *   cloud-publisher:platforms  → getSupportedPlatforms
 */

const { log } = require('./logger')

class CloudPublisher {

  /**
   * @param {Object} opts
   * @param {string} opts.orchestratorUrl - Orchestrator base URL (e.g. http://39.105.42.85)
   * @param {Object} opts.store - Electron store instance (reserved for future use)
   */
  constructor (opts) {
    this._axios = opts.axios || require("axios")
    this._orchestratorUrl = opts.orchestratorUrl || 'http://39.105.42.85'
    this._store = opts.store || null
  }

  /**
   * 提交云端发布任务
   *
   * POST /api/jobs/publish-video  { mode: "cloud", video_url, platform, title, desc, tags, cover_url }
   *
   * @param {Object} params
   * @param {string} params.videoUrl
   * @param {string} params.platform
   * @param {string} params.title
   * @param {string} [params.desc]
   * @param {string[]} [params.tags]
   * @param {string} [params.coverUrl]
   * @returns {Promise<Object>} orchestrator response: { task_id, status, platform }
   */
  async submitTask ({ videoUrl, platform, title, desc, tags, coverUrl }) {
    const resp = await this._axios.post(this._orchestratorUrl + '/api/jobs/publish-video', {
      video_url: videoUrl,
      platform: platform,
      title: title,
      desc: desc || '',
      tags: tags || [],
      cover_url: coverUrl || '',
      mode: 'cloud',
    })
    return resp.data
  }

  /**
   * 获取云端发布任务列表
   *
   * GET /api/jobs/publish
   *
   * @returns {Promise<{items: Array}>}
   */
  async listTasks () {
    const resp = await this._axios.get(this._orchestratorUrl + '/api/jobs/publish')
    return resp.data
  }

  /**
   * 获取单个云端发布任务详情
   *
   * GET /api/jobs/publish/{taskId}
   *
   * @param {string} taskId
   * @returns {Promise<Object>}
   */
  async getTask (taskId) {
    const resp = await this._axios.get(this._orchestratorUrl + '/api/jobs/publish/' + taskId)
    return resp.data
  }

  /**
   * 获取支持云端发布的平台列表
   *
   * @returns {Array<{id: string, name: string}>}
   */
  getSupportedPlatforms () {
    return [
      { id: 'bilibili', name: 'B站' },
      { id: 'douyin', name: '抖音' },
    ]
  }

  /**
   * 注册 IPC handlers
   */
  registerIpcHandlers () {
    const { ipcMain } = require("electron")
    ipcMain.handle('cloud-publisher:submit', async (_event, params) => {
      try {
        const result = await this.submitTask(params)
        return { ok: true, data: result }
      } catch (err) {
        log.error('CloudPublisher', 'submit failed: ' + err.message)
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle('cloud-publisher:list-tasks', async () => {
      try {
        const result = await this.listTasks()
        return { ok: true, data: result }
      } catch (err) {
        log.error('CloudPublisher', 'list-tasks failed: ' + err.message)
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle('cloud-publisher:get-task', async (_event, taskId) => {
      try {
        const result = await this.getTask(taskId)
        return { ok: true, data: result }
      } catch (err) {
        log.error('CloudPublisher', 'get-task failed: ' + err.message)
        return { ok: false, error: err.message }
      }
    })

    ipcMain.handle('cloud-publisher:platforms', async () => {
      return { ok: true, data: this.getSupportedPlatforms() }
    })
  }
}

module.exports = CloudPublisher
