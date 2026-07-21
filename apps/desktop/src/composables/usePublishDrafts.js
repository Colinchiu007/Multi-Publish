// @ts-check
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { draftDelete, draftList, draftSave } from '@/api/publisher'

const ARTICLE_FIELDS = [
  'title',
  'content',
  'author',
  'cover_url',
  'video_path',
  'publishTime',
]

function toPlainJson (value) {
  return JSON.parse(JSON.stringify(value))
}

function replaceRecord (target, source) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, toPlainJson(source || {}))
}

function errorMessage (error, fallback) {
  return error && error.message ? error.message : fallback
}

/**
 * 发布草稿用例。页面只负责打开面板和转发用户操作。
 * @param {object} options
 * @param {Record<string, unknown>} options.article
 * @param {{ value: string[] }} options.selectedPlatforms
 * @param {{ value: Record<string, unknown> }} options.selectedAccounts
 * @param {Record<string, unknown>} options.platformOverrides
 */
export function usePublishDrafts ({
  article,
  selectedPlatforms,
  selectedAccounts,
  platformOverrides,
}) {
  const showDraftList = ref(false)
  const drafts = ref([])
  const loadingDrafts = ref(false)

  function buildDraftSnapshot () {
    const snapshot = {
      id: 'draft_' + Date.now(),
      platforms: toPlainJson(selectedPlatforms.value || []),
      accounts: toPlainJson(selectedAccounts.value || {}),
      platformOverrides: toPlainJson(platformOverrides || {}),
    }
    for (const field of ARTICLE_FIELDS) snapshot[field] = article[field] || ''
    return snapshot
  }

  function applyDraft (draft) {
    if (!draft || typeof draft !== 'object') return false
    for (const field of ARTICLE_FIELDS) article[field] = draft[field] || ''
    selectedPlatforms.value = Array.isArray(draft.platforms)
      ? toPlainJson(draft.platforms)
      : []
    selectedAccounts.value = draft.accounts && typeof draft.accounts === 'object'
      ? toPlainJson(draft.accounts)
      : {}
    replaceRecord(platformOverrides, draft.platformOverrides)
    showDraftList.value = false
    return true
  }

  async function loadDrafts () {
    loadingDrafts.value = true
    try {
      const result = await draftList()
      if (!result || result.code !== 0) {
        throw new Error((result && result.message) || '草稿读取失败')
      }
      drafts.value = Array.isArray(result.data) ? result.data : []
      return drafts.value
    } catch (error) {
      drafts.value = []
      ElMessage.error(errorMessage(error, '草稿读取失败'))
      return []
    } finally {
      loadingDrafts.value = false
    }
  }

  async function saveDraft () {
    if (!String(article.title || '').trim() && !String(article.content || '').trim()) {
      ElMessage.warning('标题和内容不能都为空')
      return false
    }
    try {
      const result = await draftSave(buildDraftSnapshot())
      if (!result || result.code !== 0) {
        throw new Error((result && result.message) || '草稿保存失败')
      }
      ElMessage.success('草稿已保存')
      await loadDrafts()
      return true
    } catch (error) {
      ElMessage.error(errorMessage(error, '草稿保存失败'))
      return false
    }
  }

  async function loadDraft (draftId) {
    const draft = drafts.value.find(item => item && item.id === draftId)
    if (!draft) {
      ElMessage.error('草稿不存在或已被删除')
      return false
    }
    applyDraft(draft)
    ElMessage.success('已加载草稿')
    return true
  }

  async function removeDraft (draftId) {
    try {
      const result = await draftDelete(draftId)
      if (!result || result.code !== 0) {
        throw new Error((result && result.message) || '草稿删除失败')
      }
      await loadDrafts()
      ElMessage.success('草稿已删除')
      return true
    } catch (error) {
      ElMessage.error(errorMessage(error, '草稿删除失败'))
      return false
    }
  }

  return {
    showDraftList,
    drafts,
    loadingDrafts,
    buildDraftSnapshot,
    applyDraft,
    loadDrafts,
    saveDraft,
    loadDraft,
    removeDraft,
  }
}
