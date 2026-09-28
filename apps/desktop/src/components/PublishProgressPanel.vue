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

      <div class="ppp__summary" data-testid="publish-progress-summary">
        <span>{{ t('publishPage.publishProgressPanel.summaryDone', { done: store.aggregate.done, total: store.aggregate.total }) }}</span>
        <span v-if="store.aggregate.failed > 0" class="ppp__summary-failed">
          {{ t('publishPage.publishProgressPanel.summaryFailed', { count: store.aggregate.failed }) }}
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
        <div v-for="session in store.sessions" :key="session.id" class="ppp__session">
          <div class="ppp__session-head">
            <span class="ppp__session-title" :title="sessionTitle(session)">{{ sessionTitle(session) }}</span>
            <span class="ppp__badge" :class="session.status === 'done' ? 'ppp__badge--done' : 'ppp__badge--running'">
              {{ session.status === 'done'
                ? t('publishPage.publishProgressPanel.sessionDone')
                : t('publishPage.publishProgressPanel.sessionRunning') }}
            </span>
          </div>
          <div
            v-for="taskId in session.taskOrder"
            :key="taskId"
            class="ppp__task"
            data-testid="publish-progress-task"
            :class="'ppp__task--' + session.tasks[taskId].phase"
          >
            <span class="ppp__task-platform">{{ platformLabel(session.tasks[taskId].platform) }}</span>
            <span class="ppp__task-status" :class="'ppp__status--' + session.tasks[taskId].phase">
              <el-icon v-if="session.tasks[taskId].phase === 'success'"><CircleCheckFilled /></el-icon>
              <el-icon v-else-if="session.tasks[taskId].phase === 'failed'"><CircleCloseFilled /></el-icon>
              <el-icon v-else-if="session.tasks[taskId].phase === 'retry'"><RefreshRight /></el-icon>
              <el-icon v-else-if="session.tasks[taskId].phase === 'blocked' || session.tasks[taskId].phase === 'queued'"><Clock /></el-icon>
              <el-icon v-else class="ppp__spin"><Loading /></el-icon>
              {{ statusLabel(session.tasks[taskId].phase) }}
            </span>
            <span v-if="showStepChain(session.tasks[taskId])" class="ppp__steps">
              <span
                v-for="step in STEP_CHAIN"
                :key="step"
                class="ppp__step"
                :class="{ 'ppp__step--current': session.tasks[taskId].stageKey === step, 'ppp__step--past': isPastStep(session.tasks[taskId].stageKey, step) }"
              >
                {{ stageLabel(step) }}
              </span>
            </span>
            <span v-else class="ppp__task-detail">
              <template v-if="session.tasks[taskId].stageKey === 'detail' && session.tasks[taskId].stage">
                {{ session.tasks[taskId].stage }}
              </template>
            </span>
            <span v-if="session.tasks[taskId].percent !== null && session.tasks[taskId].percent !== undefined" class="ppp__task-percent">
              {{ session.tasks[taskId].percent }}%
            </span>
            <span v-if="session.tasks[taskId].phase === 'blocked' && session.tasks[taskId].remainingWait" class="ppp__task-wait">
              {{ t('publishPage.publishProgressPanel.blockedWaitMinutes', { minutes: Math.max(1, Math.ceil(session.tasks[taskId].remainingWait / 60000)) }) }}
            </span>
            <span
              v-if="session.tasks[taskId].phase === 'failed' && session.tasks[taskId].error"
              class="ppp__task-error"
              :title="session.tasks[taskId].error"
            >
              {{ truncateError(session.tasks[taskId].error) }}
            </span>
          </div>
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

      <div v-if="store.hasRunning" class="ppp__hint" data-testid="publish-progress-hint">
        {{ t('publishPage.publishProgressPanel.hintRunning') }}
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
 * 首次隐藏教育：minimize 时 consumeFirstHideToast() 为 true → 一次性 toast
 * （localStorage 记忆）；之后由胶囊常驻提示承担持续提醒。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  CircleCheckFilled, CircleCloseFilled, Clock, Close, Loading, Minus, RefreshRight,
} from '@element-plus/icons-vue'
import { usePublishProgressStore } from '@/stores/publishProgress'

