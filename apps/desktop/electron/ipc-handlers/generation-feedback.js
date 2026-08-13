// @ts-check
'use strict'

/**
 * generation-feedback.js — 提示词引擎自进化反馈 IPC
 *
 * 通道：
 * - generation:feedback（渲染→主）：上报用户操作反馈（采纳/重新生成/编辑/下载/发布）
 * - prompt-library:list（P0 骨架）：模板库只读列表（尚未实现记忆库，返回空）
 *
 * 契约：入参纯 JSON；eventId 必传；沿用 code+data+message + EC 常量。
 */

function registerHandlers (ipcMain, deps) {
  const EC = require('../core/error-codes').ERROR
  const { signalCollector, promptMemory } = deps || {}

  ipcMain.handle('generation:feedback', async (_, arg) => {
    try {
      // R51 解构保护：入参必须为纯 JSON 对象
      if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
        return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      }
      // eventId 或 sessionId 至少其一：eventId 直接关联；sessionId 由采集器解析到最新生成事件
      if ((typeof arg.eventId !== 'string' || arg.eventId.length === 0) &&
          (typeof arg.sessionId !== 'string' || arg.sessionId.length === 0)) {
        return { code: EC.VALIDATION_ERROR, message: 'eventId 或 sessionId 至少必填其一' }
      }
      if (!signalCollector || typeof signalCollector.recordFeedback !== 'function') {
        return { code: EC.UNKNOWN_ERROR, message: '反馈采集器未启用' }
      }
      const result = signalCollector.recordFeedback({
        eventId: typeof arg.eventId === 'string' ? arg.eventId : undefined,
        sessionId: typeof arg.sessionId === 'string' ? arg.sessionId : undefined,
        type: arg.type,
        detail: arg.detail && typeof arg.detail === 'object' ? arg.detail : undefined,
        ts: typeof arg.ts === 'string' ? arg.ts : undefined,
      })
      if (!result.ok) {
        if (result.error === 'invalid-feedback') {
          return { code: EC.VALIDATION_ERROR, message: '反馈数据校验失败' }
        }
        if (result.error === 'collection-muted') {
          // muted 是预期配置态而非故障：返回成功并标注 muted（M6 修复）
          return { code: EC.SUCCESS, data: { muted: true } }
        }
        return { code: EC.REQUEST_ERROR, message: '反馈写入失败' }
      }
      return { code: EC.SUCCESS, data: { orphan: !!result.orphan, muted: false } }
    } catch (e) {
      // 不向渲染进程泄露内部异常细节（M6 修复）
      return { code: EC.REQUEST_ERROR, message: '反馈处理失败' }
    }
  })

  ipcMain.handle('prompt-library:list', async () => {
    // P1b：升级为真实只读列表，保持 P0 envelope data:{templates, evolution}（M1 兼容契约）
    const state = !signalCollector ? 'disabled' : (signalCollector.isEnabled ? 'enabled' : 'muted')
    const templates = (promptMemory && typeof promptMemory.list === 'function') ? promptMemory.list({}) : []
    return { code: EC.SUCCESS, data: { templates, evolution: state } }
  })

  ipcMain.handle('prompt-library:get', async (_, arg) => {
    try {
      if (!arg || typeof arg !== 'object' || Array.isArray(arg) || typeof arg.id !== 'string' || arg.id.length === 0) {
        return { code: EC.TEMPLATE_INVALID, message: '缺少模板 id' }
      }
      if (!promptMemory) return { code: EC.UNKNOWN_ERROR, message: '记忆库未启用' }
      if (arg.version != null && !(Number.isInteger(arg.version) && arg.version >= 1)) {
        return { code: EC.TEMPLATE_INVALID, message: 'version 必须为正整数' }
      }
      const version = arg.version
      const tpl = promptMemory.get(arg.id, version)
      if (!tpl) return { code: EC.TEMPLATE_NOT_FOUND, message: '模板不存在' }
      return { code: EC.SUCCESS, data: tpl }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: '模板读取失败' }
    }
  })

  ipcMain.handle('prompt-library:save', async (_, arg) => {
    try {
      if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
        return { code: EC.VALIDATION_ERROR, message: '缺少参数对象' }
      }
      if (!promptMemory) return { code: EC.UNKNOWN_ERROR, message: '记忆库未启用' }
      const result = promptMemory.saveLearnt({
        engine: arg.engine,
        mode: arg.mode,
        type: arg.type,
        content: arg.content,
        concept: arg.concept,
        eventId: arg.eventId,
      })
      if (!result.ok) {
        return { code: result.code, message: result.message || '模板入库失败' }
      }
      return { code: EC.SUCCESS, data: { id: result.id, version: result.version, state: result.state } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: '模板入库失败' }
    }
  })

  ipcMain.handle('prompt-library:activate', async (_, arg) => {
    try {
      if (!arg || typeof arg !== 'object' || Array.isArray(arg) || typeof arg.id !== 'string' || arg.id.length === 0) {
        return { code: EC.TEMPLATE_INVALID, message: '缺少模板 id' }
      }
      if (!promptMemory) return { code: EC.UNKNOWN_ERROR, message: '记忆库未启用' }
      const confirmedBy = typeof arg.confirmedBy === 'string' ? arg.confirmedBy : undefined
      const result = promptMemory.activate(arg.id, { confirmedBy })
      if (!result.ok) {
        return { code: result.code, message: result.message || '模板激活失败' }
      }
      return { code: EC.SUCCESS, data: { id: result.id, state: result.state } }
    } catch (e) {
      return { code: EC.REQUEST_ERROR, message: '模板激活失败' }
    }
  })
}

module.exports = registerHandlers
