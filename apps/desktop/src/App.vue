<template>
  <div>
    <!-- 顶部导航 -->
    <nav class="cohere-topnav">
      <div class="brand">
        <span class="logo-dot"></span>
        社媒管家
      </div>
      <router-link to="/accounts" class="nav-item" :class="{ active: route.path.startsWith('/accounts') }">
        账号管理
      </router-link>
      <router-link to="/publish" class="nav-item" :class="{ active: route.path === '/publish' }">
        一键发布
      </router-link>
      <router-link to="/collection" class="nav-item" :class="{ active: route.path === '/collection' }">
        采集
      </router-link>
      <router-link to="/monitor" class="nav-item" :class="{ active: route.path.startsWith('/monitor') }">
        监控
      </router-link>
      <router-link to="/comments" class="nav-item" :class="{ active: route.path === '/comments' }">
        评论
      </router-link>
      <router-link to="/dashboard" class="nav-item" :class="{ active: route.path === '/dashboard' }">
        数据看板
      </router-link>
      <router-link to="/create" class="nav-item" :class="{ active: route.path === '/create' }">
        视频创作
      </router-link>
      <div class="nav-spacer"></div>
      <div class="nav-right">
        <button v-if="authViewVisible" @click="closeLogin" class="btn-ghost-close">✕ 关闭登录</button>
        <button v-if="!licenseStore.isPro" @click="showUpgradeModal = true" class="pro-btn">⭐ 升级 Pro</button>
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
            :key="p"
            class="cohere-platform-item"
            :class="{ active: activePlatform === p }"
            @click="activePlatform = p"
          >
            <div class="platform-icon"><PlatformIcon :platform="p" size="sm" /></div>
            <div style="flex:1;min-width:0">
              <div class="platform-name">{{ platformMeta[p].label }}</div>
              <div class="platform-account">
                <template v-if="getAccountsForPlatform(p).length > 1">
                  <select
                    class="account-switcher"
                    :value="(getDefaultAccount(p) || {}).id || ''"
                    @click.stop
                    @change.stop="switchAccount(p, $event.target.value)"
                  >
                    <option v-for="a in getAccountsForPlatform(p)" :key="a.id" :value="a.id">
                      {{ a.name || a.id?.slice(0,8) }}
                    </option>
                  </select>
                </template>
                <template v-else>
                  {{ getAccountText(p) }}
                </template>
              </div>
            </div>
            <span class="platform-status" :class="getStatusClass(p)"></span>
          </div>
        </div>
      </aside>

      <!-- 主内容 -->
      <main class="cohere-main">
        <router-view />
      </main>
    </div>

    <!-- 更新通知弹窗 (保留原始逻辑) -->
        <UiModal
      :visible="showUpdateDialog"
      title="📦 发现新版本"
      size="sm"
      @close="showUpdateDialog = false"
    >
      <div v-if="updateStatus === 'available'">
        <p>新版本 <strong>{{ updateInfo?.version }}</strong> 可用</p>
        <div style="display:flex;gap:8px;margin-top:16px">
          <UiButton @click="handleDownload" :disabled="downloading">
            {{ downloading ? '下载中...' : '下载更新' }}
          </UiButton>
        </div>
      </div>
      <div v-else-if="updateStatus === 'downloading'" style="text-align:center">
        <p>正在下载更新...</p>
        <div class="update-progress-bar">
          <div class="update-progress-fill" :style="{ width: downloadPercent + '%' }"></div>
        </div>
        <p class="update-speed">{{ downloadSpeed }}</p>
      </div>
      <div v-else-if="updateStatus === 'downloaded'">
        <p>✅ 更新已下载完成</p>
        <div style="display:flex;gap:8px;margin-top:16px">
          <UiButton @click="handleInstall">立即重启安装</UiButton>
        </div>
      </div>
    </UiModal>

    <!-- 前台通知条 -->
    <div
      v-if="updateStatus === 'not-available' && showNotAvailable"
      style="position: fixed; bottom: 16px; right: 16px; z-index: 2000"
    >
      <div class="ui-toast ui-toast-success">✅ 当前已是最新版本</div>
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
import UiButton from "./components/UiButton.vue";
import PlatformIcon from "./components/PlatformIcon.vue";
import UiModal from "./components/UiModal.vue";
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { onUpdateStatus, updateCheck, updateDownload, updateInstall } from '@/api/publisher'
import { useLicenseStore } from '@/stores/license'
import UpgradeModal from '@/components/UpgradeModal.vue'
import TrialBanner from '@/components/TrialBanner.vue'

const route = useRoute()
const authViewVisible = ref(false)
const showUpgradeModal = ref(false)
const dismissBanner = ref(false)
const licenseStore = useLicenseStore()

function closeLogin () {
  const api = window.electronAPI
  if (api && api.authClose) api.authClose()
  authViewVisible.value = false
}

