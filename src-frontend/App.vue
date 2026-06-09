<template>
  <el-container style="height: 100vh">
    <el-aside width="220px" style="background: #304156">
      <el-menu
        :default-active="currentRoute"
        background-color="#304156"
        text-color="#bfcbd9"
        active-text-color="#409eff"
        router
        style="height: 100%; border-right: none"
      >
        <div style="padding: 20px; color: #fff; font-size: 18px; text-align: center; border-bottom: 1px solid #1f2d3d">
          📢 Multi-Publish
        </div>
        <el-menu-item index="/publish">
          <el-icon><Upload /></el-icon>
          <span>一键发布</span>
        </el-menu-item>
        <el-menu-item index="/dashboard">
          <el-icon><DataAnalysis /></el-icon>
          <span>统计看板</span>
        </el-menu-item>
        <el-menu-item index="/accounts">
          <el-icon><User /></el-icon>
          <span>账号管理</span>
        </el-menu-item>
        <el-menu-item index="/">
          <el-icon><InfoFilled /></el-icon>
          <span>关于</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-main style="background: #f0f2f5; padding: 24px">
      <router-view />
    </el-main>

    <!-- 更新可用通知 -->
    <el-dialog
      v-model="showUpdateDialog"
      title="📦 发现新版本"
      width="400px"
      :close-on-click-modal="false"
    >
      <div v-if="updateStatus === 'available'">
        <p>新版本 <strong>{{ updateInfo?.version }}</strong> 可用</p>
        <el-button type="primary" @click="handleDownload" :loading="downloading">
          {{ downloading ? '下载中...' : '下载更新' }}
        </el-button>
      </div>
      <div v-else-if="updateStatus === 'downloading'" style="text-align: center">
        <p>正在下载更新...</p>
        <el-progress :percentage="downloadPercent" :stroke-width="12" />
        <p style="font-size: 12px; color: #999;">{{ downloadSpeed }}</p>
      </div>
      <div v-else-if="updateStatus === 'downloaded'">
        <p>✅ 更新已下载完成</p>
        <el-button type="primary" @click="handleInstall">
          立即重启安装
        </el-button>
      </div>
    </el-dialog>

    <!-- 前台通知条 -->
    <div
      v-if="updateStatus === 'not-available' && showNotAvailable"
      style="position: fixed; bottom: 16px; right: 16px; z-index: 2000"
    >
      <el-alert title="当前已是最新版本" type="success" show-icon :closable="true" @close="showNotAvailable = false" />
    </div>
    <div
      v-if="updateStatus === 'error' && showError"
      style="position: fixed; bottom: 16px; right: 16px; z-index: 2000"
    >
      <el-alert :title="'更新失败: ' + updateError" type="warning" show-icon :closable="true" @close="showError = false" />
    </div>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { Upload, User, InfoFilled, DataAnalysis } from '@element-plus/icons-vue'
<<<<<<< HEAD
import { onUpdateStatus, updateCheck, updateDownload, updateInstall } from '@/api/publisher'
=======
>>>>>>> origin/main

const route = useRoute()
const currentRoute = computed(() => route.path)

// 更新状态
const showUpdateDialog = ref(false)
const updateStatus = ref(null)
const updateInfo = ref(null)
const downloading = ref(false)
const downloadPercent = ref(0)
const downloadSpeed = ref('')
const showNotAvailable = ref(false)
const showError = ref(false)
const updateError = ref('')
let cancelUpdateListen = null

function formatSpeed (bytesPerSecond) {
  if (!bytesPerSecond) return ''
  if (bytesPerSecond > 1024 * 1024) return (bytesPerSecond / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bytesPerSecond > 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s'
  return bytesPerSecond + ' B/s'
}

function handleUpdateStatus (payload) {
  if (!payload) return
  updateStatus.value = payload.type
  if (payload.type === 'available') {
    updateInfo.value = payload.data
    showUpdateDialog.value = true
  } else if (payload.type === 'downloading') {
    downloading.value = true
    downloadPercent.value = payload.data.percent || 0
    downloadSpeed.value = formatSpeed(payload.data.bytesPerSecond)
  } else if (payload.type === 'downloaded') {
    downloading.value = false
    downloadPercent.value = 100
    showUpdateDialog.value = true
  } else if (payload.type === 'error') {
    updateError.value = payload.data || '未知错误'
    showError.value = true
    showUpdateDialog.value = false
    downloading.value = false
  } else if (payload.type === 'not-available') {
    if (!showUpdateDialog.value) showNotAvailable.value = true
    setTimeout(() => { showNotAvailable.value = false }, 4000)
  }
}

function handleDownload () {
  updateDownload()
}
function handleInstall () {
  updateInstall()
}

onMounted(() => {
  cancelUpdateListen = onUpdateStatus(handleUpdateStatus)
  // 启动后检查更新
  setTimeout(() => updateCheck(), 3000)
})

onBeforeUnmount(() => {
  if (cancelUpdateListen) cancelUpdateListen()
})
</script>

<style>
body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
</style>