// @ts-check
/**
 * useBatchPublish.js — 批量发布 composable（从 Publish.vue 拆分）
 *
 * 职责：
 *   - 维护 batchMode / articles / batchProgress / templateTargetIdx / precheckEnabled 状态
 *   - addArticle / removeArticle / duplicateArticle / applyTemplate 文章管理
 *   - handleBatchPublish 批量发布流程（batchCreate + batchSchedule/batchExecute）
 *   - checkBatchAccess 权限检查（Pro 才能用批量模式）
 *   - watch batchMode 切换时自动初始化 articles
 *
 * 依赖（参数传入）：
 *   - article: reactive 对象（单篇模式 applyTemplate 目标）
 *   - licenseStore: { isPro: boolean }
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { batchCreate, onProgress } from '@/api/publisher'

let _keyCounter = 1

function freshKey() {
  return 'a_' + (_keyCounter++) + '_' + Date.now()
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

  const batchMode = ref(false)
  const precheckEnabled = ref(false)
  const articles = ref([])
  const batchProgress = ref([])
  const templateTargetIdx = ref(-1)
  const showTemplatePicker = ref(false)

  const batchDone = computed(function () {
    return batchProgress.value.filter(function (p) { return p.type === 'success' }).length
  })

  const batchFail = computed(function () {
    return batchProgress.value.filter(function (p) { return p.type === 'danger' }).length
  })

  const totalPlatformTasks = computed(function () {
    return articles.value.reduce(function (s, a) {
      return s + (a.platforms ? a.platforms.length : 0)
    }, 0)
  })

  function checkBatchAccess() {
    if (batchMode.value && licenseStore && !licenseStore.isPro) {
      batchMode.value = false
    }
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
      publishTime: '',
    })
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
      publishTime: '',
      _key: freshKey(),
    })
    // 复制标题加后缀
    articles.value[idx + 1].title = orig.title + ' (复制)'
  }

  async function handleBatchPublish() {
    // 验证每篇文章
    for (const a of articles.value) {
      if (!a.title.trim()) {
        ElMessage.warning('有文章缺少标题')
        return
      }
      if (!a.content.trim()) {
        ElMessage.warning('有文章缺少正文')
        return
      }
      if (!a.platforms || a.platforms.length === 0) {
        ElMessage.warning('"' + a.title.slice(0, 20) + '" 未选择发布平台')
        return
      }
    }

    const off = onProgress(function (data) {
      batchProgress.value.push({
        text: '[' + data.platform + '] ' + data.stage,
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        type: data.type || 'primary',
      })
    })

    try {
      const createRes = await batchCreate({
        name: '批量发布 ' + new Date().toLocaleDateString('zh-CN'),
        articles: articles.value.map(function (a) {
          return {
            title: a.title,
            content: a.content,
            platforms: a.platforms,
            publishTime: a.publishTime || null,
            precheck: precheckEnabled.value,
          }
        }),
      })

      if (createRes.code !== 0) {
        throw new Error(createRes.message)
      }

      const batchId = createRes.data.id
      const api = window.electronAPI

      // 检查是否有定时任务
      const hasScheduled = articles.value.some(function (a) { return a.publishTime })
      if (hasScheduled) {
        await api.batchSchedule(batchId)
        batchProgress.value.push({
          text: '✅ 已排期 ' + articles.value.length + ' 篇文章',
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'success',
        })
      } else {
        const off2 = api.onBatchProgress(function (data) {
          batchProgress.value.push({
            text: data.ok
              ? '✅ [' + data.platform + '] ' + data.title.slice(0, 20) + ': 发布成功'
              : '❌ [' + data.platform + '] ' + data.title.slice(0, 20) + ': ' + data.message,
            time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            type: data.ok ? 'success' : 'danger',
          })
        })

        await api.batchExecute(batchId)
        batchProgress.value.push({
          text: '🚀 ' + articles.value.length + ' 篇文章已提交发布',
          time: new Date().toLocaleTimeString('zh-CN'),
          type: 'primary',
        })
        off2()
      }
    } catch (e) {
      batchProgress.value.push({
        text: '❌ 批量发布失败: ' + e.message,
        time: new Date().toLocaleTimeString('zh-CN'),
        type: 'danger',
      })
    } finally {
      off()
    }
  }

  // 批量模式切换时初始化
  watch(batchMode, function (val) {
    if (val && articles.value.length === 0) addArticle()
  })

  return {
    batchMode,
    precheckEnabled,
    articles,
    batchProgress,
    templateTargetIdx,
    showTemplatePicker,
    batchDone,
    batchFail,
    totalPlatformTasks,
    addArticle,
    removeArticle,
    duplicateArticle,
    handleBatchPublish,
    applyTemplate,
    checkBatchAccess,
  }
}
