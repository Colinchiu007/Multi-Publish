<template>
  <aside class="yixiaoer-sidebar" data-testid="yixiaoer-sidebar" aria-label="主导航">
    <header class="yixiaoer-sidebar-header">
      <ProfileMenu />
      <button class="yixiaoer-sidebar-add" type="button" aria-label="新建发布" title="新建发布" @click="goToPublish">
        <Plus />
      </button>
    </header>

    <nav class="yixiaoer-primary-nav" aria-label="蚁小二主导航">
      <router-link
        v-for="item in primaryItems"
        :key="item.key"
        :to="item.to"
        class="yixiaoer-primary-item"
        :class="{ active: isActive(item) }"
        :data-testid="`yixiaoer-primary-${item.key}`"
        :aria-current="isActive(item) ? 'page' : undefined"
      >
        <component :is="item.icon" aria-hidden="true" />
        <span>{{ item.label }}</span>
      </router-link>

      <button
        class="yixiaoer-primary-item"
        type="button"
        data-testid="yixiaoer-primary-settings"
        aria-label="设置"
        title="设置"
        @click="emit('open-settings')"
      >
        <Setting aria-hidden="true" />
        <span>设置</span>
      </button>

      <button
        class="yixiaoer-primary-item yixiaoer-more-trigger"
        :class="{ active: moreOpen }"
        type="button"
        aria-haspopup="true"
        :aria-expanded="moreOpen"
        data-testid="yixiaoer-primary-more"
        @click="moreOpen = !moreOpen"
      >
        <MoreFilled aria-hidden="true" />
        <span>更多</span>
        <ArrowDown :class="{ rotated: moreOpen }" aria-hidden="true" />
      </button>
      <div v-if="moreOpen" class="yixiaoer-more-menu" role="menu">
        <router-link v-for="item in moreItems" :key="item.key" :to="item.to" role="menuitem" class="yixiaoer-more-item">
          <component :is="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </router-link>
      </div>
    </nav>

    <footer class="yixiaoer-sidebar-footer">
      <div class="yixiaoer-sidebar-status-row">
        <span
          class="yixiaoer-sidebar-status"
          :class="'is-' + identityStatus"
          data-testid="yixiaoer-sidebar-status"
          :title="clientStatusTitle"
        >
          <i aria-hidden="true"></i>{{ clientStatusLabel }}
        </span>
      </div>
      <div class="yixiaoer-sidebar-footer-actions">
        <el-popover
          placement="top-start"
          :width="280"
          trigger="hover"
          :show-after="200"
          popper-class="yixiaoer-service-popover"
        >
          <template #reference>
            <span
              class="yixiaoer-service-status"
              :class="serviceSummaryClass"
              data-testid="yixiaoer-service-status"
              role="button"
              tabindex="0"
              aria-haspopup="dialog"
            >
              <i aria-hidden="true"></i>{{ serviceSummaryLabel }}
            </span>
          </template>
          <div class="yixiaoer-service-list" data-testid="yixiaoer-service-list">
            <div v-if="serviceStatusStore.unavailable" class="yixiaoer-service-unavailable">
              {{ t('sidebar.serviceStatus.unavailable') }}
            </div>
            <template v-else>
              <div
                v-for="svc in serviceStatusStore.services"
                :key="svc.key"
                class="yixiaoer-service-item"
                :data-testid="'yixiaoer-service-' + svc.key"
              >
                <i class="yixiaoer-service-dot" :class="'is-' + svc.status" aria-hidden="true"></i>
                <span class="yixiaoer-service-name">{{ serviceLabel(svc) }}</span>
                <span class="yixiaoer-service-state">{{ serviceStateLabel(svc.status) }}</span>
              </div>
            </template>
          </div>
        </el-popover>
        <button v-if="!licenseStore.isPro" type="button" class="yixiaoer-upgrade-btn" data-testid="yixiaoer-upgrade" @click="showUpgradeModal = true">
          ⭐ 升级 Pro
        </button>
        <UpgradeModal v-if="showUpgradeModal" @close="showUpgradeModal = false" />
      </div>
    </footer>
  </aside>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  ArrowDown,
  Calendar,
  ChatDotRound,
  Collection,
  Cpu,
  DataAnalysis,
  FolderOpened,
  HomeFilled,
  MagicStick,
  Monitor,
  MoreFilled,
  Plus,
  Search,
  Setting,
  TrendCharts,
  User,
  VideoCamera,
} from '@element-plus/icons-vue'
import { useLicenseStore } from '@/stores/license'
import { useIdentityStore } from '@/stores/identity'
import { useServiceStatusStore } from '@/stores/serviceStatus'
import UpgradeModal from '@/components/UpgradeModal.vue'
import ProfileMenu from '@/components/ProfileMenu.vue'
import { invokePageManager } from '@/api/electron-bridge'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const licenseStore = useLicenseStore()
const identityStore = useIdentityStore()
const serviceStatusStore = useServiceStatusStore()
const moreOpen = ref(false)
const showUpgradeModal = ref(false)

