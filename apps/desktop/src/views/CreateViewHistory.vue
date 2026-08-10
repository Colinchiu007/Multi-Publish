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
            <option value="completed">已完成</option>
            <option value="failed">生成失败</option>
            <option value="cancelled">已取消</option>
            <option value="running">进行中</option>
            <option value="paused">已暂停</option>
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
              <span class="history-status" :class="h.status">
                {{ historyStatusLabel(h.status) }}
              </span>
            </div>

            <!-- 第二行：提示信息 -->
            <div v-if="h.status === 'running'" class="history-item-row history-running-hint">
              <span class="hint-icon">🔄</span> 返回流水线创作查看进度
            </div>
            <div v-if="h.status === 'paused' && h.pausedStage" class="history-item-row history-paused-hint">
              <span class="hint-icon">⏸</span> 暂停环节：{{ h.pausedStage }}
            </div>
            <div v-if="h.status === 'failed' && h.error" class="history-item-row history-failed-hint">
              <span class="hint-icon">⚠</span> {{ truncateError(h.error) }}
            </div>

            <!-- 第三行：阶段进度（运行中） -->
            <div v-if="h.status === 'running' && Array.isArray(h.stages) && h.stages.length > 0" class="history-progress">
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
      return this.history.filter(item => item.status === this.historyFilter)
    },
  },
  methods: {
    pipelineName(id) {
      return getPipelineName((key) => this.$t?.(key), id)
    },
    historyStatusLabel(status) {
      return {
        completed: '已完成',
        failed: '生成失败',
        cancelled: '已取消',
        running: '进行中',
        paused: '已暂停',
        pending: '等待中',
      }[status] || status || '未知'
    },
    formatTime(iso) {
      if (!iso) return ''
      return new Date(iso).toLocaleString('zh-CN')
    },
    historyItemResumable(item) {
      if (!item || item.status !== 'failed' || !(item.id || item.runId)) return false
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
    truncateError(error) {
      if (!error) return ''
      const msg = String(error)
      return msg.length > 60 ? msg.slice(0, 57) + '...' : msg
    },
  },
}
</script>

<style scoped>
.create-view-history { width: 100%; }

/* 本地模式提示 */
.history-local-mode-banner {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--warning-bg);
  color: var(--banner-warning-color);
  font-size: 13px;
}

/* 工具栏 */
.history-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}
.history-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.history-toolbar label {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 600;
}
.history-filter { width: min(220px, 100%); }
.history-count {
  color: var(--text-light, #999);
  font-size: 12px;
}

/* 列表 */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 卡片 */
.history-item {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.15s ease;
  cursor: pointer;
  background: var(--surface);
}
.history-item:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  border-color: var(--primary, #409eff);
}

/* 状态色条 */
.history-item-bar {
  width: 4px;
  flex-shrink: 0;
  background: var(--border);
}
.history-item.status-completed .history-item-bar { background: var(--status-completed-text, #065f46); }
.history-item.status-failed .history-item-bar { background: var(--status-failed-text, #991b1b); }
.history-item.status-cancelled .history-item-bar { background: var(--status-cancelled-text, #6b7280); }
.history-item.status-running .history-item-bar { background: var(--status-running-text, #1d4ed8); }
.history-item.status-paused .history-item-bar { background: var(--status-waiting-text, #92400e); }

/* 运行中脉冲动画 */
.history-item.is-running {
  border-color: var(--history-running-border, #93c5fd);
  animation: history-pulse 2s ease-in-out infinite;
}
@keyframes history-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
  50% { box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
}

/* 主体内容 */
.history-item-body {
  flex: 1;
  min-width: 0;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* 行 */
.history-item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

/* 标题 */
.history-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 500;
  color: var(--text, #333);
}

/* 状态徽章 */
.history-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  flex-shrink: 0;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.history-status.completed { background: var(--status-completed-bg); color: var(--status-completed-text); }
.history-status.failed { background: var(--status-failed-bg); color: var(--status-failed-text); }
.history-status.cancelled { background: var(--status-cancelled-bg); color: var(--status-cancelled-text); }
.history-status.running { background: var(--status-running-bg); color: var(--status-running-text); }
.history-status.paused { background: var(--status-waiting-bg); color: var(--status-waiting-text); }

/* 提示信息 */
.hint-icon { font-size: 12px; }
.history-running-hint {
  font-size: 12px;
  color: var(--history-running-hint-text, #1d4ed8);
}
.history-paused-hint {
  font-size: 12px;
  color: var(--banner-warning-color, #b45309);
}
.history-failed-hint {
  font-size: 12px;
  color: var(--status-failed-text, #991b1b);
  opacity: 0.85;
}

/* 阶段进度 */
.history-progress {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  align-items: stretch;
}
.history-progress-seg {
  flex: 1 1 0;
  min-width: 72px;
  max-width: 150px;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 4px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--status-pending-bg);
  color: var(--status-pending-text);
}
.history-progress-seg.done { background: var(--status-completed-bg); color: var(--status-completed-text); }
.history-progress-seg.active {
  background: var(--history-progress-active-bg, #2563eb);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 0 0 2px var(--history-progress-active-shadow, #bfdbfe);
}
.history-progress-seg.failed { background: var(--status-failed-bg); color: var(--status-failed-text); }

/* 底部 */
.history-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.history-time {
  color: var(--text-light, #999);
  font-size: 12px;
}

/* 操作按钮 */
.history-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.history-btn {
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  padding: 4px 10px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.history-btn:hover { border-color: var(--primary, #409eff); color: var(--primary, #409eff); }
.history-btn.resume { border-color: var(--primary, #409eff); color: var(--primary, #409eff); font-weight: 500; }
.history-btn.resume:hover { background: var(--primary, #409eff); color: #fff; }
.history-btn.delete:hover { border-color: var(--error, #f56c6c); color: var(--error, #f56c6c); }
.history-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* 通用 */
.loading-state, .empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px;
  color: var(--text-muted);
}
.empty-icon { font-size: 32px; opacity: 0.5; }
.empty-hint { font-size: 12px; opacity: 0.6; }
.empty-state.compact { padding: 28px 0; }
.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid var(--hairline, #ccc);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* 响应式 */
@media (max-width: 720px) {
  .history-item-row { flex-wrap: wrap; }
  .history-name { flex-basis: 100%; }
  .history-actions { width: 100%; justify-content: flex-end; }
}
</style>
