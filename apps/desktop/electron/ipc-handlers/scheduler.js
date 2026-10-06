// @ts-check
const { wrapIpcHandlerRaw, withSenderCheck } = require('./helpers')

function registerHandlers(ipcMain, deps) {
  const { scheduler, identityService } = deps

  function currentOwnerSubject () {
    if (!identityService) return undefined
    const state = identityService.getState()
    const subject = state && state.user && state.user.sub
    if (typeof subject !== 'string' || !subject.trim()) {
      throw new Error('登录会话缺少用户标识')
    }
    return subject.trim()
  }

  // 迁移至 wrapIpcHandlerRaw：统一 try-catch + 参数校验 + 错误日志
  // 保留原响应格式（含 message 字段）
  ipcMain.handle('scheduler:create', withSenderCheck(wrapIpcHandlerRaw(async (event, arg) => {
    // R51 P1：解构保护（requireArgs 已校验 arg 为对象）
    const { platform, article, publishTime } = arg
    const ownerSubject = currentOwnerSubject()
    const task = { platform, article, publishTime }
    if (ownerSubject !== undefined) task.owner_subject = ownerSubject
    const entry = scheduler.create(task)
    return { code: 0, data: entry, message: '定时任务已创建' }
  }, { requireArgs: true, label: 'scheduler:create' })))

  // 迁移至 wrapIpcHandlerRaw：catchData 保留 catch 时 data: [] 兜底语义
  ipcMain.handle('scheduler:list', withSenderCheck(wrapIpcHandlerRaw(async () => {
    const ownerSubject = currentOwnerSubject()
    return { code: 0, data: ownerSubject === undefined ? scheduler.list() : scheduler.list(ownerSubject) }
  }, { label: 'scheduler:list', catchData: [] })))

  ipcMain.handle('scheduler:cancel', withSenderCheck(wrapIpcHandlerRaw(async (event, id) => {
    const ownerSubject = currentOwnerSubject()
    // 如实回传 cancel() 的布尔结果（scheduler.js:321）：任务不存在 / 已 executed /
    // 已 cancelled 时它返回 false。此前这里无条件返回 data:true，导致
    //   1) Calendar.vue 的 `res.data === false` 分支永不可达 —— 取消失败被谎报成成功；
    //   2) usePublishFlow.scheduleTargets 的回滚失败判定（`data === false`）永不成立 ——
    //      部分定时任务取消失败却提示已回滚，留下到点仍会发布的幽灵排期。
    const cancelled = ownerSubject === undefined ? scheduler.cancel(id) : scheduler.cancel(id, ownerSubject)
    return { code: 0, data: cancelled === true, message: cancelled === true ? '定时任务已取消' : '定时任务无法取消（可能已发布或已取消）' }
  }, { label: 'scheduler:cancel' })))
}

module.exports = registerHandlers
