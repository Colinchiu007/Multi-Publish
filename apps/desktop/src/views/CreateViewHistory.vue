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

            <!-- 第三行：阶段进度（运行中/已暂停） -->
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
    truncateError(error) {
      if (!error) return ''
      const msg = String(error)
      return msg.length > 60 ? msg.slice(0, 57) + '...' : msg
    },
  },
}
</script>

<style scoped>
.create-view-history { width: 100%; animation: fadeIn 0.2s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

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
  padding: 10px 16px;
  background: var(--surface, #fff);
  border: 1px solid var(--hairline, rgba(0,0,0,0.06));
  border-radius: 10px;
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
  gap: 10px;
}

/* 卡片 */
.history-item {
  display: flex;
  border: 1px solid var(--hairline, rgba(0,0,0,0.08));
  border-radius: 10px;
  overflow: hidden;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  background: var(--surface);
}
.history-item:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  border-color: var(--primary, #409eff);
  transform: translateY(-1px);
}
.history-item:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}
.history-item.status-running { box-shadow: 0 1px 4px rgba(59,130,246,0.08); }
.history-item.status-paused { box-shadow: 0 1px 4px rgba(217,119,6,0.08); }

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
  font-weight: 600;
  color: var(--text, #333);
  letter-spacing: -0.01em;
}

/* 状态徽章 */
.history-status {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 6px;
  flex-shrink: 0;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  font-size: 10px;
}
.history-status.completed { background: var(--status-completed-bg); color: var(--status-completed-text); }
.history-status.failed { background: var(--status-failed-bg); color: var(--status-failed-text); border: 1px solid rgba(239,68,68,0.15); }
.history-status.cancelled { background: var(--status-cancelled-bg); color: var(--status-cancelled-text); }
.history-status.running { background: var(--status-running-bg); color: var(--status-running-text); animation: status-pulse 2s ease-in-out infinite; }
.history-status.paused { background: var(--status-waiting-bg); color: var(--status-waiting-text); }
@keyframes status-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }

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
  padding: 4px 10px;
  border-radius: 6px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  background: var(--status-pending-bg);
  color: var(--status-pending-text);
  font-weight: 500;
  transition: all 0.2s ease;
}
.history-progress-seg.done { background: var(--status-completed-bg); color: var(--status-completed-text); }
.history-progress-seg.active {
  background: var(--history-progress-active-bg, #2563eb);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 0 0 2px var(--history-progress-active-shadow, #bfdbfe);
  position: relative;
  overflow: hidden;
}
.history-progress-seg.active::after {
  content: '';
  position: absolute;
  top: 0; left: 0; bottom: 0; right: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: seg-shimmer 2s infinite;
}
@keyframes seg-shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.history-progress-seg.failed { background: var(--status-failed-bg); color: var(--status-failed-text); }

/* 底部 */
.history-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid var(--hairline, rgba(0,0,0,0.04));
}
.history-time {
  color: var(--text-light, #999);
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.history-time::before {
  content: '🕐';
  font-size: 11px;
}

/* 操作按钮 */
.history-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.history-btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  padding: 5px 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.history-btn:hover { border-color: var(--primary, #409eff); color: var(--primary, #409eff); }
.history-btn.resume { border-color: var(--primary, #409eff); color: var(--primary, #409eff); font-weight: 600; gap: 4px; }
.history-btn.resume:hover { background: var(--primary, #409eff); color: #fff; box-shadow: 0 2px 8px rgba(64,158,255,0.2); }
.history-btn.open { gap: 4px; }
.history-btn.delete { gap: 4px; }
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

/* 流水线标签 */
.history-pipeline-tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--status-pending-bg, #f3f4f6);
  color: var(--text-muted, #6b7280);
  flex-shrink: 0;
  white-space: nowrap;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

/* 响应式 */
@media (max-width: 720px) {
  .history-item-row { flex-wrap: wrap; }
  .history-name { flex-basis: 100%; }
  .history-actions { width: 100%; justify-content: flex-end; }
}

/* === UI 增强 === */

/* 暂停任务阶段进度：使用更柔和的视觉效果 */
.history-item.status-paused .history-progress-seg.active {
  background: var(--status-waiting-text, #92400e);
  box-shadow: 0 0 0 2px rgba(217,119,6,0.2);
}
.history-item.status-paused .history-progress-seg.active::after {
  animation: seg-paused-pulse 3s ease-in-out infinite;
}
@keyframes seg-paused-pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 0.6; }
}

/* 暂停任务卡片：更柔和的边框和阴影 */
.history-item.status-paused {
  border-color: var(--status-waiting-text, #d97706);
  border-left-width: 3px;
}
.history-item.status-paused:hover {
  border-color: var(--status-waiting-text, #d97706);
  box-shadow: 0 2px 12px rgba(217,119,6,0.12);
}

/* 已完成任务卡片：绿色左边框 */
.history-item.status-completed {
  border-left-width: 3px;
  border-left-color: var(--status-completed-text, #065f46);
}

/* 失败任务卡片：红色左边框（兼容未转换的 failed） */
.history-item.status-failed {
  border-left-width: 3px;
  border-left-color: var(--status-failed-text, #991b1b);
}

/* 运行中任务：蓝色左边框 + 脉冲 */
.history-item.status-running {
  border-left-width: 3px;
  border-left-color: var(--status-running-text, #1d4ed8);
}

/* 状态徽章增强 */
.history-status {
  font-weight: 600;
  letter-spacing: 0.03em;
}
.history-status.paused {
  background: rgba(217,119,6,0.1);
  color: var(--status-waiting-text, #92400e);
  border: 1px solid rgba(217,119,6,0.2);
}
.history-status.completed {
  background: rgba(6,95,70,0.08);
  color: var(--status-completed-text, #065f46);
  border: 1px solid rgba(6,95,70,0.15);
}
.history-status.running {
  background: rgba(29,78,216,0.08);
  color: var(--status-running-text, #1d4ed8);
  border: 1px solid rgba(29,78,216,0.15);
}

/* 暂停提示增强 */
.history-paused-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(217,119,6,0.06);
  font-size: 12px;
  color: var(--banner-warning-color, #b45309);
}

/* 运行中提示增强 */
.history-running-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: rgba(29,78,216,0.06);
  font-size: 12px;
  color: var(--history-running-hint-text, #1d4ed8);
}

/* 卡片整体改进 */
.history-item {
  border-radius: 10px;
  transition: all 0.15s ease;
}
.history-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.history-item-body {
  padding: 12px 16px;
}
.history-item-footer {
  padding-top: 4px;
  border-top: 1px solid var(--hairline, rgba(0,0,0,0.04));
}

/* 操作按钮改进 */
.history-btn {
  border-radius: 6px;
  font-weight: 500;
}
.history-btn.resume {
  background: rgba(29,78,216,0.04);
}

/* 空状态改进 */
.empty-state {
  padding: 48px 20px;
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 4px;
}

/* 工具栏改进 */
.history-toolbar {
  padding: 8px 0;
  border-bottom: 1px solid var(--hairline, rgba(0,0,0,0.04));
  margin-bottom: 16px;
}
</style>
