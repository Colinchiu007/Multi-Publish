<template>
  <div class="replay-page">
    <!-- 顶部信息栏 -->
    <div class="replay-header">
      <div class="replay-header-left">
        <router-link :to="'/board/' + projectId" class="back-link">← 返回看板</router-link>
        <h1 class="replay-title">
          {{ projectName ? projectName + ' · 生产回放' : '生产回放' }}
        </h1>
        <span v-if="totalDuration > 0" class="replay-duration">
          总时长 {{ formatDuration(totalDuration) }}
        </span>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="replay-loading">
      <span class="spinner"></span> 加载回放数据...
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="replay-error">
      <p>{{ error }}</p>
      <UiButton size="sm" @click="loadReplay">重试</UiButton>
    </div>

    <!-- 空状态 -->
    <div v-else-if="events.length === 0" class="replay-empty">
      <p>该生产无录制数据</p>
      <p class="text-muted">运行流水线后可查看生产回放</p>
    </div>

    <!-- 回放主体 -->
    <div v-else class="replay-body">
      <!-- 时间轴控制栏 -->
      <div class="timeline-controls">
        <UiButton size="sm" variant="ghost" @click="togglePlay">
          {{ playing ? '⏸ 暂停' : '▶ 播放' }}
        </UiButton>
        <div class="speed-control">
          <label>速度</label>
          <select v-model="speed" class="speed-select">
            <option :value="1">1x</option>
            <option :value="2">2x</option>
            <option :value="4">4x</option>
          </select>
        </div>
        <span class="timeline-position">
          {{ currentIndex + 1 }} / {{ events.length }}
        </span>
      </div>

      <!-- 时间轴滑块 -->
      <div class="timeline-slider-wrapper">
        <input
          type="range"
          :min="0"
          :max="Math.max(0, events.length - 1)"
          v-model.number="currentIndex"
          class="timeline-slider"
          @input="onSliderInput"
        />
        <!-- 事件标记 -->
        <div class="timeline-markers">
          <div
            v-for="(evt, i) in events"
            :key="evt.id"
            class="timeline-marker"
            :class="markerClass(evt.type)"
            :style="{ left: markerPosition(i) }"
            :title="evt.type + (evt.stageName ? ' · ' + evt.stageName : '')"
          ></div>
        </div>
      </div>

      <!-- 当前事件信息 -->
      <div class="current-event" v-if="currentEvent">
        <div class="event-meta">
          <span class="event-type" :class="markerClass(currentEvent.type)">
            {{ eventLabel(currentEvent.type) }}
          </span>
          <span v-if="currentEvent.stageName" class="event-stage">
            {{ currentEvent.stageName }}
          </span>
          <span class="event-time">{{ formatTime(currentEvent.timestamp) }}</span>
        </div>
      </div>

      <!-- 快照面板 -->
      <div class="snapshot-panel" v-if="currentSnapshot">
        <h3 class="snapshot-title">看板快照</h3>

        <!-- 阶段指示器 -->
        <div v-if="currentSnapshot.stages && currentSnapshot.stages.length > 0" class="snapshot-stages">
          <BoardStageIndicator
            :stages="currentSnapshot.stages"
            :current-index="currentSnapshot.currentStageIndex || 0"
          />
        </div>

        <!-- 项目状态 + 成本 -->
        <div class="snapshot-info">
          <span class="info-item">
            <span class="info-label">状态</span>
            <span class="info-value">{{ statusLabel(currentSnapshot.status) }}</span>
          </span>
          <span v-if="currentSnapshot.totalActualCost != null" class="info-item">
            <span class="info-label">实际成本</span>
            <span class="info-value">${{ currentSnapshot.totalActualCost }}</span>
          </span>
          <span v-if="currentSnapshot.totalEstimatedCost != null" class="info-item">
            <span class="info-label">预估成本</span>
            <span class="info-value">${{ currentSnapshot.totalEstimatedCost }}</span>
          </span>
          <span v-if="currentSnapshot.elapsed != null" class="info-item">
            <span class="info-label">已耗时</span>
            <span class="info-value">{{ currentSnapshot.elapsed }}</span>
          </span>
          <span v-if="currentSnapshot.currentOperation" class="info-item">
            <span class="info-label">当前操作</span>
            <span class="info-value">{{ currentSnapshot.currentOperation }}</span>
          </span>
        </div>

        <!-- 场景列表 -->
        <div v-if="currentSnapshot.scenes && currentSnapshot.scenes.length > 0" class="snapshot-scenes">
          <h4 class="scenes-subtitle">场景 ({{ currentSnapshot.scenes.length }})</h4>
          <div class="scene-grid">
            <SceneCard
              v-for="scene in currentSnapshot.scenes"
              :key="scene.id"
              :scene="scene"
              @select="() => {}"
            />
          </div>
        </div>
      </div>

      <!-- 事件列表（可折叠） -->
      <div class="event-list-section">
        <h3 class="event-list-title" @click="showEventList = !showEventList">
          事件列表 ({{ events.length }})
          <span class="toggle-icon">{{ showEventList ? '▼' : '▶' }}</span>
        </h3>
        <div v-if="showEventList" class="event-list">
          <div
            v-for="(evt, i) in events"
            :key="evt.id"
            class="event-row"
            :class="{ active: i === currentIndex }"
            @click="jumpTo(i)"
          >
            <span class="event-row-time">{{ formatTime(evt.timestamp) }}</span>
            <span class="event-row-type" :class="markerClass(evt.type)">
              {{ eventLabel(evt.type) }}
            </span>
            <span v-if="evt.stageName" class="event-row-stage">{{ evt.stageName }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute } from 'vue-router'
