<template>
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
    <router-link to="/library" class="nav-item" :class="{ active: route.path.startsWith('/library') || route.path.startsWith('/board') }">
      项目库
    </router-link>
    <router-link to="/calendar" class="nav-item" :class="{ active: route.path === '/calendar' }">
      发布日历
    </router-link>
    <!-- 设置下拉菜单 -->
    <div class="nav-dropdown-wrapper" ref="settingsDropdownRef">
      <button class="nav-item nav-dropdown-trigger" :class="{ active: showSettingsMenu }" @click="toggleSettingsMenu">
        设置 ▾
      </button>
      <div v-if="showSettingsMenu" class="nav-dropdown-menu">
        <button class="nav-dropdown-item" @click="openSettings">模型设置</button>
      </div>
    </div>
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
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useLicenseStore } from '@/stores/license'
import { useAuthView } from '@/composables/useAuthView'
// eslint-disable-next-line no-unused-vars
import UpgradeModal from '@/components/UpgradeModal.vue'

const emit = defineEmits(['openSettings'])

const route = useRoute()
const licenseStore = useLicenseStore()
const showUpgradeModal = ref(false)

// 设置弹窗 + 下拉菜单
const showSettingsMenu = ref(false)
const settingsDropdownRef = ref(null)

function toggleSettingsMenu () {
  showSettingsMenu.value = !showSettingsMenu.value
}

function openSettings () {
  showSettingsMenu.value = false
  emit('openSettings')
}

function handleOutsideClick (e) {
  if (settingsDropdownRef.value && !settingsDropdownRef.value.contains(e.target)) {
    showSettingsMenu.value = false
  }
}

// 登录视图
const { authViewVisible, registerListeners: registerAuthListeners, closeLogin } = useAuthView()

onMounted(() => {
  registerAuthListeners()
  document.addEventListener('click', handleOutsideClick)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
})
</script>
