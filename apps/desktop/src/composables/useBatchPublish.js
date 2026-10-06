// @ts-check
/**
 * useBatchPublish.js — 批量发布 composable（从 Publish.vue 拆分）
 * 职责：batchMode/articles/batchProgress 状态 + 文章管理 + handleBatchPublish 流程
 * （batchCreate + batchSchedule/batchExecute）+ Pro 权限检查；参数：article、licenseStore。
 */
import { ref, computed, watch, getCurrentScope, onScopeDispose } from 'vue'
import { formatUserError } from '@/utils/user-facing-error'
import { useLoginGate } from './useLoginGate'
import { useNotify } from './useNotify'
import { resolveNotifyText } from '@/utils/notifyCore'
import {
  batchCreate,
  batchExecute,
  batchSchedule,
  batchCancel,
  batchGet,
  retryTask,
  onBatchProgress,
  offlineStatus,
  offlineAddToCache,
} from '@/api/publisher'
import {
  buildPublishTargets,
  normalizePublishFiles,
  normalizePublishMentions,
  normalizePublishStringList,
  validatePlatformContent,
  validatePublishMetadata,
  validatePublishTargets,
  validateScheduleEntries,
} from '@/features/publish/publish-contract'
import { convertBatchArticleItem } from '@/features/publish/platform-content-conversion'
import { isMarkdownContent, normalizePlatformOverrides } from '@/features/publish/publish-overrides'
import { resolveCoverFields } from '@/features/publish/publish-upload-file'
import { attachRewriteLineage } from '@/utils/rewrite-lineage'
import { usePublishProgressStore } from '@/stores/publishProgress'

let _keyCounter = 1

function freshKey() {
  return 'a_' + (_keyCounter++) + '_' + Date.now()
}

function toPlainJson(value) {
  return JSON.parse(JSON.stringify(value))
}

const DEFAULT_BATCH_STATUS_POLL_INTERVAL_MS = 5000
const DEFAULT_BATCH_STATUS_POLL_MAX_ATTEMPTS = 180

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback
}

/**
 * 批量发布 composable
 * @param {object} options
 * @param {object} options.article - 单篇模式 reactive article
 * @param {object} options.licenseStore - { isPro: boolean }
 * @returns {object} 响应式状态 + 方法
 */
