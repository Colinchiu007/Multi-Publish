<template>
  <nav
    class="yixiaoer-module-nav"
    data-testid="yixiaoer-module-nav"
    aria-label="工作区导航"
  >
    <div
      class="yixiaoer-module-tabs"
      role="tablist"
      :aria-label="module === 'accounts' ? '账号模块' : module === 'home' ? '主页' : '发布模块'"
    >
      <router-link
        v-for="tab in tabs"
        :key="tab.key"
        :to="tab.to"
        class="yixiaoer-module-tab"
        :class="{ active: isTabActive(tab) }"
        :data-testid="`yixiaoer-tab-${tab.key}`"
        :aria-current="isTabActive(tab) ? 'page' : undefined"
        :aria-selected="isTabActive(tab)"
        role="tab"
      >
        {{ tab.label }}
      </router-link>
    </div>

    <div class="yixiaoer-module-tools" data-testid="yixiaoer-module-tools" aria-label="工具">
      <button
        class="yixiaoer-tool-button"
        data-testid="yixiaoer-tool-preview"
        type="button"
        aria-label="移动端预览"
        title="移动端预览"
        :aria-expanded="activeTool === 'preview'"
        aria-controls="yixiaoer-tool-panel"
        @click="toggleTool('preview')"
      >
        <span aria-hidden="true">▯</span>
      </button>
      <button
        class="yixiaoer-tool-button"
        data-testid="yixiaoer-tool-support"
        type="button"
        aria-label="客服支持"
        title="客服支持"
        :aria-expanded="activeTool === 'support'"
        aria-controls="yixiaoer-tool-panel"
        @click="toggleTool('support')"
      >
        <span aria-hidden="true">◉</span>
      </button>
      <button
        class="yixiaoer-tool-button"
        data-testid="yixiaoer-tool-guide"
        type="button"
        aria-label="使用指南"
        title="使用指南"
        :aria-expanded="activeTool === 'guide'"
        aria-controls="yixiaoer-tool-panel"
        @click="toggleTool('guide')"
      >
        <span aria-hidden="true">◫</span>
      </button>
      <button
        class="yixiaoer-tool-button"
        data-testid="yixiaoer-tool-notifications"
        type="button"
        aria-label="通知"
        title="通知"
        :aria-expanded="activeTool === 'notifications'"
        aria-controls="yixiaoer-tool-panel"
        @click="toggleTool('notifications')"
      >
        <span aria-hidden="true">♧</span>
      </button>
    </div>

    <IdentityMenu />

    <aside
      v-if="activeTool"
      id="yixiaoer-tool-panel"
      class="yixiaoer-tool-panel"
      data-testid="yixiaoer-tool-panel"
      :data-tool="activeTool"
      role="dialog"
      :aria-label="activeToolContent.title"
    >
      <div class="yixiaoer-tool-panel-header">
        <strong>{{ activeToolContent.title }}</strong>
        <button
          class="yixiaoer-tool-close"
          data-testid="yixiaoer-tool-close"
          type="button"
          aria-label="关闭工具面板"
          @click="activeTool = ''"
        >
          ×
        </button>
      </div>
      <p>{{ activeToolContent.body }}</p>
      <ol v-if="activeTool === 'guide'" class="yixiaoer-tool-guide-list">
        <li>先在账号管理中添加并验证平台账号。</li>
        <li>再在发布页填写内容、选择平台和目标账号。</li>
        <li>发布后可在发布记录中查看状态并重试失败任务。</li>
      </ol>
    </aside>
  </nav>
</template>

<script setup>
import { computed, ref } from 'vue'
import IdentityMenu from '@/components/IdentityMenu.vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const accountTabs = [
  { key: 'accounts', label: '账号管理', to: '/accounts' },
  { key: 'groups', label: '分组管理', to: { path: '/accounts', query: { tab: 'groups' } } },
  { key: 'share', label: '分享链接', to: { path: '/accounts', query: { tab: 'share' } } },
  { key: 'favorites', label: '收藏分组', to: { path: '/accounts', query: { tab: 'favorites' } } },
]

const publishTabs = [
  { key: 'new-publish', label: '新建发布', to: '/publish' },
  { key: 'publish-history', label: '发布记录', to: '/publish/history' },
  { key: 'drafts', label: '草稿箱', to: { path: '/publish', query: { tab: 'drafts' } } },
]

const homeTabs = [
  { key: 'home', label: '主页', to: '/' },
]

