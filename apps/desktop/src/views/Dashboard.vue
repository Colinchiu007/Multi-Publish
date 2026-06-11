<template>
  <div>
    <!-- 页面头部 -->
    <div class="cohere-page-header">
      <div>
        <div class="page-title">数据看板</div>
        <div class="page-subtitle">发布统计与趋势分析</div>
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
          <div class="stat-value">{{ stats.successRate }}%</div>
          <div class="stat-label">成功率</div>
        </div>
      </div>

      <!-- 两列：平台分布 + 趋势 -->
      <div style="display:flex;gap:var(--space-xl)">
        <!-- 平台分布 -->
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

        <!-- 近30天趋势 -->
        <div style="flex:1;min-width:0">
          <div class="cohere-card" style="cursor:default">
            <div class="cohere-form-label" style="margin-bottom:var(--space-lg)">近30天发布趋势</div>
            <div v-if="stats.daily.length === 0" style="color:var(--muted);text-align:center;padding:20px">暂无数据</div>
            <div v-for="d in stats.daily" :key="d.date" class="cohere-day-bar">
              <span class="day-label">{{ d.date.slice(5) }}</span>
              <div class="day-track">
                <div
                  class="day-fill"
                  :style="{ width: (d.total > 0 ? d.success / d.total * 100 : 0) + '%' }"
                ></div>
              </div>
              <span class="day-count">{{ d.total }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { dashboardStats } from '@/api/publisher'

const PLATFORM_LABELS = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书',
  tencent_video: '视频号',
  kuaishou: '快手',
}

const stats = ref({ total: 0, success: 0, failed: 0, successRate: 0, perPlatform: {}, daily: [] })

const platformList = computed(() => {
  const pp = stats.value.perPlatform || {}
  return Object.entries(pp).map(([id, data]) => ({
    id,
    label: PLATFORM_LABELS[id] || id,
    total: data.total,
    success: data.success,
    failed: data.failed,
    rate: data.total > 0 ? Math.round(data.success / data.total * 100) : 0
  }))
})

async function loadStats () {
  const res = await dashboardStats()
  if (res && res.code === 0) {
    stats.value = res.data
  }
}

onMounted(loadStats)
</script>