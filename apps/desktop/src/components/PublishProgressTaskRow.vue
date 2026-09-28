<template>
  <div
    class="ppp__task"
    data-testid="publish-progress-task"
    :class="'ppp__task--' + task.phase"
  >
    <span class="ppp__task-platform">{{ platformLabel(task.platform) }}</span>
    <span class="ppp__task-status" :class="'ppp__status--' + task.phase">
      <el-icon v-if="task.phase === 'success'"><CircleCheckFilled /></el-icon>
      <el-icon v-else-if="task.phase === 'failed'"><CircleCloseFilled /></el-icon>
      <el-icon v-else-if="task.phase === 'retry'"><RefreshRight /></el-icon>
      <el-icon v-else-if="task.phase === 'blocked' || task.phase === 'queued'"><Clock /></el-icon>
      <el-icon v-else class="ppp__spin"><Loading /></el-icon>
      {{ statusLabel(task.phase) }}
    </span>
    <span v-if="showStepChain" class="ppp__steps">
      <span
        v-for="step in STEP_CHAIN"
        :key="step"
        class="ppp__step"
        :class="{ 'ppp__step--current': task.stageKey === step, 'ppp__step--past': isPastStep(task.stageKey, step) }"
      >
        {{ stageLabel(step) }}
      </span>
    </span>
    <span v-else class="ppp__task-detail">
      <template v-if="task.stageKey === 'detail' && task.stage">{{ task.stage }}</template>
    </span>
    <span v-if="task.percent !== null && task.percent !== undefined" class="ppp__task-percent">
      {{ task.percent }}%
    </span>
    <span v-if="task.phase === 'blocked' && task.remainingWait" class="ppp__task-wait">
      {{ t('publishPage.publishProgressPanel.blockedWaitMinutes', { minutes: Math.max(1, Math.ceil(task.remainingWait / 60000)) }) }}
    </span>
    <span
      v-if="task.phase === 'failed' && task.error"
      class="ppp__task-error"
      :title="task.error"
    >
      {{ truncateError(task.error) }}
    </span>
  </div>
</template>

<script setup>
/**
 * PublishProgressTaskRow —— 发布进度面板的单任务行（publish-progress-ux）
 *
 * 从 PublishProgressPanel 拆出（CI 逐文件行数门禁：新代码单文件 < 500 行）。
 * 职责：平台名 + 状态标签（文字+图标双通道）+ 步骤链（准备→上传→填写→提交→校验→完成，
 * 当前高亮）+ percent + 失败错误行 + 频控等待提示。纯展示组件（props 单向）。
 */
import { useI18n } from 'vue-i18n'
import {
  CircleCheckFilled, CircleCloseFilled, Clock, Loading, RefreshRight,
} from '@element-plus/icons-vue'

const props = defineProps({
  /** TaskState（store publishProgress 会话内单任务） */
  task: { type: Object, required: true },
})

const { t } = useI18n()

/** 步骤链（stageKey 顺序；waiting/retry/blocked/failed/detail 以状态标签表达不进链） */
const STEP_CHAIN = ['prepare', 'upload', 'fill', 'submit', 'verify', 'done']

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

function showStepChain() {
  return (props.task.phase === 'start' || props.task.phase === 'progress') && STEP_CHAIN.includes(props.task.stageKey)
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
</script>

<style scoped>
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
}
</style>
