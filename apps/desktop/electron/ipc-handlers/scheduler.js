// @ts-check
const { wrapIpcHandlerRaw, withSenderCheck } = require('./helpers')

function registerHandlers(ipcMain, deps) {
  const { scheduler } = deps

  // 迁移至 wrapIpcHandlerRaw：统一 try-catch + 参数校验 + 错误日志
  // 保留原响应格式（含 message 字段）
  ipcMain.handle('scheduler:create', withSenderCheck(wrapIpcHandlerRaw(async (event, arg) => {
    // R51 P1：解构保护（requireArgs 已校验 arg 为对象）
    const { platform, article, publishTime } = arg
    const entry = scheduler.create({ platform, article, publishTime })
    return { code: 0, data: entry, message: '定时任务已创建' }
  }, { requireArgs: true, label: 'scheduler:create' })))

  // 迁移至 wrapIpcHandlerRaw：catchData 保留 catch 时 data: [] 兜底语义
  ipcMain.handle('scheduler:list', wrapIpcHandlerRaw(async () => {
    return { code: 0, data: scheduler.list() }
  }, { label: 'scheduler:list', catchData: [] }))

  ipcMain.handle('scheduler:cancel', withSenderCheck(wrapIpcHandlerRaw(async (event, id) => {
    scheduler.cancel(id)
    return { code: 0, data: true, message: '定时任务已取消' }
  }, { label: 'scheduler:cancel' })))
}

module.exports = registerHandlers
