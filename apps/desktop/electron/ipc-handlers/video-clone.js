// @ts-check
/**
 * 视频克隆 IPC handlers（切片 4b/4c）
 * 通道：video-clone:run / video-clone:cancel / video-clone:report:edit / video-clone:report:regenerate / video-clone:pick-file
 * 进度：video-clone:progress（主 → 渲染事件）
 * 独立流水线：仅新增 handler，不修改既有管线 handler。
 */
const { withSenderCheck } = require('./helpers')
const engine = require('@multi-publish/video-clone-engine')
const {
  createVideoCloneAssetGenerator,
  createPlaceholderImageGenerator,
} = require('../services/video-clone/asset-generator')
const { createVideoClonePublisher } = require('../services/video-clone/publisher')

function registerHandlers(ipcMain, deps) {
  const { BrowserWindow, dialog } = deps
  const tmp = require('node:os').tmpdir()
  // 4c：真实 AssetGenerator 服务优先；无服务时用显式标注的离线占位生成器（degraded）
  const assetGenerator = deps.assetGenerator
    ? createVideoCloneAssetGenerator({ assetGenerator: deps.assetGenerator })
    : createPlaceholderImageGenerator({ outputDir: tmp })
  const publisher = createVideoClonePublisher({ publisherRouter: deps.publisherRouter })

  const service = engine.createVideoCloneService({
    createPipeline: (opts) => engine.createSlice3Pipeline(
      Object.assign({}, opts, { assetGenerator, publisher, outputDir: tmp, fps: 24 }),
    ),
  })

  ipcMain.handle('video-clone:run', withSenderCheck(async (event, arg) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const sendProgress = (evt) => win?.webContents.send('video-clone:progress', evt)
    try {
      const result = await service.run(arg, { sendProgress })
      return { code: 0, data: result }
    } catch (e) {
      return { code: -1, message: e.message, errorCode: e.code || 'VIDEOCLONE_INTERNAL' }
    }
  }))

  ipcMain.handle('video-clone:cancel', (_event, arg) => {
    try {
      return { code: 0, data: service.cancel(arg && arg.runId) }
    } catch (e) { return { code: -1, message: e.message } }
  })

  ipcMain.handle('video-clone:report:edit', (_event, arg) => {
    try {
      const report = service.applyReportPatch(arg && arg.report, arg && arg.patch)
      return { code: 0, data: report }
    } catch (e) {
      return { code: -1, message: e.message, errorCode: 'VIDEOCLONE_REPORT_EDIT_INVALID' }
    }
  })

  ipcMain.handle('video-clone:report:regenerate', (_event, arg) => {
    // 基于已编辑报告重跑 generate→compose（4c 简化：返回 not-wired，4d 接线持久化报告）
    return { code: 0, data: { status: 'not-wired', runId: arg && arg.runId } }
  })

  ipcMain.handle('video-clone:pick-file', withSenderCheck(async (_event) => {
    const dialogApi = dialog || (() => { try { return require('electron').dialog } catch { return null } })()
    if (!dialogApi || typeof dialogApi.showOpenDialog !== 'function') {
      return { code: -1, message: '文件选择对话框不可用' }
    }
    try {
      const result = await dialogApi.showOpenDialog({
        title: '选择视频文件',
        properties: ['openFile'],
        filters: [{ name: '视频文件', extensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'] }],
      })
      if (!result || result.canceled === true || !result.filePaths || result.filePaths.length === 0) {
        return { code: 0, data: { path: null } }
      }
      return { code: 0, data: { path: result.filePaths[0] } }
    } catch (e) {
      return { code: -1, message: e.message }
    }
  }))
}

module.exports = registerHandlers
