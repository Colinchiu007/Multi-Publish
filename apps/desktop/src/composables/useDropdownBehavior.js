// @ts-check
/**
 * useDropdownBehavior.js — 下拉菜单通用行为 composable（从 IdentityMenu 提炼）
 *
 * 职责：
 *   - 管理 open 状态与面板/触发器引用
 *   - 点击外部 / Esc 关闭、方向键与 Home/End 键盘导航
 *   - 提供 toggle / close / openAndFocusFirst 供触发器与菜单项使用
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

/**
 * @param {object} [options]
 * @param {string} [options.focusableSelector] 面板内可聚焦项的选择器，默认菜单项
 * @returns {object} 响应式状态 + 方法
 */
export function useDropdownBehavior(options = {}) {
  const focusableSelector = options.focusableSelector || '[role="menuitem"], [role="button"]'
  const open = ref(false)
  const root = ref(null)
  const trigger = ref(null)
  const panel = ref(null)

  async function openAndFocusFirst() {
    open.value = true
    await nextTick()
    panel.value?.querySelector(focusableSelector)?.focus()
  }

  function toggle() {
    if (open.value) {
      open.value = false
      return false
    }
    return openAndFocusFirst()
  }

  function close() {
    open.value = false
  }

  function handleOutsideClick(event) {
    if (open.value && root.value && !root.value.contains(event.target)) open.value = false
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape' || !open.value) return
    event.preventDefault()
    open.value = false
    trigger.value?.focus()
  }

  function handleMenuKeydown(event) {
    if (event.key === 'Tab') {
      open.value = false
      return
    }
    if (event.key === 'Escape') {
      handleKeydown(event)
      return
    }
    const items = Array.from(panel.value?.querySelectorAll(`${focusableSelector}:not(:disabled)`) || [])
    if (items.length === 0) return
    const currentIndex = items.indexOf(document.activeElement)
    let nextIndex = currentIndex
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
    else if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = items.length - 1
    else return
    event.preventDefault()
    items[nextIndex].focus()
  }

  onMounted(() => {
    document.addEventListener('click', handleOutsideClick)
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleOutsideClick)
    document.removeEventListener('keydown', handleKeydown)
  })

  return {
    open,
    root,
    trigger,
    panel,
    toggle,
    close,
    openAndFocusFirst,
    handleMenuKeydown,
  }
}