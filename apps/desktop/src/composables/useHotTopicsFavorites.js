// useHotTopicsFavorites — 热门选题收藏逻辑（owner-scoped 持久化经 IPC）
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { hotTopicsFavoriteAdd, hotTopicsFavoriteRemove, hotTopicsFavoriteList } from '@/api/hot-topics'

export function useHotTopicsFavorites() {
  const { t } = useI18n()
  const activeTab = ref('hot')
  const favorites = ref([])
  const favPendingIds = new Set()

  const favoritedIds = computed(() =>
    new Set(favorites.value.filter(f => f.topic).map(f => f.topic.id)),
  )

  function isFavorited(topicId) {
    return favoritedIds.value.has(topicId)
  }

  async function toggleFavorite(topic) {
    if (!topic?.id || favPendingIds.has(topic.id)) return
    favPendingIds.add(topic.id)
    try {
      if (isFavorited(topic.id)) {
        const res = await hotTopicsFavoriteRemove(topic.id)
        if (res && res.code === 0 && res.data) {
          favorites.value = favorites.value.filter(f => f.topic?.id !== topic.id)
        }
      } else {
        const res = await hotTopicsFavoriteAdd(topic)
        if (res && res.code === 0 && res.data) {
          // 后端去重已返回已有条目时，不重复 unshift
          if (!favorites.value.some(f => f.topic?.id === topic.id)) {
            favorites.value.unshift(res.data)
          }
        }
      }
    } finally {
      favPendingIds.delete(topic.id)
    }
  }

  async function loadFavorites() {
    try {
      const res = await hotTopicsFavoriteList()
      if (res && res.code === 0 && Array.isArray(res.data)) {
        favorites.value = res.data
      }
    } catch (_) { /* 收藏加载失败不影响热门选题列表 */ }
  }

  async function removeFavorite(topicId) {
    if (!topicId) return
    const res = await hotTopicsFavoriteRemove(topicId)
    if (res && res.code === 0) {
      favorites.value = favorites.value.filter(f => f.topic?.id !== topicId)
    }
  }

  function formatHotValue(v) {
    if (v >= 10000) return (v / 10000).toFixed(1) + t('hotTopics.tenThousand')
    return String(v)
  }

  function getTopicSummary(topic) {
    const channel = topic.channel
      ? t('hotTopics.channels.' + topic.channel)
      : ''
    const category = t('hotTopics.categories.' + (topic.category || 'general'))
    const rank = topic.rank || '—'
    const hot = topic.hotValue ? formatHotValue(topic.hotValue) : '—'
    return t('hotTopics.topicSummary', { channel, rank, category, hotValue: hot })
  }

  function formatFavoritedAt(ts) {
    const d = new Date(ts)
    const pad = n => String(n).padStart(2, '0')
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  }

  return {
    activeTab, favorites,
    isFavorited, toggleFavorite, loadFavorites, removeFavorite,
    formatHotValue, getTopicSummary, formatFavoritedAt,
  }
}
