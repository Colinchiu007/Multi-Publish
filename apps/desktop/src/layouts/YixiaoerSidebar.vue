<template>
  <aside class="yixiaoer-sidebar" data-testid="yixiaoer-sidebar" aria-label="主导航">
    <header class="yixiaoer-sidebar-header">
      <div class="yixiaoer-profile" data-testid="yixiaoer-profile">
        <span class="yixiaoer-avatar" aria-hidden="true">{{ avatarInitial }}</span>
        <span class="yixiaoer-profile-copy">
          <strong :title="displayName">{{ displayName }}</strong>
          <small>{{ licenseLabel }}</small>
        </span>
      </div>
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
        <span class="yixiaoer-sidebar-status is-unknown" data-testid="yixiaoer-sidebar-status">
          <i aria-hidden="true"></i>{{ t('sidebar.clientStatusUnknown') }}
        </span>
      </div>
      <div class="yixiaoer-sidebar-footer-actions">
        <span class="yixiaoer-service-status" data-testid="yixiaoer-service-status">
          <i aria-hidden="true"></i>服务运行中
        </span>
        <button v-if="!licenseStore.isPro" type="button" class="yixiaoer-upgrade-btn" data-testid="yixiaoer-upgrade" @click="showUpgradeModal = true">
          ⭐ 升级 Pro
        </button>
        <UpgradeModal v-if="showUpgradeModal" @close="showUpgradeModal = false" />
      </div>
    </footer>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
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
import { useIdentityStore } from '@/stores/identity'
import { useLicenseStore } from '@/stores/license'
import UpgradeModal from '@/components/UpgradeModal.vue'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const identityStore = useIdentityStore()
const licenseStore = useLicenseStore()
const moreOpen = ref(false)
const showUpgradeModal = ref(false)

const displayName = computed(() => {
  if (identityStore.user?.name) return identityStore.user.name
  if (identityStore.user?.username) return identityStore.user.username
  return '未登录'
})

const avatarInitial = computed(() => {
  const name = displayName.value
  return name.charAt(0)
})

const licenseLabel = computed(() => {
  if (licenseStore.isPro) return '专业版'
  if (licenseStore.isTrial) return '试用版'
  return '免费版'
})

const emit = defineEmits(['open-settings'])

const primaryItems = [
  { key: 'home', label: '主页', to: '/', icon: HomeFilled },
  { key: 'publish', label: '发布', to: '/publish/history', icon: VideoCamera },
  { key: 'accounts', label: '账号', to: '/accounts', icon: User },
  { key: 'dashboard', label: '数据', to: '/dashboard', icon: DataAnalysis },
  { key: 'create', label: '视频创作', to: '/create', icon: VideoCamera },
  { key: 'collection', label: '采集', to: '/collection', icon: Collection },
]

const moreItems = [
  { key: 'monitor', label: '监控', to: '/monitor', icon: Monitor },
  { key: 'calendar', label: '发布日历', to: '/calendar', icon: Calendar },
  { key: 'comments', label: '私信评论', to: '/comments', icon: ChatDotRound },
  { key: 'cloud-publish', label: 'CLI', to: '/cloud-publish', icon: FolderOpened },
  { key: 'library', label: '素材库', to: '/library', icon: FolderOpened },
  { key: 'keywords', label: '关键词监控', to: '/keywords', icon: Search },
  { key: 'viral', label: '爆款分析', to: '/viral-analysis', icon: TrendCharts },
  { key: 'prompt-eval', label: '提示词评估', to: '/prompt-eval', icon: MagicStick },
  { key: 'model-providers', label: '模型提供商', to: '/model-providers', icon: Cpu },
]

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
  display: flex;
  flex-direction: column;
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

.yixiaoer-profile {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.yixiaoer-avatar {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 50%;
  background: linear-gradient(140deg, #ffcf80, #ef9e68);
  color: #5d3824;
  font-size: 13px;
  font-weight: 700;
}

.yixiaoer-profile-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.yixiaoer-profile-copy strong {
  overflow: hidden;
  color: #4d4f6f;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.yixiaoer-profile-copy small {
  width: fit-content;
  padding: 1px 5px;
  border-radius: 8px;
  background: #e3e1f2;
  color: #9293a6;
  font-size: 10px;
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
}

.yixiaoer-service-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6fbf73;
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

  .yixiaoer-profile-copy,
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
