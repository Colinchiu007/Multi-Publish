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
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { publishBatch, onProgress, sensitiveCheck, offlineStatus, offlineAddToCache } from '@/api/publisher'

const MARKDOWN_RE = /^#\s|^\*\*|^>\s|^```/m
const MARKDOWN_LINK_RE = /\[.+\]\(.+\)/

function isMarkdownContent(content) {
  return MARKDOWN_RE.test(content) || MARKDOWN_LINK_RE.test(content)
}

function nowTimeString() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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

  const publishing = ref(false)
  const progress = ref([])
  const result = ref(null)
  const copied = ref(false)

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

  async function handlePublish() {
    if (!article.title.trim()) {
      ElMessage.warning('请输入文章标题')
      return
    }
    if (!article.content.trim()) {
      ElMessage.warning('请输入正文内容')
      return
    }

    // 敏感词预检
    if (sensitiveCheck) {
      const titleResult = await sensitiveCheck(article.title)
      const contentResult = await sensitiveCheck(article.content)
      const allWords = [].concat(
        (titleResult.data && titleResult.data.words) || [],
        (contentResult.data && contentResult.data.words) || []
      )
      if (allWords.length > 0) {
        try {
          await ElMessageBox.confirm(
            '发布内容包含敏感词：' + allWords.join('、') + '，是否仍然发布？',
            '敏感词提示',
            { confirmButtonText: '强制发布', cancelButtonText: '修改', type: 'warning' }
          )
        } catch (e) {
          return // 用户取消
        }
      }
    }

    // 离线检测
    const targets = selectedPlatforms.value.map(function (pid) {
      return { platform: pid, accountId: selectedAccounts.value[pid] || null }
    })
    const offlineRes = await offlineStatus()
    if (offlineRes.code === 0 && offlineRes.data.offline) {
      await offlineAddToCache({ targets: targets, data: article })
      addProgress('📡 网络已断开，发布任务已缓存，网络恢复后自动重试', 'warning')
      ElMessage.warning('网络已断开，任务已缓存')
      publishing.value = false
      return
    }

    publishing.value = true
    progress.value = []
    result.value = null

    const off = onProgress(function (data) {
      addProgress('[' + data.platform + '] ' + data.stage)
    })

    try {
      const md = isMarkdownContent(article.content)
      const data = {
        title: article.title,
        content: article.content,
        contentFormat: md ? 'markdown' : 'html',
        author: article.author || '',
        cover_url: article.cover_url || '',
        video_path: article.video_path || '',
        precheck: precheckEnabled.value,
      }
      addProgress('发布到 ' + targets.length + ' 个目标（含多账号）...', 'info')
      const res = await publishBatch(targets, data)
      if (res.code === 0) {
        const count = (res.data && res.data.taskIds && res.data.taskIds.length) || ''
        addProgress('✓ 已添加 ' + count + ' 个任务', 'success')
        result.value = { success: true, message: res.message || '任务已加入队列', url: '' }
      } else {
        addProgress('✗ 发布失败: ' + res.message, 'danger')
        result.value = { success: false, message: res.message }
      }
    } catch (e) {
      addProgress('✗ 错误: ' + e.message, 'danger')
      result.value = { success: false, message: e.message }
    } finally {
      publishing.value = false
      off()
    }
  }

  return {
    publishing,
    progress,
    result,
    copied,
    handlePublish,
    addProgress,
    copyUrl,
  }
}
