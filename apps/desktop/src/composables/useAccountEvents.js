import { ref } from 'vue'
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
