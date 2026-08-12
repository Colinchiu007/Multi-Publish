<template>
  <!-- 顶部导航 -->
  <nav class="cohere-topnav">
    <div class="brand">
      <span class="logo-dot"></span>
      社媒管家
    </div>
    <div class="nav-primary" aria-label="主要导航">
      <router-link to="/accounts" class="nav-item" :class="{ active: route.path.startsWith('/accounts') }">
        账号管理
      </router-link>
      <router-link to="/publish/history" class="nav-item" :class="{ active: route.path.startsWith('/publish') }">
        发布记录
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
      <router-link to="/prompt-eval" class="nav-item" :class="{ active: route.path === '/prompt-eval' }">
        提示词评估
      </router-link>
      <button class="nav-item nav-settings-trigger" @click="openSettings">设置</button>
    </div>
    <div class="nav-right">
      <button v-if="authViewVisible" @click="closeLogin" class="btn-ghost-close">✕ 关闭登录</button>
      <button v-if="!licenseStore.isPro" @click="showUpgradeModal = true" class="pro-btn">⭐ 升级 Pro</button>
      <IdentityMenu />
      <div class="status-indicator">
        <span class="status-dot online"></span>
        服务运行中
      </div>
    </div>
  </nav>
  <UpgradeModal v-if="showUpgradeModal" @close="showUpgradeModal = false" />
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useLicenseStore } from '@/stores/license'
import { useAuthView } from '@/composables/useAuthView'
import UpgradeModal from '@/components/UpgradeModal.vue'
import IdentityMenu from '@/components/IdentityMenu.vue'

const emit = defineEmits(['openSettings'])

const route = useRoute()
const licenseStore = useLicenseStore()
const showUpgradeModal = ref(false)

function openSettings () {
  emit('openSettings')
}

// 登录视图
const { authViewVisible, registerListeners: registerAuthListeners, closeLogin } = useAuthView()

onMounted(() => {
  registerAuthListeners()
})

</script>