// 监听登录视图状态
onMounted(() => {
  licenseStore.load()
  const api = window.electronAPI
  if (api && api.onAuthViewOpened) {
    api.onAuthViewOpened(() => { authViewVisible.value = true })
  }
  if (api && api.onAuthViewClosed) {
    api.onAuthViewClosed(() => { authViewVisible.value = false })
  }
  if (api && api.onAuthCompleted) {
    api.onAuthCompleted(() => { authViewVisible.value = false })
  }
})
const router = useRouter()

// 侧栏平台数据
const platformSearch = ref('')
const activePlatform = ref(null)

// 从 Store 加载多账号
const platformAccounts = ref({})  // { platformId: [account, ...] }
const loaded = ref(false)

const platformMeta = {
  wechat_mp: { label: '微信公众号', icon: '💬' },
  zhihu: { label: '知乎', icon: '❓' },
  weibo: { label: '微博', icon: '✧' },
  douyin: { label: '抖音', icon: '🎵' },
  xiaohongshu: { label: '小红书', icon: '📕' },
  tencent_video: { label: '视频号', icon: '▶' },
  kuaishou: { label: '快手', icon: '🎬' },
  toutiao: { label: '今日头条', icon: '📰' },
  bilibili: { label: 'B站', icon: '📺' },
  baijiahao: { label: '百家号', icon: '📖' },
  yidian: { label: '一点号', icon: '📋' },
  youtube: { label: 'YouTube', icon: '▶' },
  tiktok: { label: 'TikTok', icon: '♪' },
  twitter: { label: 'X (Twitter)', icon: '✕' },
}

async function loadAccounts () {
  const api = window.electronAPI
  if (!api || !api.accountList) return
  try {
    const res = await api.accountList()
    if (res.code === 0 && Array.isArray(res.data)) {
      const grouped = {}
      for (const acc of res.data) {
        if (!grouped[acc.platform]) grouped[acc.platform] = []
        grouped[acc.platform].push(acc)
      }
      platformAccounts.value = grouped
    }
    loaded.value = true
  } catch (e) {
    console.warn('Failed to load accounts:', e)
    loaded.value = true
  }
}

function getDefaultAccount (platform) {
  const accounts = platformAccounts.value[platform]
  if (!accounts || accounts.length === 0) return null
  return accounts.find(a => a.is_default) || accounts[0]
}

function getAccountText (platform) {
  const def = getDefaultAccount(platform)
  return def ? def.name || '已登录' : '未登录'
}

function getStatusClass (platform) {
  const def = getDefaultAccount(platform)
  if (!def) return 'offline'
  return def.status === 'active' || def.status === 'online' ? 'online' : 'offline'
}

function getAccountsForPlatform (platform) {
  return platformAccounts.value[platform] || []
}

async function switchAccount (platform, accountId) {
  const api = window.electronAPI
  if (!api || !api.accountSetDefault) return
  try {
    await api.accountSetDefault(platform, accountId)
    // 刷新列表
    await loadAccounts()
  } catch (e) {
    console.warn('Failed to switch account:', e)
  }
}

const filteredPlatforms = computed(() => {
  const ids = Object.keys(platformMeta)
  if (!platformSearch.value) return ids
  const q = platformSearch.value.toLowerCase()
  return ids.filter(id =>
    platformMeta[id].label.toLowerCase().includes(q) || id.toLowerCase().includes(q)
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
  loadAccounts()
  cancelUpdateListen = onUpdateStatus(handleUpdateStatus)
  setTimeout(() => updateCheck(), 3000)

  // 全局快捷键导航
  const api = window.electronAPI
  if (api && api.onNavigate) {
    api.onNavigate((route) => {
      router.push(route)
    })
  }
})

onBeforeUnmount(() => {
  if (cancelUpdateListen) cancelUpdateListen()
})
</script>

<style>
body { margin: 0; padding: 0; }

/* 侧栏账号切换器 */
.account-switcher {
  background: transparent;
  border: none;
  color: var(--text-secondary, var(--text-muted));
  font-size: 11px;
  width: 100%;
  cursor: pointer;
  outline: none;
  padding: 0;
  appearance: auto;
}

html, body { height: 100%; }
#app { height: 100%; }

/* ---- Design System Overrides ---- */
/* .btn-ghost-close removed, using UiButton */

.update-speed {
  font-size: 12px;
  color: var(--text-muted, #7c7c9a);
}

/* Custom progress bar (replaces el-progress) */
.update-progress-bar {
  width: 100%;
  height: 8px;
  background: var(--border-light);
  border-radius: 4px;
  overflow: hidden;
  margin: 12px 0;
}
.update-progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 4px;
  transition: width 300ms ease-out;
}

/* Toast notifications (replaces el-alert) */
.ui-toast {
  padding: 12px 16px;
  border-radius: var(--r-sm, 8px);
  font-size: 13px;
  font-weight: 500;
}
.ui-toast-success { background: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
.ui-toast-warning { background: #fef3c7; color: #92400e; border: 1px solid #fde68a; }
</style>
