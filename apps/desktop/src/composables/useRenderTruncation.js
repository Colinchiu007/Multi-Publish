/**
 * useRenderTruncation —— 列表渲染截断 + 加载更多（M-15 批次 D）。
 *
 * 从 Accounts.vue 抽出的通用形态，CopyLibraryView / HotTopics 同样适用。
 * 三个列表（账号/文案/选题）此前都是 filter 后全量渲染，条目数增长后
 * 一次挂载数百个组件必然劣化 —— 渲染层截断是方案 §10.2 认可的最低成本路径
 * （不上虚拟滚动）。
 *
 * @param {import('vue').ComputedRef<Array>} sourceRef 全量集合（筛选后）
 * @param {number} pageSize 每次加载条数（如 48/30）
 * @returns {{ rendered: import('vue').ComputedRef<Array>, truncated: import('vue').ComputedRef<boolean>,
 *             total: import('vue').ComputedRef<number>, loadMore: Function }}
 */
import { computed, ref } from 'vue'

export function useRenderTruncation(sourceRef, pageSize) {
  const limit = ref(pageSize)
  const rendered = computed(() => sourceRef.value.slice(0, limit.value))
  const total = computed(() => sourceRef.value.length)
  const truncated = computed(() => total.value > rendered.value.length)
  function loadMore() { limit.value += pageSize }
  return { rendered, truncated, total, loadMore, limit }
}
