<template>
  <div class="history-page">
    <div class="page-header">
      <h1>创作历史</h1>
      <p class="text-muted">查看已渲染的视频和流水线运行记录</p>
    </div>

    <div class="page-tabs">
      <button :class="['tab', { active: tab === 'renders' }]" @click="tab = 'renders'">渲染记录</button>
      <button :class="['tab', { active: tab === 'pipelines' }]" @click="tab = 'pipelines'; loadPipelines()">流水线记录</button>
    </div>

    <!-- 渲染记录 -->
    <div v-if="tab === 'renders'">
      <div
        v-if="runningPipelineCount > 0 || failedOrCancelledPipelineCount > 0"
        class="running-banner"
        role="button"
        tabindex="0"
        @click="showRunningPipelines"
        @keydown.enter="showRunningPipelines"
      >
        <span>
          有 {{ runningPipelineCount + failedOrCancelledPipelineCount }} 条流水线记录（
          {{ runningPipelineCount > 0 ? runningPipelineCount + ' 条运行中、' : '' }}{{ failedOrCancelledPipelineCount }} 条失败或已取消
          ），点击查看「流水线记录」
        </span>
      </div>
      <div v-if="renderLoading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else>
        <div v-if="renderError" class="history-error"><p>{{ renderError }}</p><UiButton size="sm" @click="loadRenders">重试</UiButton></div>
        <div v-if="renders.length === 0" class="empty-state">
          <p>暂无渲染记录</p>
          <UiButton @click="$router.push('/create')">去创作</UiButton>
        </div>
        <div v-else class="render-list">
          <div v-for="(r, i) in renders" :key="i" class="render-card" @click="$router.push('/create/result?path=' + encodeURIComponent(r.outputPath || ''))">
            <div class="render-info">
              <span class="render-icon">🎬</span>
              <div class="render-meta">
                <span class="render-name">{{ r.composition || r.name || '视频 ' + (i + 1) }}</span>
                <span class="render-time">{{ formatTime(r.completedAt || r.createdAt) }}</span>
              </div>
            </div>
            <div class="render-status" :class="r.status || 'completed'">{{ statusLabel(r.status) }}</div>
            <div class="render-actions">
              <UiButton size="sm" @click.stop="$router.push('/publish')">发布</UiButton>
              <UiButton size="sm" variant="ghost" @click.stop="$router.push('/create/result?path=' + encodeURIComponent(r.outputPath || ''))">预览</UiButton>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 流水线记录 -->
    <div v-if="tab === 'pipelines'">
      <div v-if="pipelineLoading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else>
        <div v-if="pipelineError" class="history-error pipeline-history-error"><p>{{ pipelineError }}</p><UiButton size="sm" @click="loadPipelines">重试</UiButton></div>
        <div v-if="pipelines.length === 0" class="empty-state">
          <p>暂无流水线运行记录</p>
          <UiButton @click="$router.push('/create')">浏览流水线</UiButton>
        </div>
        <div v-else class="pipeline-list">
          <div v-for="(p, i) in pipelines" :key="i" class="pipeline-card" @click="openPipeline(p)">
            <div class="pipeline-info">
              <span class="pipeline-status-dot" :class="p.status"></span>
              <div class="pipeline-meta">
                <span class="pipeline-name">{{ humanName(p.pipelineName || p.name) }}</span>
                <span class="pipeline-time">{{ formatTime(p.completedAt || p.startedAt || p.createdAt) }}</span>
              </div>
            </div>
            <div v-if="p.status === 'running'" class="pipeline-progress">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: pipelineProgress(p) + '%' }"></div></div>
              <span class="progress-text">{{ pipelineProgress(p) }}%</span>
            </div>
            <div class="pipeline-stages">
              <span v-for="(s, si) in (p.stages || [])" :key="si" class="stage-tag" :class="stageClass(s)" :title="stageTitle(s)">
                {{ stageLabel(s) }}
              </span>
            </div>
            <span class="pipeline-status" :class="p.status">{{ statusLabel(p.status) }}</span>
            <span v-if="p.status === 'running'" class="pipeline-running-hint">与流水线页面实时同步</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { pipelineHistory } from '@/api/publisher'
import UiButton from '../components/UiButton.vue'

const HISTORY_LOAD_TIMEOUT_MS = 5000

