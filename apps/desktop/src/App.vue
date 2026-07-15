<template>
  <div>
    <OfflineIndicator />
    <AppNavbar @open-settings="showSettingsDialog = true" />

    <!-- 主体 -->
    <div class="cohere-app-body">
      <AppSidebar />
      <!-- 主内容 -->
      <main class="cohere-main">
        <router-view />
      </main>
    </div>

    <!-- 更新通知（弹窗 + Toast） -->
    <UpdateNotification />

    <!-- 设置弹窗（多 Tab） -->
    <SettingsDialog :visible="showSettingsDialog" @close="showSettingsDialog = false" />
  </div>
</template>

<script setup>
import AppNavbar from '@/layouts/AppNavbar.vue'
import AppSidebar from '@/layouts/AppSidebar.vue'
import OfflineIndicator from '@/components/OfflineIndicator.vue'
import UpdateNotification from '@/components/UpdateNotification.vue'
import SettingsDialog from '@/components/SettingsDialog.vue'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLicenseStore } from '@/stores/license'
// eslint-disable-next-line no-unused-vars
import TrialBanner from '@/components/TrialBanner.vue'

const router = useRouter()
const licenseStore = useLicenseStore()
// eslint-disable-next-line no-unused-vars
const dismissBanner = ref(false)

const showSettingsDialog = ref(false)

onMounted(() => {
  licenseStore.load()

  // 全局快捷键导航
  const api = window.electronAPI
  if (api && api.onNavigate) {
    api.onNavigate((route) => {
      router.push(route)
    })
  }
})
</script>

<style>
body { margin: 0; padding: 0; }
html, body { height: 100%; }
#app { height: 100%; }
</style>
