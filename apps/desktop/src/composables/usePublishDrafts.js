// @ts-check
import { ref } from 'vue'
import { draftDelete, draftList, draftSave } from '@/api/publisher'
import { formatUserError } from '@/utils/user-facing-error'
import i18n from '@/i18n'
import { useNotify } from './useNotify'

const t = (key) => i18n.global.t(key)

const ARTICLE_FIELDS = [
  'title',
  'content',
  'author',
  'cover_url',
  'cover_path',
  'cover_file',
  'video_path',
  'images',
  'image_files',
  'tags',
  'topics',
  'mentions',
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
  return formatUserError(error, { fallback }).message
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
  // 统一通知通道（D1 决策）：toast 走 useNotify（带 notify:log 上报）
  const { notifyError, notifySuccess, notifyWarning } = useNotify()
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
    for (const field of ARTICLE_FIELDS) snapshot[field] = toPlainJson(article[field] || '')
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
      notifyError('publishDrafts.loadFailed', { message: errorMessage(error, t('publishDrafts.loadFailed')) })
      return []
    } finally {
      loadingDrafts.value = false
    }
  }

  async function saveDraft () {
    if (!String(article.title || '').trim() && !String(article.content || '').trim()) {
      notifyWarning('publishDrafts.emptyTitleContent', { message: t('publishDrafts.emptyTitleContent') })
      return false
    }
    try {
      const result = await draftSave(buildDraftSnapshot())
      if (!result || result.code !== 0) {
        throw new Error((result && result.message) || t('publishDrafts.saveFailed'))
      }
      notifySuccess('publishDrafts.saved', { message: t('publishDrafts.saved') })
      await loadDrafts()
      return true
    } catch (error) {
      notifyError('publishDrafts.saveFailed', { message: errorMessage(error, t('publishDrafts.saveFailed')) })
      return false
    }
  }

  async function loadDraft (draftId) {
    const draft = drafts.value.find(item => item && item.id === draftId)
    if (!draft) {
      notifyError('publishDrafts.notFound', { message: t('publishDrafts.notFound') })
      return false
    }
    applyDraft(draft)
    notifySuccess('publishDrafts.loaded', { message: t('publishDrafts.loaded') })
    return true
  }

  async function removeDraft (draftId) {
    try {
      const result = await draftDelete(draftId)
      if (!result || result.code !== 0) {
        throw new Error((result && result.message) || t('publishDrafts.deleteFailed'))
      }
      await loadDrafts()
      notifySuccess('publishDrafts.deleted', { message: t('publishDrafts.deleted') })
      return true
    } catch (error) {
      notifyError('publishDrafts.deleteFailed', { message: errorMessage(error, t('publishDrafts.deleteFailed')) })
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
