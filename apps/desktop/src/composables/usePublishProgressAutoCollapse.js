/**
 * usePublishProgressAutoCollapse —— 发布进度面板完成自动收敛组合式（publish-progress-panel-refine）
 *
 * 设计（PRD D3）：只在「完成跃迁」（store.hasRunning true→false）触发；全部任务成功
 * （failed===0 && cancelled===0）且面板展开时，5 秒无指针操作 → store.minimizePanel()。
 * - 用户事后手动展开完成态面板不触发（展开即被收回是骚扰）。
 * - 面板内任意 pointerdown、新会话开始（hasRunning 回 true）、组件卸载 → 取消收敛。
 * - 存在失败/取消任务不收敛（不遮蔽恢复入口）。
 * - 计时器归组件所有（store 不持计时器，保持纯状态）——本 composable 负责申请/清理。
 *
 * 拆分承载面：逐文件行数门禁（<500 行），Panel.vue 拆出的自动收敛逻辑独立于此文件。
 */
import { onBeforeUnmount, watch } from 'vue'

/** 完成自动收敛延迟（publish-progress-panel-refine D3） */
export const AUTO_COLLAPSE_DELAY_MS = 5000

/**
 * @param {object} deps
 * @param {import('vue').Ref<boolean>} deps.hasRunning
 * @param {import('vue').Ref<boolean>} deps.panelVisible
 * @param {import('vue').Ref<boolean>} deps.panelMinimized
 * @param {() => { failed: number, cancelled: number }} deps.aggregate
 * @param {() => number} deps.sessionCount
 * @param {() => void} deps.minimizePanel
 * @returns {{ cancelAutoCollapse: () => void }}
 */
export function usePublishProgressAutoCollapse({
  hasRunning, panelVisible, panelMinimized, aggregate, sessionCount, minimizePanel,
}) {
  let autoCollapseTimer = null

  function clearAutoCollapseTimer() {
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer)
      autoCollapseTimer = null
    }
  }

  /** 面板内任意指针交互 → 取消收敛（用户在看，收回是骚扰） */
  function cancelAutoCollapse() {
    clearAutoCollapseTimer()
  }

  function eligible() {
    const agg = aggregate()
    return panelVisible.value
      && !panelMinimized.value
      && !hasRunning.value
      && sessionCount() > 0
      && agg.failed === 0
      && agg.cancelled === 0
  }

  // 只在「完成跃迁」（hasRunning true→false）触发；用户事后手动展开不触发
  watch(hasRunning, (running, prev) => {
    if (running) {
      clearAutoCollapseTimer()
      return
    }
    if (prev !== true) return
    if (!eligible()) return
    clearAutoCollapseTimer()
    autoCollapseTimer = setTimeout(() => {
      autoCollapseTimer = null
      // 触发时复核资格（期间可能失败/新会话/手动收纳）
      if (eligible()) minimizePanel()
    }, AUTO_COLLAPSE_DELAY_MS)
  })

  onBeforeUnmount(clearAutoCollapseTimer)

  return { cancelAutoCollapse }
}