import UiButton from '@/components/UiButton.vue'
import BoardStageIndicator from '@/components/BoardStageIndicator.vue'
import SceneCard from '@/components/SceneCard.vue'

const route = useRoute()
const projectId = computed(() => route.params.projectId || '')

// 状态
const loading = ref(true)
const error = ref(null)
const events = ref([])
const projectName = ref('')
const totalDuration = ref(0)

// 播放状态
const currentIndex = ref(0)
const playing = ref(false)
const speed = ref(1)
const showEventList = ref(false)
let playTimer = null

// 计算属性
const currentEvent = computed(() => events.value[currentIndex.value] || null)

const currentSnapshot = computed(() => {
  const evt = currentEvent.value
  if (!evt) return null
  return evt.snapshot || null
})

// 生命周期
onMounted(() => {
  loadReplay()
})

onBeforeUnmount(() => {
  stopPlay()
})

// 监听播放状态
watch(playing, (val) => {
  if (val) {
    startPlay()
  } else {
    stopPlay()
  }
})

// 方法
async function loadReplay() {
  loading.value = true
  error.value = null
  try {
    const api = window.electronAPI
    if (!api || !api.replay || !api.replay.get) {
      error.value = 'IPC API 不可用'
      loading.value = false
      return
    }
    const result = await api.replay.get(projectId.value)
    if (result && result.code === 0 && result.data) {
      events.value = result.data.events || []
      projectName.value = result.data.project ? result.data.project.name || '' : ''
      totalDuration.value = result.data.totalDuration || 0
      currentIndex.value = 0
    } else if (result && result.code !== 0) {
      error.value = result.message || '加载回放失败'
    } else {
      events.value = []
    }
  } catch (e) {
    error.value = e.message || '加载回放数据失败'
  } finally {
    loading.value = false
  }
}

function togglePlay() {
  if (events.value.length === 0) return
  if (currentIndex.value >= events.value.length - 1) {
    currentIndex.value = 0
  }
  playing.value = !playing.value
}

function startPlay() {
  stopPlay()
  const interval = Math.max(100, 1000 / speed.value)
  playTimer = setInterval(() => {
    if (currentIndex.value < events.value.length - 1) {
      currentIndex.value++
    } else {
      playing.value = false
    }
  }, interval)
}

function stopPlay() {
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
}

function onSliderInput() {
  // 拖动滑块时暂停播放
  playing.value = false
}

function jumpTo(index) {
  currentIndex.value = index
  playing.value = false
}

// 速度变化时重启播放
watch(speed, () => {
  if (playing.value) {
    startPlay()
  }
})

// 格式化函数
function formatDuration(seconds) {
  if (seconds < 60) return seconds + 's'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m + 'm ' + s + 's'
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('zh-CN', { hour12: false })
  } catch (_) {
    return ts
  }
}

function eventLabel(type) {
  const labels = {
    'pipeline:start': '流水线开始',
    'pipeline:complete': '流水线完成',
    'pipeline:fail': '流水线失败',
    'stage:start': '阶段开始',
    'stage:complete': '阶段完成',
    'stage:fail': '阶段失败',
    'checkpoint:pause': '审批暂停',
    'scene:complete': '场景完成',
    'scene:fail': '场景失败',
    'scene:retry': '场景重试',
    'contact_sheet:all_approved': '全部批准',
    'approval:resolved': '审批已处理',
  }
  return labels[type] || type
}

