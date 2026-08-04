<template>
  <aside class="yixiaoer-sidebar" data-testid="yixiaoer-sidebar" aria-label="主导航">
    <header class="yixiaoer-sidebar-header">
      <div class="yixiaoer-profile" data-testid="yixiaoer-profile">
        <span class="yixiaoer-avatar" aria-hidden="true">邱</span>
        <span class="yixiaoer-profile-copy">
          <strong>邱里奥谈认知</strong>
          <small>免费版</small>
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
      <span class="yixiaoer-sidebar-status"><i aria-hidden="true"></i>客户端已连接</span>
      <button type="button" class="yixiaoer-sidebar-help" aria-label="帮助">?</button>
    </footer>
  </aside>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  ArrowDown,
  ChatDotRound,
  Collection,
  DataAnalysis,
  FolderOpened,
  HomeFilled,
  MoreFilled,
  Plus,
  User,
  VideoCamera,
} from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const moreOpen = ref(false)

const primaryItems = [
  { key: 'home', label: '主页', to: '/', icon: HomeFilled },
  { key: 'publish', label: '发布', to: '/publish/history', icon: VideoCamera },
  { key: 'accounts', label: '账号', to: '/accounts', icon: User },
  { key: 'dashboard', label: '数据', to: '/dashboard', icon: DataAnalysis },
  { key: 'cloud-publish', label: 'CLI', to: '/cloud-publish', icon: FolderOpened },
  { key: 'comments', label: '私信评论', to: '/comments', icon: ChatDotRound },
]

const moreItems = [
  { key: 'collection', label: '采集', to: '/collection', icon: Collection },
  { key: 'create', label: '视频创作', to: '/create', icon: VideoCamera },
  { key: 'library', label: '素材库', to: '/library', icon: FolderOpened },
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
  width: 200px;
  min-width: 200px;
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
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px;
  color: #9294ab;
  font-size: 11px;
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
  background: #2fc27a;
}

.yixiaoer-sidebar-help {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid #c5c4d9;
  border-radius: 50%;
  background: transparent;
  color: #8587a1;
  cursor: pointer;
}

.yixiaoer-primary-item:focus-visible,
.yixiaoer-more-item:focus-visible,
.yixiaoer-sidebar-add:focus-visible,
.yixiaoer-sidebar-help:focus-visible {
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
