<template>
  <Teleport to="body">
    <!-- 展开浮卡：非模态（无遮罩、不阻塞交互、不接入浮层互斥合同——见
         PRD-OVERLAY-VIEW-SUSPENSION §6 与 PRD-PUBLISH-PROGRESS-UX §5.3/D4） -->
    <div
      v-if="store.panelVisible"
      class="publish-progress-panel"
      data-testid="publish-progress-panel"
      role="region"
      :aria-label="t('publishPage.publishProgressPanel.title')"
      @pointerdown="cancelAutoCollapse"
    >
      <div class="ppp__header">
        <span class="ppp__title">
          {{ t('publishPage.publishProgressPanel.title') }}
          <span v-if="store.hasRunning" class="ppp__badge ppp__badge--running">
            <el-icon class="ppp__spin"><Loading /></el-icon>
            {{ t('publishPage.publishProgressPanel.sessionRunning') }}
          </span>
        </span>
        <span class="ppp__actions">
          <button
            type="button"
            class="ppp__icon-btn"
            data-testid="publish-progress-minimize"
            :aria-label="t('publishPage.publishProgressPanel.minimize')"
            :title="t('publishPage.publishProgressPanel.minimize')"
            @click="handleMinimize"
          >
            <el-icon><Minus /></el-icon>
          </button>
          <button
            type="button"
            class="ppp__icon-btn"
            data-testid="publish-progress-close"
            :disabled="store.hasRunning"
            :title="store.hasRunning
              ? t('publishPage.publishProgressPanel.closeDisabledHint')
              : t('publishPage.publishProgressPanel.close')"
            :aria-label="t('publishPage.publishProgressPanel.close')"
            @click="handleClose"
          >
            <el-icon><Close /></el-icon>
          </button>
        </span>
      </div>

      <!-- 汇总行（publish-progress-panel-refine）：成功数直给（failed/cancelled 不计入
           「已完成」口径），失败/取消单列；进度条填充仍按已处理比例（含失败/取消） -->
      <div class="ppp__summary" data-testid="publish-progress-summary">
        <span>{{ t('publishPage.publishProgressPanel.summarySucceeded', { succeeded: store.aggregate.succeeded, total: store.aggregate.total }) }}</span>
        <span v-if="store.aggregate.failed > 0" class="ppp__summary-failed">
          {{ t('publishPage.publishProgressPanel.summaryFailed', { count: store.aggregate.failed }) }}
        </span>
        <span v-if="store.aggregate.cancelled > 0" class="ppp__summary-cancelled">
          {{ t('publishPage.publishProgressPanel.summaryCancelled', { count: store.aggregate.cancelled }) }}
        </span>
        <span class="ppp__bar" role="progressbar"
          :aria-valuenow="store.aggregate.total > 0 ? Math.round(store.aggregate.done / store.aggregate.total * 100) : 0"
          aria-valuemin="0" aria-valuemax="100"
        >
          <span class="ppp__bar-fill" :style="{ width: progressWidth }"></span>
        </span>
      </div>

      <div v-if="store.sessions.length === 0" class="ppp__empty">
        {{ t('publishPage.publishProgressPanel.emptyRunning') }}
      </div>

      <div v-else class="ppp__sessions">
        <!-- 单会话扁平（去卡中卡嵌套/去会话徽标重复）；多会话分组卡+点徽标 -->
        <div
          v-for="session in store.sessions"
          :key="session.id"
          class="ppp__session"
          :class="{ 'ppp__session--flat': isSingleSession }"
        >
          <div v-if="!isSingleSession" class="ppp__session-head">
            <span class="ppp__session-title" :title="sessionTitle(session)">{{ sessionTitle(session) }}</span>
            <span class="ppp__session-badge" :class="session.status === 'done' ? 'ppp__session-badge--done' : 'ppp__session-badge--running'">
              <span class="ppp__session-badge-dot"></span>
              {{ session.status === 'done'
                ? t('publishPage.publishProgressPanel.sessionDone')
                : t('publishPage.publishProgressPanel.sessionRunning') }}
            </span>
          </div>
          <PublishProgressTaskRow
            v-for="taskId in session.taskOrder"
            :key="taskId"
            :task="session.tasks[taskId]"
            @retry="handleTaskRetry(session, taskId)"
            @copy-error="handleCopyError"
          />
          <button
            v-if="session.status === 'done' && store.sessionFailedCount(session.id) > 0"
            type="button"
            class="ppp__retry-btn"
            data-testid="publish-progress-retry-failed"
            :disabled="store.retrying"
            @click="handleRetry(session)"
          >
            <el-icon><RefreshRight /></el-icon>
            {{ store.retrying
              ? t('publishPage.publishProgressPanel.retrying')
              : t('publishPage.publishProgressPanel.retryFailed', { count: store.sessionFailedCount(session.id) }) }}
          </button>
        </div>
      </div>

      <!-- footer（publish-progress-panel-refine）：警示条承载「勿关应用」操作约束（原
           xs/muted 脚注层级倒挂修正），与取消入口同置一行；取消为两步内联确认（免模态，
           不触碰浮层互斥合同——模态确认弹窗属应用级模态浮层，接入即触发互斥合同） -->
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
    </div>

    <!-- 最小化胶囊：常驻勿关提示（后台运行语义） -->
    <button
      v-else-if="store.panelMinimized && (store.hasRunning || store.sessions.length > 0)"
      type="button"
      class="publish-progress-pill"
      data-testid="publish-progress-pill"
      :aria-label="t('publishPage.publishProgressPanel.expand')"
      @click="store.expandPanel()"
    >
      <el-icon v-if="store.hasRunning" class="ppp__spin ppp__pill-icon"><Loading /></el-icon>
      <el-icon v-else class="ppp__pill-icon"><CircleCheckFilled /></el-icon>
      <span class="ppp__pill-text">
        {{ store.hasRunning
          ? t('publishPage.publishProgressPanel.pillRunning', { done: store.aggregate.done, total: store.aggregate.total })
          : t('publishPage.publishProgressPanel.pillDone', { done: store.aggregate.done, total: store.aggregate.total }) }}<template v-if="store.aggregate.failed > 0">{{ t('publishPage.publishProgressPanel.pillFailedPart', { count: store.aggregate.failed }) }}</template>
      </span>
      <span v-if="store.hasRunning" class="ppp__pill-hint">{{ t('publishPage.publishProgressPanel.hintRunning') }}</span>
    </button>
  </Teleport>
