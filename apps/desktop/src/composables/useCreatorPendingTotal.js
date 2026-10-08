/**
 * useCreatorPendingTotal.js — 博主监控页签的待采集角标
 *
 * ## 为什么抽出来
 *
 * `Collection.vue` 已是 2900+ 行的存量挂账文件，登记值 2721 行、容差 200 行。
 * 本特性往里加的每一行都在吃那个容差，而上游还有约 199 行**未登记的历史漂移**
 * （main 上多个 PR 累加，`check-max-lines` 报 `LEDGER_GREW: 膨胀 212 行`）。
 * 把这 13 行外提，本 PR 对该文件的净增量即为 0 —— 按仓库铁律，
 * 存量债的正解是**拆分**而不是 `--update` 把当前行数洗成新基线
 * （挂账等于承认「接受漂移」，且会把别人未登记的 199 行一并合法化）。
 *
 * ## 为什么独立读通道而不是复用 creator:list
 *
 * 角标渲染在**父组件**（页签按钮上），列表数据在子组件 CreatorMonitor 里。
 * 让父组件拉整份列表 = 切页时重复拉一次全量数据。
 */
import { ref, onMounted } from 'vue'
import { creatorPendingTotal as fetchPendingTotal } from '@/api/publisher'

export function useCreatorPendingTotal () {
  // 显式 0 起步：`undefined > 0` 为 false —— 不抛错但角标永不显示，
  // 属静默失效（CCG 评审 i6 的原始缺陷形态）。
  const creatorPendingTotal = ref(0)

  async function refreshCreatorPendingTotal () {
    try {
      const r = await fetchPendingTotal()
      if (r && r.code === 0) creatorPendingTotal.value = Number(r.total) || 0
    } catch (_) {
      // 服务未就绪（依赖缺失 / 未接线）时保留 0，不打断采集页。
      // 刻意不提示：角标缺失不该打断采集主流程。
    }
  }

  onMounted(() => { void refreshCreatorPendingTotal() })

  return { creatorPendingTotal, refreshCreatorPendingTotal }
}
