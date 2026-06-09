<template>
  <div class="dashboard">
    <h2 style="margin-top: 0">发布统计</h2>

    <!-- 概览卡片 -->
    <el-row :gutter="20" style="margin-bottom: 20px">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总发布</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card success-bg">
          <div class="stat-value">{{ stats.success }}</div>
          <div class="stat-label">成功</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card danger-bg">
          <div class="stat-value">{{ stats.failed }}</div>
          <div class="stat-label">失败</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card info-bg">
          <div class="stat-value">{{ stats.successRate }}%</div>
          <div class="stat-label">成功率</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <!-- 平台分布 -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>平台分布</span></template>
          <div v-if="platformList.length === 0" style="color: #999; text-align: center; padding: 20px">暂无发布数据</div>
          <div v-for="p in platformList" :key="p.id" style="margin-bottom: 16px">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px">
              <span>{{ p.label }}</span>
              <span>{{ p.total }} 次</span>
            </div>
            <el-progress
              :percentage="p.rate"
              :color="p.rate > 80 ? '#67c23a' : p.rate > 50 ? '#e6a23c' : '#f56c6c'"
              :stroke-width="16"
            >
              <span style="font-size: 12px">{{ p.success }}/{{ p.total }}</span>
            </el-progress>
          </div>
        </el-card>
      </el-col>

      <!-- 最近30天趋势 -->
      <el-col :span="12">
        <el-card shadow="never">
          <template #header><span>近30天发布趋势</span></template>
          <div v-if="stats.daily.length === 0" style="color: #999; text-align: center; padding: 20px">暂无数据</div>
          <div v-for="d in stats.daily" :key="d.date" style="margin-bottom: 6px; display: flex; align-items: center; gap: 8px">
            <span style="width: 80px; font-size: 12px; color: #666; flex-shrink: 0">{{ d.date.slice(5) }}</span>
            <div style="flex: 1; height: 20px; background: #f0f0f0; border-radius: 4px; overflow: hidden; display: flex">
              <div
                v-if="d.total > 0"
                :style="{ width: (d.success / d.total * 100) + '%', background: '#67c23a', transition: 'width 0.3s' }"
              />
            </div>
            <span style="width: 50px; font-size: 12px; text-align: right">
              {{ d.total }}
            </span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { dashboardStats } from '@/api/publisher'

const stats = ref({ total: 0, success: 0, failed: 0, successRate: 0, perPlatform: {}, daily: [] })

const PLATFORM_LABELS = {
  wechat_mp: '微信公众号',
  zhihu: '知乎',
  weibo: '微博',
  douyin: '抖音',
  xiaohongshu: '小红书'
}

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

<style scoped>
.stat-card {
  text-align: center;
  padding: 4px 0;
}
.stat-value {
  font-size: 36px;
  font-weight: 700;
  color: #303133;
}
.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}
.success-bg { border-left: 4px solid #67c23a; }
.danger-bg { border-left: 4px solid #f56c6c; }
.info-bg { border-left: 4px solid #409eff; }
</style>