</template>

<script setup>
/**
 * PublishProgressPanel —— 发布进度全局面板（publish-progress-ux，2026-09-28）
 *
 * 挂载：App.vue 根级全局唯一实例（与 UpdateNotification / PipelineBackgroundToast
 * 同级），setup 内 store.init() 完成 App 级事件订阅（订阅生命周期 == 应用生命周期）。
 *
 * 形态：展开浮卡（会话×任务×步骤状态）↔ 最小化胶囊（微型汇总 + 常驻勿关提示）。
 * 非模态：无遮罩、不阻塞交互，按 PRD-OVERLAY-VIEW-SUSPENSION §6 口径显式不接入
 * 浮层互斥合同（负向测试锁见 PublishProgressPanel.test.js）。
 *
 * publish-progress-panel-refine 重构（2026-09-29）：
 * - 汇总口径改「成功 N/M」直给（failed/cancelled 不再计入「已完成」）。
 * - 单会话扁平化（无卡中卡/无会话徽标重复）；fallback 会话标题带创建时间。
 * - footer 警示条 + 「取消全部任务」两步内联确认（复用 queue:cancel；任务状态由
 *   转发的 phase:'cancelled' 事件收敛——事件单一来源，面板不自标记）。
 * - 完成自动收敛：全部成功且无失败/取消、面板展开、5 秒无指针操作 → 自动最小化
 *   （不弹首次隐藏 toast）；面板交互/新会话开始即取消；失败/取消在场不收敛。
 * - 单任务内联重试/复制错误（TaskRow emit 上抛，本组件持有 store 与剪贴板副作用）。
 *
 * 首次隐藏教育：minimize 时 consumeFirstHideToast() 为 true → 一次性 toast
 * （localStorage 记忆）；之后由胶囊常驻提示承担持续提醒。
 * 任务行渲染拆分至 PublishProgressTaskRow.vue（CI 逐文件行数门禁 < 500 行）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  CircleCheckFilled, Close, Loading, Minus, RefreshRight, WarningFilled,
} from '@element-plus/icons-vue'
import { usePublishProgressStore } from '@/stores/publishProgress'
import PublishProgressTaskRow from './PublishProgressTaskRow.vue'

const { t } = useI18n()
const store = usePublishProgressStore()

store.init()

/** 完成自动收敛延迟（publish-progress-panel-refine D3） */
const AUTO_COLLAPSE_DELAY_MS = 5000
/** 取消两步确认窗口（超时自动退出确认态，防误触滞留） */
const CANCEL_CONFIRM_WINDOW_MS = 4000

