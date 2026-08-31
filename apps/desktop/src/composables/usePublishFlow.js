// @ts-check
/**
 * usePublishFlow.js — 单篇发布流程 composable（从 Publish.vue 拆分）
 *
 * 职责：
 *   - 维护 publishing / progress / result / copied 状态
 *   - handlePublish：标题/正文校验 → 敏感词预检 → 离线检测 → publishBatch → 进度回调
 *   - addProgress：进度条目追加
 *   - copyUrl：剪贴板复制（含 fallback）
 *
 * 依赖（参数传入，避免循环引用）：
 *   - article: reactive 对象 { title, content, author, cover_url, video_path }
 *   - selectedPlatforms: ref<string[]>
 *   - selectedAccounts: ref<{[platformId]: accountId}>
 *   - precheckEnabled: ref<boolean>
 */
import { ref, watch } from 'vue'
import i18n from '@/i18n'
import { formatUserError } from '@/utils/user-facing-error'
import { useLoginGate } from './useLoginGate'
import { useNotify } from './useNotify'
import { resolveNotifyText } from '@/utils/notifyCore'
import {
  publishBatch,
  onProgress,
  sensitiveCheck,
  offlineStatus,
  offlineAddToCache,
  schedulerCreate,
  schedulerCancel,
  cancelTask,
  storeGetSetting,
  storeSetSetting,
} from '@/api/publisher'
import {
  buildPublishTargets,
  normalizePublishFile,
  normalizePublishFiles,
  normalizePublishMentions,
  normalizePublishStringList,
  truncateByUtf8Bytes,
  validatePlatformContent,
  validatePublishMetadata,
  validatePublishTargets,
  validateScheduleEntries,
} from '@/features/publish/publish-contract'

const MARKDOWN_RE = /^#\s|^\*\*|^>\s|^```/m
const MARKDOWN_LINK_RE = /\[.+\]\(.+\)/

function isMarkdownContent(content) {
  return MARKDOWN_RE.test(content) || MARKDOWN_LINK_RE.test(content)
}

function nowTimeString() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizePlatformOverrides (overrides) {
  if (!overrides || typeof overrides !== 'object') return {}
  return Object.fromEntries(Object.entries(overrides).flatMap(([platform, value]) => {
    if (!value || typeof value !== 'object') return []
    const normalized = {
      title: typeof value.title === 'string' ? value.title : '',
      content: typeof value.content === 'string' ? value.content : '',
    }
    if (platform === 'zhihu') {
      const declaration = Number(value.declare)
      normalized.commentPermission = 'anyone'
      normalized.declare = Number.isInteger(declaration) && declaration >= 0 && declaration <= 5
        ? declaration
        : 0
      const topics = Array.isArray(value.topics)
        ? [...new Set(value.topics.filter(topic => typeof topic === 'string').map(topic => topic.trim()).filter(Boolean))]
        : []
      if (topics.length > 0) normalized.topics = topics
      if (value.draft === true) normalized.draft = true
    } else if (platform === 'douyin') {
      if (value.draft === true) normalized.draft = true
    } else if (platform === 'wechat_mp') {
      if (value.massSend === true) normalized.massSend = true
    }
    const hasExecutableOption = normalized.draft === true || normalized.massSend === true
    if (!normalized.title && !normalized.content && platform !== 'zhihu' && !hasExecutableOption) return []
    return [[platform, normalized]]
  }))
}

/**
 * 单篇发布流程 composable
 * @param {object} options
 * @param {object} options.article
 * @param {object} options.selectedPlatforms
 * @param {object} options.selectedAccounts
 * @param {object} options.precheckEnabled
 * @returns {object} 响应式状态 + 方法
 */
