// @ts-check
'use strict'
/**
 * PromptEval IPC 通道
 * prompt-eval:run / list / get / delete / analyze / dimensions
 * 所有通道带 withSenderCheck；run 对图片路径做解析 + 拷贝（不改调用方对象），
 * 深层路径/魔数校验由引擎 fail closed 承担（EVAL_IMAGE_INVALID / EVAL_IMAGE_NOT_FOUND）。
 */
const path = require('path')
const { withSenderCheck } = require('./helpers')

function registerPromptEvalHandlers (ipcMain, deps) {
  const service = deps && deps.promptEvalService
  if (!service) throw new Error('promptEvalService 未注入，无法注册 prompt-eval IPC 通道')

  ipcMain.handle('prompt-eval:run', withSenderCheck(async (_event, request) => {
    if (!request || typeof request !== 'object') {
      throw Object.assign(new Error('评估请求必须是对象'), { code: 'EVAL_INVALID_REQUEST' })
    }
    // 拷贝入参后再归一化路径，避免污染调用方对象
    const normalized = Array.isArray(request.items) ? request.items.map(item => {
      const copy = item && typeof item === 'object' ? { ...item } : item
      if (copy && typeof copy.imagePath === 'string' && copy.imagePath) {
        copy.imagePath = path.resolve(copy.imagePath)
      }
      return copy
    }) : request.items
    return service.run({ ...request, items: normalized })
  }))

  ipcMain.handle('prompt-eval:list', withSenderCheck(async () => service.list()))

  ipcMain.handle('prompt-eval:get', withSenderCheck(async (_event, id) => service.get(id)))

  ipcMain.handle('prompt-eval:delete', withSenderCheck(async (_event, id) => service.remove(id)))

  ipcMain.handle('prompt-eval:analyze', withSenderCheck(async () => service.analyze()))

  ipcMain.handle('prompt-eval:dimensions', withSenderCheck(async () => service.dimensions()))
}

module.exports = registerPromptEvalHandlers
