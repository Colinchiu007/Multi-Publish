/**
 * useTheme — 暗色/亮色主题 composable
 *
 * 核心逻辑：
 *   - 优先从 electron store 读取持久化偏好
 *   - 无持久化偏好时跟随系统 prefers-color-scheme
 *   - 通过 data-theme 属性控制 CSS 变量切换
 *   - 偏好写入 electron store 跨会话持久
 *
 * 依赖:
 *   - electronAPI.storeGetSetting / storeSetSetting（preload 已暴露）
 *   - cohere-design-system.css 中 :root 和 [data-theme="dark"] 变量定义
 */

import { ref, watch, onMounted } from 'vue'

const THEME_KEY = 'ui:theme'

/**
 * @returns {{ theme: Ref<string>, toggle: Function, isDark: ComputedRef }}
 */
export function useTheme() {
  const theme = ref('light')
  const loaded = ref(false)

  // 获取系统偏好
  function getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  }

  // 应用主题到 DOM
  function applyTheme(val) {
    document.documentElement.setAttribute('data-theme', val)
    theme.value = val
  }

  // 切换主题
  function toggle() {
    const next = theme.value === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    persist(next)
  }

  // 持久化
  async function persist(val) {
    try {
      const api = window.electronAPI
      if (api && api.storeSetSetting) {
        await api.storeSetSetting(THEME_KEY, val)
      }
    } catch (e) {
      // silent — 本地存储降级
    }
  }

  // 初始化：读持久化 → 系统检测 → 应用
  async function init() {
    let preferred = null
    try {
      const api = window.electronAPI
      if (api && api.storeGetSetting) {
        const res = await api.storeGetSetting(THEME_KEY)
        if (res.code === 0 && res.data) {
          preferred = res.data
        }
      }
    } catch (e) {
      // silent
    }

    const initial = preferred || getSystemTheme()
    applyTheme(initial)
    loaded.value = true

    // 监听系统主题变化（当无用户偏好时）
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', (e) => {
      // 只在没有持久化偏好的情况下跟随系统
      if (!preferred) {
        applyTheme(e.matches ? 'dark' : 'light')
      }
    })
  }

  onMounted(() => { init() })

  const isDark = ref(false)
  watch(theme, (val) => { isDark.value = val === 'dark' }, { immediate: true })

  return { theme, toggle, isDark, loaded }
}
