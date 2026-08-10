import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/**
 * 标签页 Store — 浏览器式标签管理
 *
 * 与主进程 WebviewManager 通过 IPC 通信，
 * 维护前端 reactive 状态，驱动 TabBar / NavBar 组件。
 */
export const useTabStore = defineStore('tabs', () => {
  // ── State ──
  const tabs = ref([])
  const activeTabId = ref(null)
  const navigation = ref({
    url: '',
    title: '',
    canGoBack: false,
    canGoForward: false,
    loading: false
  })

  // ── Unsubscribe handles ──
  const _unsubscribes = []

  // ── Getters ──
  const activeTab = computed(() => tabs.value.find(t => t.tabId === activeTabId.value) || null)
  const isHomeTab = computed(() => activeTab.value?.isHome === true)
  const hasTabs = computed(() => tabs.value.length > 0)
  const tabCount = computed(() => tabs.value.length)

  // ── Internal: 获取 pageManager API ──
  function _api() {
    const api = window.electronAPI?.pageManager
    if (!api) {
      console.warn('[tabStore] pageManager API not available')
      return null
    }
    return api
  }

  // ── Internal: 刷新完整 tab 列表 ──
  async function _refreshTabs() {
    const api = _api()
    if (!api) return
    try {
      const result = await api.getAllTabs()
      if (result?.code === 0 && Array.isArray(result.data)) {
        tabs.value = result.data
        // 确保 activeTabId 同步
        const active = result.data.find(t => t.isActive)
        if (active) activeTabId.value = active.tabId
      }
    } catch (e) {
      console.error('[tabStore] refreshTabs failed:', e)
    }
  }

  // ── Internal: 刷新导航状态 ──
  async function _refreshNavigation() {
    const api = _api()
    if (!api) return
    try {
      const result = await api.getActiveTab()
      if (result?.code === 0 && result.data) {
        navigation.value = {
          url: result.data.url || '',
          title: result.data.title || '',
          canGoBack: !!result.data.canGoBack,
          canGoForward: !!result.data.canGoForward,
          loading: !!result.data.loading
        }
      }
    } catch (e) {
      console.error('[tabStore] refreshNavigation failed:', e)
    }
  }

  // ── Actions ──

  /**
   * 初始化：订阅主进程事件，加载初始状态
   * 应在 App.vue onMounted 中调用
   */
  async function init() {
    const api = _api()
    if (!api) return

    // 订阅事件
    _unsubscribes.push(
      api.onTabEvent('tab-created', () => _refreshTabs()),
      api.onTabEvent('tab-closed', () => _refreshTabs()),
      api.onTabEvent('tab-switched', () => {
        _refreshTabs()
        _refreshNavigation()
      }),
      api.on('tab-loading', (data) => {
        if (data?.tabId === activeTabId.value) {
          navigation.value.loading = true
        }
      }),
      api.on('tab-finished-loading', (data) => {
        if (data?.tabId === activeTabId.value) {
          navigation.value.loading = false
        }
      }),
      api.onNavigationChanged((data) => {
        if (data?.tabId === activeTabId.value) {
          navigation.value = {
            url: data.url || '',
            title: data.title || '',
            canGoBack: !!data.canGoBack,
            canGoForward: !!data.canGoForward,
            loading: false
          }
          // 更新 tab 列表中的 title
          const tab = tabs.value.find(t => t.tabId === data.tabId)
          if (tab) {
            tab.title = data.title || tab.title
            tab.url = data.url || tab.url
          }
        }
      })
    )

    // 订阅主进程事件流
    await api.subscribeEvents()

    // 加载初始状态
    await _refreshTabs()
    await _refreshNavigation()
  }

  /**
   * 销毁：取消所有订阅
   */
  async function dispose() {
    const api = _api()
    if (api) {
      for (const unsub of _unsubscribes) {
        try { unsub() } catch (_) { /* ignore */ }
      }
      _unsubscribes.length = 0
      await api.unsubscribeEvents()
    }
  }

  /**
   * 创建新标签页
   * @param {Object} opts - { url, cookies, accountId, platform }
   * @returns {string|null} tabId
   */
  async function createTab(opts = {}) {
    const api = _api()
    if (!api) return null
    try {
      const result = await api.createNewTabPage(opts)
      if (result?.code === 0 && result.data?.tabId) {
        await _refreshTabs()
        return result.data.tabId
      }
    } catch (e) {
      console.error('[tabStore] createTab failed:', e)
    }
    return null
  }

  /**
   * 关闭标签页
   */
  async function closeTab(tabId) {
    const api = _api()
    if (!api) return
    try {
      await api.closeTab(tabId)
      await _refreshTabs()
      await _refreshNavigation()
    } catch (e) {
      console.error('[tabStore] closeTab failed:', e)
    }
  }

  /**
   * 切换到指定标签页
   */
  async function switchToTab(tabId) {
    const api = _api()
    if (!api) return
    try {
      await api.switchToTab(tabId)
      activeTabId.value = tabId
      await _refreshNavigation()
    } catch (e) {
      console.error('[tabStore] switchToTab failed:', e)
    }
  }

  /**
   * 后退
   */
  async function goBack() {
    const api = _api()
    if (!api || !activeTabId.value) return
    try {
      await api.goBack(activeTabId.value)
    } catch (e) {
      console.error('[tabStore] goBack failed:', e)
    }
  }

  /**
   * 前进
   */
  async function goForward() {
    const api = _api()
    if (!api || !activeTabId.value) return
    try {
      await api.goForward(activeTabId.value)
    } catch (e) {
      console.error('[tabStore] goForward failed:', e)
    }
  }

  /**
   * 刷新当前标签页
   */
  async function reload(ignoreCache = false) {
    const api = _api()
    if (!api || !activeTabId.value) return
    try {
      await api.reload(activeTabId.value, ignoreCache)
    } catch (e) {
      console.error('[tabStore] reload failed:', e)
    }
  }

  /**
   * 搜索或导航到 URL
   */
  async function searchOrNavigate(query) {
    const api = _api()
    if (!api) return
    try {
      await api.searchOrNavigate(query, activeTabId.value)
    } catch (e) {
      console.error('[tabStore] searchOrNavigate failed:', e)
    }
  }

  /**
   * 导航到指定 URL
   */
  async function navigate(url) {
    const api = _api()
    if (!api || !activeTabId.value) return
    try {
      await api.navigate(activeTabId.value, url)
    } catch (e) {
      console.error('[tabStore] navigate failed:', e)
    }
  }

  return {
    // State
    tabs,
    activeTabId,
    navigation,
    // Getters
    activeTab,
    isHomeTab,
    hasTabs,
    tabCount,
    // Actions
    init,
    dispose,
    createTab,
    closeTab,
    switchToTab,
    goBack,
    goForward,
    reload,
    searchOrNavigate,
    navigate
  }
})
