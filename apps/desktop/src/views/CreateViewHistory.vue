<template>
  <div class="create-view-history">
    <!-- 本地模式提示 -->
    <div v-if="historyLocalMode" class="history-local-mode-banner" data-testid="history-local-mode-banner">
      {{ historyLocalModeText }}
    </div>

    <!-- 加载状态 -->
    <div v-if="historyLoading" class="loading-state">
      <span class="spinner"></span>
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="history.length === 0" class="empty-state">
      <div class="empty-icon">📋</div>
      <p>暂无创作记录</p>
      <p class="empty-hint">开始创作后，记录将在此显示</p>
    </div>

    <!-- 有数据 -->
    <template v-else>
      <!-- 工具栏 -->
      <div class="history-toolbar">
        <div class="history-toolbar-left">
          <label for="history-status-filter">状态</label>
          <select id="history-status-filter" :value="historyFilter" @change="$emit('update:historyFilter', $event.target.value)" class="form-select history-filter">
            <option value="all">全部</option>
            <option value="running">进行中</option>
            <option value="paused">已暂停</option>
            <option value="failed">执行失败</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
          </select>
        </div>
        <span class="history-count">{{ filteredHistory.length }} 条记录</span>
      </div>

      <!-- 空筛选结果 -->
      <div v-if="filteredHistory.length === 0" class="empty-state compact">
        <p>没有符合条件的记录</p>
      </div>

      <!-- 历史列表 -->
      <div v-else class="history-list">
        <div
          v-for="(h, i) in filteredHistory"
          :key="h.projectId || h.id || i"
          class="history-item"
          :class="[
            'status-' + (h.status || 'unknown'),
            { 'is-running': h.status === 'running' }
          ]"
          @click="$emit('open-history', h)"
        >
          <!-- 状态色条 -->
          <div class="history-item-bar"></div>

          <!-- 主内容区 -->
          <div class="history-item-body">
            <!-- 第一行：标题 + 状态 -->
            <div class="history-item-row">
              <span class="history-name" :title="h.title || pipelineName(h.pipeline || h.name)">
                {{ h.title || pipelineName(h.pipeline || h.name) }}
              </span>
              <span v-if="h.pipeline || h.name" class="history-pipeline-tag">{{ pipelineName(h.pipeline || h.name) }}</span>
              <span class="history-status" :class="historyStatusClass(h.status)">
                {{ historyStatusIcon(h.status) }} {{ historyStatusLabel(h.status) }}
              </span>
            </div>

            <!-- 第二行：提示信息 -->
            <div v-if="h.status === 'running'" class="history-item-row history-running-hint">
              <span class="hint-icon">🔄</span> 返回流水线创作查看进度
            </div>
            <div v-if="h.status === 'paused' && h.pausedStage" class="history-item-row history-paused-hint">
              <span class="hint-icon">⏸</span> 暂停环节：{{ h.pausedStage }}
            </div>
            <div v-if="h.status === 'failed'" class="history-item-row history-failed-hint">
              <span class="hint-icon">⚠</span>
              <span v-if="h.pausedStage">失败环节：{{ h.pausedStage }}</span>
              <span v-else-if="h.error">{{ truncateError(h.error) }}</span>
              <span v-else>执行过程中出现错误</span>
            </div>


            <div v-if="h.createdAt || h.completedAt || h.duration || h.mode" class="history-meta">
              <span v-if="h.createdAt" class="history-meta-item"><span class="history-meta-icon">🕐</span> {{ formatTime(h.updatedAt || h.completedAt || h.createdAt) }}</span>
              <span v-if="h.duration" class="history-meta-item"><span class="history-meta-icon">⏱</span> {{ formatDuration(h.duration) }}</span>
              <span v-if="h.mode" class="history-meta-item"><span class="history-meta-icon">⚙</span> {{ h.mode }}</span>
              <span v-if="h.projectId" class="history-meta-item"><span class="history-meta-icon">📁</span> {{ h.projectId.slice(0, 8) }}</span>
            </div>
            <!-- 阶段进度（运行中/已暂停） -->
            <div v-if="(h.status === 'running' || h.status === 'paused') && Array.isArray(h.stages) && h.stages.length > 0" class="history-progress">
              <span
                v-for="(s, si) in h.stages"
                :key="si"
                class="history-progress-seg"
                :class="historyStageState(s)"
                :title="historyStageTitle(s)"
              >
                {{ historyStageLabel(s) }}
              </span>
            </div>

            <!-- 底部：时间 + 操作 -->
            <div class="history-item-footer">
              <span class="history-time">{{ formatTime(h.updatedAt || h.completedAt || h.createdAt) }}</span>
              <div class="history-actions">
                <button
                  v-if="(h.status === 'failed' || h.status === 'paused') && historyItemResumable(h)"
                  class="history-btn resume"
                  :disabled="story2videoResuming"
                  @click.stop="$emit('resume-history', h)"
                >
                  {{ story2videoResuming ? '恢复中...' : '从断点继续' }}
                </button>
                <button
                  v-else-if="h.status === 'running'"
                  class="history-btn resume"
                  :disabled="story2videoResuming"
                  @click.stop="$emit('resume-history', h)"
                >
                  {{ story2videoResuming ? '恢复中...' : '继续生成' }}
                </button>
                <button
                  v-if="h.projectId && h.recoverable !== false"
                  class="history-btn open"
                  @click.stop="$emit('open-history', h)"
                >
                  打开
                </button>
                <button
                  v-if="h.projectId"
                  class="history-btn delete"
                  @click.stop="$emit('delete-history', h)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import '@/styles/create-view-history.css'
