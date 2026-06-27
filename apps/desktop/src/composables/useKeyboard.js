/**
 * useKeyboard — 应用级键盘快捷键 composable
 *
 * 处理 Cmd+K (搜索)、Cmd+N (新建)、Cmd+, (设置)、Esc (关闭) 等快捷键。
 * 仅当应用窗口获得焦点时生效（renderer 级，非 globalShortcut）。
 *
 * 与 electron/hotkeys.js 互补：
 *   - hotkeys.js: Electron globalShortcut，即使窗口最小化也能工作
 *   - useKeyboard: Vue renderer 级快捷键，需要窗口焦点
 */

import { onMounted, onBeforeUnmount } from 'vue'

/**
 * @param {Object} handlers
 * @param {Function} [handlers.onSearch] — Cmd+K / Ctrl+K 触发
 * @param {Function} [handlers.onNewPublish] — Cmd+N / Ctrl+N 触发
 * @param {Function} [handlers.onSettings] — Cmd+, / Ctrl+, 触发
 * @param {Function} [handlers.onEscape] — Esc 触发
 * @param {Function} [handlers.onNavigateNext] — Cmd+Shift+] 触发
 * @param {Function} [handlers.onNavigatePrev] — Cmd+Shift+[ 触发
 */
export function useKeyboard(handlers = {}) {
  function handleKeyDown(e) {
    const isMeta = e.metaKey || e.ctrlKey
    const isMetaShift = isMeta && e.shiftKey

    // Cmd+K / Ctrl+K → 打开搜索面板
    if (isMeta && e.key === 'k') {
      e.preventDefault()
      handlers.onSearch?.()
      return
    }

    // Cmd+N / Ctrl+N → 新建发布
    if (isMeta && e.key === 'n') {
      e.preventDefault()
      handlers.onNewPublish?.()
      return
    }

    // Cmd+, / Ctrl+, → 设置/账号管理
    if (isMeta && e.key === ',') {
      e.preventDefault()
      handlers.onSettings?.()
      return
    }

    // Cmd+Shift+] → 下一视图
    if (isMetaShift && e.key === ']') {
      e.preventDefault()
      handlers.onNavigateNext?.()
      return
    }

    // Cmd+Shift+[ → 上一视图
    if (isMetaShift && e.key === '[') {
      e.preventDefault()
      handlers.onNavigatePrev?.()
      return
    }

    // Esc → 关闭/取消
    if (e.key === 'Escape') {
      handlers.onEscape?.()
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  return { handleKeyDown }
}