function markerClass(type) {
  if (type === 'pipeline:start') return 'marker-start'
  if (type === 'pipeline:complete') return 'marker-complete'
  if (type === 'pipeline:fail') return 'marker-fail'
  if (type === 'stage:start') return 'marker-stage-start'
  if (type === 'stage:complete') return 'marker-stage-complete'
  if (type === 'stage:fail') return 'marker-fail'
  if (type === 'checkpoint:pause') return 'marker-pause'
  if (type === 'scene:fail') return 'marker-fail'
  if (type === 'scene:complete') return 'marker-scene'
  if (type === 'scene:retry') return 'marker-retry'
  if (type === 'contact_sheet:all_approved') return 'marker-approved'
  if (type === 'approval:resolved') return 'marker-resolved'
  return 'marker-default'
}

function markerPosition(index) {
  if (events.value.length <= 1) return '0%'
  return ((index / (events.value.length - 1)) * 100) + '%'
}

function statusLabel(status) {
  const labels = {
    draft: '草稿', running: '运行中', paused: '已暂停',
    completed: '已完成', failed: '已失败', cancelled: '已取消',
  }
  return labels[status] || status || ''
}
</script>

<style scoped>
.replay-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.replay-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.replay-header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-link {
  color: var(--text-secondary, #666);
  text-decoration: none;
  font-size: 14px;
}

.back-link:hover {
  color: var(--primary, #3b82f6);
}

.replay-title {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.replay-duration {
  color: var(--text-secondary, #666);
  font-size: 14px;
}

.replay-loading,
.replay-error,
.replay-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary, #666);
}

.replay-error p {
  color: var(--danger, #ef4444);
  margin-bottom: 12px;
}

.text-muted {
  color: var(--text-tertiary, #999);
  font-size: 13px;
  margin-top: 8px;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid #ddd;
  border-top-color: var(--primary, #3b82f6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.replay-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.timeline-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
}

.speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.speed-control label {
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.speed-select {
  padding: 4px 8px;
  border: 1px solid var(--border, #ddd);
  border-radius: 4px;
  background: white;
}

.timeline-position {
  margin-left: auto;
  font-size: 14px;
  color: var(--text-secondary, #666);
}

.timeline-slider-wrapper {
  position: relative;
  padding: 20px 0;
}

.timeline-slider {
  width: 100%;
  height: 6px;
  cursor: pointer;
}

.timeline-markers {
  position: relative;
  height: 12px;
  margin-top: 4px;
}

.timeline-marker {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transform: translateX(-50%);
  top: 2px;
}

.marker-start { background: #3b82f6; }
.marker-complete { background: #22c55e; }
.marker-fail { background: #ef4444; }
.marker-stage-start { background: #60a5fa; }
.marker-stage-complete { background: #4ade80; }
.marker-pause { background: #f59e0b; }
.marker-scene { background: #a78bfa; }
.marker-retry { background: #fb923c; }
.marker-approved { background: #22c55e; }
.marker-resolved { background: #8b5cf6; }
.marker-default { background: #9ca3af; }

.current-event {
  padding: 12px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
}

.event-meta {
  display: flex;
  align-items: center;
  gap: 12px;
}

.event-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  font-weight: 500;
  color: white;
  background: #9ca3af;
}

.event-type.marker-start { background: #3b82f6; }
.event-type.marker-complete { background: #22c55e; }
.event-type.marker-fail { background: #ef4444; }
.event-type.marker-stage-start { background: #60a5fa; }
.event-type.marker-stage-complete { background: #4ade80; }
.event-type.marker-pause { background: #f59e0b; }

.event-stage {
  font-size: 14px;
  color: var(--text-primary, #333);
}

.event-time {
  font-size: 13px;
  color: var(--text-tertiary, #999);
  margin-left: auto;
}

.snapshot-panel {
  padding: 20px;
  background: white;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 8px;
}

.snapshot-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
}

.snapshot-stages {
  margin-bottom: 16px;
}

.snapshot-info {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border, #e5e7eb);
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 12px;
  color: var(--text-tertiary, #999);
}

.info-value {
  font-size: 14px;
  font-weight: 500;
}

.scenes-subtitle {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 12px 0;
}

.scene-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.event-list-section {
  border-top: 1px solid var(--border, #e5e7eb);
  padding-top: 16px;
}

.event-list-title {
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  margin: 0 0 8px 0;
}

.toggle-icon {
  font-size: 12px;
  margin-left: 4px;
}

.event-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
}

.event-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--border, #f0f0f0);
}

.event-row:hover {
  background: var(--bg-secondary, #f9fafb);
}

.event-row.active {
  background: var(--bg-active, #eff6ff);
}

.event-row-time {
  font-size: 12px;
  color: var(--text-tertiary, #999);
  min-width: 80px;
}

.event-row-type {
  font-size: 13px;
  font-weight: 500;
  min-width: 100px;
}

.event-row-stage {
  font-size: 13px;
  color: var(--text-secondary, #666);
}
</style>
