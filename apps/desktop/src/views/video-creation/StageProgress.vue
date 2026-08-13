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
            已用时 {{ formatDuration(elapsedMs) }}
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
          <!-- 子进度条：已完成=100%，运行中=上下文进度，其他=隐藏 -->
          <span
            v-if="stageSubProgressPercent(stage) !== null"
            class="stage-sub-progress" :data-testid="`story2video-stage-${stage.name || index}-progress`"
            role="progressbar"
            :aria-valuenow="stageSubProgressPercent(stage)"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="stage-sub-bar">
              <span class="stage-sub-fill" :data-testid="`story2video-stage-${stage.name || index}-sub-fill`" :style="{ width: stageSubProgressPercent(stage) + '%' }"></span>
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
    
    stageDetailText(stage, index) {
      // 优先：统一 stage.progress.message（新契约，Phase 1-2 后所有阶段走此路径）
      if (stage.progress && stage.progress.message) return stage.progress.message
      // 兼容：旧 context 键（optimize_progress / assets_progress / compose_progress / split.scenes）
      if (!this.orchestrationContext) return this.stageTimeDetailText(stage, index)
      const ctx = this.orchestrationContext
      if (stage.name === 'split' && stage.status === 'completed') {
        const scenes = ctx.split?.scenes || []
        if (scenes.length > 0) return '拆分为了 ' + scenes.length + ' 个场景'
      }
      if (stage.name === 'optimize' && stage.status === 'completed') {
        const p = ctx.optimize_progress
        if (p && p.done != null && p.total != null) return '共 ' + p.total + ' 个场景，已完成 ' + p.done + ' 个'
      }
      if (stage.name === 'generate_assets') {
        const p = ctx.assets_progress
        if (p) {
          if (p.videosDone != null) return '图片 ' + p.imagesDone + '/' + p.imagesTotal + ' · 视频 ' + p.videosDone + '/' + p.videosTotal + ' · 旁白 ' + p.ttsDone + '/' + p.ttsTotal
          return '图片 ' + p.imagesDone + '/' + p.imagesTotal + ' · 旁白 ' + p.ttsDone + '/' + p.ttsTotal
        }
      }
      if (stage.name === 'compose' && stage.status === 'running') {
        const p = ctx.compose_progress
        if (p && Number.isFinite(p.percent)) {
          if (p.phase === 'segments' && Number.isInteger(p.segmentsTotal) && p.segmentsTotal > 0 && Number.isInteger(p.segmentsDone)) {
            return '正在合成片段 ' + p.segmentsDone + '/' + p.segmentsTotal + ' · ' + Math.round(p.percent) + '%'
          }
          return '视频合成 ' + Math.round(p.percent) + '%'
        }
      }
      return ''
    },
    stageStatusLabel(stage, index) {
      if (!stage || !stage.status) return '等待中'
      const status = stage.status
      if (status === 'paused') {
        if (this.checkpoint && this.checkpoint.type === 'scene_asset_selection') {
          return this.translateStageStatus('create.story2video.selectionWait.stageLabel', 'Awaiting asset selection')
        }
        return this.translateStageStatus('pipelines.statuses.paused', 'Paused')
      }
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
    /** 通用阶段子进度：已完成→100%，运行中→上下文百分比，其他→null（不显示） */
    stageSubProgressPercent(stage) {
      if (!stage) return null
      if (stage.status === 'completed') return 100
      if (stage.status === 'running') {
        const stageProgress = stage.progress
        if (stageProgress && Number.isFinite(stageProgress.percent)) {
          const v = Math.round(stageProgress.percent)
          if (v >= 0 && v <= 100) return v
        }
        const ctx = this.orchestrationContext
        if (ctx) {
          const ctxProgress = ctx[`${stage.name}_progress`]
          if (ctxProgress && Number.isFinite(ctxProgress.percent)) {
            const v = Math.round(ctxProgress.percent)
            if (v >= 0 && v <= 100) return v
          }
        }
      }
      return null
    },
    composeSubProgressPercent(stage) {
      return this.stageSubProgressPercent(stage)
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
