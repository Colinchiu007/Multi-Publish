/**
 * calendarPage 命名空间文案（locales 结构拆分，FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
 * 从 locales/en.js 拆出，键名与拆出前完全一致；zh/en 成对维护（CI Gate 7）。
 */
export default {
    // Publish calendar — scheduled task cancel entry (2026-10-02 scheduled publish audit)
    cancelSchedule: 'Cancel schedule',
    cancelScheduleTitle: 'Cancel scheduled publish',
    cancelScheduleConfirm: 'Cancel this scheduled task? It will not be published at the scheduled time.',
    cancelScheduleConfirmButton: 'Cancel schedule',
    cancelScheduleCancelButton: 'Keep task',
    cancelScheduleSuccess: 'Scheduled task cancelled',
    cancelScheduleFailed: 'Failed to cancel the scheduled task, please retry',
    // Scheduled task reached its time but could not enter the publish queue (2026-10-06)
    scheduleDispatchFailed: 'Scheduled publish did not go out: {platform} {reason}. The task is marked failed; please schedule it again.',
    scheduleCancelledUncancellable: 'This scheduled task cannot be cancelled (it may have been published or already cancelled)',
    // Scheduled batch display and cancellation on the calendar (2026-10-06)
    scheduledBatchTitle: 'Scheduled batch ({count} articles)',
    cancelBatchScheduleTitle: 'Cancel scheduled batch',
    cancelBatchScheduleConfirm: 'Cancel this scheduled batch? Its articles will not be published at the scheduled time.',
    cancelBatchScheduleSuccess: 'Scheduled batch cancelled',
    cancelBatchScheduleFailed: 'Failed to cancel the scheduled batch, please retry',
  }
