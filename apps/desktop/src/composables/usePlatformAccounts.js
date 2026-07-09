// @ts-check
/**
 * usePlatformAccounts.js — 平台账号 composable（从 App.vue 拆分）
 *
 * 职责：
 *   - 维护侧栏平台列表 + 多账号状态
 *   - 提供 loadAccounts / switchAccount 副作用方法
 *   - 提供 getDefaultAccount / getAccountText / getStatusClass / filterPlatforms 纯函数
 *
 * 设计：
 *   - 纯函数导出（可独立测试，参考 useProviderFilters 范式）
 *   - usePlatformAccounts() 返回响应式状态 + 方法（包装纯函数 + 副作用）
 */
import { ref, computed } from 'vue'

// 平台元数据（常量，与原 App.vue 一致）
export const platformMeta = {
  wechat_mp: { label: '微信公众号', icon: '💬' },
  zhihu: { label: '知乎', icon: '❓' },
  weibo: { label: '微博', icon: '✧' },
  douyin: { label: '抖音', icon: '🎵' },
  xiaohongshu: { label: '小红书', icon: '📕' },
  tencent_video: { label: '视频号', icon: '▶' },
  kuaishou: { label: '快手', icon: '🎬' },
  toutiao: { label: '今日头条', icon: '📰' },
  bilibili: { label: 'B站', icon: '📺' },
  baijiahao: { label: '百家号', icon: '📖' },
  yidian: { label: '一点号', icon: '📋' },
  youtube: { label: 'YouTube', icon: '▶' },
  tiktok: { label: 'TikTok', icon: '♪' },
  twitter: { label: 'X (Twitter)', icon: '✕' },
}

/**
 * 获取平台默认账号
 * @param {Array} accounts - 平台账号数组
 * @returns {object|null}
 */
export function getDefaultAccount(accounts) {
  if (!accounts || accounts.length === 0) return null
  return accounts.find(function (a) { return a.is_default }) || accounts[0]
}

/**
 * 获取账号显示文本
 * @param {Array} accounts - 平台账号数组
 * @returns {string}
 */
export function getAccountText(accounts) {
  const def = getDefaultAccount(accounts)
  return def ? def.name || '已登录' : '未登录'
}

/**
 * 获取账号状态 class
 * @param {Array} accounts - 平台账号数组
 * @returns {'online'|'offline'}
 */
export function getStatusClass(accounts) {
  const def = getDefaultAccount(accounts)
  if (!def) return 'offline'
  return def.status === 'active' || def.status === 'online' ? 'online' : 'offline'
}

/**
 * 过滤平台列表
 * @param {string[]} ids - 全部平台 ID
 * @param {string} search - 搜索词
 * @param {object} meta - 平台元数据
 * @returns {string[]}
 */
export function filterPlatforms(ids, search, meta) {
  if (!search) return ids
  const q = search.toLowerCase()
  return ids.filter(function (id) {
    return meta[id].label.toLowerCase().includes(q) || id.toLowerCase().includes(q)
  })
}

/**
 * 平台账号 composable
 * @returns {object} 响应式状态 + 方法
 */
export function usePlatformAccounts() {
  const platformSearch = ref('')
  const activePlatform = ref(null)
  const platformAccounts = ref({}) // { platformId: [account, ...] }
  const loaded = ref(false)

  const filteredPlatforms = computed(function () {
    return filterPlatforms(Object.keys(platformMeta), platformSearch.value, platformMeta)
  })

  async function loadAccounts() {
    const api = window.electronAPI
    if (!api || !api.accountList) {
      loaded.value = true
      return
    }
    try {
      const res = await api.accountList()
      if (res && res.code === 0 && Array.isArray(res.data)) {
        const grouped = {}
        for (const acc of res.data) {
          if (!grouped[acc.platform]) grouped[acc.platform] = []
          grouped[acc.platform].push(acc)
        }
        platformAccounts.value = grouped
      }
      loaded.value = true
    } catch (e) {
      console.warn('Failed to load accounts:', e)
      loaded.value = true
    }
  }

  async function switchAccount(platform, accountId) {
    const api = window.electronAPI
    if (!api || !api.accountSetDefault) return
    try {
      await api.accountSetDefault(platform, accountId)
      await loadAccounts()
    } catch (e) {
      console.warn('Failed to switch account:', e)
    }
  }

  function getAccountsForPlatform(platform) {
    return platformAccounts.value[platform] || []
  }

  return {
    platformSearch,
    activePlatform,
    platformAccounts,
    loaded,
    filteredPlatforms,
    loadAccounts,
    switchAccount,
    getAccountsForPlatform,
    getDefaultAccount: function (platform) {
      return getDefaultAccount(platformAccounts.value[platform])
    },
    getAccountText: function (platform) {
      return getAccountText(platformAccounts.value[platform])
    },
    getStatusClass: function (platform) {
      return getStatusClass(platformAccounts.value[platform])
    },
  }
}
