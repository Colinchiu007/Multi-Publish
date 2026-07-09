// @ts-check
/**
 * useAutoUpdate.js — 自动更新 composable（从 App.vue 拆分）
 *
 * 职责：
 *   - 维护更新状态（available/downloading/downloaded/error/not-available）
 *   - 提供 handleUpdateStatus / handleDownload / handleInstall 方法
 *   - start/cleanup 管理监听器生命周期
 */
import { ref } from 'vue'
import { onUpdateStatus, updateCheck, updateDownload, updateInstall } from '@/api/publisher'

/**
 * 格式化下载速度
 * @param {number} bytesPerSecond
 * @returns {string}
 */
export function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond) return ''
  if (bytesPerSecond > 1024 * 1024) return (bytesPerSecond / 1024 / 1024).toFixed(1) + ' MB/s'
  if (bytesPerSecond > 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s'
  return bytesPerSecond + ' B/s'
}

/**
 * 自动更新 composable
 * @returns {object} 响应式状态 + 方法
 */
export function useAutoUpdate() {
  const showUpdateDialog = ref(false)
  const updateStatus = ref(null)
  const updateInfo = ref(null)
  const downloading = ref(false)
  const downloadPercent = ref(0)
  const downloadSpeed = ref('')
  const showNotAvailable = ref(false)
  const showError = ref(false)
  const updateError = ref('')
  let _cancelUpdateListen = null

  function handleUpdateStatus(payload) {
    if (!payload) return
    updateStatus.value = payload.type
    if (payload.type === 'available') {
      updateInfo.value = payload.data
      showUpdateDialog.value = true
    } else if (payload.type === 'downloading') {
      downloading.value = true
      downloadPercent.value = (payload.data && payload.data.percent) || 0
      downloadSpeed.value = formatSpeed(payload.data && payload.data.bytesPerSecond)
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
      setTimeout(function () { showNotAvailable.value = false }, 4000)
    }
  }

  function handleDownload() {
    downloading.value = true
    updateDownload().catch(function (e) {
      updateError.value = (e && e.message) || '下载失败'
      showError.value = true
      downloading.value = false
    })
  }

  function handleInstall() {
    updateInstall()
  }

  function start() {
    _cancelUpdateListen = onUpdateStatus(handleUpdateStatus)
    setTimeout(function () { updateCheck() }, 3000)
  }

  function cleanup() {
    if (_cancelUpdateListen) _cancelUpdateListen()
  }

  return {
    showUpdateDialog,
    updateStatus,
    updateInfo,
    downloading,
    downloadPercent,
    downloadSpeed,
    showNotAvailable,
    showError,
    updateError,
    handleUpdateStatus,
    handleDownload,
    handleInstall,
    start,
    cleanup,
    _cancelUpdateListen,
  }
}
