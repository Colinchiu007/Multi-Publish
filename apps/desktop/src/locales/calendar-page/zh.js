/**
 * calendarPage 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/zh.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    // 发布日历 — 定时任务取消入口（2026-10-02 定时发布验证补齐）
    cancelSchedule: '取消定时',
    cancelScheduleTitle: '取消定时发布',
    cancelScheduleConfirm: '确定取消该定时任务？取消后到点不会发布。',
    cancelScheduleConfirmButton: '取消定时',
    cancelScheduleCancelButton: '保留任务',
    cancelScheduleSuccess: '已取消定时任务',
    cancelScheduleFailed: '取消定时任务失败，请重试',
    // 定时任务到点但未能进入发布队列（2026-10-06）——此前零可见性，用户无从得知没发出去
    scheduleDispatchFailed: '定时发布未能发出：{platform} {reason}。该任务已标记失败，请重新排期。',
    scheduleCancelledUncancellable: '该定时任务无法取消（可能已发布或已取消）',
    // 批量排期批次在日历上的展示与取消（2026-10-06）
    scheduledBatchTitle: '批量排期（{count} 篇）',
    cancelBatchScheduleTitle: '取消批量排期',
    cancelBatchScheduleConfirm: '确定取消该批量排期？取消后该批次到点不会发布。',
    cancelBatchScheduleSuccess: '已取消批量排期',
    cancelBatchScheduleFailed: '取消批量排期失败，请重试',
  }
