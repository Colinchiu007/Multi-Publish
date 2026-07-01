import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * 平台元数据 Store
 * 统一管理平台列表、名称、标签，替代 5 处以上的重复定义
 * 从后端 IPC 拉取数据作为单一数据源
 */
export const usePlatformStore = defineStore('platforms', () => {
  const platforms = ref([])
  const names = ref({})
  const icons = ref({})
  const loaded = ref(false)
  const loading = ref(false)
  const loading = ref(false)

  // 默认硬编码（IPC 不可用时回退）
  const DEFAULT_ICONS = {
    wechat_mp: '💬', zhihu: '❓', weibo: '✧', douyin: '🎵',
    xiaohongshu: '📕', tencent_video: '▶', kuaishou: '🎬', toutiao: '📰',
    bilibili: '📺', baijiahao: '📖', youtube: '▶', tiktok: '♪',
    twitter: '✕', instagram: '📷', facebook: '👍',
  }

  const DEFAULT_PLATFORMS = [
    { id: 'wechat_mp', label: '微信公众号' },
    { id: 'zhihu', label: '知乎' },
    { id: 'weibo', label: '微博' },
    { id: 'douyin', label: '抖音' },
    { id: 'xiaohongshu', label: '小红书' },
    { id: 'tencent_video', label: '视频号' },
    { id: 'kuaishou', label: '快手' },
    { id: 'toutiao', label: '今日头条' },
    { id: 'bilibili', label: 'B站', tag: '新' },
    { id: 'baijiahao', label: '百家号' },
    { id: 'youtube', label: 'YouTube' },
    { id: 'tiktok', label: 'TikTok' },
    { id: 'twitter', label: 'Twitter/X' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'facebook', label: 'Facebook' },

  ]

  async function load() {
    if (loaded.value) return
    loading.value = true
    try {
      const res = await window.electronAPI.getPlatformDefinitions()
      if (res && res.code === 0 && res.data) {
        const { names: nameMap, icons: iconMap } = res.data
        names.value = nameMap || {}
        icons.value = iconMap || {}
        platforms.value = Object.entries(nameMap || {}).map(([id, label]) => ({ id, label }))
        loaded.value = true
      } else {
        useFallback()
      }
    } catch (e) {
      console.warn('[PlatformStore] 拉取平台数据失败，使用默认值:', e.message)
      useFallback()
    } finally {
      loading.value = false
    }
  }

  function useFallback() {
    platforms.value = DEFAULT_PLATFORMS
    names.value = Object.fromEntries(DEFAULT_PLATFORMS.map(p => [p.id, p.label]))
    icons.value = DEFAULT_ICONS
    loaded.value = true
  }

  function getLabel(id) {
    return names.value[id] || id
  }

  function getIcon(id) {
    return icons.value[id] || ''
  }

  return { platforms, names, icons, loaded, loading, load, getLabel, getIcon }
})
