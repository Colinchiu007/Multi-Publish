<template>
  <div class="pipeline-page">
    <div class="page-header">
      <h1>管线编排</h1>
      <p class="text-muted">查看和管理视频创作管线</p>
    </div>

    <div class="page-tabs">
      <button :class="['tab', { active: tab === 'browse' }]" @click="tab = 'browse'">浏览管线</button>
      <button :class="['tab', { active: tab === 'running' }]" @click="tab = 'running'">运行中</button>
      <button :class="['tab', { active: tab === 'history' }]" @click="tab = 'history'; loadHistory()">历史记录</button>
    </div>

    <!-- 管线浏览 -->
    <div v-if="tab === 'browse'">
      <div v-if="loading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else-if="error" class="error-state">⚠️ {{ error }}</div>
      <div v-else class="pipeline-list">
        <div v-for="p in pipelines" :key="p.name" class="pipeline-card" :class="getRunningClass(p.name)">
          <div class="card-left">
            <span class="badge" :class="p.category">{{ p.category }}</span>
            <h3>{{ humanName(p.name) }}</h3>
            <p class="desc">{{ p.description }}</p>
            <div class="stages">
              <span v-for="(s, i) in p.stages" :key="i" class="stage-dot" :title="s"></span>
              <span class="stage-count">{{ p.stages?.length || 0 }} 阶段</span>
            </div>
          </div>
          <div class="card-right">
            <UiButton v-if="currentPipeline !== p.name" @click="startPipeline(p.name)">开始</UiButton>
            <div v-else class="running-controls">
              <UiButton v-if="pipelineStatusData === 'paused'" @click="resumePipeline">继续</UiButton>
              <UiButton v-else-if="pipelineStatusData === 'running'" @click="pausePipeline">暂停</UiButton>
              <UiButton variant="danger" @click="cancelPipeline">取消</UiButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 运行中状态 -->
    <div v-if="tab === 'running' && currentPipeline" class="running-section">
      <h2>当前管线: {{ humanName(currentPipeline) }}</h2>
      <div class="status-bar" :class="pipelineStatusData">
        <span>状态: {{ statusLabel }}</span>
        <span class="controls">
          <UiButton v-if="pipelineStatusData === 'paused'" @click="resumePipeline">继续</UiButton>
          <UiButton v-else-if="pipelineStatusData === 'running'" @click="pausePipeline">暂停</UiButton>
          <UiButton variant="danger" @click="cancelPipeline">取消</UiButton>
        </span>
      </div>
      <div class="stage-list">
        <div v-for="(stage, i) in currentStages" :key="i" class="stage-item" :class="stageClass(stage, i)">
          <span class="stage-icon">{{ stageIcon(stage, i) }}</span>
          <span class="stage-name">{{ humanName(stage) }}</span>
        </div>
      </div>
    </div>
    <div v-else-if="tab === 'running' && !currentPipeline" class="empty-state">
      <p>没有正在运行的管线</p>
      <UiButton @click="tab = 'browse'">浏览管线</UiButton>
    </div>

    <!-- 历史记录 -->
    <div v-if="tab === 'history'">
      <div v-if="historyLoading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else-if="history.length === 0" class="empty-state"><p>暂无管线运行记录</p></div>
      <div v-else class="history-list">
        <div v-for="(h, i) in history" :key="i" class="history-item">
          <span class="history-name">{{ humanName(h.pipelineName || h.name) }}</span>
          <span class="history-status" :class="h.status">{{ h.status }}</span>
          <span class="history-time">{{ formatTime(h.completedAt || h.startedAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { pipelineList, pipelineGet, pipelineStart, pipelinePause, pipelineResume, pipelineCancel, pipelineStatus, pipelineHistory } from '@/api/publisher'
export default {
  name: 'PipelineView',
  data() {
    return {
      tab: 'browse',
      pipelines: [],
      loading: true,
      error: null,
      currentPipeline: null,
      pipelineStatusData: null,
      currentStages: [],
      currentStageIndex: -1,
      history: [],
      historyLoading: false,
      pollTimer: null,
    }
  },
  computed: {
    statusLabel() {
      const labels = { idle: '空闲', running: '运行中', paused: '已暂停', completed: '已完成', cancelled: '已取消', failed: '失败' }
      return labels[this.pipelineStatusData] || this.pipelineStatusData || '未知'
    },
  },
  async mounted() {
    await this.loadPipelines()
    this.pollTimer = setInterval(() => { if (this.currentPipeline) this.updateStatus() }, 3000)
  },
  beforeUnmount() { if (this.pollTimer) clearInterval(this.pollTimer) },
  methods: {
    async loadPipelines() {
      this.loading = true; this.error = null
      try {
        const res = await pipelineList()
        if (res?.success) this.pipelines = res.data || []
        else this.error = res?.error || '加载失败'
      } catch (e) { this.error = e.message }
      finally { this.loading = false }
    },
    async startPipeline(name) {
      const res = await pipelineStart(name, {})
      if (res?.success) { this.currentPipeline = name; this.tab = 'running'; await this.updateStatus() }
      else { this.error = res?.error || '启动失败' }
    },
    async pausePipeline() { const r = await pipelinePause(); if (r?.success) this.pipelineStatusData = 'paused' },
    async resumePipeline() { const r = await pipelineResume(); if (r?.success) this.pipelineStatusData = 'running' },
    async cancelPipeline() {
      const r = await pipelineCancel()
      if (r?.success) { this.pipelineStatusData = null; this.currentPipeline = null; this.currentStages = []; this.currentStageIndex = -1 }
    },
    async updateStatus() {
      if (!this.currentPipeline) return
      const s = await pipelineStatus(this.currentPipeline)
      if (s) {
        this.pipelineStatusData = s.status
        this.currentStages = s.stages || []
        this.currentStageIndex = s.currentStageIndex ?? -1
      }
    },
    async loadHistory() {
      this.historyLoading = true
      try {
        const r = await pipelineHistory()
        if (r?.success) this.history = r.data || []
      } catch (e) {
        console.error(e)
      } finally {
        this.historyLoading = false
      }
    },
    getRunningClass(name) { return this.currentPipeline === name ? 'is-running' : '' },
    stageClass(stage, i) { return i < this.currentStageIndex ? 'done' : i === this.currentStageIndex ? 'active' : '' },
    stageIcon(stage, i) {
      if (i < this.currentStageIndex) return '✅'
      if (i === this.currentStageIndex) return '⏳'
      return '⭕'
    },
    humanName(name) { if (!name) return ''; return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
    formatTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleString('zh-CN') },
  },
}
</script>

<style scoped>
.pipeline-page { padding: 24px; max-width: 960px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.text-muted { color: #666; font-size: 14px; }
.page-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
.tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: #666; border-bottom: 2px solid transparent; }
.tab.active { color: var(--primary, #7c5cbf); border-bottom-color: var(--primary, #7c5cbf); font-weight: 600; }
.loading-state, .empty-state { display: flex; align-items: center; gap: 8px; padding: 40px; color: #666; justify-content: center; }
.error-state { padding: 16px; background: #fef2f2; border-radius: 8px; color: #dc2626; }
.pipeline-list { display: flex; flex-direction: column; gap: 12px; }
.pipeline-card { display: flex; justify-content: space-between; align-items: center; padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff; }
.pipeline-card.is-running { border-color: var(--primary, #7c5cbf); background: #f5f3ff; }
.card-left h3 { margin: 4px 0; font-size: 16px; }
.desc { font-size: 13px; color: #666; margin: 0 0 8px 0; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
.badge.generated { background: #dbeafe; color: #1d4ed8; }
.badge.assembly { background: #fef3c7; color: #b45309; }
.badge.hybrid { background: #d1fae5; color: #047857; }
.stages { display: flex; align-items: center; gap: 4px; }
.stage-dot { width: 8px; height: 8px; border-radius: 50%; background: #e0e0e0; display: inline-block; }
.stage-count { font-size: 11px; color: #999; margin-left: 6px; }
.card-right { display: flex; gap: 8px; }
.running-controls { display: flex; gap: 6px; }
.running-section { padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff; }
.running-section h2 { margin: 0 0 16px 0; font-size: 18px; }
.status-bar { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; font-size: 14px; }
.status-bar.running { background: #dbeafe; color: #1e40af; }
.status-bar.paused { background: #fef3c7; color: #92400e; }
.status-bar.completed { background: #d1fae5; color: #065f46; }
.status-bar.failed { background: #fee2e2; color: #991b1b; }
.controls { display: flex; gap: 8px; }
.stage-list { display: flex; flex-direction: column; gap: 8px; }
.stage-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 6px; font-size: 14px; }
.stage-item.done { color: #666; }
.stage-item.active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.stage-icon { width: 24px; text-align: center; }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border: 1px solid #e0e0e0; border-radius: 6px; font-size: 14px; }
.history-name { flex: 1; }
.history-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.history-status.completed { background: #d1fae5; color: #065f46; }
.history-status.failed { background: #fee2e2; color: #991b1b; }
.history-status.cancelled { background: #f3f4f6; color: #6b7280; }
.history-time { color: #999; font-size: 12px; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: var(--primary, #7c5cbf); border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