const progressWidth = computed(() => {
  const { done, total } = store.aggregate
  if (!total) return '0%'
  return Math.round((done / total) * 100) + '%'
})

const isSingleSession = computed(() => store.sessions.length === 1)

function sessionTitle(session) {
  if (session.title) return session.title
  if (session.recovered) return t('publishPage.publishProgressPanel.recoveredTitle')
  const time = new Date(session.createdAt || Date.now())
    .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  return t('publishPage.publishProgressPanel.sessionTitleTimeFallback', { time })
}

function handleMinimize() {
  store.minimizePanel()
  if (store.consumeFirstHideToast()) {
    ElMessage({
      message: t('publishPage.publishProgressPanel.firstHideToast'),
      type: 'info',
      duration: 6000,
      showClose: true,
    })
  }
}

function handleClose() {
  store.clearFinished()
  if (store.sessions.length === 0) store.panelVisible = false
}

async function handleRetry(session) {
  const result = await store.retryFailed(session.id)
  if (result && (result.ok > 0 || result.fail > 0)) {
    ElMessage({
      message: t('publishPage.publishProgressPanel.retryPartial', { ok: result.ok, fail: result.fail }),
      type: result.fail > 0 ? 'warning' : 'success',
      duration: 4000,
    })
  }
}

/** 单任务内联重试（TaskRow @retry 上抛；纯展示组件不持 store） */
async function handleTaskRetry(session, taskId) {
  const result = await store.retryOne(session.id, taskId)
  if (result && (result.ok > 0 || result.fail > 0)) {
    ElMessage({
      message: t('publishPage.publishProgressPanel.retryPartial', { ok: result.ok, fail: result.fail }),
      type: result.fail > 0 ? 'warning' : 'success',
      duration: 4000,
    })
  }
}

/** 复制完整错误文本（TaskRow @copy-error 上抛；剪贴板失败如实 toast，不静默） */
async function handleCopyError(error) {
  const text = String(error || '')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage({ message: t('publishPage.publishProgressPanel.copied'), type: 'success', duration: 2500 })
  } catch {
    ElMessage({ message: t('publishPage.publishProgressPanel.copyFailed'), type: 'error', duration: 2500 })
  }
}

// ─── 取消全部在途任务（两步内联确认，publish-progress-panel-refine） ──

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

// ─── 完成自动收敛（publish-progress-panel-refine D3） ──────────────

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

function autoCollapseEligible() {
  const { failed, cancelled } = store.aggregate
  return store.panelVisible
    && !store.panelMinimized
    && !store.hasRunning
    && store.sessions.length > 0
    && failed === 0
    && cancelled === 0
}

