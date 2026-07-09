<template>
  <div>
    <!-- 离线提示 -->
    <div v-if="isOffline" class="offline-banner">
      <span>📡 网络已断开 — 发布任务将被缓存，网络恢复后自动重试</span>
      <span v-if="cachedTaskCount > 0" style="margin-left:8px;font-weight:600">({{ cachedTaskCount }} 个待发布)</span>
    </div>
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
      <router-link to="/calendar" class="nav-item" :class="{ active: route.path === '/calendar' }">
        发布日历
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
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useLicenseStore } from '@/stores/license'
// eslint-disable-next-line no-unused-vars
import UpgradeModal from '@/components/UpgradeModal.vue'
// eslint-disable-next-line no-unused-vars
import TrialBanner from '@/components/TrialBanner.vue'
import { usePlatformAccounts, platformMeta } from '@/composables/usePlatformAccounts'
import { useAutoUpdate } from '@/composables/useAutoUpdate'
import { useAuthView } from '@/composables/useAuthView'
import { useOfflineStatus } from '@/composables/useOfflineStatus'

const route = useRoute()
const router = useRouter()
const licenseStore = useLicenseStore()
const showUpgradeModal = ref(false)
// eslint-disable-next-line no-unused-vars
const dismissBanner = ref(false)

// 平台账号（侧栏）
const {
  platformSearch,
  activePlatform,
  filteredPlatforms,
  loadAccounts,
  switchAccount,
  getDefaultAccount,
  getAccountText,
  getStatusClass,
  getAccountsForPlatform,
} = usePlatformAccounts()

// 自动更新
const {
  showUpdateDialog,
  updateStatus,
  updateInfo,
  downloading,
  downloadPercent,
  downloadSpeed,
  showNotAvailable,
  showError,
  updateError,
  handleDownload,
  handleInstall,
  start: startAutoUpdate,
  cleanup: cleanupAutoUpdate,
} = useAutoUpdate()

// 登录视图
const { authViewVisible, registerListeners: registerAuthListeners, closeLogin } = useAuthView()

// 离线状态
const { isOffline, cachedTaskCount, init: initOfflineStatus } = useOfflineStatus()

onMounted(() => {
  licenseStore.load()
  registerAuthListeners()
  initOfflineStatus()
  loadAccounts()
  startAutoUpdate()

  // 全局快捷键导航
  const api = window.electronAPI
  if (api && api.onNavigate) {
    api.onNavigate((route) => {
      router.push(route)
    })
  }
})

onBeforeUnmount(() => {
  cleanupAutoUpdate()
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

/* Offline banner */
.offline-banner {
  background: #fef3c7;
  border-bottom: 1px solid #fbbf24;
  padding: 8px 16px;
  font-size: 13px;
  color: #92400e;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: slideDown 0.3s ease-out;
}
@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
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
