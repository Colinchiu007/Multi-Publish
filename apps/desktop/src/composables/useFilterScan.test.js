// useFilterScan 的纯逻辑单测 —— 状态机与视图解耦后可以直接注入依赖测试。
//
// 重点锁「扫描途中改条件必须用新条件重扫」（CCG 外部评审 i1 / Critical）：
// 这条回归之前在视图层测试里写不出可判定断言（反证两次不转红，按证据纪律
// 移除了那条用例）。把逻辑抽出来之后，「重扫次数」可以被直接观测 ——
// 注入的 loadRecords 记录每轮扫描用的签名，断言"新签名至少完整跑了一轮"。
//
//   pnpm exec vitest run src/composables/useFilterScan.test.js

import { describe, it, expect, vi } from 'vitest'
import { ref, computed } from 'vue'
import { useFilterScan } from './useFilterScan'
import { FILTER_SCAN_MAX_PAGES } from './useDebouncedRef'

/**
 * 搭一个可控的扫描环境。
 * - total/每页条数可调：决定"有没有更多记录"
 * - filterRef：模拟用户改条件（signature 变化）
 * - spy 记录每页请求时用的签名，用于断言重扫用的是新条件
 */
function setup ({ total = 100000, perPage = 5 } = {}) {
  const filter = ref('v1')
  const loadedCount = ref(0)
  const hasActiveFilters = computed(() => filter.value !== '')
  const hasMoreRecords = computed(() => loadedCount.value < total)
  const callsBySignature = []

  const loadRecords = vi.fn(async () => {
    callsBySignature.push(filter.value)
    loadedCount.value += perPage
    return true
  })

  const settled = []
  const { loadRemainingRecordsForFilters } = useFilterScan({
    loadRecords,
    hasActiveFilters,
    hasMoreRecords,
    signature: () => filter.value,
    onSettled: (t) => settled.push(t),
  })

  return { filter, loadRecords, loadRemainingRecordsForFilters, settled, callsBySignature }
}

