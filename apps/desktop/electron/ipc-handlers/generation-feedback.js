// @ts-check
'use strict'

/**
 * generation-feedback.js — 提示词引擎自进化反馈 IPC
 *
 * 通道：
 * - generation:feedback（渲染→主）：上报用户操作反馈（采纳/重新生成/编辑/下载/发布）
 * - prompt-library:list（真实只读列表，保持 P0 envelope data:{templates, evolution}）
 * - prompt-library:get（单模板详情）
 * - prompt-library:save（learnt 模板入库，过门禁进 draft）
 * - prompt-library:activate（draft→active 人工确认）
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
    } catch {
      // 不向渲染进程泄露内部异常细节（M6 修复）
      return { code: EC.REQUEST_ERROR, message: '反馈处理失败' }
    }
  })

  ipcMain.handle('prompt-library:list', async () => {
    // 记忆库未启用时返回 P0 骨架（空列表 + 状态）
    if (!promptMemory || typeof promptMemory.list !== 'function') {
      const state = !signalCollector ? 'disabled' : (signalCollector.isEnabled ? 'enabled' : 'muted')
      return { code: EC.SUCCESS, data: { templates: [], evolution: state } }
    }
    try {
      const templates = promptMemory.list({})
      const state = !signalCollector ? 'disabled' : (signalCollector.isEnabled ? 'enabled' : 'muted')
      return { code: EC.SUCCESS, data: { templates, evolution: state } }
    } catch {
      return { code: EC.REQUEST_ERROR, message: '模板库读取失败' }
    }
  })

  ipcMain.handle('prompt-library:get', async (_, arg) => {
    if (!promptMemory || typeof promptMemory.get !== 'function') {
      return { code: EC.UNKNOWN_ERROR, message: '模板库未启用' }
    }
    try {
      const id = arg && typeof arg.id === 'string' ? arg.id : null
      if (!id) return { code: EC.TEMPLATE_INVALID, message: '缺少模板 id' }
      const tpl = promptMemory.get(id, arg.version)
      if (!tpl) return { code: EC.TEMPLATE_NOT_FOUND, message: '模板不存在' }
      return { code: EC.SUCCESS, data: tpl }
    } catch {
      return { code: EC.REQUEST_ERROR, message: '模板读取失败' }
    }
  })

  ipcMain.handle('prompt-library:save', async (_, arg) => {
    if (!promptMemory || typeof promptMemory.saveLearnt !== 'function') {
      return { code: EC.UNKNOWN_ERROR, message: '模板库未启用' }
    }
    try {
      // 入参校验：纯 JSON 对象
      if (!arg || typeof arg !== 'object' || Array.isArray(arg)) {
        return { code: EC.TEMPLATE_INVALID, message: '缺少参数对象' }
      }
      // eventId 必填且校验 evt_ 前缀
      if (typeof arg.eventId !== 'string' || !arg.eventId.startsWith('evt_')) {
        return { code: EC.TEMPLATE_INVALID, message: 'eventId 必填且需 evt_ 前缀' }
      }
      // concept ≤2000 截断
      const concept = typeof arg.concept === 'string' ? arg.concept.slice(0, 2000) : ''
      const result = promptMemory.saveLearnt({
        engine: arg.engine,
        mode: arg.mode,
        type: arg.type,
        content: arg.content,
        concept,
        eventId: arg.eventId,
      })
      if (!result.ok) {
        const code = result.code === 'TEMPLATE_GATE_FAILED'
          ? EC.TEMPLATE_GATE_FAILED
          : EC.TEMPLATE_INVALID
        return { code, message: result.code === 'TEMPLATE_GATE_FAILED' ? '模板未通过门禁' : '模板入参非法' }
      }
      return { code: EC.SUCCESS, data: { id: result.id, version: result.version, state: result.state } }
    } catch {
      return { code: EC.REQUEST_ERROR, message: '模板入库失败' }
    }
  })

  ipcMain.handle('prompt-library:activate', async (_, arg) => {
    if (!promptMemory || typeof promptMemory.activate !== 'function') {
      return { code: EC.UNKNOWN_ERROR, message: '模板库未启用' }
    }
    try {
      const id = arg && typeof arg.id === 'string' ? arg.id : null
      if (!id) return { code: EC.TEMPLATE_INVALID, message: '缺少模板 id' }
      const result = promptMemory.activate(id, { confirmedBy: arg && arg.confirmedBy })
      if (!result) return { code: EC.TEMPLATE_BAD_STATE, message: '模板不存在或不可激活' }
      return { code: EC.SUCCESS, data: { id: result.id, state: result.state } }
    } catch {
      return { code: EC.REQUEST_ERROR, message: '模板激活失败' }
    }
  })
}

module.exports = registerHandlers