import { getPipelineName } from '@/i18n/pipeline-labels'

export default {
  name: 'CreateViewHistory',
  props: {
    history: { type: Array, default: () => [] },
    historyLoading: { type: Boolean, default: false },
    historyLocalMode: { type: Boolean, default: false },
    historyLocalModeText: { type: String, default: '' },
    historyFilter: { type: String, default: 'all' },
    story2videoResuming: { type: Boolean, default: false },
  },
  emits: ['update:historyFilter', 'open-history', 'resume-history', 'delete-history'],
  computed: {
    filteredHistory() {
      if (this.historyFilter === 'all') return this.history
      if (this.historyFilter === 'paused') return this.history.filter(item => item.status === 'paused' || item.status === 'failed')
      return this.history.filter(item => item.status === this.historyFilter)
    },
  },
  methods: {
    pipelineName(id) {
      return getPipelineName((key) => this.$t?.(key), id)
    },
    historyStatusLabel(status) {
      const labels = {
        completed: '已完成',
        failed: '执行失败',
        cancelled: '已取消',
        running: '进行中',
        paused: '已暂停',
        pending: '等待中',
      }
      return labels[status] || status || '未知'
    },
    historyStatusClass(status) {
      if (status === 'failed') return 'failed'
      return status || 'unknown'
    },
    historyStatusIcon(status) {
      const icons = { completed: '✓', failed: '✕', cancelled: '—', running: '⟳', paused: '⏸', pending: '○' }
      return icons[status] || ''
    },
    formatTime(iso) {
      if (!iso) return ''
      return new Date(iso).toLocaleString('zh-CN')
    },
    historyItemResumable(item) {
      if (!item || (item.status !== 'failed' && item.status !== 'paused') || !(item.id || item.runId)) return false
      if (/needs_user_input|content[_-\s]?policy|可能需要修改文案/i.test(String(item.error || ''))) return false
      return true
    },
    historyStageState(stage) {
      if (!stage || typeof stage !== 'object') return ''
      const status = stage.status || ''
      if (status === 'completed') return 'done'
      if (status === 'running') return 'active'
      if (status === 'failed' || status === 'needs_user_input' || status === 'cancelled') return 'failed'
      return 'pending'
    },
    historyStageLabel(stage) {
      if (!stage) return ''
      return typeof stage === 'object' ? (stage.name || stage.stage || '') : String(stage)
    },
    historyStageTitle(stage) {
      const name = this.historyStageLabel(stage)
      const status = stage && typeof stage === 'object' ? (stage.status || '') : ''
      return name + (status ? ' · ' + status : '')
    },
    formatDuration(ms) {
      if (!ms && ms !== 0) return ''
      const mins = Math.floor(ms / 60000)
      const secs = Math.floor((ms % 60000) / 1000)
      if (mins > 0) return mins + ' 分钟 ' + secs + ' 秒'
      return secs + ' 秒'
    },
    truncateError(error) {
      if (!error) return ''
      const msg = String(error)
      return msg.length > 60 ? msg.slice(0, 57) + '...' : msg
    },
  },
}
</script>