const emit = defineEmits(['open-settings'])

// ── 左侧导航栏宽度同步到主进程（避免 WebContentsView 遮挡侧边栏）──
let _sidebarObserver = null
onMounted(() => {
  serviceStatusStore.startPolling()
  const el = document.querySelector('.yixiaoer-sidebar')
  if (el) {
    const syncWidth = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) invokePageManager('setSidebarWidth', Math.round(w))
    }
    syncWidth()
    _sidebarObserver = new ResizeObserver(syncWidth)
    _sidebarObserver.observe(el)
  }
})
onUnmounted(() => {
  serviceStatusStore.stopPolling()
  if (_sidebarObserver) {
    _sidebarObserver.disconnect()
    _sidebarObserver = null
  }
})

const identityStatus = computed(() => {
  const status = identityStore.status
  return ['authenticated', 'refreshing', 'offline_authenticated'].includes(status) ? 'online'
    : ['signing_in', 'signing_out'].includes(status) ? 'busy'
    : status === 'disabled' ? 'disabled'
    : ['signed_out', 'expired'].includes(status) ? 'offline'
    : 'error'
})

const clientStatusLabel = computed(() => {
  if (identityStatus.value === 'online') return t('memberCenter.statusConnected')
  if (identityStatus.value === 'busy') return identityStore.status === 'signing_in'
    ? t('memberCenter.statusSigningIn')
    : t('memberCenter.statusSigningOut')
  if (identityStatus.value === 'disabled') return t('memberCenter.identityDisabled')
  if (identityStatus.value === 'offline') return identityStore.status === 'expired'
    ? t('memberCenter.statusExpired')
    : t('memberCenter.notLoggedIn')
  return t('memberCenter.statusError')
})

const clientStatusTitle = computed(() => clientStatusLabel.value)

const serviceSummaryLabel = computed(() => {
  if (serviceStatusStore.unavailable) return t('sidebar.serviceStatus.unavailable')
  if (serviceStatusStore.allRunning) return t('sidebar.serviceStatus.allRunning')
  return t('sidebar.serviceStatus.partialRunning', { count: serviceStatusStore.runningCount })
})

const serviceSummaryClass = computed(() => {
  if (serviceStatusStore.unavailable) return 'is-degraded'
  if (serviceStatusStore.allRunning) return 'is-ok'
  return 'is-degraded'
})

function serviceLabel (svc) {
  const key = 'sidebar.serviceStatus.services.' + svc.key
  const label = t(key)
  return label === key ? svc.name : label
}

function serviceStateLabel (status) {
  return t('sidebar.serviceStatus.states.' + status)
}

