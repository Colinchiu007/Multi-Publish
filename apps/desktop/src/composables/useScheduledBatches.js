// @ts-check
/**
 * 发布日历的「批量排期」数据源与取消动作（从 Calendar.vue 拆出，逐文件行数门禁）。
 *
 * 为什么独立成 composable：批量排期的取消入口此前**只存在于发布页会话内**
 * （`scheduledBatchId` 是内存态，离开页面即丢），且日历页只渲染 `scheduler:*` 任务，
 * 导致「排了期却找不到地方取消」。补持久入口时新增的批次筛选/时间计算/取消流程
 * 与日历的日期渲染逻辑无关，混在一起会让视图文件持续膨胀。
 *
 * 关键语义：
 *   - 事件时间取批次内**最早一篇带 publishTime 的文章**；整批立即发布（无任何
 *     publishTime）的批次**不渲染**为待发事件 —— 那不是排期。
 *   - 取消结果**以主进程返回为准**，渲染层不自标记成功 —— 只改状态不清定时器
 *     就是「幽灵发布」的同族风险（与 BatchManager 的定时器生命周期契约一致）。
 *   - batchList 能力缺席（老 preload）时保持空数组，单篇定时渲染不受影响。
 */
import { ref } from 'vue'
import { getApi } from '@/api/electron-bridge'

const SCHEDULED_BATCH_STATUS = 'scheduled'

export function useScheduledBatches ({ loadData, notifyError, notifySuccess, notifyConfirm, t }) {
  const scheduledBatches = ref([])
  const cancellingBatchId = ref(null)

  function batchArticles (batch) {
    return Array.isArray(batch && batch.articles) ? batch.articles : []
  }

  function batchArticleCount (batch) {
    if (batch && typeof batch.article_count === 'number') return batch.article_count
    return batchArticles(batch).length
  }

  /** 批次事件时间：最早一篇带 publishTime 的文章；全部无定时时间则 null（不渲染） */
  function earliestBatchPublishTime (batch) {
    const times = batchArticles(batch)
      .map(a => a && a.publishTime)
      .filter(Boolean)
      .map(t => new Date(t).getTime())
      .filter(Number.isFinite)
    if (times.length === 0) return null
    return new Date(Math.min(...times)).toISOString()
  }

  /** 把 status=scheduled 且落在指定日期的批次转成日历事件 */
  function batchEventsForDate (dateStr, toCalendarDateKey) {
    const events = []
    for (const batch of scheduledBatches.value) {
      if (!batch || batch.status !== SCHEDULED_BATCH_STATUS) continue
      const publishTime = earliestBatchPublishTime(batch)
      if (!publishTime || toCalendarDateKey(publishTime) !== dateStr) continue
      events.push({
        ...batch,
        publishTime,
        platform: 'batch',
        title: t('calendarPage.scheduledBatchTitle', { count: batchArticleCount(batch) }),
        type: 'scheduled-batch',
      })
    }
    return events
  }

  /** 从主进程拉取批次列表（失败保持空数组，不影响单篇定时渲染） */
  async function loadBatches () {
    const api = getApi()
    if (!api || typeof api.batchList !== 'function') return []
    try {
      const res = await api.batchList()
      scheduledBatches.value = res && res.code === 0 ? (res.data || []) : []
    } catch { scheduledBatches.value = [] }
    return scheduledBatches.value
  }

  /** 取消批量排期：确认弹窗 → batchCancel → 成功刷新 */
  async function cancelScheduledBatch (event) {
    if (!event || event.type !== 'scheduled-batch' || !event.id) return
    if (cancellingBatchId.value) return

    const confirmed = await notifyConfirm('calendarPage.cancelBatchScheduleConfirm', {
      title: t('calendarPage.cancelBatchScheduleTitle'),
      confirmButtonText: t('calendarPage.cancelScheduleConfirmButton'),
      cancelButtonText: t('calendarPage.cancelScheduleCancelButton'),
      type: 'warning',
    })
    if (!confirmed) return

    cancellingBatchId.value = event.id
    try {
      const api = getApi()
      if (!api || typeof api.batchCancel !== 'function') {
        notifyError('calendarPage.cancelBatchScheduleFailed', { fallback: t('calendarPage.cancelBatchScheduleFailed') })
        return
      }
      const res = await api.batchCancel(event.id)
      if (!res || res.code !== 0) {
        notifyError('calendarPage.cancelBatchScheduleFailed', { fallback: t('calendarPage.cancelBatchScheduleFailed') })
        return
      }
      notifySuccess('calendarPage.cancelBatchScheduleSuccess')
      await loadData()
    } catch {
      notifyError('calendarPage.cancelBatchScheduleFailed', { fallback: t('calendarPage.cancelBatchScheduleFailed') })
    } finally {
      cancellingBatchId.value = null
    }
  }

  return {
    scheduledBatches,
    cancellingBatchId,
    batchEventsForDate,
    loadBatches,
    cancelScheduledBatch,
  }
}