<template>
  <Teleport to="body">
    <transition name="cp-fade">
      <div
        v-if="visible"
        class="cp-overlay"
        @click.self="close"
        @keydown="handleOverlayKeydown"
        ref="overlayRef"
        tabindex="-1"
      >
        <div class="cp-panel" ref="panelRef">
          <!-- 搜索输入 -->
          <div class="cp-search-row">
            <span class="cp-search-icon">⌕</span>
            <input
              ref="inputRef"
              v-model="query"
              class="cp-input"
              type="text"
              placeholder="搜索页面、操作..."
              autocomplete="off"
              spellcheck="false"
              @input="onInput"
            />
            <kbd class="cp-hint-key">ESC</kbd>
          </div>

          <!-- 空状态 -->
          <div v-if="query && filteredItems.length === 0" class="cp-empty">
            没有找到匹配结果
          </div>

          <!-- 结果列表 -->
          <div v-if="filteredItems.length > 0" class="cp-results">
            <!-- 页面导航 -->
            <div v-if="navItems.length > 0" class="cp-group">
              <div class="cp-group-label">页面导航</div>
              <div
                v-for="(item, idx) in navItems"
                :key="item.id"
                class="cp-item"
                :class="{ active: activeIndex === idx }"
                @click="selectItem(item)"
                @mouseenter="activeIndex = idx"
              >
                <span class="cp-item-icon">{{ item.icon }}</span>
                <span class="cp-item-label">{{ item.label }}</span>
                <span class="cp-item-meta">{{ item.path }}</span>
                <kbd v-if="item.shortcut" class="cp-shortcut">{{ item.shortcut }}</kbd>
              </div>
            </div>

            <!-- 操作 -->
            <div v-if="actionItems.length > 0 && navItems.length > 0" class="cp-divider"></div>

            <div v-if="actionItems.length > 0" class="cp-group">
              <div class="cp-group-label">操作</div>
              <div
                v-for="(item, idx) in actionItems"
                :key="item.id"
                class="cp-item"
                :class="{ active: activeIndex === (navItems.length + idx) }"
                @click="selectItem(item)"
                @mouseenter="activeIndex = navItems.length + idx"
              >
                <span class="cp-item-icon">{{ item.icon }}</span>
                <span class="cp-item-label">{{ item.label }}</span>
                <kbd v-if="item.shortcut" class="cp-shortcut">{{ item.shortcut }}</kbd>
              </div>
            </div>

            <!-- 快捷键列表 (无搜索时) -->
            <div v-if="!query" class="cp-divider"></div>
            <div v-if="!query && shortcuts.length > 0" class="cp-group">
              <div class="cp-group-label">快捷键</div>
              <div
                v-for="s in shortcuts"
                :key="s.accelerator"
                class="cp-item cp-item-shortcut"
              >
                <span class="cp-item-label cp-item-label-dim">{{ s.label }}</span>
                <kbd class="cp-shortcut">{{ formatAccelerator(s.accelerator) }}</kbd>
              </div>
            </div>
          </div>

          <!-- 底部提示 -->
          <div class="cp-footer">
            <span>↑↓ 导航</span>
            <span class="cp-dot">·</span>
            <span>↵ 选择</span>
            <span class="cp-dot">·</span>
            <span>ESC 关闭</span>
          </div>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import Fuse from 'fuse.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])
const router = useRouter()

// ─── 搜索项定义 ────────────────────────────
const searchItems = [
  // 页面导航
  { id: 'nav-publish',    type: 'route',   label: '一键发布',       path: '/publish',      icon: '↗',    shortcut: '⌘N', keywords: ['publish', '发布', '发布文章'] },
  { id: 'nav-accounts',   type: 'route',   label: '账号管理',       path: '/accounts',     icon: '○',    shortcut: '',   keywords: ['account', '账号', '登录'] },
  { id: 'nav-collection', type: 'route',   label: '采集',           path: '/collection',   icon: '📋',   shortcut: '',   keywords: ['collect', '采集', '热榜'] },
  { id: 'nav-monitor',    type: 'route',   label: '监控',           path: '/monitor',      icon: '🖥',   shortcut: '',   keywords: ['monitor', '监控', '分屏'] },
  { id: 'nav-keywords',   type: 'route',   label: '关键词监测',     path: '/keywords',     icon: '🔑',   shortcut: '',   keywords: ['keyword', '关键词'] },
  { id: 'nav-comments',   type: 'route',   label: '评论管理',       path: '/comments',     icon: '💬',   shortcut: '',   keywords: ['comment', '评论', '回复'] },
  { id: 'nav-dashboard',  type: 'route',   label: '数据看板',       path: '/dashboard',    icon: '◇',    shortcut: '',   keywords: ['dashboard', '数据', '统计'] },
  { id: 'nav-viral',      type: 'route',   label: '爆款分析',       path: '/viral-analysis', icon: '🔥', shortcut: '', keywords: ['viral', '爆款', '分析'] },
  { id: 'nav-providers',  type: 'route',   label: 'Provider 配置',  path: '/providers',  icon: '⚙',    shortcut: '',   keywords: ['provider', 'LLM', 'API', '配置', '设置'] },
  { id: 'nav-home',       type: 'route',   label: '首页',           path: '/',             icon: '⌂',    shortcut: '',   keywords: ['home', '首页'] },

  // 操作
  { id: 'action-new-publish', type: 'action', label: '新建发布任务', action: 'navigate', path: '/publish', icon: '✚', shortcut: '⌘N', keywords: ['new', '新建', 'publish', '发布'] },
  { id: 'action-accounts',    type: 'action', label: '添加新账号',  action: 'navigate', path: '/accounts', icon: '+', shortcut: '', keywords: ['add account', '添加账号'] },
  { id: 'action-check-update',type: 'action', label: '检查更新',    action: 'trigger',  event: 'check-update', icon: '↻', shortcut: '', keywords: ['update', '更新', '版本'] },
]

