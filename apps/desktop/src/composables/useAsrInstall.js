/**
 * useAsrInstall —— 采集链路的 ASR 运行时安装流程（M-16 重构）
 *
 * 为什么要抽出来（这不是"为了减行数而减行数"）
 * --------------------------------------------------
 * Collection.vue 早已 2700+ 行并被 max-lines 门禁挂账（登记 2721、容差 200，
 * 实际长期贴着 +198 走）。修 M-16 需要往里加「卸载时取消 1200ms 重试计时器」
 * 这几行，而那几行正好把它推过 +200 —— 门禁当场报 LEDGER_GREW。
 *
 * 与其把注释压到 0 行、用「后推覆盖」的方式绕过门禁，不如把这一块本来就独立的
 * 关注点搬出去：ASR 安装的「订阅进度事件 → 调主进程 → 成功后延时重试」是一条
 * 自成闭环的流程，和采集列表、草稿、视频采集都无关。与 M-4 把批量轮询抽成
 * `useBatchPollGuard` 是同一个动作。
 *
 * 附带修掉 M-16 的根因
 * ----------------------
 * 原实现的 1200ms 自动重试用裸 `setTimeout`，句柄无处可存，卸载时无法取消；
 * 进度事件订阅靠组件里的 `asrInstallUnsubscribe` 手动在 onUnmounted 里清理 ——
 * 也就是说**清理逻辑存在但不在同一个地方**，新增计时器时极容易只加业务不加工��
 * （本次缺陷正是如此）。抽成 composable 后，订阅与计时器都由本模块持有并提供
 * `stop()`，组件只需在 onUnmounted 调一次，两类副作用再也分不掉。
 */
import { ref, onUnmounted } from 'vue'

const RETRY_DELAY_MS = 1200

export function useAsrInstall({ getApi, resolveNotifyText, formatUserError, notifySuccess, onRetry }) {
  const visible = ref(false)
  const stage = ref('')
  const detail = ref('')
  const percent = ref(0)
  const error = ref('')

  let pendingUrl = ''
  let progressUnsubscribe = null
  let retryTimer = null

  // 暴露为 ref：安装成功后要重试的原始采集 URL 是有意义的状态，且调用方/测试
  // 需要能读到它（此前它是组件里的一个裸 let，重构后仍不该消失）。
  const pendingUrlRef = ref('')

  function stop () {
    if (progressUnsubscribe) { progressUnsubscribe(); progressUnsubscribe = null }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
    pendingUrl = ''; pendingUrlRef.value = ''
  }
  onUnmounted(stop)

  function close () {
    visible.value = false
    pendingUrl = ''; pendingUrlRef.value = ''
  }

  async function start () {
    const api = getApi()
    if (!api || typeof api.aggregationAsrInstall !== 'function') {
      stage.value = 'failed'
      error.value = resolveNotifyText('collection.collectUnavailable').text
      return
    }
    stage.value = 'checking'
    detail.value = resolveNotifyText('collection.asrInstallChecking').text
    error.value = ''

    // 订阅进度事件（安装/下载阶段实时推送）
    if (progressUnsubscribe) progressUnsubscribe()
    if (typeof api.onAsrInstallProgress === 'function') {
      progressUnsubscribe = api.onAsrInstallProgress((p) => {
        if (!p || !p.stage) return
        stage.value = p.stage
        if (p.detail) detail.value = p.detail
        if (typeof p.percent === 'number') percent.value = p.percent
      })
    }

    try {
      const res = await api.aggregationAsrInstall()
      if (res && res.code === 0) {
        stage.value = 'done'
        detail.value = resolveNotifyText('collection.asrInstallDone').text
        notifySuccess('collection.collectSuccess')
        // 安装成功 → 关闭弹窗，自动重试原采集请求
        const retryUrl = pendingUrl
        if (retryTimer) clearTimeout(retryTimer)
        retryTimer = setTimeout(() => {
          retryTimer = null
          close()
          if (retryUrl) onRetry(retryUrl)
        }, RETRY_DELAY_MS)
      } else {
        stage.value = 'failed'
        error.value = (res && res.message) || resolveNotifyText('collection.asrInstallFailed').text
      }
    } catch (e) {
      stage.value = 'failed'
      error.value = formatUserError(e, { fallback: resolveNotifyText('collection.asrInstallFailed').text }).message
    }
  }

  function prepare (url) {
    // 只重置状态并展示弹窗，**不自动开始安装** —— 安装由用户在弹窗里点按钮触发。
    stage.value = ''
    detail.value = ''
    percent.value = 0
    error.value = ''
    pendingUrl = url || ''; pendingUrlRef.value = url || ''
    visible.value = true
  }

  function requireInstall (url) {
    prepare(url)
    return start()
  }

  return { visible, stage, detail, percent, error, pendingUrl: pendingUrlRef, start, close, stop, prepare, requireInstall }
}