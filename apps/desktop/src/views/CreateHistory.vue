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
          <span class="empty-state-icon">🎬</span>
          <p>暂无渲染记录</p>
          <p class="empty-state-hint">创作你的第一个视频，记录将在这里显示</p>
          <UiButton @click="$router.push('/create')">去创作</UiButton>
        </div>
        <div v-else class="render-list">
          <div v-for="(r, i) in renders" :key="i" class="render-card" tabindex="0" role="button" @keydown.enter="$router.push('/create/result?path=' + encodeURIComponent(r.outputPath || ''))" @click="$router.push('/create/result?path=' + encodeURIComponent(r.outputPath || ''))">
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
          <span class="empty-state-icon">🔄</span>
          <p>暂无流水线运行记录</p>
          <p class="empty-state-hint">选择创作模式开始流水线，运行记录将在这里显示</p>
          <UiButton @click="$router.push('/create')">浏览流水线</UiButton>
        </div>
        <div v-else class="pipeline-list">
          <div v-for="(p, i) in pipelines" :key="i" class="pipeline-card" :class="p.status" tabindex="0" role="button" @keydown.enter="openPipeline(p)" @click="openPipeline(p)">
            <div class="pipeline-info">
              <span class="pipeline-status-dot" :class="p.status"></span>
              <div class="pipeline-meta">
                <span class="pipeline-name">{{ humanName(p.pipelineName || p.name) }}</span>
                <span class="pipeline-time">{{ formatTime(p.completedAt || p.startedAt || p.createdAt) }}</span>
              </div>
            </div>
            <span class="pipeline-status" :class="p.status">{{ statusLabel(p.status) }}</span>
            <div v-if="p.status === 'running'" class="pipeline-progress">
              <div class="progress-bar"><div class="progress-fill" :style="{ width: pipelineProgress(p) + '%' }"></div></div>
              <span class="progress-text">{{ pipelineProgress(p) }}%</span>
            </div>
            <div class="pipeline-card-bottom">
              <div class="pipeline-stages">
                <span v-for="(s, si) in (p.stages || [])" :key="si" class="stage-tag" :class="stageClass(s)" :title="stageTitle(s)">
                  {{ stageLabel(s) }}
                </span>
              </div>
              <div class="pipeline-hints">
                <span v-if="p.status === 'running'" class="pipeline-running-hint">与流水线页面实时同步</span>
                <span v-if="p.status === 'paused' && p.pausedStage" class="pipeline-paused-hint">暂停环节：{{ stageLabel(p.pausedStage) }}</span>
                <span v-if="p.status === 'failed'" class="pipeline-paused-hint" style="background:var(--status-failed-bg);color:var(--status-failed-text);">生成失败</span>
              </div>
            </div>
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
      // stale running 检测：updatedAt 超过 30 分钟仍为 running 的任务视为已暂停（超时/崩溃遗留）
      const STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000
      const now = Date.now()
      for (const p of this.pipelines) {
        if (p && p.status === 'running') {
          const updatedAt = p.updatedAt ? new Date(p.updatedAt).getTime() : 0
          if (updatedAt && (now - updatedAt) > STALE_RUNNING_THRESHOLD_MS) {
            p.status = 'paused'
            if (!p.pausedStage) {
              const stages = Array.isArray(p.stages) ? p.stages : []
              const runningStage = stages.find(s => s && s.status === 'running') || stages[stages.length - 1]
              p.pausedStage = runningStage ? (runningStage.name || runningStage.stage || '') : ''
            }
          }
        }
      }
          } catch (e) {    if (requestId !== this.pipelineRequestId) return
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
      if (p.status === 'running' || p.status === 'failed' || p.status === 'cancelled' || p.status === 'paused') {
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
      const statusText = { completed: '已完成', running: '进行中', failed: '失败', cancelled: '已取消', pending: '等待中', paused: '已暂停' }[s.status] || s.status || ''
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
.history-page { padding: 24px 32px; max-width: 1080px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 6px; color: var(--ink); }
.text-muted { color: var(--text-muted); font-size: 14px; }
.page-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--hairline); }
.tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: var(--text-muted); border-bottom: 2px solid transparent; }
.tab.active { color: var(--primary, #7c5cbf); border-bottom-color: var(--primary, #7c5cbf); font-weight: 600; }
.loading-state, .empty-state { display: flex; align-items: center; gap: 8px; padding: 40px; color: var(--text-muted); justify-content: center; flex-direction: column; }
.history-error { display: flex; align-items: center; gap: 12px; padding: 12px 16px; margin-bottom: 16px; color: var(--status-failed-text); background: var(--status-failed-bg); border-radius: var(--r-sm); }
.running-banner { display: flex; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: 16px; color: var(--status-running-text); background: var(--status-running-bg); border-radius: var(--r-sm); cursor: pointer; font-size: 13px; }
.running-banner:hover { background: var(--history-progress-active-shadow); }
.render-list, .pipeline-list { display: flex; flex-direction: column; gap: 12px; }
.render-card, .pipeline-card { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 16px 20px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); cursor: pointer; transition: all 0.15s; }
.pipeline-card { border-left: 3px solid transparent; }
.pipeline-card.running { border-left-color: var(--stability-beta); }
.pipeline-card.failed { border-left-color: var(--pipe-cinematic); }
.pipeline-card.cancelled { border-left-color: var(--text-light); }
.pipeline-card.paused { border-left-color: var(--stability-experimental); }
.pipeline-card.completed { border-left-color: var(--stability-production); }
.render-card:hover, .pipeline-card:hover { border-color: var(--primary, #7c5cbf); box-shadow: 0 2px 12px rgba(0,0,0,0.08); transform: translateY(-1px); }
.render-info, .pipeline-info { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 200px; }
.render-icon { font-size: 24px; }
.render-meta, .pipeline-meta { display: flex; flex-direction: column; gap: 2px; }
.render-name, .pipeline-name { font-size: 14px; font-weight: 600; }
.render-time, .pipeline-time { font-size: 12px; color: var(--text-light); }
.render-status, .pipeline-status { font-size: 12px; padding: 4px 12px; border-radius: 6px; font-weight: 600; white-space: nowrap; }
.render-status.completed, .pipeline-status.completed { background: var(--status-completed-bg); color: var(--status-completed-text); }
.render-status.failed, .pipeline-status.failed { background: var(--status-failed-bg); color: var(--status-failed-text); }
.render-status.cancelled, .pipeline-status.cancelled { background: var(--status-cancelled-bg); color: var(--status-cancelled-text); }
.render-status.paused, .pipeline-status.paused { background: var(--status-waiting-bg); color: var(--status-waiting-text); }
.render-status.running, .pipeline-status.running { background: var(--status-running-bg); color: var(--status-running-text); }
.render-actions { display: flex; gap: 6px; }
.pipeline-card-bottom { display: flex; align-items: center; gap: 12px; width: 100%; padding-top: 6px; border-top: 1px solid var(--border); margin-top: 2px; }
.pipeline-hints { display: flex; gap: 6px; flex-shrink: 0; }
.pipeline-stages { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 240px; }
.stage-tag { font-size: 12px; padding: 3px 8px; border-radius: var(--r-xs); background: var(--status-pending-bg); color: var(--status-pending-text); font-weight: 500; white-space: nowrap; }
.stage-tag.completed { background: var(--status-completed-bg); color: var(--status-completed-text); }
.stage-tag.failed { background: var(--status-failed-bg); color: var(--status-failed-text); }
.stage-tag.paused { background: var(--status-waiting-bg); color: var(--status-waiting-text); }
.stage-tag.cancelled { background: var(--status-cancelled-bg); color: var(--status-cancelled-text); }
.stage-tag.running { background: var(--status-running-bg); color: var(--status-running-text); }
.pipeline-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pipeline-status-dot.completed { background: var(--stability-production); }
.pipeline-status-dot.failed { background: var(--pipe-cinematic); }
.pipeline-status-dot.cancelled { background: var(--text-light); }
.pipeline-status-dot.paused { background: var(--stability-experimental); }
.pipeline-status-dot.running { background: var(--stability-beta); animation: pulse-dot 1.5s ease-in-out infinite; }
@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
.pipeline-running-hint { font-size: 11px; color: var(--history-running-hint-text); background: var(--history-running-hint-bg); padding: 2px 8px; border-radius: var(--r-xs); white-space: nowrap; }
.pipeline-paused-hint { font-size: 11px; color: var(--banner-warning-color); background: var(--banner-warning-bg); padding: 2px 8px; border-radius: var(--r-xs); white-space: nowrap; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid var(--hairline); border-top-color: var(--primary, #7c5cbf); border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 进度条 */
.progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--primary); border-radius: 3px; transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1); }
.progress-text { font-size: 12px; color: var(--text-muted); margin-left: 8px; }
.pipeline-progress { display: flex; align-items: center; gap: 8px; width: 100%; margin-top: 4px; }

/* 骨架屏加载 */
.skeleton { background: var(--skeleton-bg); border-radius: 4px; position: relative; overflow: hidden; }
.skeleton::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--skeleton-shimmer), transparent); animation: skeleton-shimmer 1.5s infinite; }
@keyframes skeleton-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

/* 空状态增强 */
.empty-state-icon { font-size: 48px; margin-bottom: 8px; opacity: 0.6; }
.empty-state-hint { font-size: 13px; color: var(--text-light); margin: 0 0 12px; }


/* 键盘导航焦点样式 */
.render-card:focus-visible, .pipeline-card:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

</style>
