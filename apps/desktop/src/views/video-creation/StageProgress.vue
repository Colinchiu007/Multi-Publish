<template>
  <div class="stage-progress" v-if="stages && stages.length > 0">
    <!-- 进度头部 -->
    <div class="progress-header">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>
      <span class="progress-text">{{ progressPercent }}%</span>
      <span v-if="elapsedMs !== null" class="elapsed-text">
        {{ formatDuration(elapsedMs) }}
      </span>
    </div>

    <!-- 完成摘要 -->
    <div v-if="summary" class="progress-summary">{{ summary }}</div>

    <!-- 阶段列表 -->
    <div class="stages-list">
      <div
        v-for="(stage, index) in stages"
        :key="stage.id || stage.name || index"
        class="stage-item"
        :class="stageStateClass(stage, index)"
      >
        <span class="stage-icon">{{ stageStateIcon(stage, index) }}</span>
        <span class="stage-main">
          <span class="stage-name">{{ stageName(stage.name) }}</span>
          <span v-if="stageDetailText(stage, index)" class="stage-meta">
            {{ stageDetailText(stage, index) }}
          </span>
          <!-- compose 子进度条 -->
          <span
            v-if="stage.name === 'compose' && stage.status === 'running' && composeSubProgressPercent(stage) !== null"
            class="stage-sub-progress"
            role="progressbar"
            :aria-valuenow="composeSubProgressPercent(stage)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="stage-sub-bar">
              <span class="stage-sub-fill" :style="{ width: composeSubProgressPercent(stage) + '%' }"></span>
            </span>
          </span>
        </span>
        <span class="stage-status">
          {{ stageStatusLabel(stage, index) }}
          <span v-if="stageTimeText(stage)" class="stage-time"> · {{ stageTimeText(stage) }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script>
import { getPipelineStage } from '@/i18n/pipeline-labels'

export default {
  name: 'StageProgress',
  props: {
    stages: { type: Array, default: () => [] },
    progressPercent: { type: Number, default: 0 },
    elapsedMs: { type: Number, default: null },
    summary: { type: String, default: '' },
  },
  methods: {
    stageName(name) {
      return getPipelineStage((key) => this.$t?.(key), name)
    },
    stageStateClass(stage, index) {
      if (!stage || !stage.status) return ''
      const status = stage.status
      if (status === 'completed') return 'completed'
      if (status === 'running') return 'running'
      if (status === 'failed') return 'failed'
      if (status === 'waiting_approval') return 'waiting'
      return 'pending'
    },
    stageStateIcon(stage, index) {
      if (!stage || !stage.status) return '○'
      const status = stage.status
      if (status === 'completed') return '✓'
      if (status === 'running') return '⟳'
      if (status === 'failed') return '✕'
      if (status === 'waiting_approval') return '⏸'
      if (status === 'cancelled') return '—'
      return '○'
    },
    stageDetailText(stage, index) {
      if (!stage) return ''
      const status = stage.status || ''
      if (status === 'completed' && stage.completedAt) {
        return `完成于 ${new Date(stage.completedAt).toLocaleTimeString('zh-CN')}`
      }
      if (status === 'running' && stage.startedAt) {
        return `开始于 ${new Date(stage.startedAt).toLocaleTimeString('zh-CN')}`
      }
      if (status === 'failed' && stage.error) {
        return stage.error.length > 50 ? stage.error.slice(0, 47) + '...' : stage.error
      }
      return ''
    },
    stageStatusLabel(stage, index) {
      if (!stage || !stage.status) return '等待中'
      const status = stage.status
      const labels = {
        completed: '已完成',
        running: '运行中',
        failed: '失败',
        waiting_approval: '等待确认',
        cancelled: '已取消',
        pending: '等待中',
      }
      return labels[status] || status
    },
    stageTimeText(stage) {
      if (!stage || !stage.startedAt) return ''
      if (stage.status !== 'running' && stage.status !== 'completed' && stage.status !== 'failed') return ''
      const start = Date.parse(stage.startedAt)
      if (!Number.isFinite(start)) return ''
      const end = stage.completedAt ? Date.parse(stage.completedAt) : Date.now()
      if (!Number.isFinite(end)) return ''
      return this.formatDuration(Math.max(0, end - start))
    },
    composeSubProgressPercent(stage) {
      if (!stage || !stage.progress) return null
      const p = stage.progress
      if (!p || !Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100) return null
      return Math.round(p.percent)
    },
    formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000))
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      if (minutes > 0) {
        return `${minutes} 分 ${seconds} 秒`
      }
      return `${seconds} 秒`
    },
  },
}
</script>

<style scoped>
.stage-progress {
  width: 100%;
}

.progress-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background: var(--border);
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  min-width: 40px;
}

.elapsed-text {
  font-size: 13px;
  color: var(--text-muted);
}

.progress-summary {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 16px;
  padding: 8px 12px;
  background: var(--surface);
  border-radius: 6px;
}

.stages-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.stage-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  transition: all 0.2s;
}

.stage-item.completed {
  border-color: var(--status-completed-bg);
  background: var(--status-completed-bg);
}

.stage-item.running {
  border-color: var(--primary);
  background: var(--primary-bg, rgba(124, 92, 191, 0.05));
}

.stage-item.failed {
  border-color: var(--status-failed-bg);
  background: var(--status-failed-bg);
}

.stage-item.waiting {
  border-color: var(--status-waiting-bg);
  background: var(--status-waiting-bg);
}

.stage-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.stage-item.completed .stage-icon {
  background: var(--status-completed-text);
  color: #fff;
}

.stage-item.running .stage-icon {
  background: var(--primary);
  color: #fff;
  animation: pulse 2s infinite;
}

.stage-item.failed .stage-icon {
  background: var(--status-failed-text);
  color: #fff;
}

.stage-item.waiting .stage-icon {
  background: var(--status-waiting-text);
  color: #fff;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.stage-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stage-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.stage-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.stage-sub-progress {
  margin-top: 4px;
}

.stage-sub-bar {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.stage-sub-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.stage-status {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
}

.stage-time {
  color: var(--text-light);
}

/* 响应式 */
@media (max-width: 768px) {
  .stage-item {
    flex-wrap: wrap;
  }

  .stage-status {
    width: 100%;
    text-align: right;
    margin-top: 4px;
  }
}
</style>
