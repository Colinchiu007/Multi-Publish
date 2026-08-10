<template>
  <div class="app-root">
    <OfflineIndicator />
    <AnnouncementBanner />

    <template v-if="isYixiaoerWorkspace">
      <div class="yixiaoer-shell" data-testid="yixiaoer-shell">
        <YixiaoerSidebar @open-settings="showSettingsDialog = true" />
        <div class="yixiaoer-shell-main">
          <YixiaoerModuleNav />
          <main class="yixiaoer-workspace cohere-main" data-testid="yixiaoer-workspace">
            <RouteLoadError v-if="routeLoadError" v-bind="routeLoadError" @retry="retryRouteLoad" @refresh="refreshRouteLoad" />
            <router-view v-else />
          </main>
        </div>
      </div>
    </template>

    <template v-else>
      <AppNavbar @open-settings="showSettingsDialog = true" />

      <!-- 主体 -->
      <div class="cohere-app-body">
        <AppSidebar />
        <!-- 主内容 -->
        <main class="cohere-main">
          <RouteLoadError v-if="routeLoadError" v-bind="routeLoadError" @retry="retryRouteLoad" @refresh="refreshRouteLoad" />
          <router-view v-else />
        </main>
      </div>
    </template>

    <!-- 更新通知（弹窗 + Toast） -->
    <UpdateNotification />

    <!-- 设置弹窗（多 Tab） -->
    <SettingsDialog :visible="showSettingsDialog" @close="showSettingsDialog = false" />
  </div>
</template>

<script setup>
import AppNavbar from '@/layouts/AppNavbar.vue'
import AppSidebar from '@/layouts/AppSidebar.vue'
import YixiaoerModuleNav from '@/layouts/YixiaoerModuleNav.vue'
import YixiaoerSidebar from '@/layouts/YixiaoerSidebar.vue'
import OfflineIndicator from '@/components/OfflineIndicator.vue'
import AnnouncementBanner from '@/components/AnnouncementBanner.vue'
import UpdateNotification from '@/components/UpdateNotification.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import RouteLoadError from '@/components/RouteLoadError.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearRouteLoadError, routeLoadError } from '@/router'
import { useLicenseStore } from '@/stores/license'
import { useIdentityStore } from '@/stores/identity'
// eslint-disable-next-line no-unused-vars
import TrialBanner from '@/components/TrialBanner.vue'

const router = useRouter()
const route = useRoute()
const licenseStore = useLicenseStore()
const identityStore = useIdentityStore()
// eslint-disable-next-line no-unused-vars
const dismissBanner = ref(false)

const showSettingsDialog = ref(false)
let unsubscribeNavigate = null

// 非工作区路由（使用旧布局的特殊页面）
const NON_WORKSPACE_ROUTES = new Set(['/first-run', '/model-providers', '/keywords', '/viral-analysis'])

const isYixiaoerWorkspace = computed(() => !NON_WORKSPACE_ROUTES.has(route.path))

async function retryRouteLoad() {
  const failedPath = routeLoadError.value?.path || router.currentRoute.value.fullPath
  clearRouteLoadError()
  try {
    await router.replace(failedPath)
  } catch (error) {
    routeLoadError.value = {
      title: '页面加载失败',
      message: '页面资源仍未加载成功，请重试或刷新应用。',
      details: error?.stack || error?.message || '',
      path: failedPath,
    }
  }
}

function refreshRouteLoad() {
  window.location.reload()
}

onMounted(() => {
  licenseStore.load()
  identityStore.load()

  // 全局快捷键导航
  const api = window.electronAPI
  if (api && api.onNavigate) {
    unsubscribeNavigate = api.onNavigate((route) => {
      router.push(route)
    })
  }
})

onBeforeUnmount(() => {
  if (typeof unsubscribeNavigate === 'function') unsubscribeNavigate()
  unsubscribeNavigate = null
  identityStore.dispose()
})
</script>

<style>
body { margin: 0; padding: 0; }
html, body { height: 100%; }
#app { height: 100%; }
.yixiaoer-shell { height: 100%; display: flex; min-width: 0; overflow: hidden; background: #f7f7fb; }
.yixiaoer-shell-main { min-width: 0; flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.yixiaoer-workspace { min-width: 0; min-height: 0; flex: 1; overflow: auto; }
</style>
