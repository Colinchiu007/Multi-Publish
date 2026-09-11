import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { i18n } from '@/i18n'
import {
  onAccountStatusChanged,
  onAuthCompleted,
  onAuthViewClosed,
  onAuthViewOpened,
  onQrCodeClosed,
  onQrCodeCompleted,
  onQrCodeDetected,
  onQrCodeOpened,
} from '@/api/publisher'

/** 自动保存成功后的全局提示文案（i18n，zh/en 成对维护于 locales）。 */
function autoSavedToastText (data) {
  try {
    const t = i18n.global.t.bind(i18n.global)
    const platform = data?.platform || ''
    return platform
      ? t('accountsPage.autoSavedWithPlatform', { platform })
      : t('accountsPage.autoSaved')
  } catch (_) {
    return ''
  }
}

export function useAccountEvents (options = {}) {
  const loginVisible = ref(false)
  const loginMode = ref(null)
  const platform = ref('')
  const qrStatus = ref('idle')
  const qrImage = ref(null)
  const isListening = ref(false)
  const lastError = ref(null)
  let cleanups = []

  function subscribe (register, callback) {
    try {
      const cleanup = register(callback)
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    } catch (_) { /* Electron bridge 在纯浏览器环境不可用时保持静默 */ }
  }

  function markOpening (mode, platformId) {
    loginVisible.value = true
    loginMode.value = mode
    platform.value = platformId || ''
    if (mode === 'qrcode') {
      qrStatus.value = 'opening'
      qrImage.value = null
    }
  }

  function reportError (error, context) {
    const normalized = error instanceof Error ? error : new Error(String(error || '账号事件处理失败'))
    lastError.value = normalized
    if (typeof options.onError !== 'function') return
    try {
      const pending = options.onError(normalized, context)
      if (pending && typeof pending.catch === 'function') pending.catch(() => {})
    } catch (_) { /* 错误提示本身失败时避免产生第二个未处理异常 */ }
  }

  function invokeOption (name, args, context) {
    if (typeof options[name] !== 'function') return
    try {
      const pending = options[name](...args)
      if (pending && typeof pending.catch === 'function') {
        pending.catch(error => reportError(error, context))
      }
    } catch (error) {
      reportError(error, context)
    }
  }

  function complete (data, mode) {
    loginVisible.value = false
    loginMode.value = null
    if (mode === 'qrcode') {
      qrStatus.value = 'completed'
      qrImage.value = null
    }
    // 全局成功提示：凭证已由主进程自动保存（CDP/URL 检测自动完成或手动保存），
    // 无论用户当前停留在哪个页面都能看到反馈；页面级 onCompleted 仍负责各自刷新。
    const toast = autoSavedToastText(data)
    if (toast) ElMessage.success(toast)
    invokeOption('onCompleted', [data, mode], 'completed')
  }

  function start () {
    if (isListening.value) return
    isListening.value = true
    subscribe(onAuthViewOpened, data => markOpening('browser', data?.platform))
    subscribe(onAuthCompleted, data => complete(data, 'browser'))
    subscribe(onAuthViewClosed, () => {
      loginVisible.value = false
      loginMode.value = null
    })
    subscribe(onQrCodeOpened, data => {
      markOpening('qrcode', data?.platform)
      qrStatus.value = 'waiting'
    })
    subscribe(onQrCodeDetected, data => {
      platform.value = data?.platform || platform.value
      qrStatus.value = 'detected'
      qrImage.value = data?.image || null
    })
    subscribe(onQrCodeCompleted, data => complete(data, 'qrcode'))
    subscribe(onQrCodeClosed, () => {
      loginVisible.value = false
      loginMode.value = null
      if (qrStatus.value !== 'completed') qrStatus.value = 'closed'
      qrImage.value = null
    })
    subscribe(onAccountStatusChanged, data => {
      invokeOption('onStatusChanged', [data], 'status-changed')
    })
  }

  function stop () {
    for (const cleanup of cleanups.splice(0)) cleanup()
    isListening.value = false
    loginVisible.value = false
    loginMode.value = null
    platform.value = ''
    qrStatus.value = 'idle'
    qrImage.value = null
    lastError.value = null
  }

  return {
    loginVisible,
    loginMode,
    platform,
    qrStatus,
    qrImage,
    isListening,
    lastError,
    markOpening,
    start,
    stop,
  }
}
