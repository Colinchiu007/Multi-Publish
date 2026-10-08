/**
 * useDebouncedRef —— 视图层缺失的防抖工具（M-11 根因）
 *
 * 为什么要有这个
 * --------------
 * 全仓 `views/` 下 `debounce|throttle` **零命中**。唯一的手写防抖是
 * `Accounts.vue` 里一个 `setTimeout(..., 300)`，其余筛选输入全部裸奔。
 * 后果是：用户在发布记录页每敲一个字符，就触发一次「清空 + 串行分页把整张历史表
 * 拉完」—— 历史积累到数千条后，单次搜索会引发上百次串行 IPC 往返。
 *
 * 报告给的根因判断是「缺工具而非缺调用」，所以先补工具，再把调用点接上去。
 *
 * 设计取舍
 * --------
 * - **返回 ref 而不是回调**：调用点需要的是「一个会延迟生效的值」，watch 起来最自然；
 *   给回调会逼每个调用方自己管计时器，又退回到各自手写的状态。
 * - **默认 300ms**：与仓库里唯一那处手写防抖（`Accounts.vue` 的 300ms）保持一致，
 *   不引入第二个数字。
 * - **立即值 + 延迟值同时暴露**：输入框要立刻回显用户敲的内容（否则打字会顿），
 *   但触发昂贵操作的是延迟值。`immediate` 与 `debounced` 分开就是这个用途。
 * - **卸载自动清理**：计时器挂在组件作用域上，不在 onUnmounted 里清就会对已卸载
 *   组件触发 —— 与 M-16 同类。
 */
import { ref, watch, onUnmounted } from 'vue'

const DEFAULT_DELAY_MS = 300

/**
 * 筛选扫描的补页页数上限（M-11）。
 *
 * 放在这里而不是视图里，是为了让组件与测试**同源引用**：这个上限是临时值
 * （M-15 落地服务端过滤后应移除），若测试硬编码字面量，将来改值会让测试
 * 莫名其妙变红（CCG 外部评审 i5）。
 *
 * 取 20 页（每页 50 条 ⇒ 约 1000 条）的依据：
 *   - 把最坏情况从「不限」压到 20 次串行 IPC；
 *   - 不给上限则历史表每增长一倍、单次搜索代价就翻倍——那是随时间恶化的缺陷。
 */
export const FILTER_SCAN_MAX_PAGES = 20

/**
 * @param {any} initial 初始值
 * @param {number} [delayMs=300] 延迟毫秒
 * @returns {{ immediate: import('vue').Ref, debounced: import('vue').Ref,
 *             flush: Function, cancel: Function }}
 */
export function useDebouncedRef(initial, delayMs = DEFAULT_DELAY_MS) {
  const immediate = ref(initial)
  const debounced = ref(initial)
  let timer = null

  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null }
  }

  /** 立刻把 pending 的值同步过去（跳过剩余等待） */
  const flush = () => {
    if (!timer) return
    cancel()
    debounced.value = immediate.value
  }

  watch(immediate, (next) => {
    cancel()
    timer = setTimeout(() => {
      timer = null
      debounced.value = next
    }, delayMs)
  })

  onUnmounted(cancel)

  return { immediate, debounced, flush, cancel }
}

/**
 * 与 useDebouncedRef 配套：把「多个筛选源」合并成一个防抖的快照。
 *
 * 为什么需要：发布记录页 watch 了 7 个筛选源，任何一个变化都要重新拉全表。
 * 逐个给 7 个源各加防抖，用户连改两个条件仍会触发两次。合成一个快照后，
 * 连续的多项变更只产生一次拉取。
 *
 * @param {Array<import('vue').Ref|(() => any)>} sources 取值源
 * @param {number} [delayMs=300]
 * @returns {{ snapshot: import('vue').Ref<Array>, flush: Function }}
 */
export function useDebouncedWatchSources(sources, delayMs = DEFAULT_DELAY_MS) {
  const snapshot = ref(sources.map((s) => (typeof s === 'function' ? s() : s.value)))
  let timer = null
  let pending = null

  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null }
    if (pending) { snapshot.value = pending; pending = null }
  }

  const read = () => sources.map((s) => (typeof s === 'function' ? s() : s.value))

  watch(sources, () => {
    pending = read()
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      snapshot.value = pending
      pending = null
    }, delayMs)
  }, { deep: false })

  onUnmounted(() => { if (timer) clearTimeout(timer) })

  return { snapshot, flush }
}