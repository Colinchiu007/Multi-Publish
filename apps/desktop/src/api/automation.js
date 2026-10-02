/**
 * automation API — 自动化任务模块 IPC 桥接（渲染层）
 *
 * 后台语义：任务的失败/恢复通知经 `onAutomationNotification` 推送到渲染层，
 * 渲染层只转成 toast，**不弹模态框**——自动化任务在后台跑，不该打断当前操作。
 */
import { invokeWithFallback, on as bridgeOn } from './electron-bridge'

/** 列出任务（含触发摘要 / 运行状态 / 上次结果） */
export async function automationList () {
  return invokeWithFallback('automationList', { code: -1, message: 'electronAPI not available', data: { tasks: [] } })
}

/** 新建任务 */
export async function automationCreate (payload) {
  return invokeWithFallback('automationCreate', { code: -1, message: 'electronAPI not available', ok: false }, payload)
}

/** 编辑任务（改触发器 / 失败策略 / 启停） */
export async function automationUpdate (id, payload) {
  return invokeWithFallback('automationUpdate', { code: -1, message: 'electronAPI not available', ok: false }, id, payload)
}

/** 删除任务 */
export async function automationRemove (id) {
  return invokeWithFallback('automationRemove', { code: -1, message: 'electronAPI not available', ok: false }, id)
}

/** 立即运行一次（手动触发，不影响定时计划） */
export async function automationRunNow (id) {
  return invokeWithFallback('automationRunNow', { code: -1, message: 'electronAPI not available', ok: false, data: {} }, id)
}

/**
 * 订阅后台任务通知（失败 / 从失败恢复）。
 * @param {(payload: {level:string,title:string,message:string,taskId:string}) => void} callback
 * @returns {Function} 取消订阅
 */
export function onAutomationNotification (callback) {
  return bridgeOn('AutomationNotification', callback)
}
