<template>
  <div>
    <div class="cohere-page-header">
      <div>
        <div class="page-title">数据看板</div>
        <div class="page-subtitle">各平台发布数据与趋势分析</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="refreshSync" :disabled="syncing">
          {{ syncing ? '同步中...' : '⟳ 刷新数据' }}
        </button>
      </div>
    </div>

    <!-- 试用横幅 -->
    <TrialBanner :dismissed="dismissBanner" @upgrade="showUpgradeModal = true" @dismiss="dismissBanner = true" />

    <div class="cohere-content">
      <!-- 汇总卡片 -->
      <div class="cohere-stat-grid">
        <div class="cohere-stat-card">
          <div class="stat-value">{{ totalArticles }}</div>
          <div class="stat-label">总发布</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value">{{ totalViews > 10000 ? (totalViews / 10000).toFixed(1) + '万' : totalViews }}</div>
          <div class="stat-label">总阅读</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value">{{ totalComments }}</div>
          <div class="stat-label">评论</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value">{{ totalFollowers > 10000 ? (totalFollowers / 10000).toFixed(1) + '万' : totalFollowers }}</div>
          <div class="stat-label">粉丝</div>
        </div>
      </div>

      <!-- 发布统计 -->
      <div v-if="statsData" class="cohere-stat-grid" style="margin-bottom:var(--space-md)">
        <div class="cohere-stat-card">
          <div class="stat-value">{{ statsData.total }}</div>
          <div class="stat-label">累计发布</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value" style="color:var(--success)">{{ statsData.success }}</div>
          <div class="stat-label">成功</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value" style="color:var(--coral)">{{ statsData.failed }}</div>
          <div class="stat-label">失败</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value">{{ statsData.successRate || 0 }}%</div>
          <div class="stat-label">成功率</div>
        </div>
      </div>

      <!-- 发布趋势（最近 14 天） -->
      <div v-if="statsData && statsData.daily && statsData.daily.length > 0" class="cohere-card" style="cursor:default;margin-bottom:var(--space-md);padding:16px">
        <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-md)">📈 发布趋势（近 14 天）</div>
        <div style="display:flex;align-items:flex-end;gap:4px;height:80px;padding:0 4px">
          <div v-for="(d, i) in last14Days" :key="d.date" :title="d.date + ': ' + d.total + ' 篇'" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
            <div :style="{width:'100%', height: Math.max(4, (d.total / dailyMax) * 60) + 'px', background: d.total > 0 ? 'var(--coral, #f56c6c)' : 'var(--border, #e0e0e0)', borderRadius: '3px 3px 0 0', opacity: d.total > 0 ? 0.7 + (d.total / dailyMax) * 0.3 : 0.3, transition: 'height 0.3s'}"></div>
            <span style="font-size:9px;color:var(--muted);white-space:nowrap">{{ d.date.slice(5) }}</span>
          </div>
        </div>
      </div>

      <!-- 平台分布 -->
      <div v-if="statsData && platformStats.length > 0" class="cohere-card" style="cursor:default;margin-bottom:var(--space-md);padding:16px">
        <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-md)">📊 平台分布</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <div v-for="p in platformStats" :key="p.platform" style="display:flex;align-items:center;gap:8px">
            <span style="width:60px;font-size:12px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap">{{ platformName(p.platform) }}</span>
            <div style="flex:1;height:16px;background:var(--border);border-radius:8px;overflow:hidden">
              <div :style="{width: (p.total / maxPlatformTotal) * 100 + '%', height: '100%', background: 'var(--coral, #f56c6c)', borderRadius: '8px', opacity: 0.8, transition: 'width 0.3s'}"></div>
            </div>
            <span style="width:50px;text-align:right;font-size:12px;color:var(--muted)">{{ p.total }} 篇</span>
          </div>
        </div>
      </div>

      <!-- 最近发布 -->
      <div v-if="recentPublishes.length > 0" class="cohere-card" style="cursor:default;margin-bottom:var(--space-md);padding:16px">
        <div style="font-weight:600;font-size:14px;margin-bottom:var(--space-md)">⚡ 最近发布</div>
        <ul class="cohere-timeline">
          <li v-for="r in recentPublishes" :key="r.id" class="cohere-timeline-item" :class="r.success !== false ? 'success' : 'danger'">
            <span class="tl-time">{{ formatTime(r.timestamp) }}</span>
            <span class="tl-text">
              <span :style="{color: r.success !== false ? 'var(--success)' : 'var(--coral)'}">{{ r.success !== false ? '✅' : '❌' }}</span>
              {{ platformName(r.platform) }}: {{ r.title || r.article?.title || '(无标题)' }}
            </span>
          </li>
        </ul>
      </div>

      <!-- 各平台数据 -->
      <div class="cohere-section-title">各平台数据</div>
      <div v-if="platformData.length === 0" class="cohere-empty">
        <div class="empty-icon">📊</div>
        <h3>暂无数据</h3>
        <p>点击「刷新数据」同步各平台信息</p>
      </div>
      <div v-else class="cohere-card-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">
        <div v-for="item in platformData" :key="item.platform" class="cohere-card">
          <div class="card-top">
            <div class="card-icon">{{ platformIcon(item.platform) }}</div>
            <div class="card-info">
              <div class="card-platform">{{ platformName(item.platform) }}</div>
              <div v-if="!item.error" class="card-meta">
                更新于 {{ formatTime(item.syncedAt) }}
              </div>
              <div v-else style="font-size:12px;color:var(--coral)">数据获取失败</div>
            </div>
          </div>
          <div v-if="!item.error" class="card-stats">
            <div class="stat-item"><span class="stat-num">{{ item.views ?? '-' }}</span><span class="stat-lbl">阅读</span></div>
            <div class="stat-item"><span class="stat-num">{{ item.comments ?? '-' }}</span><span class="stat-lbl">评论</span></div>
            <div class="stat-item"><span class="stat-num">{{ item.likes ?? '-' }}</span><span class="stat-lbl">点赞</span></div>
            <div class="stat-item"><span class="stat-num">{{ item.followers ?? '-' }}</span><span class="stat-lbl">粉丝</span></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 内容基准比较 -->
    <div class="cohere-section-title" style="margin-top: var(--space-xl);">📊 内容基准比较</div>
    <div style="display:flex;gap:var(--space-sm);margin-bottom:var(--space-md);align-items:center">
      <input class="cohere-input" v-model="benchmarkTitle" placeholder="输入文章标题进行基准比较..." style="flex:1;font-size:14px" @keyup.enter="doBenchmark" />
      <button class="cohere-btn-primary" @click="doBenchmark" :disabled="!benchmarkTitle.trim()">分析</button>
    </div>
    <BenchmarkChart v-if="benchmarkActiveTitle" :title="benchmarkActiveTitle" :key="benchmarkActiveTitle" />
  </div>