describe('useFilterScan（M-11 状态机）', () => {
  it('扫描最多翻 FILTER_SCAN_MAX_PAGES 页', async () => {
    const { loadRemainingRecordsForFilters, loadRecords, settled } = setup({ total: 100000 })
    await loadRemainingRecordsForFilters()
    expect(loadRecords).toHaveBeenCalledTimes(FILTER_SCAN_MAX_PAGES)
    expect(settled).toEqual([true]) // 跑满上限仍有更多 ⇒ 如实上报触顶
  })

  it('扫到底就停（不跑满上限），且上报未触顶', async () => {
    const { loadRemainingRecordsForFilters, loadRecords, settled } = setup({ total: 12, perPage: 5 })
    await loadRemainingRecordsForFilters()
    expect(loadRecords.mock.calls.length).toBeLessThan(FILTER_SCAN_MAX_PAGES)
    expect(settled).toEqual([false])
  })

  it('筛选为空时不启动扫描', async () => {
    const filter = ref('')
    const hasActiveFilters = computed(() => filter.value !== '')
    const hasMore = computed(() => true)
    const load = vi.fn(async () => true)
    const scan = useFilterScan({ loadRecords: load, hasActiveFilters, hasMoreRecords: hasMore, signature: () => filter.value, onSettled: () => {} })
    await scan.loadRemainingRecordsForFilters()
    expect(load).not.toHaveBeenCalled()
  })

  it('扫描途中清空筛选 ⇒ 立即停止（CCG i1 之外的另一半：取消）', async () => {
    const s = setup({ total: 100000 })
    const p = s.loadRemainingRecordsForFilters()
    // 第一页返回后清空筛选
    s.filter.value = ''
    await p
    expect(s.loadRecords.mock.calls.length, '清空后不应再翻页').toBeLessThan(FILTER_SCAN_MAX_PAGES)
    expect(s.settled).toEqual([false])
  })

  it('扫描途中改条件 ⇒ 旧扫描让位，新条件完整重扫一轮（CCG i1 / Critical）', async () => {
    // 用可控 defer 保证"改条件发生在扫描进行中"（第一页的 await 尚未 resolve）：
    // 直接 await Promise.resolve() 只让一个微任务，扫描可能已经跑完，
    // 那测到的就不是"中途改"而是"结束后再触发"（首版实测 newCalls=0 即此因）。
    let releaseFirstPage
    const firstPagePromise = new Promise((r) => { releaseFirstPage = r })
    const filter = ref('v1')
    const loadedCount = ref(0)
    const total = 100000
    const callsBySignature = []
    let isFirstCall = true
    const loadRecords = vi.fn(async () => {
      callsBySignature.push(filter.value)
      if (isFirstCall) { isFirstCall = false; await firstPagePromise }
      loadedCount.value += 5
      return true
    })
    const settled = []
    const scan = useFilterScan({
      loadRecords,
      hasActiveFilters: computed(() => filter.value !== ''),
      hasMoreRecords: computed(() => loadedCount.value < total),
      signature: () => filter.value,
      onSettled: (t) => settled.push(t),
    })

    const p = scan.loadRemainingRecordsForFilters()
    // 扫描已启动（第一页挂在 defer 上），此刻改条件
    await Promise.resolve()
    await Promise.resolve()
    filter.value = 'v2'
    releaseFirstPage()
    // 组件里改条件会经防抖 watch **再次调用** loadRemainingRecordsForFilters ——
    // 正是这次调用把 filterScanStale 置真、触发让位重扫。单测必须复刻这条路径。
    const p2 = scan.loadRemainingRecordsForFilters()
    await p
    // 重扫是 void 触发的 fire-and-forget：等它真正跑完再断言
    // （连续两次微任务后 loadRecords 次数不再增长即认为静止）
    for (let i = 0; i < 50; i++) {
      const before = loadRecords.mock.calls.length
      await Promise.resolve()
      await Promise.resolve()
      if (loadRecords.mock.calls.length === before) break
    }
    await p2
    // 旧签名（v1）只应该有 1 次调用（第一页），新签名（v2）必须完整跑满一轮
    const oldCalls = callsBySignature.filter((x) => x === 'v1').length
    const newCalls = callsBySignature.filter((x) => x === 'v2').length
    expect(
      newCalls,
      '新条件没有完整重扫一轮 ⇒ 用户改了条件却看到旧条件扫出来的结果（CCG i1）'
    ).toBeGreaterThanOrEqual(FILTER_SCAN_MAX_PAGES - 1)
    expect(oldCalls, '旧条件应只跑了第一页就让位').toBe(1)
    expect(settled[settled.length - 1]).toBe(true)
  })

  it('反证：撤掉 stale 重启逻辑（模拟旧实现），新条件不会重扫', async () => {
    // 复刻 i1 修复前的行为：pendingFilterLoad 非空时直接返回，不登记 stale
    const filter = ref('v1')
    const loadedCount = ref(0)
    const total = 100000
    const callsBySignature = []
    const loadRecords = vi.fn(async () => {
      callsBySignature.push(filter.value)
      loadedCount.value += 5
      return true
    })
    let pending = null
    async function legacyScan () {
      if (pending) return pending // ← 旧实现：直接返回，没有 stale 机制
      pending = (async () => {
        const startedWith = filter.value
        for (let page = 0; page < FILTER_SCAN_MAX_PAGES; page++) {
          if (filter.value !== startedWith) break
          if (loadedCount.value >= total) break
          await loadRecords()
        }
      })().finally(() => { pending = null })
      return pending
    }
    const p = legacyScan()
    await Promise.resolve()
    filter.value = 'v2'
    await p
    const newCalls = callsBySignature.filter((x) => x === 'v2').length
    expect(newCalls, '旧行为下新条件被吞，这条必须为 0 —— 若不为 0 说明反证失效').toBe(0)
  })
})
