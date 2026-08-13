<template>
  <div class="stage-progress" v-if="stages && stages.length > 0">
    <!-- 阶段列表 -->
    <div class="stages-list" data-testid="story2video-stage-list">
      <!-- 粘性头部：进度条 + 摘要，在阶段列表内滚动时固定在顶部 -->
      <div class="stages-sticky-header" data-testid="story2video-stage-sticky-header">
        <div data-testid="story2video-orchestration-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="progress-text">{{ progressPercent }}%</span>
          <span v-if="elapsedMs !== null" class="elapsed-text">
            {{ $t('stageProgress.elapsed', { duration: formatDuration(elapsedMs) }) }}
          </span>
        </div>
        <div v-if="summary" class="progress-summary">{{ summary }}</div>
      </div>
      <div
        v-for="(stage, index) in stages"
        :key="stage.id || stage.name || index"
        class="stage-item"
        :class="stageStateClass(stage, index)" :data-testid="`story2video-stage-${stage.name || index}`"
      >
        <span class="stage-icon">{{ stageStateIcon(stage, index) }}</span>
        <span class="stage-main">
          <span class="stage-name">{{ stageName(stage.name) }}</span>
          <span v-if="stageDetailText(stage, index)" class="stage-detail" :data-testid="`story2video-stage-detail-${stage.name || index}`">{{ stageDetailText(stage, index) }}</span>
          <span v-if="stageTimeDetailText(stage, index)" class="stage-meta">
            {{ stageTimeDetailText(stage, index) }}
          </span>
          <!-- compose 子进度条 -->
          <span
            v-if="stage.name === 'compose' && stage.status === 'running' && composeSubProgressPercent(stage) !== null"
            class="stage-sub-progress" data-testid="story2video-stage-compose-progress"
            role="progressbar"
            :aria-valuenow="composeSubProgressPercent(stage)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="stage-sub-bar">
              <span class="stage-sub-fill" data-testid="story2video-stage-sub-fill" :style="{ width: composeSubProgressPercent(stage) + '%' }"></span>
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
import '@/styles/stage-progress.css'
import { getPipelineStage } from '@/i18n/pipeline-labels'
import { getAppLocale } from '@/i18n'

export default {
  name: 'StageProgress',
  props: {
    stages: { type: Array, default: () => [] },
    progressPercent: { type: Number, default: 0 },
    elapsedMs: { type: Number, default: null },
    summary: { type: String, default: '' },
    orchestrationContext: { type: Object, default: null },
    // 当前运行检查点（scene_asset_selection 等）：用于区分「等待用户选择素材」与「手动暂停」
    checkpoint: { type: Object, default: null },
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
      if (status === 'paused') return 'waiting paused'
      return 'pending'
    },
    stageStateIcon(stage, index) {
      if (!stage || !stage.status) return '○'
      const status = stage.status
      if (status === 'completed') return '✓'
      if (status === 'running') return '⟳'
      if (status === 'failed') return '✕'
      if (status === 'waiting_approval' || status === 'paused') return '⏸'
      if (status === 'cancelled') return '—'
      return '○'
    },
    stageTimeDetailText(stage, index) {
      if (!stage) return ''
      const status = stage.status || ''
      const locale = getAppLocale() === 'en' ? 'en-US' : 'zh-CN'
      if (status === 'completed' && stage.completedAt) {
        return this.$t('stageProgress.completedAt', { time: new Date(stage.completedAt).toLocaleTimeString(locale) })
      }
      if (status === 'running' && stage.startedAt) {
        return this.$t('stageProgress.startedAt', { time: new Date(stage.startedAt).toLocaleTimeString(locale) })
      }
      if (status === 'failed' && stage.error) {
        return stage.error.length > 50 ? stage.error.slice(0, 47) + '...' : stage.error
      }
      return ''
    },
    
    stageDetailText(stage, index) {
      if (!this.orchestrationContext) return this.stageTimeDetailText(stage, index)
      const ctx = this.orchestrationContext
      if (stage.name === 'split' && stage.status === 'completed') {
        const scenes = ctx.split?.scenes || []
        if (scenes.length > 0) return this.$t('stageProgress.splitScenes', { count: scenes.length })
      }
      if (stage.name === 'optimize' && stage.status === 'completed') {
        const p = ctx.optimize_progress
        if (p && p.done != null && p.total != null) return this.$t('stageProgress.optimizeDone', { total: p.total, done: p.done })
      }
      if (stage.name === 'generate_assets') {
        const p = ctx.assets_progress
        if (p) {
          if (p.videosDone != null) return this.$t('stageProgress.assetsDetail', { images: p.imagesDone, imagesTotal: p.imagesTotal, videos: p.videosDone, videosTotal: p.videosTotal, tts: p.ttsDone, ttsTotal: p.ttsTotal })
          return this.$t('stageProgress.assetsDetailNoVideo', { images: p.imagesDone, imagesTotal: p.imagesTotal, tts: p.ttsDone, ttsTotal: p.ttsTotal })
        }
      }
      if (stage.name === 'compose' && stage.status === 'running') {
        const p = ctx.compose_progress
        if (p && Number.isFinite(p.percent)) {
          if (p.phase === 'segments' && Number.isInteger(p.segmentsTotal) && p.segmentsTotal > 0 && Number.isInteger(p.segmentsDone)) {
            return this.$t('stageProgress.composeSegments', { done: p.segmentsDone, total: p.segmentsTotal, percent: Math.round(p.percent) })
          }
          return this.$t('stageProgress.composeVideo', { percent: Math.round(p.percent) })
        }
      }
      return ''
    },
    stageStatusLabel(stage, index) {
      if (!stage || !stage.status) return this.$t('stageProgress.statusPending')
      const status = stage.status
      if (status === 'paused') {
        if (this.checkpoint && this.checkpoint.type === 'scene_asset_selection') {
          return this.translateStageStatus('create.story2video.selectionWait.stageLabel', 'Awaiting asset selection')
        }
        return this.translateStageStatus('pipelines.statuses.paused', 'Paused')
      }
      const labels = {
        completed: 'statusCompleted',
        running: 'statusRunning',
        failed: 'statusFailed',
        waiting_approval: 'statusWaitingApproval',
        cancelled: 'statusCancelled',
        pending: 'statusPending',
      }
      return labels[status] ? this.$t('stageProgress.' + labels[status]) : status
    },
    translateStageStatus(key, fallback) {
      const value = this.$t?.(key)
      return typeof value === 'string' && value && value !== key ? value : fallback
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
      const p = (stage && stage.progress) || (this.orchestrationContext && this.orchestrationContext.compose_progress)
      if (!p || !Number.isFinite(p.percent) || p.percent < 0 || p.percent > 100) return null
      return Math.round(p.percent)
    },
    formatDuration(ms) {
      const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000))
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      if (minutes > 0) {
        return this.$t('stageProgress.durationMin', { minutes, seconds })
      }
      return this.$t('stageProgress.durationSec', { seconds })
    },
  },
}
</script>
