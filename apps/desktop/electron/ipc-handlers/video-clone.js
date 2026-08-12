// @ts-check
/**
 * 视频克隆 IPC handlers（切片 4b）
 * 通道：video-clone:run / video-clone:cancel / video-clone:report:edit / video-clone:report:regenerate
 * 进度：video-clone:progress（主 → 渲染事件）
 * 独立流水线：仅新增 handler，不修改既有管线 handler。
 */
const { withSenderCheck } = require('./helpers')
const engine = require('@multi-publish/video-clone-engine')

function registerHandlers(ipcMain, deps) {
  const { BrowserWindow } = deps
  const service = engine.createVideoCloneService({
    createPipeline: (opts) => engine.createSlice3Pipeline(Object.assign({}, opts, { outputDir: require('node:os').tmpdir() })),
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
    // 切片 4c：基于已编辑报告重跑 generate→compose；当前返回未接线提示
    return { code: 0, data: { status: 'not-wired', runId: arg && arg.runId } }
  })
}

module.exports = registerHandlers
