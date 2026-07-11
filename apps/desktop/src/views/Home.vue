<template>
  <div>
    <div class="cohere-page-header">
      <div>
        <div class="page-title">社媒管家</div>
        <div class="page-subtitle">多平台内容一键发布 · v{{ version }}</div>
      </div>
    </div>

    <div class="cohere-content">
      <!-- 快捷导航 -->
      <div class="cohere-stat-grid" style="grid-template-columns: repeat(5, 1fr);">
        <div class="cohere-stat-card" style="cursor:pointer" @click="go('/publish')">
          <div class="stat-value">🚀</div>
          <div class="stat-label">一键发布</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="go('/collection')">
          <div class="stat-value">📋</div>
          <div class="stat-label">内容采集</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="go('/monitor')">
          <div class="stat-value">🖥️</div>
          <div class="stat-label">分屏监控</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="go('/accounts')">
          <div class="stat-value">🔐</div>
          <div class="stat-label">账号管理</div>
        </div>
        <div class="cohere-stat-card" style="cursor:pointer" @click="go('/dashboard')">
          <div class="stat-value">📊</div>
          <div class="stat-label">数据看板</div>
        </div>
      </div>

      <!-- 平台支持 -->
      <div style="margin-top:var(--space-xl)">
        <div class="cohere-section-title">支持平台</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:var(--space-sm)">
          <span v-for="p in platforms" :key="p.id" class="cohere-tag" style="font-size:13px;padding:6px 14px">
            {{ p.icon }} {{ p.label }}
          </span>
        </div>
      </div>

      <!-- 快速统计 -->
      <div v-if="loaded" class="cohere-card" style="margin-top:var(--space-xl);cursor:default">
        <div style="display:flex;gap:var(--space-lg);justify-content:space-around;text-align:center;padding:var(--space-md) 0">
          <div>
            <div style="font-size:24px;font-weight:700">{{ stats.total }}</div>
            <div style="font-size:13px;color:var(--muted)">总发布</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--green)">{{ stats.success }}</div>
            <div style="font-size:13px;color:var(--muted)">成功</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--coral)">{{ stats.failed }}</div>
            <div style="font-size:13px;color:var(--muted)">失败</div>
          </div>
          <div>
            <div style="font-size:24px;font-weight:700;color:var(--action-blue)">{{ accounts }}</div>
            <div style="font-size:13px;color:var(--muted)">账号</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const version = ref('1.0.0')
const loaded = ref(false)
const stats = ref({ total: 0, success: 0, failed: 0 })
const accounts = ref(0)

const platforms = [
  { id: 'wechat_mp', label: '微信公众号', icon: '💬' },
  { id: 'zhihu', label: '知乎', icon: '❓' },
  { id: 'weibo', label: '微博', icon: '✧' },
  { id: 'douyin', label: '抖音', icon: '🎵' },
  { id: 'xiaohongshu', label: '小红书', icon: '📕' },
  { id: 'tencent_video', label: '视频号', icon: '▶' },
  { id: 'kuaishou', label: '快手', icon: '🎬' },
  { id: 'toutiao', label: '今日头条', icon: '📰' },
  { id: 'youtube', label: 'YouTube', icon: '▶️' },
  { id: 'tiktok', label: 'TikTok', icon: '🎶' },
]

onMounted(async () => {
  try {
    const api = window.electronAPI
    if (api) {
      if (api.getVersion) version.value = await api.getVersion()
      if (api.storeGetPublishStats) {
        const res = await api.storeGetPublishStats()
        if (res.code === 0) stats.value = res.data
      }
      if (api.storeListAccounts) {
        const res = await api.storeListAccounts()
        if (res.code === 0) accounts.value = (res.data || []).length
      }
    }
  } catch (e) {
    console.error(e)
  } finally {
    loaded.value = true
  }
})

function go (path) {
  router.push(path)
}
</script>
