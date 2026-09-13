import { ref } from 'vue'

// ⚠️ 非 Pinia store：普通模块级单例信号（与 settings-dialog.js 同模式），
// 放在 stores/ 下仅为与其它状态模块集中管理；消费方直接 import。
/**
 * 视频流水线「后台运行」全局居中提示 — 单一状态源。
 *
 * 背景（2026-09-12 需求）：所有视频生成流水线进度弹窗都提供【后台运行】按钮；
 * 点击后应用界面正中央显示「如果想查看该任务，请进入视频创作的历史记录」，
 * 数秒后自动消失。提示必须脱离触发视图存活（用户可能立即切页），
 * 因此用模块级单例承载，由 App.vue 挂载的全局组件渲染。
 */
export const pipelineBackgroundToastVisible = ref(false)

let hideTimer = null

/** 显示全局居中提示，并在 durationMs 后自动消失（重复触发时重置计时）。 */
export function showPipelineBackgroundToast(durationMs = 4000) {
  pipelineBackgroundToastVisible.value = true
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    pipelineBackgroundToastVisible.value = false
    hideTimer = null
  }, durationMs)
}

/** 立即隐藏（组件卸载/测试清理用）。 */
export function hidePipelineBackgroundToast() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  pipelineBackgroundToastVisible.value = false
}
