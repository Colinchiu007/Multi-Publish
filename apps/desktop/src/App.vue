<template>
  <div class="app-root">
    <OfflineIndicator />

    <template v-if="isYixiaoerWorkspace">
      <div class="yixiaoer-shell" data-testid="yixiaoer-shell">
        <YixiaoerSidebar @open-settings="showSettingsDialog = true" />
        <div class="yixiaoer-shell-main">
          <!-- 浏览器式标签栏 -->
          <TabBar
            @switch-tab="onSwitchTab"
            @close-tab="onCloseTab"
            @create-tab="onCreateTab"
          />
          <!-- 导航栏（后退/前进/刷新/URL） -->
          <NavBar
            :current-url="navigation.url"
            :current-title="navigation.title"
            :can-go-back="navigation.canGoBack"
            :can-go-forward="navigation.canGoForward"
            :is-home="isHomeTab"
            :loading="navigation.loading"
            @go-back="tabStore.goBack()"
            @go-forward="tabStore.goForward()"
            @reload="tabStore.reload()"
            @go-home="goHome"
            @navigate="onNavigate"
          />
          <!-- 模块导航（仅首页标签显示） -->
          <YixiaoerModuleNav v-if="isHomeTab" />
          <!-- 主内容区 -->
          <main class="yixiaoer-workspace cohere-main" data-testid="yixiaoer-workspace">
            <RouteLoadError v-if="routeLoadError" v-bind="routeLoadError" @retry="retryRouteLoad" @refresh="refreshRouteLoad" />
            <router-view v-else />
          </main>
        </div>
      </div>
    </template>

    <template v-else>
      <AppNavbar @open-settings="showSettingsDialog = true" />
      <div class="cohere-app-body">
        <AppSidebar />
        <main class="cohere-main">
          <RouteLoadError v-if="routeLoadError" v-bind="routeLoadError" @retry="retryRouteLoad" @refresh="refreshRouteLoad" />
          <router-view v-else />
        </main>
      </div>
    </template>

    <UpdateNotification />
    <SettingsDialog :visible="showSettingsDialog" @close="closeSettingsDialog" />
  </div>
</template>

<script setup>
import AppNavbar from '@/layouts/AppNavbar.vue'
import AppSidebar from '@/layouts/AppSidebar.vue'
import YixiaoerModuleNav from '@/layouts/YixiaoerModuleNav.vue'
import YixiaoerSidebar from '@/layouts/YixiaoerSidebar.vue'
import TabBar from '@/components/TabBar.vue'
import NavBar from '@/components/NavBar.vue'
import OfflineIndicator from '@/components/OfflineIndicator.vue'
import UpdateNotification from '@/components/UpdateNotification.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import RouteLoadError from '@/components/RouteLoadError.vue'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearRouteLoadError, routeLoadError } from '@/router'
import { useLicenseStore } from '@/stores/license'
import { useIdentityStore } from '@/stores/identity'
import { useTabStore } from '@/stores/tab'
import { notifySettingsDialogClosed } from '@/stores/settings-dialog'
import { storeToRefs } from 'pinia'

const router = useRouter()
const route = useRoute()
const licenseStore = useLicenseStore()
const identityStore = useIdentityStore()
const tabStore = useTabStore()
const { navigation, isHomeTab, activeTabId } = storeToRefs(tabStore)

const showSettingsDialog = ref(false)
let unsubscribeNavigate = null

// 关闭「设置」弹窗并通知依赖模型配置的视图刷新（如图片轮播的服务商/音色能力下拉），
// 避免“新增模型后关闭弹窗仍看不到新模型”的陈旧状态（2026-08-12 Bug 修复）。
function closeSettingsDialog () {
  showSettingsDialog.value = false
  notifySettingsDialogClosed()
}

const NON_WORKSPACE_ROUTES = new Set(['/first-run', '/model-providers', '/keywords', '/viral-analysis'])
const isYixiaoerWorkspace = computed(() => !NON_WORKSPACE_ROUTES.has(route.path))

// ── 标签页操作 ──

function onSwitchTab(tabId) {
  tabStore.switchToTab(tabId)
}

function onCloseTab(tabId) {
  tabStore.closeTab(tabId)
}

async function onCreateTab() {
  await tabStore.createTab({ url: 'about:blank' })
}

function goHome() {
  const homeTab = tabStore.tabs.find(t => t.isHome)
  if (homeTab) {
    tabStore.switchToTab(homeTab.tabId)
  }
}

function onNavigate(query) {
  tabStore.searchOrNavigate(query)
}

// ── 路由错误恢复 ──

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

// ── 生命周期 ──

onMounted(() => {
  licenseStore.load()
  identityStore.load()
  tabStore.init()

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
  tabStore.dispose()
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