function settleHistoryRequest (request) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(Object.assign(new Error('历史记录加载超时'), { code: 'HISTORY_LOAD_TIMEOUT' })), HISTORY_LOAD_TIMEOUT_MS)
  })
  return Promise.race([Promise.resolve().then(request), timeout]).finally(() => clearTimeout(timeoutId))
}
export default {
  
  components: { UiButton },
  data() {
    return {
      tab: 'renders',
      renders: [],
      renderLoading: true,
      renderError: '',
      renderRequestId: 0,
      pipelines: [],
      pipelineLoading: false,
      pipelineError: '',
      pipelineRequestId: 0,
      pipelinePollTimer: null,
    }
  },
  async mounted() {
    await this.loadRenders()
    // 同时加载流水线记录：存在运行中/失败/已取消流水线时默认展示流水线记录，
    // 避免用户进入历史页后以为失败/取消任务「消失」（默认 tab 是渲染记录，只含成功渲染项目）。
    await this.loadPipelines()
    if ((this.runningPipelineCount > 0 || this.failedOrCancelledPipelineCount > 0) && this.tab === 'renders') {
      this.tab = 'pipelines'
    }
  },
  computed: {
    runningPipelineCount() {
      return (this.pipelines || []).filter((p) => p && p.status === 'running').length
    },
    failedOrCancelledPipelineCount() {
      return (this.pipelines || []).filter((p) => p && (p.status === 'failed' || p.status === 'cancelled')).length
    },
  },
  methods: {
    showRunningPipelines() {
      this.tab = 'pipelines'
      this.loadPipelines()
    },
    async loadRenders() {
      const requestId = ++this.renderRequestId
      this.renderLoading = true
      this.renderError = ''
      try {
        const res = await settleHistoryRequest(async () => {
          const { storeListPublishHistory } = await import('@/api/publisher')
          return storeListPublishHistory({ limit: 50, type: 'render' })
        })
        if (requestId !== this.renderRequestId) return
        if (res?.code === 0) this.renders = res?.data?.records || []
        else this.renderError = res?.message || '渲染记录加载失败，请重试'
      } catch (e) {
        if (requestId !== this.renderRequestId) return
        this.renderError = e?.code === 'HISTORY_LOAD_TIMEOUT' ? '渲染记录加载超时，请重试' : '渲染记录加载失败，请重试'
      } finally {
        if (requestId === this.renderRequestId) this.renderLoading = false
      }
    },
    async loadPipelines() {
      const requestId = ++this.pipelineRequestId
      this.pipelineLoading = true
      this.pipelineError = ''
      try {
        const r = await settleHistoryRequest(() => pipelineHistory())
        if (requestId !== this.pipelineRequestId) return
        if (r?.code === 0 && Array.isArray(r.data)) this.pipelines = r.data
        else this.pipelineError = r?.message || '流水线记录加载失败，请重试'
      } catch (e) {
        if (requestId !== this.pipelineRequestId) return
        this.pipelineError = e?.code === 'HISTORY_LOAD_TIMEOUT' ? '流水线记录加载超时，请重试' : '流水线记录加载失败，请重试'
      } finally {
        if (requestId === this.pipelineRequestId) {
          this.pipelineLoading = false
          this.schedulePipelineRefresh()
        }
      }
    },
    schedulePipelineRefresh() {
      if (this.pipelinePollTimer) { clearInterval(this.pipelinePollTimer); this.pipelinePollTimer = null }
      const hasRunning = (this.pipelines || []).some((p) => p && p.status === 'running')
      if (!hasRunning) return
      // 存在后台运行中的流水线：每 5s 轮询刷新进度状态（同流水线页面一致）
      this.pipelinePollTimer = setInterval(() => { this.loadPipelines() }, 5000)
    },
    openPipeline(p) {
      if (!p) return
      if (p.status === 'running' || p.status === 'failed' || p.status === 'cancelled') {
        // 运行中/失败/已取消：跳回创作页，CreateView 恢复查看该流水线进度/支持断点继续
        this.$router.push('/create')
        return
      }
      if (p.status === 'completed') {
        const context = p.context || {}
        const composeRaw = context.compose?.data || context.compose
        const exportRaw = context.export?.data || context.export
        const reportRaw = context.report?.data || context.report
        const videoPath = (composeRaw && (composeRaw.videoPath || composeRaw.path)) ||
          (exportRaw && (exportRaw.videoPath || exportRaw.path)) ||
          (reportRaw && (reportRaw.videoPath || reportRaw.path))
        this.$router.push('/create/result?path=' + encodeURIComponent(videoPath || ''))
      }
    },
    statusLabel(s) {
      const labels = { completed: '已完成', running: '运行中', failed: '生成失败', cancelled: '已取消', paused: '已暂停' }
      return labels[s] || s || '已完成'
    },
    stageClass(s) {
      if (s && typeof s === 'object') return s.status || ''
      return ''
    },
    stageLabel(s) {
      const name = this.shortName(typeof s === 'string' ? s : (s?.name || s?.stage || ''))
      if (!s || typeof s !== 'object') return name
      const marks = { completed: '✓', running: '⟳', failed: '✕', cancelled: '—', pending: '' }
      return (marks[s.status] ? marks[s.status] + ' ' : '') + name
    },
    stageTitle(s) {
      if (!s || typeof s !== 'object') return ''
      const statusText = { completed: '已完成', running: '进行中', failed: '失败', cancelled: '已取消', pending: '等待中' }[s.status] || s.status || ''
      const progress = typeof s.progress === 'number' ? '（' + s.progress + '%）' : ''
      return statusText + progress
    },
    pipelineProgress(p) {
      if (!p) return 0
      if (typeof p.progress === 'number' && Number.isFinite(p.progress)) return Math.max(0, Math.min(100, Math.round(p.progress)))
      const stages = Array.isArray(p.stages) ? p.stages : []
      if (stages.length === 0) return 0
      const done = stages.filter((s) => s && typeof s === 'object' && (s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled')).length
      return Math.round((done / stages.length) * 100)
    },
    shortName(name) {
      if (!name) return ''
      return name.length > 10 ? name.substring(0, 10) + '...' : name
    },
    humanName(name) {
      if (!name) return ''
      return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    },
    formatTime(iso) {
      if (!iso) return ''
      try { return new Date(iso).toLocaleString('zh-CN') } catch (e) { return iso }
    },
  },
  beforeUnmount() {
    if (this.pipelinePollTimer) { clearInterval(this.pipelinePollTimer); this.pipelinePollTimer = null }
  },
}
</script>

<style scoped>
.history-page { padding: 24px; max-width: 960px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.text-muted { color: #666; font-size: 14px; }
.page-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid #e0e0e0; }
.tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: #666; border-bottom: 2px solid transparent; }
.tab.active { color: var(--primary, #7c5cbf); border-bottom-color: var(--primary, #7c5cbf); font-weight: 600; }
.loading-state, .empty-state { display: flex; align-items: center; gap: 8px; padding: 40px; color: #666; justify-content: center; flex-direction: column; }
.history-error { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 16px; color: #991b1b; background: #fee2e2; border-radius: 8px; }
.running-banner { display: flex; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: 16px; color: #1d4ed8; background: #dbeafe; border-radius: 8px; cursor: pointer; font-size: 13px; }
.running-banner:hover { background: #bfdbfe; }
.render-list, .pipeline-list { display: flex; flex-direction: column; gap: 8px; }
.render-card, .pipeline-card { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fff; cursor: pointer; transition: all 0.15s; }
.render-card:hover, .pipeline-card:hover { border-color: var(--primary, #7c5cbf); box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
.render-info, .pipeline-info { display: flex; align-items: center; gap: 12px; flex: 1; }
.render-icon { font-size: 24px; }
.render-meta, .pipeline-meta { display: flex; flex-direction: column; gap: 2px; }
.render-name, .pipeline-name { font-size: 14px; font-weight: 600; }
.render-time, .pipeline-time { font-size: 12px; color: #999; }
.render-status, .pipeline-status { font-size: 12px; padding: 3px 10px; border-radius: 4px; font-weight: 500; }
.render-status.completed, .pipeline-status.completed { background: #d1fae5; color: #065f46; }
.render-status.failed, .pipeline-status.failed { background: #fee2e2; color: #991b1b; }
.render-status.cancelled, .pipeline-status.cancelled { background: #f3f4f6; color: #6b7280; }
.render-actions { display: flex; gap: 6px; }
.pipeline-stages { display: flex; gap: 4px; flex-wrap: wrap; max-width: 300px; }
.stage-tag { font-size: 11px; padding: 2px 6px; border-radius: 3px; background: #f3f4f6; color: #6b7280; }
.stage-tag.completed { background: #d1fae5; color: #065f46; }
.stage-tag.running { background: #dbeafe; color: #1d4ed8; }
.pipeline-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pipeline-status-dot.completed { background: #22c55e; }
.pipeline-status-dot.failed { background: #ef4444; }
.pipeline-status-dot.cancelled { background: #9ca3af; }
.pipeline-running-hint { font-size: 11px; color: #1d4ed8; background: #dbeafe; padding: 2px 8px; border-radius: 4px; white-space: nowrap; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: var(--primary, #7c5cbf); border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