// 只在「完成跃迁」（hasRunning true→false）触发；用户事后手动展开不触发
watch(() => store.hasRunning, (running, prev) => {
  if (running) {
    clearAutoCollapseTimer()
    return
  }
  if (prev !== true) return
  if (!autoCollapseEligible()) return
  clearAutoCollapseTimer()
  autoCollapseTimer = setTimeout(() => {
    autoCollapseTimer = null
    // 触发时复核资格（期间可能失败/新会话/手动收纳）
    if (autoCollapseEligible()) store.minimizePanel()
  }, AUTO_COLLAPSE_DELAY_MS)
})

onBeforeUnmount(() => {
  clearAutoCollapseTimer()
  resetCancelConfirm()
})
</script>

<style scoped>
/* 定位口径：右下角、BackToTop(1900) 之上、UpdateNotification(2000) 之下；
   bottom 抬高避让 BackToTop 44px 按钮（PRD-PUBLISH-PROGRESS-UX §5.3） */
.publish-progress-panel {
  position: fixed;
  right: var(--spacing-6);
  bottom: calc(var(--spacing-6) + 52px);
  z-index: 1950;

  display: flex;
  flex-direction: column;
  width: 380px;
  max-height: 60vh;
  padding: var(--spacing-3) var(--spacing-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-float);
  overflow: hidden;
}

.ppp__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  padding-bottom: var(--spacing-2);
}

.ppp__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--color-text-strong);
}

.ppp__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: 500;
}

.ppp__badge--running {
  color: var(--color-primary);
  background: var(--color-primary-light, rgba(80, 72, 229, 0.1));
}

.ppp__actions {
  display: flex;
  gap: 4px;
}

.ppp__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
}

.ppp__icon-btn:hover:not(:disabled) {
  background: var(--color-bg-inset);
  color: var(--color-text-strong);
}

.ppp__icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ppp__summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  padding-bottom: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.ppp__summary-failed {
  color: var(--color-danger);
}

.ppp__summary-cancelled {
  color: var(--color-text-muted);
}

.ppp__bar {
  position: relative;
  flex: 1 1 100%;
  height: 4px;
  border-radius: var(--radius-full);
  background: var(--color-bg-inset);
  overflow: hidden;
}

.ppp__bar-fill {
  position: absolute;
  inset: 0 auto 0 0;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  transition: width 240ms ease-out;
}

.ppp__empty {
  padding: var(--spacing-4) 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
  text-align: center;
}

.ppp__sessions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  overflow-y: auto;
}

.ppp__session {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  padding: var(--spacing-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-inset);
}

/* 单会话扁平（publish-progress-panel-refine）：去卡中卡嵌套 */
.ppp__session--flat {
  padding: 0;
  border: none;
  background: transparent;
}

.ppp__session-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
}

.ppp__session-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

/* 会话徽标（publish-progress-panel-refine）：点+文字，去色块底（状态色收敛） */
.ppp__session-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.ppp__session-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
}

.ppp__session-badge--done .ppp__session-badge-dot {
  background: var(--color-success);
}

.ppp__retry-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  align-self: flex-start;
  margin-top: var(--spacing-1);
  padding: 3px 10px;
  border: 1px solid var(--color-border-strong, var(--color-border));
  border-radius: var(--radius-sm);
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.ppp__retry-btn:hover:not(:disabled) {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.ppp__retry-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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

/* 最小化胶囊 */
.publish-progress-pill {
  position: fixed;
  right: var(--spacing-6);
  bottom: calc(var(--spacing-6) + 52px);
  z-index: 1950;

  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  max-width: 320px;
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-card);
  box-shadow: var(--shadow-float);
  color: var(--color-text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.publish-progress-pill:hover {
  border-color: var(--color-primary);
}

.ppp__pill-icon {
  flex-shrink: 0;
  color: var(--color-primary);
}

.ppp__pill-text {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ppp__pill-hint {
  flex-shrink: 0;
  padding-left: var(--spacing-2);
  border-left: 1px solid var(--color-border);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.ppp__spin {
  animation: ppp-rotate 1.2s linear infinite;
}

@keyframes ppp-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .ppp__spin {
    animation: none;
  }

  .ppp__bar-fill {
    transition: none;
  }
}
</style>
