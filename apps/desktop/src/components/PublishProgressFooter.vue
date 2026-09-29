<template>
  <!-- footer（publish-progress-panel-refine）：警示条承载「勿关应用」操作约束（原
       xs/muted 脚注层级倒挂修正），与取消入口同置一行；取消为两步内联确认（免模态，
       不触碰浮层互斥合同——模态确认弹窗属应用级模态浮层，接入即触发互斥合同）。
       独立组件（逐文件行数门禁 < 500 行，PublishProgressPanel.vue 拆分承载面之一）。 -->
  <div v-if="store.hasRunning" class="ppp__footer" data-testid="publish-progress-footer">
    <span class="ppp__hint" data-testid="publish-progress-hint">
      <el-icon><WarningFilled /></el-icon>
      {{ t('publishPage.publishProgressPanel.hintRunning') }}
    </span>
    <button
      type="button"
      class="ppp__cancel-btn"
      :class="{ 'ppp__cancel-btn--confirm': cancelConfirming }"
      data-testid="publish-progress-cancel"
      :disabled="store.cancelling"
      @click="handleCancelClick"
    >
      {{ store.cancelling
        ? t('publishPage.publishProgressPanel.cancelling')
        : (cancelConfirming
          ? t('publishPage.publishProgressPanel.cancelConfirm')
          : t('publishPage.publishProgressPanel.cancelAll')) }}
    </button>
  </div>
</template>

<script setup>
/**
 * PublishProgressFooter —— 发布进度面板 footer（publish-progress-panel-refine）
 *
 * 职责：警示条（勿关应用操作约束）+「取消全部任务」两步内联确认。
 * - 两步确认：首次点击进入 4 秒确认窗口（防误触滞留），再点执行；超时/运行结束退出确认态。
 * - 不用模态弹窗：浮窗按 PRD-OVERLAY-VIEW-SUSPENSION §6 显式不接入浮层互斥合同，
 *   模态确认弹窗属应用级模态浮层，接入即触发互斥合同——两步内联零合同成本。
 * - 执行：store.cancelRunning()（逐任务 queue:cancel，任务状态由转发的 phase:'cancelled'
 *   事件收敛——事件单一来源，本组件不自标记）。
 */
import { onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { WarningFilled } from '@element-plus/icons-vue'
import { usePublishProgressStore } from '@/stores/publishProgress'

const { t } = useI18n()
const store = usePublishProgressStore()

/** 取消两步确认窗口（超时自动退出确认态，防误触滞留） */
const CANCEL_CONFIRM_WINDOW_MS = 4000

const cancelConfirming = ref(false)
let cancelConfirmTimer = null

function resetCancelConfirm() {
  if (cancelConfirmTimer) {
    clearTimeout(cancelConfirmTimer)
    cancelConfirmTimer = null
  }
  cancelConfirming.value = false
}

function handleCancelClick() {
  if (store.cancelling) return
  if (!cancelConfirming.value) {
    // 第一步：进入确认态（不调 IPC）；4 秒窗口防误触滞留
    cancelConfirming.value = true
    cancelConfirmTimer = setTimeout(resetCancelConfirm, CANCEL_CONFIRM_WINDOW_MS)
    return
  }
  // 第二步：执行取消
  resetCancelConfirm()
  void handleCancelAll()
}

async function handleCancelAll() {
  const result = await store.cancelRunning()
  if (result && (result.ok > 0 || result.fail > 0)) {
    ElMessage({
      message: t('publishPage.publishProgressPanel.cancelPartial', { ok: result.ok, fail: result.fail }),
      type: result.fail > 0 ? 'warning' : 'info',
      duration: 4000,
    })
  }
}

// 运行结束（footer 消失）时退出确认态，避免下次运行残留「确认取消？」
watch(() => store.hasRunning, (running) => {
  if (!running) resetCancelConfirm()
})

onBeforeUnmount(resetCancelConfirm)
</script>

<style scoped>
/* footer 警示条（publish-progress-panel-refine）：操作约束从 xs/muted 脚注升为
   warning-soft 底警示条——层级倒挂修正 */
.ppp__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
  padding: var(--spacing-2);
  border-radius: var(--radius-sm);
  background: var(--color-warning-soft, #fef3c7);
}

.ppp__hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  font-weight: 500;
  color: var(--color-text-secondary);
}

.ppp__hint .el-icon {
  color: var(--color-warning);
}

.ppp__cancel-btn {
  flex: 0 0 auto;
  padding: 2px 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-danger);
  font-size: var(--font-size-xs);
  font-weight: 500;
  cursor: pointer;
}

.ppp__cancel-btn:hover:not(:disabled) {
  background: var(--color-danger-soft, #fef0f0);
}

.ppp__cancel-btn--confirm {
  background: var(--color-danger);
  color: var(--color-on-primary, #ffffff);
}

.ppp__cancel-btn--confirm:hover:not(:disabled) {
  background: var(--color-danger);
}

.ppp__cancel-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
