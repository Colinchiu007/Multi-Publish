/**
 * useFilterScan —— 发布记录筛选时的补页扫描（M-11 的核心逻辑）。
 *
 * 从 PublishHistory.vue 抽出的原因：
 * 1. 这段逻辑与视图渲染完全解耦（依赖全部通过参数注入），可独立单测；
 * 2. 在 1200+ 行的视图上，M-11 的修复让它撞上巨型文件门禁（LEDGER_GREW），
 *   把纯状态机逻辑移出去是「真正让文件变小」的正解，与 useAsrInstall（M-16）
 *   同一形态。
 *
 * 行为契约（每一条都有对应测试钉住）：
 * - 最多翻 FILTER_SCAN_MAX_PAGES 页（≈1000 条），把最坏情况从「不限」压到
 *   20 次串行 IPC —— 不给上限则历史表每增长一倍、单次搜索代价就翻倍。
 * - 每轮开头检查筛选是否仍生效：扫描途中清空搜索框立即停止（不只在入口检查）。
 * - 扫描途中**改**条件（非清空）：登记 stale 并让在途循环中止，结束后用新条件
 *   重启一轮（CCG 外部评审 i1 / Critical：旧实现会把新条件吞掉）。
 * - 结束时通过 onSettled(truncated) 上报是否触顶，由视图决定展示方式
 *   （触顶必须如实说「已在已加载 N 条中筛选」，不能谎称扫完全表）。
 */
import { FILTER_SCAN_MAX_PAGES } from './useDebouncedRef'

export function useFilterScan({ loadRecords, hasActiveFilters, hasMoreRecords, signature, onSettled }) {
  let pendingFilterLoad = null
  // 扫描期间筛选条件是否被改过（true ⇒ 在途循环尽快让位，结束后用新条件重扫）
  let filterScanStale = false

  async function loadRemainingRecordsForFilters () {
    if (!hasActiveFilters.value || !hasMoreRecords.value) return null

    const startedWith = signature()
    // 已在扫描中：只登记"条件已变"，由在途循环自己中止并重启，避免两条扫描并存
    if (pendingFilterLoad) {
      filterScanStale = true
      return pendingFilterLoad
    }

    pendingFilterLoad = (async () => {
      for (let page = 0; page < FILTER_SCAN_MAX_PAGES; page++) {
        // 条件在扫描途中变了 ⇒ 放弃本轮，交给下面的重启逻辑用新条件重扫
        if (filterScanStale || signature() !== startedWith) break
        if (!hasActiveFilters.value || !hasMoreRecords.value) break
        const loaded = await loadRecords({ append: true })
        if (!loaded) break
      }
      // 循环退出后仍有更多记录 ⇒ 本次筛选没有覆盖全表，如实上报而不是假装扫完
      onSettled(hasActiveFilters.value && hasMoreRecords.value)
    })().finally(() => {
      pendingFilterLoad = null
      // 条件在扫描期间变过 ⇒ 用新条件再扫一轮（只重启一次，避免抖动时反复重启）
      if (filterScanStale) {
        filterScanStale = false
        if (hasActiveFilters.value && hasMoreRecords.value) void loadRemainingRecordsForFilters()
      }
    })
    return pendingFilterLoad
  }

  return { loadRemainingRecordsForFilters }
}
