<template>
  <div class="history-page">
    <div class="page-header">
      <h1>创作历史</h1>
      <p class="text-muted">查看已渲染的视频和管线运行记录</p>
    </div>

    <div class="page-tabs">
      <button :class="['tab', { active: tab === 'renders' }]" @click="tab = 'renders'">渲染记录</button>
      <button :class="['tab', { active: tab === 'pipelines' }]" @click="tab = 'pipelines'; loadPipelines()">管线记录</button>
    </div>

    <!-- 渲染记录 -->
    <div v-if="tab === 'renders'">
      <div v-if="renderLoading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else-if="renders.length === 0" class="empty-state">
        <p>暂无渲染记录</p>
        <UiButton @click=".push('/create')">去创作</UiButton>
      </div>
      <div v-else class="render-list">
        <div v-for="(r, i) in renders" :key="i" class="render-card" @click=".push('/create/result?path=' + encodeURIComponent(r.outputPath || ''))">
          <div class="render-info">
            <span class="render-icon">🎬</span>
            <div class="render-meta">
              <span class="render-name">{{ r.composition || r.name || '视频 ' + (i + 1) }}</span>
              <span class="render-time">{{ formatTime(r.completedAt || r.createdAt) }}</span>
            </div>
          </div>
          <div class="render-status" :class="r.status || 'completed'">{{ statusLabel(r.status) }}</div>
          <div class="render-actions">
            <UiButton size="sm" @click.stop=".push('/publish')">发布</UiButton>
            <UiButton size="sm" variant="ghost" @click.stop=".push('/create/result?path=' + encodeURIComponent(r.outputPath || ''))">预览</UiButton>
          </div>
        </div>
      </div>
    </div>

    <!-- 管线记录 -->
    <div v-if="tab === 'pipelines'">
      <div v-if="pipelineLoading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else-if="pipelines.length === 0" class="empty-state">
        <p>暂无管线运行记录</p>
        <UiButton @click=".push('/create/pipeline')">浏览管线</UiButton>
      </div>
      <div v-else class="pipeline-list">
        <div v-for="(p, i) in pipelines" :key="i" class="pipeline-card">
          <div class="pipeline-info">
            <span class="pipeline-status-dot" :class="p.status"></span>
            <div class="pipeline-meta">
              <span class="pipeline-name">{{ humanName(p.pipelineName || p.name) }}</span>
              <span class="pipeline-time">{{ formatTime(p.completedAt || p.startedAt) }}</span>
            </div>
          </div>
          <div class="pipeline-stages">
            <span v-for="(s, si) in (p.stages || [])" :key="si" class="stage-tag" :class="stageClass(s)">
              {{ shortName(s.name || s) }}
            </span>
          </div>
          <span class="pipeline-status" :class="p.status">{{ statusLabel(p.status) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { pipelineHistory } from '@/api/publisher'
export default {
  name: 'CreateHistory',
  data() {
    return {
      tab: 'renders',
      renders: [],
      renderLoading: true,
      pipelines: [],
      pipelineLoading: false,
    }
  },
  async mounted() {
    await this.loadRenders()
  },
  methods: {
    async loadRenders() {
      this.renderLoading = true
      try {
        // Try to load from store/publish history
        const { storeListPublishHistory } = await import('@/api/publisher')
        const res = await storeListPublishHistory({ limit: 50, type: 'render' })
        this.renders = res?.data?.records || []
      } catch (e) { /* silent fallback */ }
      this.renderLoading = false
    },
    async loadPipelines() {
      this.pipelineLoading = true
      const r = await pipelineHistory()
      if (r?.success) this.pipelines = r.data || []
      this.pipelineLoading = false
    },
    statusLabel(s) {
      const labels = { completed: '已完成', running: '运行中', failed: '失败', cancelled: '已取消', paused: '已暂停' }
      return labels[s] || s || '已完成'
    },
    stageClass(s) {
      if (typeof s === 'object') return s.status || ''
      return ''
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
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: var(--primary, #7c5cbf); border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