const { t } = useI18n()
const store = usePublishProgressStore()

store.init()

/** 步骤链（stageKey 顺序，当前高亮；waiting/retry/blocked/failed/detail 以状态标签表达不进链） */
const STEP_CHAIN = ['prepare', 'upload', 'fill', 'submit', 'verify', 'done']

const progressWidth = computed(() => {
  const { done, total } = store.aggregate
  if (!total) return '0%'
  return Math.round((done / total) * 100) + '%'
})

function platformLabel(platform) {
  if (!platform) return ''
  const key = 'home.platforms.' + platform
  const translated = t(key)
  // 缺 key 时 vue-i18n 返回 key 原文——回退平台原始 id（不泄漏 key 形态）
  return typeof translated === 'string' && translated !== key ? translated : platform
}

function statusLabel(phase) {
  const map = {
    queued: 'statusQueued',
    start: 'statusRunning',
    progress: 'statusRunning',
    retry: 'statusRetry',
    blocked: 'statusBlocked',
    success: 'statusSuccess',
    failed: 'statusFailed',
  }
  return t('publishPage.publishProgressPanel.' + (map[phase] || 'statusRunning'))
}

function stageLabel(stageKey) {
  const map = {
    prepare: 'stagePrepare', upload: 'stageUpload', fill: 'stageFill',
    submit: 'stageSubmit', verify: 'stageVerify', waiting: 'stageWaiting',
    done: 'stageDone', failed: 'stageFailed', detail: 'stageDetail',
  }
  return t('publishPage.publishProgressPanel.' + (map[stageKey] || 'stageDetail'))
}

function sessionTitle(session) {
  if (session.title) return session.title
  if (session.recovered) return t('publishPage.publishProgressPanel.recoveredTitle')
  return t('publishPage.publishProgressPanel.sessionTitleFallback')
}

function showStepChain(task) {
  return (task.phase === 'start' || task.phase === 'progress') && STEP_CHAIN.includes(task.stageKey)
}

function isPastStep(current, step) {
  const currentIdx = STEP_CHAIN.indexOf(current)
  const stepIdx = STEP_CHAIN.indexOf(step)
  return currentIdx >= 0 && stepIdx >= 0 && stepIdx < currentIdx
}

function truncateError(error) {
  const text = String(error || '')
  return text.length > 120 ? text.slice(0, 120) + '…' : text
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

.ppp__badge--done {
  color: var(--color-success);
  background: rgba(103, 194, 58, 0.12);
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

.ppp__task {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.ppp__task-platform {
  min-width: 56px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.ppp__task-status {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.ppp__status--success { color: var(--color-success); }
.ppp__status--failed { color: var(--color-danger); }
.ppp__status--retry,
.ppp__status--blocked { color: var(--color-warning); }
.ppp__status--start,
.ppp__status--progress { color: var(--color-primary); }

.ppp__steps {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.ppp__step {
  padding: 0 4px;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
}

.ppp__step--past {
  color: var(--color-text-secondary);
}

.ppp__step--current {
  color: var(--color-primary);
  background: var(--color-primary-light, rgba(80, 72, 229, 0.1));
  font-weight: 600;
}

.ppp__task-detail {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.ppp__task-percent {
  font-variant-numeric: tabular-nums;
  color: var(--color-text-secondary);
}

.ppp__task-wait {
  color: var(--color-warning);
}

.ppp__task-error {
  flex: 1 1 100%;
  color: var(--color-danger);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.ppp__hint {
  padding-top: var(--spacing-2);
  border-top: 1px solid var(--color-border);
  margin-top: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-muted);
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
