<template>
  <div>
    <div class="cohere-page-header">
      <div>
        <div class="page-title">数据看板</div>
        <div class="page-subtitle">发布统计与趋势分析</div>
      </div>
      <div class="page-actions">
        <button class="cohere-btn-secondary" @click="loadStats">刷新</button>
      </div>
    </div>

    <div class="cohere-content">
      <!-- 统计概览 -->
      <div class="cohere-stat-grid">
        <div class="cohere-stat-card">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总发布</div>
        </div>
        <div class="cohere-stat-card stat-success">
          <div class="stat-value">{{ stats.success }}</div>
          <div class="stat-label">成功</div>
        </div>
        <div class="cohere-stat-card stat-danger">
          <div class="stat-value">{{ stats.failed }}</div>
          <div class="stat-label">失败</div>
        </div>
        <div class="cohere-stat-card stat-info">
          <div class="stat-value">{{ successRate }}%</div>
          <div class="stat-label">成功率</div>
        </div>
        <div class="cohere-stat-card">
          <div class="stat-value">{{ accountsCount }}</div>
          <div class="stat-label">账号数</div>
        </div>
      </div>

      <!-- 两列：平台分布 + 最近的发布 -->
      <div style="display:flex;gap:var(--space-xl)">
        <div style="flex:1;min-width:0">
          <div class="cohere-card" style="cursor:default">
            <div class="cohere-form-label" style="margin-bottom:var(--space-lg)">平台分布</div>
            <div v-if="platformList.length === 0" style="color:var(--muted);text-align:center;padding:20px">暂无发布数据</div>
            <div v-for="p in platformList" :key="p.id" class="cohere-progress-bar">
              <span class="pb-label">{{ p.label }}</span>
              <div class="pb-track">
                <div
                  class="pb-fill"
                  :class="p.rate > 80 ? 'good' : p.rate > 50 ? 'mid' : 'warn'"
                  :style="{ width: p.rate + '%' }"
                ></div>
              </div>
              <span class="pb-value">{{ p.success }}/{{ p.total }}</span>
            </div>
          </div>
        </div>

        <div style="flex:1;min-width:0">
          <div class="cohere-card" style="cursor:default">
            <div class="cohere-form-label" style="margin-bottom:var(--space-lg)">最近的发布</div>
            <div v-if="recentRecords.length === 0" style="color:var(--muted);text-align:center;padding:20px">暂无发布记录</div>
            <div v-for="r in recentRecords" :key="r.id" class="history-row">
              <span class="cohere-tag" :class="r.status === 'success' ? 'cohere-tag-success' : r.status === 'failed' ? 'cohere-tag-danger' : 'cohere-tag-info'">
                {{ r.status === 'success' ? '✓' : r.status === 'failed' ? '✗' : '⏳' }}
              </span>
              <div class="history-info">
                <div class="history-title">{{ r.title || '无标题' }}</div>
                <div class="history-meta">{{ platformLabel(r.platform) }} · {{ r.created_at }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const platformLabels = {
  wechat_mp: '微信公众号', zhihu: '知乎', weibo: '微博',
  douyin: '抖音', xiaohongshu: '小红书', tencent_video: '视频号',
  kuaishou: '快手', toutiao: '今日头条', youtube: 'YouTube', tiktok: 'TikTok',
}

const stats = ref({ total: 0, success: 0, failed: 0, byPlatform: {} })
const recentRecords = ref([])
const accountsCount = ref(0)

const successRate = computed(() => {
  const s = stats.value
  return s.total > 0 ? Math.round(s.success / s.total * 100) : 0
})

const platformList = computed(() => {
  const bp = stats.value.byPlatform || {}
  return Object.entries(bp).map(([id, data]) => ({
    id,
    label: platformLabels[id] || id,
    total: data.total,
    success: data.success,
    failed: data.failed,
    rate: data.total > 0 ? Math.round(data.success / data.total * 100) : 0,
  })).sort((a, b) => b.total - a.total)
})

function platformLabel (id) { return platformLabels[id] || id }

onMounted(loadStats)

async function loadStats () {
  const api = window.electronAPI
  if (!api) return

  // Store 统计数据
  if (api.storeGetPublishStats) {
    const res = await api.storeGetPublishStats()
    if (res.code === 0) stats.value = res.data
  }

  // 最近发布记录
  if (api.storeListPublishHistory) {
    const res = await api.storeListPublishHistory({ limit: 10 })
    if (res.code === 0) recentRecords.value = res.data.records || []
  }

  // 账号数
  if (api.storeListAccounts) {
    const res = await api.storeListAccounts()
    if (res.code === 0) accountsCount.value = (res.data || []).length
  }
}
</script>

<style scoped>
.history-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f3;
}
.history-row:last-child { border-bottom: none; }
.history-info { flex: 1; min-width: 0; }
.history-title {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.history-meta { font-size: 12px; color: var(--muted); margin-top: 2px; }
</style>
