// @ts-check
/**
 * 发布 & 队列 & 历史 IPC handlers
 * publish:wechat → 微信发布
 * publish:batch → 批量发布
 * queue:status / queue:history / queue:cancel / queue:retry → 任务队列
 * history:list / history:get / history:delete → 发布历史
 * dashboard:stats → 发布统计
 */

function registerHandlers(ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { withSenderCheck } = require('./helpers')
  // eslint-disable-next-line no-unused-vars
  const { taskQueue, history, BrowserWindow, log, identityService } = deps

  // 平台和账号标识会进入发布路由及下游 URL，只允许单一路径段。
  function isSafePathSegment(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]+$/.test(value)
  }

  // identityService 存在时，历史记录必须以当前认证用户为唯一归属来源。
  function getOwnerSubject () {
    if (!identityService) return undefined
    try {
      const state = identityService.getState()
      const subject = state && state.user && state.user.sub
      if (typeof subject === 'string' && subject.trim()) return subject.trim()
    } catch (_) { /* 身份服务不可用时按未登录处理 */ }
    return null
  }

  // 封面提取：cover:extract
  ipcMain.handle('cover:extract', withSenderCheck(async (event, videoPath) => {
    try {
      if (typeof videoPath !== 'string' || !videoPath) {
        return { code: EC.VALIDATION_ERROR, message: 'videoPath 必须为非空字符串' }
      }
      const { extractVideoCover } = require('../services/cover-extractor')
      const coverPath = await extractVideoCover(videoPath)
      if (!coverPath) {
        return { code: EC.REQUEST_ERROR, message: '封面提取失败' }
      }
      return { code: 0, data: { coverPath }, message: '封面提取成功' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('publish:wechat', withSenderCheck(async (event, articleData) => {
    try {
      const offlineManager = require('../services/offline-manager')
      if (offlineManager.isOffline()) {
        offlineManager.addToCache({ platform: 'wechat_mp', article: articleData, accountId: null })
        return { code: 0, data: { cached: true }, message: '网络离线，任务已缓存，恢复后自动发布' }
      }
      const taskId = taskQueue.add({
        platform: 'wechat_mp',
        article: articleData,
        retry: 2,
        timeout: 180000,
      })
      return { code: 0, data: { taskId }, message: '任务已加入队列' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('publish:batch', withSenderCheck(async (event, arg) => {
    try {
    // R51 P1：解构保护，arg 为 undefined 时解构会抛（M-5 修复不完整补丁）
    if (!arg || typeof arg !== 'object') return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
    const { platforms, article } = arg
    // M-5 修复：参数校验，platforms 为 undefined 时 .map() 必崩
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return { code: EC.VALIDATION_ERROR, message: 'platforms 不能为空且必须为数组' }
    }
    if (article !== undefined && (!article || typeof article !== 'object' || Array.isArray(article))) {
      return { code: EC.VALIDATION_ERROR, message: 'article 必须为对象' }
    }
    const normalizedTargets = []
    for (const target of platforms) {
      if (typeof target === 'string') {
        const platform = target.trim()
        if (!isSafePathSegment(platform)) return { code: EC.VALIDATION_ERROR, message: '发布平台格式无效' }
        normalizedTargets.push({ platform, accountId: null })
        continue
      }
      if (!target || typeof target !== 'object' || Array.isArray(target)) {
        return { code: EC.VALIDATION_ERROR, message: '发布目标格式无效' }
      }
      const platform = typeof target.platform === 'string' ? target.platform.trim() : ''
      const accountId = typeof target.accountId === 'string' ? target.accountId.trim() : ''
      if (!isSafePathSegment(platform)) return { code: EC.VALIDATION_ERROR, message: '发布目标平台格式无效' }
      if (!isSafePathSegment(accountId)) return { code: EC.VALIDATION_ERROR, message: '发布目标账号格式无效' }
      normalizedTargets.push({ platform, accountId })
    }
    const plainArticle = JSON.parse(JSON.stringify(article || {}))
    const taskIds = normalizedTargets.map(({ platform, accountId }) => {
      return taskQueue.add({
        platform,
        article: { ...plainArticle, accountId },
        accountId,
      })
    })
      return { code: 0, data: { taskIds }, message: taskIds.length + " tasks added" }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('queue:status', withSenderCheck(async () => {
    try {
      // M-13 修复：成功路径也包裹为标准格式，与错误路径对称
      return { code: 0, data: taskQueue.getStatus() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
  ipcMain.handle('queue:history', withSenderCheck(async () => {
    try {
      return { code: 0, data: taskQueue.getHistory() }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message, data: [] } }
  }))
  ipcMain.handle('queue:cancel', withSenderCheck(async (event, taskId) => {
    try {
      const ok = taskQueue.cancel(taskId)
      // R52 修复：统一返回格式，补充 data 字段
      return { code: ok ? 0 : EC.NOT_FOUND, data: ok, message: ok ? '任务已取消' : '任务不存在或已完成' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('queue:retry', withSenderCheck(async (event, taskId) => {
    try {
      if (typeof taskId !== 'string' || !taskId.trim()) {
        return { code: EC.VALIDATION_ERROR, message: 'taskId 不能为空' }
      }
      const retryTaskId = taskQueue.retry(taskId.trim())
      if (!retryTaskId) {
        return { code: EC.NOT_FOUND, data: null, message: '任务不存在或状态不可重试' }
      }
      return {
        code: 0,
        data: { taskId: retryTaskId, retryOf: taskId.trim() },
        message: '任务已重新加入队列',
      }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('history:list', withSenderCheck(async (event, opts) => {
    try {
      const owner = getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户', data: { total: 0, records: [] } }
      const result = history.listRecords(opts, owner)
      return { code: 0, data: result }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: e.message, data: { total: 0, records: [] } }
    }
  }))

  ipcMain.handle('history:get', withSenderCheck(async (event, id) => {
    try {
      const owner = getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      const record = history.getRecord(id, owner)
      if (!record) return { code: EC.NOT_FOUND, message: '记录不存在' }
      return { code: 0, data: record }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('history:delete', withSenderCheck(async (event, payload) => {
    try {
      const owner = getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }

      const ids = Array.isArray(payload) ? payload : payload && payload.ids
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
        return { code: EC.VALIDATION_ERROR, message: '记录 ID 列表无效' }
      }
      const normalizedIds = ids
        .filter(id => typeof id === 'string')
        .map(id => id.trim())
        .filter(Boolean)
      if (normalizedIds.length !== ids.length) {
        return { code: EC.VALIDATION_ERROR, message: '记录 ID 格式无效' }
      }

      const result = history.deleteRecords(normalizedIds, owner)
      if (!result || result.deleted === 0) {
        return { code: EC.NOT_FOUND, data: { deleted: 0 }, message: '记录不存在' }
      }
      return { code: 0, data: result, message: '发布记录已删除' }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))

  ipcMain.handle('dashboard:stats', withSenderCheck(async () => {
    try {
      const owner = getOwnerSubject()
      if (owner === null) return { code: EC.AUTH_ERROR, message: '无法识别当前用户' }
      return { code: 0, data: history.getStats(owner) }
    } catch (e) { return { code: EC.REQUEST_ERROR, message: e.message } }
  }))
}

module.exports = registerHandlers