const primaryItems = [
  { key: 'home', label: '主页', to: '/', icon: HomeFilled },
  { key: 'publish', label: '发布', to: '/publish/history', icon: VideoCamera },
  { key: 'accounts', label: '账号', to: '/accounts', icon: User },
  { key: 'dashboard', label: '数据', to: '/dashboard', icon: DataAnalysis },
  { key: 'create', label: '视频创作', to: '/create', icon: VideoCamera },
  { key: 'collection', label: '采集', to: '/collection', icon: Collection },
]

const moreItems = computed(() => [
  { key: 'monitor', label: '监控', to: '/monitor', icon: Monitor },
  { key: 'calendar', label: '发布日历', to: '/calendar', icon: Calendar },
  { key: 'comments', label: '私信评论', to: '/comments', icon: ChatDotRound },
  { key: 'cloud-publish', label: 'CLI', to: '/cloud-publish', icon: FolderOpened },
  { key: 'library', label: '素材库', to: '/library', icon: FolderOpened },
  { key: 'keywords', label: '关键词监控', to: '/keywords', icon: Search },
  { key: 'viral', label: '爆款分析', to: '/viral-analysis', icon: TrendCharts },
  { key: 'prompt-eval', label: '提示词评估', to: '/prompt-eval', icon: MagicStick },
  { key: 'rewrite', label: '文案改写', to: '/rewrite', icon: MagicStick },
  { key: 'hot-topics', label: t('hotTopics.menuLabel'), to: '/hot-topics', icon: TrendCharts },
  { key: 'model-providers', label: '模型提供商', to: '/model-providers', icon: Cpu },
  { key: 'knowledge-base', label: t('knowledgeBase.title'), to: '/knowledge-base', icon: Collection },
  { key: 'member-center', label: t('memberCenter.menuEntry'), to: '/member-center', icon: User },
])

function isActive (item) {
  if (item.key === 'home') return route.path === '/'
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

function goToPublish () {
  router.push('/publish')
}
</script>

<style scoped>
.yixiaoer-sidebar {
  width: var(--yixiaoer-sidebar-width, 200px);
  min-width: var(--yixiaoer-sidebar-width, 200px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: linear-gradient(180deg, #f4f2ff 0%, #f0efff 100%);
  color: #7a7d99;
  border-right: 1px solid #e9e8f6;
}

.yixiaoer-sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 16px 14px 18px;
}

.yixiaoer-sidebar-add {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid #bab9d3;
  border-radius: 50%;
  background: transparent;
  color: #777997;
  cursor: pointer;
}

.yixiaoer-sidebar-add svg {
  width: 14px;
  height: 14px;
}

.yixiaoer-sidebar-add:hover,
.yixiaoer-sidebar-add:focus-visible {
  border-color: #5149e8;
  color: #5149e8;
}

.yixiaoer-primary-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 10px;
}

.yixiaoer-primary-item {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 12px;
  border-radius: 8px;
  color: #777a96;
  font-size: 14px;
  text-decoration: none;
  transition: background .15s ease, color .15s ease;
}

.yixiaoer-primary-item svg {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
}

.yixiaoer-primary-item:hover,
.yixiaoer-primary-item:focus-visible {
  background: rgba(255, 255, 255, .65);
  color: #5149e8;
}

.yixiaoer-primary-item.active {
  background: rgba(255, 255, 255, .9);
  color: #5149e8;
  font-weight: 600;
  box-shadow: 0 2px 9px rgba(99, 91, 195, .08);
}

.yixiaoer-more-trigger {
  width: 100%;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.yixiaoer-more-trigger > svg:last-child {
  width: 13px;
  height: 13px;
  margin-left: auto;
  transition: transform .15s ease;
}

.yixiaoer-more-trigger > svg:last-child.rotated {
  transform: rotate(180deg);
}

.yixiaoer-more-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: -1px 0 2px 22px;
  padding: 4px 0 4px 12px;
  border-left: 1px solid #d9d7ed;
}

.yixiaoer-more-item {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 6px;
  color: #8587a1;
  font-size: 12px;
  text-decoration: none;
}

.yixiaoer-more-item svg {
  width: 14px;
  height: 14px;
}

.yixiaoer-more-item:hover,
.yixiaoer-more-item:focus-visible {
  background: rgba(255, 255, 255, .68);
  color: #5149e8;
}

.yixiaoer-sidebar-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  color: #9294ab;
  font-size: 11px;
}

