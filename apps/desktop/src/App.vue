<template>
  <div>
    <!-- 顶部导航 -->
    <nav class="cohere-topnav">
      <div class="brand">
        <span class="logo-dot"></span>
        社媒管家
      </div>
      <router-link to="/accounts" class="nav-item" :class="{ active: route.path.startsWith('/accounts') }">
        <span class="icon">○</span> 账号管理
      </router-link>
      <router-link to="/publish" class="nav-item" :class="{ active: route.path === '/publish' }">
        <span class="icon">↗</span> 一键发布
      </router-link>
      <router-link to="/collection" class="nav-item" :class="{ active: route.path === '/collection' }">
        <span class="icon">📋</span> 采集
      </router-link>
      <router-link to="/monitor" class="nav-item" :class="{ active: route.path.startsWith('/monitor') }">
        <span class="icon">🖥</span> 监控
      </router-link>
      <router-link to="/dashboard" class="nav-item" :class="{ active: route.path === '/dashboard' }">
        <span class="icon">◇</span> 数据看板
      </router-link>
      <div class="nav-spacer"></div>
      <div class="nav-right">
        <div class="status-indicator">
          <span class="status-dot online"></span>
          服务运行中
        </div>
      </div>
    </nav>

    <!-- 主体 -->
    <div class="cohere-app-body">
      <!-- 左侧平台侧栏 -->
      <aside class="cohere-sidebar">
        <div class="cohere-sidebar-header">
          <span>平台账号</span>
          <button class="sidebar-add-btn" @click="$router.push('/accounts')">+</button>
        </div>
        <div class="cohere-sidebar-search">
          <input type="text" placeholder="搜索平台..." v-model="platformSearch" />
        </div>
        <div class="cohere-sidebar-list">
          <div
            v-for="p in filteredPlatforms"
            :key="p.id"
            class="cohere-platform-item"
            :class="{ active: activePlatform === p.id }"
            @click="activePlatform = p.id"
          >
            <div class="platform-icon">{{ p.icon }}</div>
            <div style="flex:1;min-width:0">
              <div class="platform-name">{{ p.label }}</div>
              <div class="platform-account">{{ p.accountText }}</div>
            </div>
            <span class="platform-status" :class="p.statusClass"></span>
          </div>
        </div>
      </aside>

      <!-- 主内容 -->
      <main class="cohere-main">
        <router-view />
      </main>
    </div>

    <!-- 更新通知弹窗 (保留原始逻辑) -->
    <el-dialog
      v-model="showUpdateDialog"
      title="📦 发现新版本"
      width="400px"
      :close-on-click-modal="false"
    >
      <div v-if="updateStatus === 'available'">
        <p>新版本 <strong>{{ updateInfo?.version }}</strong> 可用</p>
        <el-button type="primary" @click="handleDownload" :loading="downloading">
          {{ downloading ? '下载中...' : '下载更新' }}
        </el-button>
      </div>
      <div v-else-if="updateStatus === 'downloading'" style="text-align: center">
        <p>正在下载更新...</p>
        <el-progress :percentage="downloadPercent" :stroke-width="12" />
        <p style="font-size: 12px; color: #999;">{{ downloadSpeed }}</p>
      </div>
      <div v-else-if="updateStatus === 'downloaded'">
        <p>✅ 更新已下载完成</p>
        <el-button type="primary" @click="handleInstall">
          立即重启安装
        </el-button>
      </div>
    </el-dialog>

    <!-- 前台通知条 -->
    <div
      v-if="updateStatus === 'not-available' && showNotAvailable"
      style="position: fixed; bottom: 16px; right: 16px; z-index: 2000"
    >
      <el-alert title="当前已是最新版本" type="success" show-icon :closable="true" @close="showNotAvailable = false" />
    </div>
    <div
      v-if="updateStatus === 'error' && showError"
      style="position: fixed; bottom: 16px; right: 16px; z-index: 2000"
    >
      <el-alert :title="'更新失败: ' + updateError" type="warning" show-icon :closable="true" @close="showError = false" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { onUpdateStatus, updateCheck, updateDownload, updateInstall } from '@/api/publisher'

