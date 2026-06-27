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
import { ref, computed, onMounted } from 'vue'
import BenchmarkChart from '@/components/BenchmarkChart.vue'

const syncing = ref(false)
const platformData = ref([])

const platformNameMap = {
  douyin: '抖音', bilibili: 'B站', xiaohongshu: '小红书',
  tencent_video: '视频号', wechat_mp: '公众号',
}
const platformIconMap = {
  douyin: '🎵', bilibili: '📺', xiaohongshu: '📕',
  tencent_video: '▶', wechat_mp: '💬',
}

function platformName (id) { return platformNameMap[id] || id }
function platformIcon (id) { return platformIconMap[id] || '📊' }
function formatTime (iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

const totalArticles = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.articles || 0), 0))
const totalViews = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.views || 0), 0))
const totalComments = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.comments || 0), 0))
const totalFollowers = computed(() => platformData.value.filter(d => !d.error).reduce((s, d) => s + (d.followers || 0), 0))

async function refreshSync () {
  const api = window.electronAPI
  if (!api || !api.syncAll) return
  syncing.value = true
  try {
    await api.syncAll()
    await loadCached()
  } catch (e) {
    console.warn('Sync failed:', e.message)
  } finally {
    syncing.value = false
  }
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

onMounted(() => { loadCached() })
</script>