.yixiaoer-sidebar-status-row {
  display: flex;
}

.yixiaoer-sidebar-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.yixiaoer-service-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #6f9c6f;
  cursor: default;
}

.yixiaoer-service-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6fbf73;
}

.yixiaoer-service-status.is-degraded {
  color: #b08a3e;
}

.yixiaoer-service-status.is-degraded i {
  background: #e6a23c;
}

.yixiaoer-upgrade-btn {
  flex-shrink: 0;
  height: 26px;
  padding: 0 12px;
  border: 1px solid #d9c98a;
  border-radius: 13px;
  background: linear-gradient(180deg, #fff7e0, #ffeec2);
  color: #8a6d1f;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: filter .15s ease;
}

.yixiaoer-upgrade-btn:hover,
.yixiaoer-upgrade-btn:focus-visible {
  filter: brightness(.97);
  outline: 2px solid #5149e8;
  outline-offset: 2px;
}

.yixiaoer-sidebar-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.yixiaoer-sidebar-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a7a8b5;
}

.yixiaoer-sidebar-status.is-online i {
  background: #6fbf73;
}

.yixiaoer-sidebar-status.is-online {
  color: #6f9c6f;
}

.yixiaoer-sidebar-status.is-busy i,
.yixiaoer-sidebar-status.is-error i {
  background: #e6a23c;
}

.yixiaoer-sidebar-status.is-busy,
.yixiaoer-sidebar-status.is-error {
  color: #b08a3e;
}

.yixiaoer-sidebar-settings {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid #c5c4d9;
  border-radius: 50%;
  background: transparent;
  color: #8587a1;
  cursor: pointer;
}

.yixiaoer-sidebar-settings svg {
  width: 12px;
  height: 12px;
}

.yixiaoer-primary-item:focus-visible,
.yixiaoer-more-item:focus-visible,
.yixiaoer-sidebar-add:focus-visible,
.yixiaoer-sidebar-settings:focus-visible {
  outline: 2px solid #5149e8;
  outline-offset: 2px;
}

@media (max-width: 900px) {
  .yixiaoer-sidebar {
    width: 68px;
    min-width: 68px;
  }

  .yixiaoer-sidebar-header {
    justify-content: center;
    padding-inline: 8px;
  }

  .yixiaoer-sidebar-add,
  .yixiaoer-primary-item span,
  .yixiaoer-primary-item > svg:last-child,
  .yixiaoer-more-menu,
  .yixiaoer-sidebar-footer {
    display: none;
  }

  .yixiaoer-primary-nav {
    padding-inline: 8px;
  }

  .yixiaoer-primary-item {
    justify-content: center;
    padding-inline: 0;
  }
}
</style>

<style>
/* el-popover 渲染在 body 下，scoped 样式无法命中，需全局样式 */
.yixiaoer-service-popover .yixiaoer-service-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.yixiaoer-service-popover .yixiaoer-service-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #5a5c73;
}

.yixiaoer-service-popover .yixiaoer-service-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.yixiaoer-service-popover .yixiaoer-service-dot.is-running {
  background: #6fbf73;
}

.yixiaoer-service-popover .yixiaoer-service-dot.is-stopped {
  background: #f56c6c;
}

.yixiaoer-service-popover .yixiaoer-service-dot.is-standby {
  background: #c0c2cf;
}

.yixiaoer-service-popover .yixiaoer-service-state {
  margin-left: auto;
  color: #9294ab;
}

.yixiaoer-service-popover .yixiaoer-service-unavailable {
  font-size: 12px;
  color: #b08a3e;
}
</style>
