// @ts-check
/**
 * pipeline-card-backgrounds.js — IPC handlers
 *
 * 通道：
 *   pipeline-card:backgrounds  — 获取/生成流水线卡片背景（GET 语义，public 只读）
 *
 * 失败语义（见 OpenSpec pipeline-card-backgrounds-ui）：
 *   - 入参非法（非数组、非法名称、批量超限）→ VALIDATION_ERROR
 *   - 无可用 provider / 部分失败 → code 0，data 内 available/failed 表达
 *   - 服务异常 → REQUEST_ERROR
 */
const { PipelineCardBackgrounds } = require('../services/pipeline-card-backgrounds')
const { withSenderCheck } = require('./helpers')
const { ERROR: EC } = require('../core/error-codes')

let singleton = null

function getService (deps) {
  if (deps && deps.pipelineCardBackgrounds) return deps.pipelineCardBackgrounds
  if (singleton) return singleton
  const { app, modelProviderManager, log } = deps || {}
  if (!app || typeof app.getPath !== 'function') {
    throw new Error('pipeline-card-backgrounds: app 依赖缺失')
  }
  const userDataDir = app.getPath('userData')
  singleton = new PipelineCardBackgrounds({
    userDataDir,
    manager: modelProviderManager,
    log: log || console,
  })
  return singleton
}

function registerPipelineCardBackgroundsHandlers (ipcMain, deps) {
  ipcMain.handle('pipeline-card:backgrounds', withSenderCheck(async (_event, payload) => {
    try {
      const names = payload && Array.isArray(payload.names) ? payload.names : null
      if (!names) return { code: EC.VALIDATION_ERROR, message: '缺少流水线名称列表' }
      const service = getService(deps)
      const data = await service.ensure({ names, force: payload.force === true })
      return { code: 0, data }
    } catch (error) {
      if (error && (error.code === 'VALIDATION_ERROR' || error.name === 'ValidationError')) {
        return { code: EC.VALIDATION_ERROR, message: error.message }
      }
      if (deps && deps.log && typeof deps.log.error === 'function') {
        deps.log.error('[pipeline-card-backgrounds] error:', error)
      }
      return { code: EC.REQUEST_ERROR, message: error && error.message ? error.message : '卡片背景服务异常' }
    }
  }))
}

module.exports = registerPipelineCardBackgroundsHandlers
module.exports.getService = getService