export function useBatchPublish(options) {
  const article = options.article
  const licenseStore = options.licenseStore
  const isAccountAvailable = typeof options.isAccountAvailable === 'function'
    ? options.isAccountAvailable
    : null
  const batchStatusPollIntervalMs = positiveInteger(
    options.batchStatusPollIntervalMs,
    DEFAULT_BATCH_STATUS_POLL_INTERVAL_MS,
  )
  const batchStatusPollMaxAttempts = positiveInteger(
    options.batchStatusPollMaxAttempts,
    DEFAULT_BATCH_STATUS_POLL_MAX_ATTEMPTS,
  )
  // publish-progress-ux：全局进度 store（会话登记；进度事件由 App 级订阅接收）
  const publishProgressStore = usePublishProgressStore()
  // 主动操作登录门：批量发布前未登录 → 弹登录引导，登录成功后继续
  const { ensureLogin } = useLoginGate()
  // 统一通知通道（D1 决策）：toast/确认框走 useNotify，进度条文案走 resolveNotifyText
  const { notify, notifyError, notifySuccess, notifyWarning, notifyConfirm } = useNotify()

  // 进度条文案解析（非 toast，组件内展示；M6 路径：文案统一进 locales）
  function progressText (messageKey, params, fallback) {
    const { text, resolved } = resolveNotifyText(messageKey, params)
    return resolved ? text : (fallback || '')
  }

  const batchMode = ref(false)
  const batchPublishing = ref(false)
  const precheckEnabled = ref(false)
  const articles = ref([])
  const batchProgress = ref([])
  const failedBatchTasks = ref([])
  const retryingFailed = ref(false)
  // 当前会话已排期成功的批次 id：非 null 时页面显示「取消排期」入口
  // （与单篇的日历取消入口对齐——排期后必须能取消，否则用户只能干等到点）。
  const scheduledBatchId = ref(null)
  const templateTargetIdx = ref(-1)
  const showTemplatePicker = ref(false)
  let stopBatchProgress = null
  let batchStatusPollTimer = null

  function clearBatchStatusPollTimer() {
    if (batchStatusPollTimer !== null) {
      clearTimeout(batchStatusPollTimer)
      batchStatusPollTimer = null
    }
  }

  function clearBatchProgressListener() {
    if (typeof stopBatchProgress === 'function') {
      const stop = stopBatchProgress
      stopBatchProgress = null
      stop()
    }
  }

  function clearBatchTracking() {
    clearBatchStatusPollTimer()
    clearBatchProgressListener()
  }

  if (getCurrentScope()) {
    onScopeDispose(clearBatchTracking)
  }

  const batchDone = computed(function () {
    return batchProgress.value.filter(function (p) { return p.type === 'success' }).length
  })

  const batchFail = computed(function () {
    return batchProgress.value.filter(function (p) { return p.type === 'danger' }).length
  })

  const totalPlatformTasks = computed(function () {
    return articles.value.reduce(function (s, a) {
      return s + buildPublishTargets(a.platforms || [], a.accounts || a.selectedAccounts || {}).length
    }, 0)
  })

  function getArticleTargets (articleItem) {
    const normalized = buildPublishTargets(
      articleItem.platforms || [],
      articleItem.accounts || articleItem.selectedAccounts || {},
    )
    const hasExplicitAccount = normalized.some(target => target.accountId)
    // 新版发布路径始终发送结构化账号目标；旧调用未接入账号目录时保留兼容格式。
    if (isAccountAvailable) return normalized
    return hasExplicitAccount ? normalized : (articleItem.platforms || []).slice()
  }

  function checkBatchAccess() {
    if (batchMode.value && licenseStore && !licenseStore.isPro) {
      batchMode.value = false
    }
  }

  /**
   * 构造单篇文章的批量提交负载。
   * **单一实现**：在线提交（batchCreate）与离线缓存（offlineAddToCache）必须共用同一份
   * 构造——两份必然漂移，漂移表现为「离线缓存重放出去的文章字段与用户确认时看到的不一致」。
   * **P2-7 与单篇同口径**：键集与条件挂载规则必须与 usePublishFlow.buildArticleData 一致
   * （回归锁见 useBatchPublish.test.js「P2-7 与单篇键集 parity」；历史缺陷详录见该测试）。
   */
  function buildBatchArticlePayload (a) {
    const imageFiles = normalizePublishFiles(a.image_files || a.images)
    // 封面三键的互斥口径由共享实现持有（单篇同一条），本地封面不得被残留 URL 遮蔽
    const cover = resolveCoverFields(a)
    const tags = normalizePublishStringList(a.tagsText || a.tags)
    const topics = normalizePublishStringList(a.topicsText || a.topics)
    const mentions = normalizePublishMentions(a.mentionsText || a.mentions)
    const data = {
      title: a.title,
      content: a.content,
      // Markdown 判定复用单篇同一函数：两份判定必然漂移，漂移表现为平台侧按错误格式渲染
      contentFormat: isMarkdownContent(a.content) ? 'markdown' : 'html',
      platforms: getArticleTargets(a),
      publishTime: a.publishTime || null,
      precheck: precheckEnabled.value,
      author: a.author || '',
      cover_url: cover.cover_url,
      video_path: a.video_path || '',
      // P0-2：批量 payload 补 AI 声明，与单篇 buildArticleData 的 fail-safe 语义对齐
      aiGenerated: a.aiGenerated !== false,
      // P2-7：平台差异化内容经唯一归一实现（面板可编辑但发布不生效 = 装饰性字段）
      platformOverrides: normalizePlatformOverrides(a.platformOverrides),
    }
    // P1-5 语义级可见性：只有非空档位才挂键，由主进程 resolver 按注册表映射
    if (a.visibilitySemantic) data.visibilitySemantic = a.visibilitySemantic
    attachRewriteLineage(data, a.rewriteHistoryId) // 归因链：与单篇同一条挂载规则（判据在 utils/rewrite-lineage）
    if (imageFiles.length > 0) {
      data.images = imageFiles.map(file => file.path)
      data.image_files = imageFiles
    }
    if (cover.cover_path) data.cover_path = cover.cover_path
    if (cover.cover_file) data.cover_file = cover.cover_file
    if (tags.length > 0) data.tags = tags
    if (topics.length > 0) data.topics = topics
    if (mentions.length > 0) data.mentions = mentions
    return data
  }

  /**
   * 离线缓存的 targets 必须归一化为 `{ platform, accountId }` 对象数组。
   * `getArticleTargets` 在未接入账号目录时返回**字符串数组**（`['wechat_mp']`），
   * 而离线重放（offline-manager 的 expandCachedTask）只认带 platform 字段的对象——
   * 直接复用会把缓存写成永远重放不了的畸形条目。
   */
  function buildCacheTargets (a) {
    return buildPublishTargets(
      a.platforms || [],
      a.accounts || a.selectedAccounts || {},
    ).map(function (target) {
      return { platform: target.platform, accountId: target.accountId || null }
    })
  }

  function toggleBatchAccount (articleItem, platformId, accountId) {
    if (!articleItem.accounts) articleItem.accounts = {}
    const selected = Array.isArray(articleItem.accounts[platformId])
      ? articleItem.accounts[platformId].slice()
      : (articleItem.accounts[platformId] ? [articleItem.accounts[platformId]] : [])
    const index = selected.indexOf(accountId)
    if (index === -1) selected.push(accountId)
    else selected.splice(index, 1)
    articleItem.accounts[platformId] = selected
  }

  function isBatchAccountSelected (articleItem, platformId, accountId) {
    const value = articleItem?.accounts?.[platformId]
    return Array.isArray(value) ? value.includes(accountId) : value === accountId
  }

  function applyTemplate(data) {
    if (batchMode.value && templateTargetIdx.value >= 0) {
      const a = articles.value[templateTargetIdx.value]
      if (a) {
        a.title = data.title
        a.content = data.content
      }
    } else {
      article.title = data.title
      article.content = data.content
    }
    showTemplatePicker.value = false
  }

  function addArticle() {
    articles.value.push({
      _key: freshKey(),
      title: '',
      content: '',
      platforms: [],
      accounts: {},
      author: '',
      cover_url: '',
      cover_path: '',
      cover_file: null,
      video_path: '',
      images: [],
      image_files: [],
      tags: [],
      topics: [],
      mentions: [],
      // P0-2：批量模式补 AI 声明（与单篇默认勾选语义一致，仅显式 false 取消）
      aiGenerated: true,
      tagsText: '',
      topicsText: '',
      mentionsText: '',
      publishTime: '',
      // P2-7：条目级字段面。批量与单篇的语义差异在于「每篇内容各自不同」，
      // 因此差异化内容与可见性档位必须逐条目持有，不得共享同一对象引用。
      platformOverrides: {},
      visibilitySemantic: '',
    })
  }

  /**
   * P2-7 条目字段面 setter（逐条目作用域）。
   *
   * 为什么放在 composable 而不是组件里直接改 props 对象：字段写入点必须与 payload
   * 构造点同侧，才能被同一条键集 parity 回归锁覆盖；组件侧写 props 会让「有 UI 写点」
   * 与「进得了 payload」脱钩——那正是本切片修掉的原始形态（cover_* 有读点、无写点）。
   */
  function setBatchArticleCover (articleItem, descriptor) {
    if (!articleItem) return false
    if (!descriptor || !descriptor.path) return false
    articleItem.cover_file = descriptor
    articleItem.cover_path = descriptor.path
    return true
  }

  /**
   * 写「远程封面 URL」——与 setBatchArticleCover 成对存在的另一个封面写点。
   *
   * 只写 URL，不清本地封面：两者同时存在时 payload 侧由 resolveCoverFields 判「本地优先」，
   * 用户若要改用 URL 必须显式点「清除封面」（那是个破坏性动作，不该由一次打字代做）。
   * 界面靠 coverUrlOnlyHint 出声说明这一点，不靠静默覆盖。
   */
  function setBatchArticleCoverUrl (articleItem, value) {
    if (!articleItem) return
    articleItem.cover_url = typeof value === 'string' ? value : ''
  }

  function clearBatchArticleCover (articleItem) {
    if (!articleItem) return
    articleItem.cover_file = null
    articleItem.cover_path = ''
    articleItem.cover_url = ''
  }

  function setBatchArticleVisibility (articleItem, semantic) {
    if (!articleItem) return
    // 只接受注册表的三个语义档位与「清空」；非法值保持现状（不写脏值进 payload）
    if (semantic === '' || semantic === null || ['public', 'friends', 'private'].includes(semantic)) {
      articleItem.visibilitySemantic = semantic || ''
    }
  }

  function setBatchArticleOverrides (articleItem, next) {
    if (!articleItem) return
    // 整体替换 + 脱壳：面板发出的是新对象，浅引用共享会让两条目互相污染
    articleItem.platformOverrides = JSON.parse(JSON.stringify(next || {}))
  }

  function removeArticle(idx) {
    if (idx >= 0 && idx < articles.value.length) {
      articles.value.splice(idx, 1)
    }
  }

  function duplicateArticle(idx) {
    const orig = articles.value[idx]
    if (!orig) return
    articles.value.splice(idx + 1, 0, {
      title: orig.title,
      content: orig.content,
      platforms: orig.platforms ? orig.platforms.slice() : [],
      accounts: JSON.parse(JSON.stringify(orig.accounts || orig.selectedAccounts || {})),
      author: orig.author || '',
      cover_url: orig.cover_url || '',
      cover_path: orig.cover_path || '',
      cover_file: orig.cover_file || null,
      video_path: orig.video_path || '',
      images: orig.images ? orig.images.slice() : [],
      image_files: orig.image_files ? JSON.parse(JSON.stringify(orig.image_files)) : [],
      tags: orig.tags ? orig.tags.slice() : [],
      topics: orig.topics ? orig.topics.slice() : [],
      mentions: orig.mentions ? JSON.parse(JSON.stringify(orig.mentions)) : [],
      aiGenerated: orig.aiGenerated !== false,
      tagsText: orig.tagsText || '',
      topicsText: orig.topicsText || '',
      mentionsText: orig.mentionsText || '',
      publishTime: '',
      // P2-7：复制携带条目级字段面。platformOverrides 必须深拷贝——浅引用会让两条目
      // 共享同一对象，改一条动两条（用户以为在调本篇的差异化内容）。
      platformOverrides: JSON.parse(JSON.stringify(orig.platformOverrides || {})),
      visibilitySemantic: orig.visibilitySemantic || '',
      _key: freshKey(),
    })
    // 复制标题加后缀
    articles.value[idx + 1].title = orig.title + progressText('publishPage.batchNotify.duplicateSuffix')
  }

  async function retryFailedBatch () {
    if (retryingFailed.value || failedBatchTasks.value.length === 0) return
    retryingFailed.value = true
    const pending = failedBatchTasks.value.slice()
    const remaining = []
    let accepted = 0

    try {
      for (const task of pending) {
        try {
          const response = await retryTask(task.taskId)
          if (!response || response.code !== 0) {
            throw new Error(response?.message || '任务无法重试')
          }
          accepted += 1
          batchProgress.value.push({
            text: progressText('publishPage.batchNotify.progressRetrySubmitted', {
              platform: task.platform,
              title: task.title || task.taskId,
            }),
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: 'primary',
          })
        } catch (error) {
          remaining.push(task)
          batchProgress.value.push({
            text: progressText('publishPage.batchNotify.progressRetryFailed', {
              platform: task.platform,
              title: task.title || task.taskId,
              message: formatUserError(error, { fallback: progressText('publishPage.batchNotify.retryResubmitFailed') }).message,
            }),
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type: 'danger',
          })
        }
      }
      failedBatchTasks.value = remaining
      if (accepted > 0 && remaining.length === 0) {
        notifySuccess('publishPage.batchNotify.retrySuccess', { params: { accepted } })
      } else if (accepted > 0) {
        notifyWarning('publishPage.batchNotify.retryPartial', { params: { accepted, remaining: remaining.length } })
      } else {
        notifyError('publishPage.batchNotify.retryFailed')
      }
    } finally {
      retryingFailed.value = false
    }
  }

  async function handleBatchPublish() {
    if (batchPublishing.value) return
    // 主动操作登录门：未登录弹登录窗口，登录成功后继续批量发布
    if (!(await ensureLogin({ message: '批量发布功能需要登录后使用，是否立即登录？' }))) return
    batchPublishing.value = true

    let keepPublishingLock = false
    try {
      // 平台字数限制体系：逐条目收集截断记录（PRD §F3），确认弹窗汇总提示
      const conversionSummaries = []
      // 验证每篇文章
      for (const a of articles.value) {
        if (!a.title.trim()) {
          notifyWarning('publishPage.batchNotify.missingTitle')
          return
        }
        if (!a.content.trim()) {
          notifyWarning('publishPage.batchNotify.missingContent')
          return
        }
        if (!a.platforms || a.platforms.length === 0) {
          notifyWarning('publishPage.batchNotify.noPlatform', { params: { title: a.title.slice(0, 20) } })
          return
        }
        if (isAccountAvailable) {
          const targetCheck = validatePublishTargets(buildPublishTargets(a.platforms, a.accounts || a.selectedAccounts || {}))
          if (!targetCheck.valid) {
            notifyWarning('publishPage.batchNotify.targetInvalid', { params: { message: targetCheck.message } })
            return
          }
        }
        const metadataCheck = validatePublishMetadata({
          ...a,
          tags: a.tagsText || a.tags,
          topics: a.topicsText || a.topics,
          mentions: a.mentionsText || a.mentions,
          images: a.images || a.image_files,
          image_files: a.image_files || a.images,
        })
        if (!metadataCheck.valid) {
          notifyWarning('publishPage.batchNotify.metadataInvalid', { params: { title: a.title.slice(0, 20), message: metadataCheck.message } })
          return
        }
        // 平台字数限制体系（PRD-PLATFORM-CHAR-LIMITS-2026-10-02 §F3/§F4）：
        // ① 应用级 10000 字截断（写回条目，用户可见）；
        // ② 按平台生成差异化覆盖截断（取代「超限整批中止」——转换后仍超限才中止）。
        // 逐条目收集截断记录，确认弹窗汇总提示。转换编排单一实现在
        // platform-content-conversion.convertBatchArticleItem（单篇/批量共口径）。
        for (const notice of convertBatchArticleItem(a)) {
          conversionSummaries.push({
            title: a.title.slice(0, 20),
            detail: progressText(notice.key, notice.params),
          })
        }
        const contentCheck = validatePlatformContent({
          platforms: a.platforms,
          article: { title: a.title, content: a.content },
          platformOverrides: a.platformOverrides,
        })
        if (!contentCheck.valid) {
          notifyWarning('publishPage.batchNotify.contentInvalid', {
            params: { title: a.title.slice(0, 20), message: contentCheck.message },
          })
          return
        }
        if (
          isAccountAvailable &&
          buildPublishTargets(a.platforms, a.accounts || a.selectedAccounts || {})
            .some(target => target.accountId && !isAccountAvailable(target.platform, target.accountId))
        ) {
          notifyWarning('publishPage.batchNotify.accountInvalid')
          return
        }
      }

      const scheduleEntries = articles.value.flatMap(function (a) {
        if (!a.publishTime) return []
        return buildPublishTargets(
          a.platforms || [],
          a.accounts || a.selectedAccounts || {},
        ).map(function (target) {
          return { ...target, publishTime: a.publishTime }
        })
      })
      const scheduleCheck = validateScheduleEntries(scheduleEntries, { translate: (k, p) => progressText(`publishPage.scheduleValidation.${k}`, p) })
      if (!scheduleCheck.valid) {
        notifyWarning('publishPage.batchNotify.scheduleInvalid', { params: { message: scheduleCheck.message } })
        return
      }

      const confirmed = await notifyConfirm('publishPage.batchNotify.confirmMessage', {
        params: {
          count: articles.value.length,
          tasks: totalPlatformTasks.value,
          ...(conversionSummaries.length > 0
            ? { converted: progressText('publishPage.batchNotify.contentConverted', {
                count: conversionSummaries.length,
                details: conversionSummaries.map(item => `「${item.title}」${item.detail}`).join('；'),
              }) }
            : {}),
        },
        title: progressText('publishPage.batchNotify.confirmTitle'),
        confirmButtonText: progressText('publishPage.batchNotify.confirmButton'),
        cancelButtonText: progressText('publishPage.batchNotify.cancelButton'),
        type: 'warning',
      })
      if (!confirmed) return

      clearBatchTracking()
      batchProgress.value = []
      failedBatchTasks.value = []
      // publish-progress-ux：阶段级本地监听已删除——该监听在 finally 无条件注销，
      // 而 batchExecute 返回后任务才真正执行，阶段事件本就无人接收（死代码）。
      // 阶段进度由全局 store 的 App 级订阅承载（PublishProgressPanel）；本页保留
      // batch:progress 任务级监听 + batchGet 有界轮询驱动页面进度卡。

      // 离线检测（与单篇 usePublishFlow 对齐）：离线时不硬发，逐篇进离线缓存，
      // 网络恢复后由 offline-manager 按 `{targets, data}` 形状展开重放。
      const offlineRes = await offlineStatus()
      if (offlineRes && offlineRes.code === 0 && offlineRes.data && offlineRes.data.offline) {
        let cachedCount = 0
        for (const a of articles.value) {
          const cacheRes = await offlineAddToCache(toPlainJson({
            targets: buildCacheTargets(a),
            data: buildBatchArticlePayload(a),
          }))
          if (!cacheRes || cacheRes.code !== 0 || cacheRes.data === false) {
            const message = formatUserError(cacheRes, {
              fallback: progressText('publishPage.batchNotify.offlineCacheFailed'),
            }).message
            batchProgress.value.push({
              text: progressText('publishPage.batchNotify.offlineCacheFailed') + ': ' + message,
              time: new Date().toLocaleTimeString('zh-CN'),
              type: 'danger',
            })
            notifyError('publishPage.batchNotify.offlineCacheFailed', { message })
            return
          }
          cachedCount += 1
        }
        batchProgress.value.push({
          text: progressText('publishPage.batchNotify.offlineCached', { count: cachedCount }),
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'warning',
        })
        notifyWarning('publishPage.batchNotify.offlineCached', { params: { count: cachedCount } })
        return
      }

      const createRes = await batchCreate(toPlainJson({
        name: progressText('publishPage.batchNotify.batchNamePrefix') + new Date().toLocaleDateString('zh-CN'),
        articles: articles.value.map(buildBatchArticlePayload),
      }))

      if (!createRes || createRes.code !== 0) {
        throw new Error((createRes && createRes.message) || '创建批量任务失败')
      }
      if (!createRes.data || !createRes.data.id) {
        throw new Error('创建批量任务失败：响应缺少批次 ID')
      }

      const batchId = createRes.data.id
      // 检查是否有定时任务
      const hasScheduled = articles.value.some(function (a) { return a.publishTime })
      if (hasScheduled) {
        const scheduleRes = await batchSchedule(batchId)
        if (!scheduleRes || scheduleRes.code !== 0) {
          throw new Error((scheduleRes && scheduleRes.message) || progressText('publishPage.batchNotify.scheduleFailedFallback'))
        }
        // 排期成功才暴露取消入口（失败时不留可取消的幽灵状态）
        scheduledBatchId.value = batchId
        batchProgress.value.push({
          text: progressText('publishPage.batchNotify.progressScheduled', { count: articles.value.length }),
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'success',
        })
      } else {
        const expectedTaskCount = totalPlatformTasks.value
        let receivedTaskCount = 0
        let succeededTaskCount = 0
        let failedTaskCount = 0
        let completedBeforeSubscribe = false
        let batchSettled = false
        let pollAttempts = 0
        const seenTaskIds = new Set()

        const finishBatchProgress = function (counts) {
          if (batchSettled) return
          batchSettled = true
          batchPublishing.value = false
          const succeeded = counts && Number.isInteger(counts.succeeded)
            ? counts.succeeded
            : succeededTaskCount
          const failed = counts && Number.isInteger(counts.failed)
            ? counts.failed
            : failedTaskCount
          const total = counts && Number.isInteger(counts.total)
            ? counts.total
            : expectedTaskCount

          if (failed === total && total > 0) {
            notifyError('publishPage.batchNotify.publishAllFailed', { params: { failed } })
          } else if (failed > 0) {
            notifyWarning('publishPage.batchNotify.publishPartial', { params: { succeeded, failed } })
          } else {
            notifySuccess('publishPage.batchNotify.publishSuccess', { params: { succeeded } })
          }

          if (stopBatchProgress) clearBatchTracking()
          else completedBeforeSubscribe = true
        }

        const unsubscribe = onBatchProgress(function (data) {
          if (!data || (data.batchId && data.batchId !== batchId)) return
          if (data.kind === 'batch-complete') {
            finishBatchProgress(data)
            return
          }
          if (data.taskId && seenTaskIds.has(data.taskId)) return
          if (data.taskId) seenTaskIds.add(data.taskId)

          const title = String(data.title || '').slice(0, 20)
          const platform = data.platform || progressText('publishPage.batchNotify.unknownPlatform')
          batchProgress.value.push({
            text: data.ok
              ? progressText('publishPage.batchNotify.progressTaskSuccess', { platform, title })
              : progressText('publishPage.batchNotify.progressTaskFailed', { platform, title, message: data.message || progressText('publishPage.batchNotify.taskFailedFallback') }),
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            type: data.ok ? 'success' : 'danger',
          })
          if (!data.ok && typeof data.taskId === 'string' && data.taskId &&
              !failedBatchTasks.value.some(task => task.taskId === data.taskId)) {
            failedBatchTasks.value.push({
              taskId: data.taskId,
              platform,
              title,
            })
          }

          receivedTaskCount += 1
          if (data.ok) succeededTaskCount += 1
          else failedTaskCount += 1
          if (receivedTaskCount >= expectedTaskCount) finishBatchProgress()
        })
        stopBatchProgress = typeof unsubscribe === 'function' ? unsubscribe : null
        if (completedBeforeSubscribe) clearBatchTracking()

        const executeRes = await batchExecute(batchId)
        if (!executeRes || executeRes.code !== 0) {
          throw new Error((executeRes && executeRes.message) || '批量执行失败')
        }
        // publish-progress-ux：登记全局会话（按 batchId 归属）——全局面板跨路由跟踪，
        // 任务条目由进度事件按 batchId 动态归入（PRD-PUBLISH-PROGRESS-UX §5.4）
        publishProgressStore.registerSession({
          batchId,
          title: progressText('publishPage.batchNotify.batchNamePrefix') + new Date().toLocaleDateString('zh-CN'),
        })
        const executeContract = executeRes.data && typeof executeRes.data === 'object'
          ? executeRes.data
          : executeRes
        const acceptedCount = Number.isInteger(executeContract.accepted)
          ? executeContract.accepted
          : expectedTaskCount
        const enqueueFailedCount = Number.isInteger(executeContract.failed)
          ? executeContract.failed
          : 0
        batchProgress.value.push({
          text: enqueueFailedCount > 0
            ? progressText('publishPage.batchNotify.progressAcceptedPartial', { accepted: acceptedCount, failed: enqueueFailedCount })
            : progressText('publishPage.batchNotify.progressAccepted', { accepted: acceptedCount }),
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'primary',
        })

        const pollBatchStatus = async function () {
          if (batchSettled) return
          pollAttempts += 1
          try {
            if (typeof batchGet === 'function') {
              const statusRes = await batchGet(batchId)
              const status = statusRes && statusRes.code === 0 ? statusRes.data : null
              if (status && status.status === 'done') {
                const completed = Number.isInteger(status.completed) ? status.completed : expectedTaskCount
                const failed = Number.isInteger(status.failed) ? status.failed : failedTaskCount
                finishBatchProgress({
                  total: Number.isInteger(status.total) ? status.total : expectedTaskCount,
                  succeeded: Math.max(0, completed - failed),
                  failed,
                })
                return
              }
            }
          } catch (_) {
            // IPC 瞬时失败由下一次有界轮询重试，达到上限后统一提示。
          }

          if (batchSettled) return
          if (pollAttempts >= batchStatusPollMaxAttempts) {
            batchSettled = true
            batchPublishing.value = false
            notifyError('publishPage.batchNotify.statusTimeout')
            clearBatchTracking()
            return
          }
          scheduleBatchStatusPoll()
        }

        const scheduleBatchStatusPoll = function () {
          if (batchSettled) return
          batchStatusPollTimer = setTimeout(function () {
            batchStatusPollTimer = null
            void pollBatchStatus()
          }, batchStatusPollIntervalMs)
          if (batchStatusPollTimer && typeof batchStatusPollTimer.unref === 'function') {
            batchStatusPollTimer.unref()
          }
        }

        if (!batchSettled) {
          keepPublishingLock = true
          scheduleBatchStatusPoll()
        }
      }
    } catch (e) {
      keepPublishingLock = false
      clearBatchTracking()
      batchProgress.value.push({
        text: progressText('publishPage.batchNotify.progressFailed', { message: formatUserError(e, { fallback: progressText('publishPage.batchNotify.unknownError') }).message }),
        time: new Date().toLocaleTimeString('zh-CN'),
        type: 'danger',
      })
    } finally {
      if (!keepPublishingLock) batchPublishing.value = false
    }
  }

  // 批量模式切换时初始化
  watch(batchMode, function (val) {
    if (val && articles.value.length === 0) addArticle()
  })

  /**
   * 取消当前会话已排期的批次（与单篇日历取消入口对齐）。
   * 平台侧定时（2026-10-07）：排期已连同时间提交给平台，由平台服务器到点发布；
   * 主进程 `batch:cancel` 负责把本地记录置 cancelled。取消结果**以主进程返回为准**，
   * 渲染层不自标记成功 —— 否则用户看到「已取消」而平台照发，正是要消灭的静默失败。
   * ⚠️ 平台侧排期是否真正撤销取决于平台是否提供撤销接口（参考产品实测：不提供），
   * 因此本地取消只作废本地记录，UI 文案须如实说明这一点。
   * 失败时**保留** scheduledBatchId 供用户重试，不自作主张清空。
   */
  async function cancelScheduledBatch () {
    if (!scheduledBatchId.value) return
    const batchId = scheduledBatchId.value
    try {
      const res = await batchCancel(batchId)
      if (!res || res.code !== 0) {
        const message = formatUserError(res, {
          fallback: progressText('publishPage.batchNotify.cancelScheduleFailed'),
        }).message
        notifyError('publishPage.batchNotify.cancelScheduleFailed', { message })
        return
      }
      scheduledBatchId.value = null
      batchProgress.value.push({
        text: progressText('publishPage.batchNotify.scheduleCancelled'),
        time: new Date().toLocaleTimeString('zh-CN'),
        type: 'warning',
      })
      notifySuccess('publishPage.batchNotify.scheduleCancelled')
    } catch (error) {
      const message = formatUserError(error, {
        fallback: progressText('publishPage.batchNotify.cancelScheduleFailed'),
      }).message
      notifyError('publishPage.batchNotify.cancelScheduleFailed', { message })
    }
  }

  return {
    batchMode,
    batchPublishing,
    precheckEnabled,
    articles,
    batchProgress,
    failedBatchTasks,
    retryingFailed,
    scheduledBatchId,
    templateTargetIdx,
    showTemplatePicker,
    batchDone,
    batchFail,
    totalPlatformTasks,
    addArticle,
    removeArticle,
    duplicateArticle,
    handleBatchPublish,
    cancelScheduledBatch,
    retryFailedBatch,
    applyTemplate,
    checkBatchAccess,
    toggleBatchAccount,
    isBatchAccountSelected,
    // P2-7 批量条目字段面写入点
    setBatchArticleCover,
    setBatchArticleCoverUrl,
    clearBatchArticleCover,
    setBatchArticleVisibility,
    setBatchArticleOverrides,
  }
}