export function usePublishFlow(options) {
  const article = options.article
  const selectedPlatforms = options.selectedPlatforms
  const selectedAccounts = options.selectedAccounts
  const precheckEnabled = options.precheckEnabled
  const diffEdits = options.diffEdits || null
  const isAccountAvailable = typeof options.isAccountAvailable === 'function'
    ? options.isAccountAvailable
    : null
  const activeMode = options.activeMode || null
  // 主动操作登录门：发布前未登录 → 弹登录引导，登录成功后继续
  const { ensureLogin } = useLoginGate()
  // 统一通知通道（D1 决策）：toast/确认框走 useNotify，进度条文案走 resolveNotifyText
  const { notify, notifyError, notifySuccess, notifyWarning, notifyInfo, notifyConfirm } = useNotify()

  // 进度条文案解析（非 toast，组件内展示；M6 路径：文案统一进 locales）
  function progressText (messageKey, params, fallback) {
    const { text, resolved } = resolveNotifyText(messageKey, params)
    return resolved ? text : (fallback || '')
  }

  const publishing = ref(false)
  const progress = ref([])
  const result = ref(null)
  const copied = ref(false)
  const activeTaskIds = ref([])
  const activeScheduleIds = ref([])
  let precheckInitialized = false
  let loadingPrecheckPreference = false

  watch(precheckEnabled, value => {
    if (!precheckInitialized || loadingPrecheckPreference) return
    Promise.resolve(storeSetSetting('precheckEnabled', Boolean(value))).catch(() => {})
  }, { flush: 'sync' })

  async function loadPrecheckPreference() {
    loadingPrecheckPreference = true
    try {
      const value = await storeGetSetting('precheckEnabled')
      precheckEnabled.value = value === true || value === 'true'
    } catch (_) {
      precheckEnabled.value = false
    } finally {
      loadingPrecheckPreference = false
      precheckInitialized = true
    }
  }

  function addProgress(text, type) {
    const t = type === undefined ? 'primary' : type
    progress.value.push({ text: text, time: nowTimeString(), type: t })
  }

  function copyUrl(url) {
    return Promise.resolve()
      .then(function () {
        return navigator.clipboard.writeText(url)
      })
      .then(function () {
        copied.value = true
        setTimeout(function () { copied.value = false }, 2000)
      })
      .catch(function () {
        // fallback for older browsers
        const ta = document.createElement('textarea')
        ta.value = url
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        copied.value = true
        setTimeout(function () { copied.value = false }, 2000)
      })
  }

  async function notifyFailure (title, body) {
    // 统一通知通道：错误级 toast + notify:log 上报（替代 showNotification 死通道）
    notifyError('publishPage.publishFlow.publishFailed', { message: body, module: 'publishFlow' })
  }

  function getTargets () {
    return buildPublishTargets(selectedPlatforms.value, selectedAccounts.value)
  }

  function buildArticleData () {
    const md = isMarkdownContent(article.content)
    const imageFiles = normalizePublishFiles([
      ...normalizePublishFiles(article.image_files),
      ...normalizePublishFiles(article.images),
    ])
    const coverFile = normalizePublishFile(article.cover_file || article.cover_path || article.cover_url)
    const coverPath = coverFile?.path || String(article.cover_path || article.cover_url || '').trim()
    const tags = normalizePublishStringList(article.tags)
    const topics = normalizePublishStringList(article.topics)
    const mentions = normalizePublishMentions(article.mentions)
    const data = {
      title: article.title,
      content: article.content,
      contentFormat: md ? 'markdown' : 'html',
      author: article.author || '',
      cover_url: article.cover_url || '',
      video_path: article.video_path || '',
      precheck: precheckEnabled.value,
      platformOverrides: normalizePlatformOverrides(diffEdits),
    }
    // AI 生成内容声明：默认勾选（AI 生成内容），仅显式 false 时取消勾选。
    // 各平台发布时须如实声明内容创作方式，AI 生成内容不勾选会违规。
    data.aiGenerated = article.aiGenerated !== false
    if (imageFiles.length > 0) {
      data.images = imageFiles.map(file => file.path)
      data.image_files = imageFiles
    }
    if (coverPath) data.cover_path = coverPath
    if (coverFile) data.cover_file = coverFile
    if (tags.length > 0) data.tags = tags
    if (topics.length > 0) data.topics = topics
    if (mentions.length > 0) data.mentions = mentions
    return data
  }

  async function scheduleTargets (targets, data) {
    const scheduleIds = []
    activeScheduleIds.value = []
    try {
      for (const target of targets) {
        const res = await schedulerCreate(toPlainJson({
          platform: target.platform,
          publishTime: article.publishTime,
          article: { ...data, accountId: target.accountId },
        }))
        if (!res || res.code !== 0) {
          throw new Error(formatUserError(res, { fallback: progressText('publishPage.publishFlow.scheduleCreateFailed') }).message)
        }
        const scheduleId = res.data && res.data.id
        if (!scheduleId) throw new Error(progressText('publishPage.publishFlow.scheduleCreateNoId'))
        scheduleIds.push(scheduleId)
        activeScheduleIds.value = scheduleIds.slice()
      }
      return scheduleIds
    } catch (error) {
      const rollbackResults = await Promise.allSettled(
        scheduleIds.map(scheduleId => schedulerCancel(scheduleId)),
      )
      const rollbackFailedIds = scheduleIds.filter((scheduleId, index) => {
        const rollback = rollbackResults[index]
        return rollback.status === 'rejected' || !rollback.value || rollback.value.code !== 0 || rollback.value.data === false
      })
      activeScheduleIds.value = rollbackFailedIds
      if (rollbackFailedIds.length > 0) {
        const message = formatUserError(error, { fallback: progressText('publishPage.publishFlow.scheduleCreateFailed') }).message
        throw new Error(message + '；' + progressText('publishPage.publishFlow.scheduleRollbackFailed', { count: rollbackFailedIds.length }))
      }
      throw error
    }
  }

  async function handlePublish() {
    if (publishing.value) return
    // 主动操作登录门：未登录弹登录窗口，登录成功后继续发布
    if (!(await ensureLogin())) return
    if (!article.title.trim()) {
      notifyWarning('publishPage.titleRequired', { message: i18n.global.t('publishPage.titleRequired') })
      return
    }
    const isVideoMode = activeMode && activeMode.value === 'video'
    if (isVideoMode && !article.video_path) {
      notifyWarning('publishPage.publishFlow.videoFileRequired', { message: progressText('publishPage.publishFlow.videoFileRequired') })
      return
    }
    if (!isVideoMode && !article.content.trim()) {
      notifyWarning('publishPage.publishFlow.contentRequired', { message: progressText('publishPage.publishFlow.contentRequired') })
      return
    }
    if (!Array.isArray(selectedPlatforms.value) || selectedPlatforms.value.length === 0) {
      notifyWarning('publishPage.publishFlow.platformRequired', { message: progressText('publishPage.publishFlow.platformRequired') })
      return
    }

    const targets = getTargets()
    if (
      isAccountAvailable &&
      targets.some(target => target.accountId && !isAccountAvailable(target.platform, target.accountId))
    ) {
      notifyWarning('publishPage.publishFlow.accountInvalid', { message: progressText('publishPage.publishFlow.accountInvalid') })
      return
    }
    const targetCheck = validatePublishTargets(targets)
    if (!targetCheck.valid) {
      notifyWarning('publishPage.publishFlow.targetInvalid', { message: targetCheck.message })
      return
    }
    const metadataCheck = validatePublishMetadata(article)
    if (!metadataCheck.valid) {
      notifyWarning('publishPage.publishFlow.metadataInvalid', { message: metadataCheck.message })
      return
    }
    const contentCheck = validatePlatformContent({
      platforms: selectedPlatforms.value,
      article,
      platformOverrides: diffEdits || {},
    })
    if (!contentCheck.valid) {
      // 一键发布/历史视频预填场景：百家号标题按 UTF-8 字节数校验（上限 149 字节），
      // 预填文案可能超长。若仅因百家号标题超长失败，自动按字节截断标题后继续，
      // 避免阻断自动一站式流程；其他平台/字段超长仍提示并阻断，让用户手动调整。
      const autoTruncatable = contentCheck.platform === 'baijiahao' && contentCheck.field === 'title'
      if (autoTruncatable && Number.isFinite(contentCheck.limit) && contentCheck.limit > 0) {
        // 截断来源：若差异化面板为 baijiahao 单独设置了覆盖标题，则截断覆盖标题；
        // 否则截断全局标题。校验用 override.title || article.title，若只改 article.title
        // 则 override 路径截断失效，buildArticleData 仍会发送超长覆盖标题。
        const baijiahaoOverride = diffEdits && diffEdits.baijiahao && typeof diffEdits.baijiahao.title === 'string'
          ? diffEdits.baijiahao
          : null
        if (baijiahaoOverride) {
          baijiahaoOverride.title = truncateByUtf8Bytes(baijiahaoOverride.title, contentCheck.limit)
        } else {
          article.title = truncateByUtf8Bytes(article.title, contentCheck.limit)
        }
        addProgress(progressText('publishPage.publishFlow.baijiahaoTitleTruncated'), 'warning')
        // 截断到 149 字节（约 49 中文字符）后重新校验剩余平台：可能仍超过
        // xiaohongshu(20字)/toutiao(30字) 等更严格平台的上限，需重新校验并阻断。
        const recheck = validatePlatformContent({
          platforms: selectedPlatforms.value,
          article,
          platformOverrides: diffEdits || {},
        })
        if (!recheck.valid) {
          notifyWarning('publishPage.publishFlow.contentInvalid', { message: recheck.message })
          return
        }
      } else {
        notifyWarning('publishPage.publishFlow.contentInvalid', { message: contentCheck.message })
        return
      }
    }

    publishing.value = true
    progress.value = []
    result.value = null
    activeTaskIds.value = []
    activeScheduleIds.value = []
    let off
    const doneTaskIds = new Set()
    let taskTotal = 0

    try {
      // 敏感词预检
      if (sensitiveCheck) {
      const titleResult = await sensitiveCheck(article.title)
      const contentResult = await sensitiveCheck(article.content)
      const allWords = [].concat(
        (titleResult.data && titleResult.data.words) || [],
        (contentResult.data && contentResult.data.words) || []
      )
        if (allWords.length > 0) {
          const confirmed = await notifyConfirm('publishPage.publishFlow.sensitiveMessage', {
            params: { words: allWords.join('、') },
            title: progressText('publishPage.publishFlow.sensitiveTitle'),
            confirmButtonText: progressText('publishPage.publishFlow.sensitiveForcePublish'),
            cancelButtonText: progressText('publishPage.publishFlow.sensitiveModify'),
            type: 'warning',
          })
          if (!confirmed) return
        }
      }

      const data = buildArticleData()
      if (article.publishTime) {
        const scheduleCheck = validateScheduleEntries(
          targets.map(target => ({ ...target, publishTime: article.publishTime })),
        )
        if (!scheduleCheck.valid) {
          addProgress(progressText('publishPage.publishFlow.scheduleInvalidProgress', { message: scheduleCheck.message }), 'danger')
          result.value = { success: false, message: scheduleCheck.message }
          return
        }
      }

      // 离线检测
      const offlineRes = await offlineStatus()
      if (offlineRes && offlineRes.code === 0 && offlineRes.data && offlineRes.data.offline) {
        const cacheRes = await offlineAddToCache(toPlainJson({ targets, data }))
        if (!cacheRes || cacheRes.code !== 0 || cacheRes.data === false) {
          throw new Error((cacheRes && cacheRes.message) || progressText('publishPage.publishFlow.offlineCacheFailed'))
        }
        addProgress(progressText('publishPage.publishFlow.offlineProgress'), 'warning')
        notifyWarning('publishPage.publishFlow.offlineCached', { message: progressText('publishPage.publishFlow.offlineCached') })
        return
      }

      if (article.publishTime) {
        const scheduleIds = await scheduleTargets(targets, data)
        addProgress(progressText('publishPage.publishFlow.scheduleCreated', { count: scheduleIds.length }), 'success')
        result.value = { success: true, message: progressText('publishPage.publishFlow.scheduleCreatedResult'), scheduled: true }
        return
      }

      off = onProgress(function (data) {
        addProgress(progressText('publishPage.batchNotify.progressStage', { platform: data.platform, stage: data.stage }))
        // 后台任务结果实时回填（task:success / task:failed），全部完成才注销监听
        if (!data.taskId || !data.stage) return
        const isFinal = data.stage.indexOf('✓') === 0 || data.stage.indexOf('✗') === 0
        if (!isFinal) return
        doneTaskIds.add(data.taskId)
        if (data.stage.indexOf('✓') === 0) {
          result.value = { success: true, message: progressText('publishPage.publishFlow.publishSuccessMessage', { platform: data.platform }), url: (data.result && data.result.url) || '' }
        } else {
          result.value = { success: false, message: data.platform + ' ' + data.stage, url: '' }
        }
        if (taskTotal > 0 && doneTaskIds.size >= taskTotal && typeof off === 'function') {
          off()
        }
      })

      addProgress(progressText('publishPage.publishFlow.publishTargets', { count: targets.length }), 'info')
      const payload = toPlainJson({ targets, data })
      const res = await publishBatch(payload.targets, payload.data)
      if (res.code === 0) {
        activeTaskIds.value = Array.isArray(res.data && res.data.taskIds)
          ? res.data.taskIds.slice()
          : []
        taskTotal = activeTaskIds.value.length
        const count = taskTotal || ''
        addProgress(progressText('publishPage.publishFlow.taskAdded', { count }), 'success')
        result.value = { success: true, message: res.message || progressText('publishPage.publishFlow.taskQueued'), url: '' }
      } else {
        const message = formatUserError(res, { fallback: progressText('publishPage.publishFlow.publishFailedTitle') }).message
        addProgress(progressText('publishPage.publishFlow.publishFailedProgress', { message }), 'danger')
        result.value = { success: false, message }
        await notifyFailure(progressText('publishPage.publishFlow.publishFailedTitle'), message)
      }
    } catch (e) {
      const message = formatUserError(e, { fallback: progressText('publishPage.publishFlow.publishErrorTitle') }).message
      addProgress(progressText('publishPage.publishFlow.publishErrorProgress', { message }), 'danger')
      result.value = { success: false, message }
      await notifyFailure(progressText('publishPage.publishFlow.publishErrorTitle'), message)
    } finally {
      publishing.value = false
      if (typeof off === 'function') off()
    }
  }

  async function cancelPublish () {
    const taskIds = activeTaskIds.value.slice()
    const scheduleIds = activeScheduleIds.value.slice()
    if (taskIds.length === 0 && scheduleIds.length === 0) {
      notifyInfo('publishPage.noActiveTasks', { message: i18n.global.t('publishPage.noActiveTasks') })
      return { success: false, cancelled: 0 }
    }
    const results = await Promise.all([
      ...taskIds.map(id => cancelTask(id)),
      ...scheduleIds.map(id => schedulerCancel(id)),
    ])
    const cancelled = results.filter(item => item && item.code === 0 && item.data !== false).length
    activeTaskIds.value = []
    activeScheduleIds.value = []
    addProgress(progressText('publishPage.publishFlow.cancelledCount', { count: cancelled }), 'warning')
    result.value = { success: false, cancelled, message: progressText('publishPage.publishFlow.taskCancelled') }
    return { success: cancelled > 0, cancelled }
  }

  async function cancelPublish () {
    const taskIds = activeTaskIds.value.slice()
    const scheduleIds = activeScheduleIds.value.slice()
    if (taskIds.length === 0 && scheduleIds.length === 0) {
      notifyInfo('publishPage.noActiveTasks', { message: i18n.global.t('publishPage.noActiveTasks') })
      return { success: false, cancelled: 0, pending: 0 }
    }
    const results = await Promise.allSettled([
      ...taskIds.map(id => Promise.resolve().then(() => cancelTask(id))),
      ...scheduleIds.map(id => Promise.resolve().then(() => schedulerCancel(id))),
    ])
    const cancelledTaskIds = taskIds.filter((_, index) => isCancelSettled(results[index]))
    const cancelledScheduleIds = scheduleIds.filter((_, index) => {
      return isCancelSettled(results[taskIds.length + index])
    })
    const cancelled = cancelledTaskIds.length + cancelledScheduleIds.length
    activeTaskIds.value = taskIds.filter(id => !cancelledTaskIds.includes(id))
    activeScheduleIds.value = scheduleIds.filter(id => !cancelledScheduleIds.includes(id))
    const pendingCount = activeTaskIds.value.length + activeScheduleIds.value.length
    const message = buildCancelMessage(cancelled, pendingCount)
    const detail = pendingCount > 0
      ? message + i18n.global.t('publishPage.cancelledRetryHint')
      : message
    addProgress(detail, pendingCount > 0 ? 'danger' : 'warning')
    result.value = { success: false, cancelled, message }
    return {
      success: cancelled > 0 && pendingCount === 0,
      cancelled,
      pending: pendingCount,
    }
  }

  function isCancelSettled (settled) {
    return settled.status === 'fulfilled' &&
      settled.value &&
      settled.value.code === 0 &&
      settled.value.data !== false
  }

  function buildCancelMessage (cancelled, pending) {
    if (cancelled > 0 && pending > 0) {
      return i18n.global.t('publishPage.cancelPartial', { count: cancelled, failed: pending })
    }
    if (pending > 0) return i18n.global.t('publishPage.cancelFailed')
    return i18n.global.t('publishPage.cancelledCount', { count: cancelled })
  }


  async function retryPublish () {
    if (!result.value || result.value.success) {
      notifyInfo('publishPage.noFailedPublish', { message: i18n.global.t('publishPage.noFailedPublish') })
      return
    }
    return handlePublish()
  }

  return {
    publishing,
    progress,
    result,
    copied,
    activeTaskIds,
    activeScheduleIds,
    handlePublish,
    cancelPublish,
    retryPublish,
    loadPrecheckPreference,
    addProgress,
    copyUrl,
  }
}