const module = computed(() => {
  if (route.path === '/') return 'home'
  if (route.path.startsWith('/accounts')) return 'accounts'
  return 'publish'
})
const tabs = computed(() => {
  if (module.value === 'home') return homeTabs
  if (module.value === 'accounts') return accountTabs
  return publishTabs
})
const activeTool = ref('')
const toolPanels = {
  preview: { title: '移动端预览', body: '当前页面将在移动端预览中展示。' },
  support: { title: '客服支持', body: '当前工作区尚未接入在线客服服务。' },
  guide: { title: '使用指南', body: '账号管理与发布流程' },
  notifications: { title: '通知', body: '暂无新通知' },
}
const activeToolContent = computed(() => toolPanels[activeTool.value] || { title: '', body: '' })

function toggleTool (tool) {
  activeTool.value = activeTool.value === tool ? '' : tool
}

function isTabActive (tab) {
  if (module.value === 'home') return route.path === '/'
  if (module.value === 'accounts') {
    if (tab.key === 'accounts') return route.path === '/accounts' && !route.query?.tab
    return route.path === '/accounts' && route.query?.tab === tab.key
  }

  if (tab.key === 'new-publish') return route.path === '/publish' && !route.query?.tab
  if (tab.key === 'publish-history') return route.path === '/publish/history'
  return route.path === '/publish' && route.query?.tab === 'drafts'
}
</script>

<style scoped>
.yixiaoer-module-nav {
  position: relative;
  min-height: var(--yixiaoer-nav-height, 70px);
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  gap: 24px;
  padding: 0 24px;
  box-sizing: border-box;
  background: #fff;
  border-bottom: 1px solid var(--yixiaoer-nav-border, #e8eaf2);
  color: var(--yixiaoer-muted, #8b8e9a);
}

.yixiaoer-tool-panel {
  position: absolute;
  z-index: 10;
  top: calc(100% + 8px);
  right: 20px;
  width: min(320px, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--yixiaoer-nav-border, #e8eaf2);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 12px 32px rgba(39, 42, 70, 0.14);
  color: var(--yixiaoer-text, #25252b);
  font-size: 13px;
}

.yixiaoer-tool-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.yixiaoer-tool-panel p {
  margin: 0;
  color: var(--yixiaoer-muted, #707080);
  line-height: 1.6;
}

.yixiaoer-tool-close {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--yixiaoer-muted, #8b8e9a);
  font-size: 18px;
  cursor: pointer;
}

.yixiaoer-tool-close:hover,
.yixiaoer-tool-close:focus-visible {
  background: #f3f2ff;
  color: var(--yixiaoer-primary, #5048e5);
}

.yixiaoer-tool-guide-list {
  margin: 10px 0 0;
  padding-left: 20px;
  color: var(--yixiaoer-muted, #707080);
  line-height: 1.7;
}

.yixiaoer-module-tabs {
  min-width: 0;
  display: flex;
  align-items: stretch;
  gap: 26px;
}

.yixiaoer-module-tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-height: var(--yixiaoer-nav-height, 70px);
  padding: 0;
  border: 0;
  color: var(--yixiaoer-muted, #8b8e9a);
  font-size: 16px;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

.yixiaoer-module-tab:hover,
.yixiaoer-module-tab:focus-visible {
  color: var(--yixiaoer-primary, #5048e5);
}

.yixiaoer-module-tab:focus-visible,
.yixiaoer-tool-button:focus-visible {
  outline: 2px solid #5048e5;
  outline-offset: 3px;
}

.yixiaoer-module-tab.active {
  color: var(--yixiaoer-primary, #5048e5);
  font-weight: 600;
}

.yixiaoer-module-tab.active::after {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--yixiaoer-primary, #5048e5);
  content: '';
}

.yixiaoer-module-tools {
  display: flex;
  align-items: center;
  gap: 18px;
  flex: 0 0 auto;
}

.yixiaoer-tool-button {
  display: inline-grid;
  width: 24px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--yixiaoer-muted, #8b8e9a);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.yixiaoer-tool-button:hover {
  color: var(--yixiaoer-primary, #5048e5);
}

@media (max-width: 700px) {
  .yixiaoer-module-nav {
    gap: 12px;
    padding: 0 14px;
  }

  .yixiaoer-module-tabs {
    gap: 18px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .yixiaoer-module-tabs::-webkit-scrollbar {
    display: none;
  }

  .yixiaoer-module-tab {
    min-height: calc(var(--yixiaoer-nav-height, 70px) - 8px);
    font-size: 14px;
  }

  .yixiaoer-module-nav {
    min-height: calc(var(--yixiaoer-nav-height, 70px) - 8px);
  }

  .yixiaoer-module-tools {
    gap: 8px;
  }

  .yixiaoer-tool-button:nth-child(-n + 2) {
    display: none;
  }
}
</style>
