<template>
  <nav
    class="yixiaoer-module-nav"
    data-testid="yixiaoer-module-nav"
    aria-label="工作区导航"
  >
    <div
      class="yixiaoer-module-tabs"
      role="tablist"
      :aria-label="module === 'accounts' ? '账号模块' : '发布模块'"
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
      <button class="yixiaoer-tool-button" type="button" aria-label="移动端预览" title="移动端预览">
        <span aria-hidden="true">▯</span>
      </button>
      <button class="yixiaoer-tool-button" type="button" aria-label="客服支持" title="客服支持">
        <span aria-hidden="true">◉</span>
      </button>
      <button class="yixiaoer-tool-button" type="button" aria-label="使用指南" title="使用指南">
        <span aria-hidden="true">◫</span>
      </button>
      <button class="yixiaoer-tool-button" type="button" aria-label="通知" title="通知">
        <span aria-hidden="true">♧</span>
      </button>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()

const accountTabs = [
  { key: 'accounts', label: '账号管理', to: '/accounts' },
  { key: 'groups', label: '分组管理', to: { path: '/accounts', query: { tab: 'groups' } } },
  { key: 'share', label: '分享链接', to: { path: '/accounts', query: { tab: 'share' } } },
  { key: 'favorites', label: '收藏分组', to: { path: '/accounts', query: { tab: 'favorites' } } },
]

const publishTabs = [
  { key: 'publish-history', label: '发布记录', to: '/publish/history' },
  { key: 'drafts', label: '草稿箱', to: { path: '/publish', query: { tab: 'drafts' } } },
]

const module = computed(() => route.path.startsWith('/accounts') ? 'accounts' : 'publish')
const tabs = computed(() => module.value === 'accounts' ? accountTabs : publishTabs)

function isTabActive (tab) {
  if (module.value === 'accounts') {
    if (tab.key === 'accounts') return route.path === '/accounts' && !route.query?.tab
    return route.path === '/accounts' && route.query?.tab === tab.key
  }

  if (tab.key === 'publish-history') return route.path === '/publish/history'
  return route.path === '/publish' && route.query?.tab === 'drafts'
}
</script>

<style scoped>
.yixiaoer-module-nav {
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
