import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlatformDefinitions } from '@/api/publisher'

/**
 * 平台元数据 Store
 * 统一管理平台列表、名称、标签，替代 5 处以上的重复定义
 * 从后端 IPC 拉取数据作为单一数据源
 */
export const usePlatformStore = defineStore('platforms', () => {
  const platforms = ref([])
  const names = ref({})
  const icons = ref({})
  const contentCategories = ref({})  // PRD F9: { platformId -> 'VIDEO'|'IMAGE_TEXT'|'MIXED' }
  const categories = ref({})
  const dashboardUrls = ref({})
  const qrCodePlatforms = ref([])
  const loaded = ref(false)
  const loading = ref(false)

  // 默认硬编码（IPC 不可用时回退）
  const DEFAULT_ICONS = {
    wechat_mp: '💬', zhihu: '❓', weibo: '✧', douyin: '🎵',
    xiaohongshu: '📕', tencent_video: '▶', kuaishou: '🎬', toutiao: '📰',
    bilibili: '📺', baijiahao: '📖', youtube: '▶', tiktok: '♪',
    twitter: '✕', instagram: '📷', facebook: '👍',
  }

  // PRD F9 PlatformCategory 默认映射（与 config/platforms.yaml 一致）
  const DEFAULT_CONTENT_CATEGORIES = {
    wechat_mp: 'IMAGE_TEXT', zhihu: 'IMAGE_TEXT', baijiahao: 'IMAGE_TEXT', instagram: 'IMAGE_TEXT',
    douyin: 'VIDEO', tencent_video: 'VIDEO', kuaishou: 'VIDEO', youtube: 'VIDEO', tiktok: 'VIDEO', bilibili: 'VIDEO',
    weibo: 'MIXED', xiaohongshu: 'MIXED', toutiao: 'MIXED', twitter: 'MIXED', facebook: 'MIXED',
  }

  const DEFAULT_CATEGORIES = {
    wechat_mp: '中文', zhihu: '中文', weibo: '中文', douyin: '中文', xiaohongshu: '中文',
    tencent_video: '中文', kuaishou: '中文', toutiao: '中文', bilibili: '中文', baijiahao: '中文',
    youtube: '海外', tiktok: '海外', twitter: '海外', instagram: '海外', facebook: '海外',
  }

  const DEFAULT_DASHBOARD_URLS = {
    wechat_mp: 'https://mp.weixin.qq.com/', zhihu: 'https://www.zhihu.com/', weibo: 'https://weibo.com/',
    douyin: 'https://creator.douyin.com/', xiaohongshu: 'https://creator.xiaohongshu.com/',
    tencent_video: 'https://channels.weixin.qq.com/', kuaishou: 'https://cp.kuaishou.com/',
    toutiao: 'https://mp.toutiao.com/', bilibili: 'https://www.bilibili.com/',
    baijiahao: 'https://baijiahao.baidu.com/', youtube: 'https://studio.youtube.com/',
    tiktok: 'https://www.tiktok.com/', twitter: 'https://twitter.com/home',
    instagram: 'https://www.instagram.com/', facebook: 'https://www.facebook.com/',
  }

  const DEFAULT_QR_CODE_PLATFORMS = ['wechat_mp', 'tencent_video', 'zhihu', 'weibo', 'toutiao']

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
      const res = await getPlatformDefinitions()
      if (res && res.code === 0 && res.data) {
        const {
          names: nameMap,
          icons: iconMap,
          content_categories: contentCategoryMap,
          categories: categoryMap,
          dashboardUrls: dashboardMap,
          qrCodePlatforms: qrPlatforms,
        } = res.data
        names.value = nameMap || {}
        icons.value = iconMap || {}
        contentCategories.value = contentCategoryMap || {}
        categories.value = { ...DEFAULT_CATEGORIES, ...(categoryMap || {}) }
        dashboardUrls.value = { ...DEFAULT_DASHBOARD_URLS, ...(dashboardMap || {}) }
        qrCodePlatforms.value = Array.isArray(qrPlatforms) ? qrPlatforms.slice() : DEFAULT_QR_CODE_PLATFORMS.slice()
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
    contentCategories.value = { ...DEFAULT_CONTENT_CATEGORIES }
    categories.value = { ...DEFAULT_CATEGORIES }
    dashboardUrls.value = { ...DEFAULT_DASHBOARD_URLS }
    qrCodePlatforms.value = DEFAULT_QR_CODE_PLATFORMS.slice()
    loaded.value = true
  }

  function getLabel(id) {
    return names.value[id] || id
  }

  function getIcon(id) {
    return icons.value[id] || ''
  }

  function getCategory(id) {
    return categories.value[id] || DEFAULT_CATEGORIES[id] || ''
  }

  function getDashboardUrl(id) {
    return dashboardUrls.value[id] || ''
  }

  function supportsQrCode(id) {
    return qrCodePlatforms.value.includes(id)
  }

  // PRD F9: 获取平台内容类型分类
  function getContentCategory(id) {
    return contentCategories.value[id] || DEFAULT_CONTENT_CATEGORIES[id] || null
  }

  // PRD F9: 按内容类型分类获取平台列表
  function getPlatformsByContentCategory(category) {
    return platforms.value.filter(p => getContentCategory(p.id) === category)
  }

  return {
    platforms, names, icons, contentCategories, categories, dashboardUrls, qrCodePlatforms,
    loaded, loading, load, getLabel, getIcon, getCategory, getDashboardUrl, supportsQrCode,
    getContentCategory, getPlatformsByContentCategory,
  }
})