const route = useRoute()

// 侧栏平台数据
const platformSearch = ref('')
const activePlatform = ref(null)

const platforms = [
  { id: 'wechat_mp', label: '微信公众号', icon: '💬', accountText: '产品实验室', statusClass: 'online' },
  { id: 'zhihu', label: '知乎', icon: '❓', accountText: '产品观察', statusClass: 'online' },
  { id: 'weibo', label: '微博', icon: '✧', accountText: '科技前线', statusClass: 'online' },
  { id: 'douyin', label: '抖音', icon: '🎵', accountText: '产品实验室', statusClass: 'online' },
  { id: 'xiaohongshu', label: '小红书', icon: '📕', accountText: '产品设计日记', statusClass: 'online' },
  { id: 'tencent_video', label: '视频号', icon: '▶', accountText: '视频实验室', statusClass: 'online' },
  { id: 'kuaishou', label: '快手', icon: '🎬', accountText: '未登录', statusClass: 'offline' },
  { id: 'toutiao', label: '今日头条', icon: '📰', accountText: '未登录', statusClass: 'offline' },
  { id: 'bilibili', label: 'B站', icon: '📺', accountText: '未登录', statusClass: 'offline' },
  { id: 'baijiahao', label: '百家号', icon: '📖', accountText: '未登录', statusClass: 'offline' },
  { id: 'yidian', label: '一点号', icon: '📋', accountText: '未登录', statusClass: 'offline' },
  { id: 'youtube', label: 'YouTube', icon: '▶', accountText: '未登录', statusClass: 'offline' },
  { id: 'tiktok', label: 'TikTok', icon: '♪', accountText: '未登录', statusClass: 'offline' },
  { id: 'twitter', label: 'X (Twitter)', icon: '✕', accountText: '未登录', statusClass: 'offline' },
]

const filteredPlatforms = computed(() => {
  if (!platformSearch.value) return platforms
  const q = platformSearch.value.toLowerCase()
  return platforms.filter(p =>
    p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
  )
})

// 更新状态 (完全保留原始)
const showUpdateDialog = ref(false)
const updateStatus = ref(null)
const updateInfo = ref(null)
const downloading = ref(false)
const downloadPercent = ref(0)
const downloadSpeed = ref('')
const showNotAvailable = ref(false)
const showError = ref(false)
const updateError = ref('')
let cancelUpdateListen = null

function formatSpeed (bytesPerSecond) {
  if (!bytesPerSecond) return ''
  if (bytesPerSecond > 1024 * 1024) return (bytesPerSecond / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bytesPerSecond > 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s'
  return bytesPerSecond + ' B/s'
}

function handleUpdateStatus (payload) {
  if (!payload) return
  updateStatus.value = payload.type
  if (payload.type === 'available') {
    updateInfo.value = payload.data
    showUpdateDialog.value = true
  } else if (payload.type === 'downloading') {
    downloading.value = true
    downloadPercent.value = payload.data.percent || 0
    downloadSpeed.value = formatSpeed(payload.data.bytesPerSecond)
  } else if (payload.type === 'downloaded') {
    downloading.value = false
    downloadPercent.value = 100
    showUpdateDialog.value = true
  } else if (payload.type === 'error') {
    updateError.value = payload.data || '未知错误'
    showError.value = true
    showUpdateDialog.value = false
    downloading.value = false
  } else if (payload.type === 'not-available') {
    if (!showUpdateDialog.value) showNotAvailable.value = true
    setTimeout(() => { showNotAvailable.value = false }, 4000)
  }
}

function handleDownload () {
  downloading.value = true
  updateDownload().catch(e => {
    updateError.value = e.message || '下载失败'
    showError.value = true
    downloading.value = false
  })
}
function handleInstall () {
  updateInstall()
}

onMounted(() => {
  cancelUpdateListen = onUpdateStatus(handleUpdateStatus)
  setTimeout(() => updateCheck(), 3000)
})

onBeforeUnmount(() => {
  if (cancelUpdateListen) cancelUpdateListen()
})
</script>

<style>
body { margin: 0; padding: 0; }
</style>