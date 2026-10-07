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
    // 2026-10-07 真机 E2E：平台侧定时创建后记录瞬时进入 executed，此时 cancel 按设计
    // 返回 false（平台无撤销接口，本地改判 cancelled 只会制造「以为取消成功、平台照发」，
    // 见 __tests__/scheduler.test.js 的契约锁）。但用户看到的是发布页那个「取消任务」
    // 入口 —— 点下去只得到一句「可能已发布或已取消」，既不成立也不可操作。
    // 改为**如实告知去哪撤销**，让用户知道下一步该做什么，
    // 而不是对着一个永远点不动的按钮猜。
    return {
      code: 0,
      data: cancelled === true,
      message: cancelled === true
        ? '定时任务已取消'
        : '该排期已提交给平台，本应用无法撤销（平台未提供撤销接口）。请到对应平台的「定时/草稿管理」中撤销。'
    }
  }, { label: 'scheduler:cancel' })))
}

module.exports = registerHandlers