// ─── Fuse.js 实例 ─────────────────────────
const fuseOptions = {
  keys: ['label', 'keywords', 'path'],
  threshold: 0.4,
  includeScore: true,
  minMatchCharLength: 1,
}

const fuse = new Fuse(searchItems, fuseOptions)

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref(null)
const panelRef = ref(null)
const overlayRef = ref(null)
const shortcuts = ref([])

const filteredItems = computed(() => {
  if (!query.value.trim()) return searchItems
  return fuse.search(query.value.trim()).map(r => r.item)
})

const navItems = computed(() =>
  filteredItems.value.filter(i => i.type === 'route')
)

const actionItems = computed(() =>
  filteredItems.value.filter(i => i.type === 'action')
)

// ─── 快捷键显示格式化 ──────────────────────
function formatAccelerator(acc) {
  return acc
    .replace(/CmdOrCtrl/g, '⌘')
    .replace(/CommandOrControl/g, '⌘')
    .replace(/Command/g, '⌘')
    .replace(/Ctrl/g, '^')
    .replace(/Alt/g, '⌥')
    .replace(/Shift/g, '⇧')
}

// ─── 操作 ──────────────────────────────────
function selectItem(item) {
  if (item.type === 'route' || item.action === 'navigate') {
    router.push(item.path)
  } else if (item.type === 'action' && item.event) {
    // 触发自定义事件（如检查更新）
    window.dispatchEvent(new CustomEvent(item.event))
  }
  emit('close')
}

function close() {
  query.value = ''
  activeIndex.value = 0
  emit('close')
}

function onInput() {
  activeIndex.value = 0
}

function handleOverlayKeydown(e) {
  const total = filteredItems.value.length
  if (total === 0) return

  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % total
    scrollToActive()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + total) % total
    scrollToActive()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = filteredItems.value[activeIndex.value]
    if (item) selectItem(item)
  }
}

function scrollToActive() {
  nextTick(() => {
    const active = panelRef.value?.querySelector('.cp-item.active')
    active?.scrollIntoView({ block: 'nearest' })
  })
}

// ─── 加载已注册的快捷键列表 ────────────────
async function loadShortcuts() {
  const api = window.electronAPI
  if (api && api.hotkeysList) {
    try {
      const res = await api.hotkeysList()
      if (res.code === 0 && Array.isArray(res.data)) {
        shortcuts.value = res.data
      }
    } catch (e) {
      // silent
    }
  }
}

// ─── 生命周期 ──────────────────────────────
watch(() => props.visible, (val) => {
  if (val) {
    query.value = ''
    activeIndex.value = 0
    loadShortcuts()
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})
</script>

<style scoped>
/* --- 遮罩 --- */
.cp-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  justify-content: center;
  padding-top: 15vh;
  backdrop-filter: blur(2px);
}

.cp-panel {
  width: 560px;
  max-width: 90vw;
  max-height: 60vh;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: cp-slide-in 0.12s ease-out;
}

@keyframes cp-slide-in {
  from {
    opacity: 0;
    transform: translateY(-12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* --- 搜索行 --- */
.cp-search-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.cp-search-icon {
  font-size: 20px;
  color: var(--text-muted);
  line-height: 1;
  flex-shrink: 0;
}

.cp-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  font-family: 'Inter', 'Arial', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: var(--ink);
  background: transparent;
  line-height: 1.4;
}

.cp-input::placeholder {
  color: var(--text-muted);
}

.cp-hint-key {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  background: var(--bg);
  font-family: inherit;
  flex-shrink: 0;
}

/* --- 结果 --- */
.cp-results {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.cp-empty {
  padding: 32px 18px;
  text-align: center;
  color: var(--text-muted);
  font-size: 14px;
}

.cp-group {
  padding: 4px 0;
}

.cp-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 8px 18px 4px;
}

.cp-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 14px;
}

.cp-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 18px;
  cursor: pointer;
  transition: background 0.08s;
  border-left: 3px solid transparent;
}

.cp-item.active {
  background: var(--primary-light);
  border-left-color: var(--primary);
}

.cp-item-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  border-radius: 6px;
  background: var(--bg);
  flex-shrink: 0;
  color: var(--text-muted);
}

.cp-item.active .cp-item-icon {
  background: #e0e8ff;
  color: var(--primary);
}

.cp-item-label {
  flex: 1;
  font-size: 14px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cp-item-label-dim {
  color: #616161;
}

.cp-item-meta {
  font-size: 12px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
}

.cp-shortcut {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: #75758a;
  background: #fafafa;
  font-family: 'SF Mono', 'JetBrains Mono', monospace;
  flex-shrink: 0;
}

.cp-item-shortcut {
  cursor: default;
}

/* --- 底部 --- */
.cp-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 18px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

.cp-dot {
  color: #d9d9dd;
}

/* --- 过渡动画 --- */
.cp-fade-enter-active,
.cp-fade-leave-active {
  transition: opacity 0.1s ease;
}

.cp-fade-enter-from,
.cp-fade-leave-to {
  opacity: 0;
}
</style>