</template>

<script setup>
import UiButton from "../components/UiButton.vue";
import UiInput from "../components/UiInput.vue";
import { ref, computed, onMounted } from 'vue'
import { syncAll, syncPlatform } from '@/api/publisher'
import { usePlatformStore } from '@/stores/platforms'
import BenchmarkChart from '@/components/BenchmarkChart.vue'
import TrialBanner from '@/components/TrialBanner.vue'
import UpgradeModal from '@/components/UpgradeModal.vue'

const syncing = ref(false)
const dismissBanner = ref(false)
const showUpgradeModal = ref(false)
const platformData = ref([])
const statsData = ref(null)
const recentPublishes = ref([])
const platformStore = usePlatformStore()
platformStore.load()

function platformName (id) { return platformStore.getLabel(id) || id }
function platformIcon (id) { return platformStore.getIcon(id) || '📊' }
function formatTime (iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const totalArticles = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.articles || 0), 0))
const totalViews = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.views || 0), 0))
const totalComments = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.comments || 0), 0))
const totalFollowers = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.followers || 0), 0))

const last14Days = computed(() => {
  if (!statsData.value || !statsData.value.daily) return []
  return statsData.value.daily.slice(-14)
})

const dailyMax = computed(() => {
  const days = last14Days.value
  if (days.length === 0) return 1
  return Math.max(1, ...days.map(d => d.total))
})

const platformStats = computed(() => {
  if (!statsData.value || !statsData.value.perPlatform) return []
  return Object.entries(statsData.value.perPlatform)
    .map(([platform, data]) => ({ platform, ...data }))
    .sort((a, b) => b.total - a.total)
})

const maxPlatformTotal = computed(() => {
  if (platformStats.value.length === 0) return 1
  return Math.max(1, ...platformStats.value.map(p => p.total))
})

async function refreshSync () {
  if (!syncAll) return
  syncing.value = true
  try {
    await syncAll()
    await loadCached()
  } catch (e) {
    console.warn('Sync failed:', e.message)
  } finally {
    syncing.value = false
  }
}

async function loadStats () {
  const api = window.electronAPI
  if (!api || !api.dashboardStats) return
  try {
    const res = await api.dashboardStats()
    if (res.code === 0) statsData.value = res.data
  } catch (e) { /* ignore */ }
}

async function loadRecent () {
  const api = window.electronAPI
  if (!api || !api.historyList) return
  try {
    const res = await api.historyList({ limit: 5 })
    if (res.code === 0) recentPublishes.value = (res.data && res.data.records) || []
  } catch (e) { /* ignore */ }
}

async function loadCached () {
  const api = window.electronAPI
  if (!api || !api.syncCached) return
  try {
    const res = await api.syncCached()
    if (res.code === 0) platformData.value = res.data || []
  } catch (e) {
    console.warn('Load cached failed:', e.message)
  }
}

const benchmarkTitle = ref('')
const benchmarkActiveTitle = ref('')

function doBenchmark () {
  if (!benchmarkTitle.value.trim()) return
  benchmarkActiveTitle.value = benchmarkTitle.value.trim()
}

onMounted(() => { loadCached(); loadStats(); loadRecent() })
</script>
