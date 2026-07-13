<template>
  <div style="height:100%;display:flex;flex-direction:column">
    <!-- 页面头部 -->
    <div class="cohere-page-header" style="flex-shrink:0">
      <div style="display:flex;align-items:center;gap:var(--space-md);width:100%">
        <div style="flex:1">
          <div class="page-title">分屏监控</div>
          <div class="page-subtitle">多平台同时在线监控，实时查看发布状态</div>
        </div>
        <!-- 布局切换 -->
        <div class="layout-toggle" style="display:flex;gap:4px;background:var(--soft-stone,var(--bg));border-radius:8px;padding:3px">
          <button v-for="l in layouts" :key="l.count"
            class="layout-btn"
            :class="{ active: currentLayout === l.count }"
            @click="switchLayout(l.count)"
            :title="l.label">
            {{ l.icon }}
          </button>
        </div>
        <!-- 操作按钮 -->
        <button class="cohere-btn-secondary" @click="openAccountDialog">＋ 添加监控</button>
        <button v-if="tabs.length > 0" class="cohere-btn-ghost" @click="closeAllTabs" style="color:var(--coral)">全部关闭</button>
      </div>
    </div>

    <!-- 监控区域（WebContentsView 由 Electron 主进程渲染，此处仅做控制面板） -->
    <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--border-light,var(--border-light));position:relative;overflow:hidden">
      <!-- 无监控时显示引导 -->
      <div v-if="tabs.length === 0" class="cohere-empty" style="position:absolute">
        <div class="empty-icon">🖥️</div>
        <h3>暂无监控</h3>
        <p>点击「添加监控」选择平台开始实时查看</p>
      </div>

      <!-- 底部状态栏 -->
      <div v-if="tabs.length > 0" class="monitor-status-bar">
        <span class="cohere-tag cohere-tag-info">{{ tabs.length }} 个监控</span>
        <span class="cohere-tag" :class="currentLayout === 1 ? 'cohere-tag-info' : 'cohere-tag-success'">
          {{ layoutLabel }}
        </span>
        <span style="flex:1"></span>
        <span class="cohere-tag" style="background:transparent;color:var(--muted);font-size:12px">
          提示: 点击布局图标切换分屏数量
        </span>
      </div>
    </div>

    <!-- 添加监控对话框 -->
        <UiModal :visible="showDialog" title="????" size="sm" @close="showDialog = false">
      <UiSelect
        v-model="newPlatform"
        label="????"
        placeholder="?????"
        :options="platforms.filter(p => p.id !== 'all').map(p => ({ value: p.id, label: p.label }))"
      />
      <template #footer>
        <UiButton variant="ghost" @click="showDialog = false">??</UiButton>
        <UiButton @click="confirmAdd" :disabled="adding">{{ adding ? '???...' : '????' }}</UiButton>
      </template>
    </UiModal>
  </div>
</template>

<script setup>
import UiModal from "../components/UiModal.vue";
import UiButton from "../components/UiButton.vue";
import UiSelect from "../components/UiSelect.vue";
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'

const layouts = [
  { count: 1, icon: '⬜', label: '单屏' },
  { count: 2, icon: '▬', label: '双屏' },
  { count: 3, icon: '◫', label: '三屏' },
  { count: 4, icon: '⊞', label: '四屏' },
  { count: 6, icon: '⊟', label: '六屏' },
]

const platforms = [
  { id: 'wechat_mp', label: '微信公众号' },
  { id: 'zhihu', label: '知乎' },
  { id: 'weibo', label: '微博' },
  { id: 'douyin', label: '抖音' },
  { id: 'xiaohongshu', label: '小红书' },
  { id: 'tencent_video', label: '视频号' },
  { id: 'kuaishou', label: '快手' },
  { id: 'toutiao', label: '今日头条' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'tiktok', label: 'TikTok' },
]

const currentLayout = ref(1)
const tabs = ref([])
const showDialog = ref(false)
const newPlatform = ref('')
const adding = ref(false)

const layoutLabel = computed(() => {
  const l = layouts.find(x => x.count === currentLayout.value)
  return l ? l.label : '单屏'
})

function platformLabel (id) {
  const p = platforms.find(x => x.id === id)
  return p ? p.label : id
}

// IPC 事件监听
const unlisteners = []

onMounted(() => {
  const api = window.electronAPI
  if (!api) return

  // 监听事件
  const addListener = (channel, fn) => {
    const off = api[channel]?.(fn)
    if (off) unlisteners.push(off)
  }

  addListener('onWebviewTabOpened', (data) => {
    tabs.value = data.tabCount ? [...Array(data.tabCount)].map((_, i) => ({ id: `tab-${i}` })) : tabs.value
  })

  addListener('onWebviewTabClosed', (data) => {
    tabs.value = data.tabCount ? [...Array(data.tabCount)].map((_, i) => ({ id: `tab-${i}` })) : []
    if (tabs.value.length === 0) tabs.value = []
  })

  addListener('onWebviewLayoutChanged', (data) => {
    currentLayout.value = data.layout
  })

  addListener('onWebviewAllClosed', () => {
    tabs.value = []
  })

  // 加载当前状态
  loadTabs()
})

onUnmounted(() => {
  unlisteners.forEach(fn => fn())
})

async function loadTabs () {
  const api = window.electronAPI
  if (!api || !api.webviewListTabs) return
  const res = await api.webviewListTabs()
  if (res.code === 0 && res.data) {
    tabs.value = res.data
  }
}

async function switchLayout (count) {
  currentLayout.value = count
  const api = window.electronAPI
  if (api && api.webviewSetLayout) {
    await api.webviewSetLayout(count)
  }
}

function openAccountDialog () {
  showDialog.value = true
}

async function confirmAdd () {
  if (!newPlatform.value) { ElMessage.warning('请选择平台'); return }
  adding.value = true
  try {
    const api = window.electronAPI
    if (api && api.webviewOpenTab) {
      const res = await api.webviewOpenTab({ platform: newPlatform.value })
      if (res.code === 0) {
        ElMessage.success(`已添加 ${platformLabel(newPlatform.value)} 监控`)
        showDialog.value = false
        newPlatform.value = ''
      } else {
        ElMessage.error(res.message || '添加失败')
      }
    }
  } catch (e) {
    ElMessage.error(e.message)
  } finally {
    adding.value = false
  }
}

async function closeAllTabs () {
  const api = window.electronAPI
  if (api && api.webviewCloseAll) {
    await api.webviewCloseAll()
    tabs.value = []
    ElMessage.success('已关闭所有监控')
  }
}
</script>

<style scoped>
.layout-toggle {}
.layout-btn {
  width: 32px; height: 32px;
  border: none; background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 16px;
  line-height: 32px;
  text-align: center;
  transition: all 0.15s;
}
.layout-btn:hover { background: var(--hairline,var(--border-light)); }
.layout-btn.active { background: var(--canvas,var(--surface)); box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.monitor-status-bar {
  position: absolute;
  bottom: 0;
  left: 0; right: 0;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: 8px 16px;
  background: var(--canvas-tp, rgba(255,255,255,0.95));
  border-top: 1px solid var(--hairline,var(--border-light));
  font-size: 13px;
}
</style>
