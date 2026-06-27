<template>
  <div style="height:100%;display:flex;flex-direction:column">
    <!-- 页面头部 -->
    <div class="cohere-page-header" style="flex-shrink:0">
      <div>
        <div class="page-title">评论管理</div>
        <div class="page-subtitle">统一查看和回复各平台评论</div>
      </div>
    </div>

    <div style="flex:1;display:flex;overflow:hidden">
      <!-- 左侧平台列表 -->
      <aside style="width:200px;flex-shrink:0;border-right:1px solid var(--border,#eee);background:var(--canvas,#fafafa);overflow-y:auto">
        <div
          v-for="p in platforms"
          :key="p.id"
          class="comment-platform-item"
          :class="{ active: activePlatform === p.id }"
          @click="openPlatform(p)"
        >
          <div class="platform-icon">{{ p.icon }}</div>
          <div style="flex:1;min-width:0">
            <div class="platform-name">{{ p.name }}</div>
            <div class="platform-url" v-if="p.comment_url">有评论页</div>
            <div class="platform-url" v-else style="color:var(--muted)">暂不支持</div>
          </div>
        </div>
      </aside>

      <!-- 右侧评论区域 -->
      <div style="flex:1;position:relative;background:var(--border-light,#f0f0f3);display:flex;align-items:center;justify-content:center">
        <div v-if="!activePlatform" class="cohere-empty">
          <div class="empty-icon">💬</div>
          <h3>选择平台</h3>
          <p>从左侧选择一个平台查看评论</p>
        </div>
        <div v-else-if="!commentUrl" class="cohere-empty">
          <div class="empty-icon">📭</div>
          <h3>暂不支持</h3>
          <p>{{ platformName(activePlatform) }} 暂未配置评论页</p>
        </div>
        <!-- WebContentsView 由主进程渲染到此区域 -->
        <div v-show="activePlatform && commentUrl" id="comment-view-container" style="width:100%;height:100%;position:absolute;top:0;left:0"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const activePlatform = ref(null)
const platforms = ref([])
const commentUrl = ref('')
const currentTabId = ref(null)

const platformNameMap = {
  wechat_mp: '微信公众号', zhihu: '知乎', weibo: '微博', douyin: '抖音',
  xiaohongshu: '小红书', tencent_video: '视频号', kuaishou: '快手',
  toutiao: '今日头条', bilibili: 'B站', youtube: 'YouTube',
  tiktok: 'TikTok', baijiahao: '百家号',
}

function platformName (id) { return platformNameMap[id] || id }

async function loadPlatforms () {
  const api = window.electronAPI
  if (!api || !api.platformList) return
  try {
    const res = await api.platformList()
    if (res.code === 0) {
      platforms.value = (res.data || []).filter(p => p.comment_url)
    }
  } catch (e) { /* ignore */ }
}

async function openPlatform (p) {
  const api = window.electronAPI
  if (!api || !api.webviewOpenTab) return

  // 关闭上一个 tab
  if (currentTabId.value) {
    await api.webviewCloseTab(currentTabId.value)
  }

  activePlatform.value = p.id
  commentUrl.value = p.comment_url || ''

  if (!p.comment_url) return

  // 打开新 tab（使用评论页 URL）
  const res = await api.webviewOpenTab({
    platform: p.id,
    url: p.comment_url,
  })
  if (res.code === 0) {
    currentTabId.value = res.data.tabId
  }
}

onMounted(() => {
  loadPlatforms()
})

onBeforeUnmount(async () => {
  if (currentTabId.value) {
    const api = window.electronAPI
    if (api && api.webviewCloseTab) {
      await api.webviewCloseTab(currentTabId.value)
    }
  }
})
</script>

<style scoped>
.comment-platform-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-light, #f0f0f0);
  transition: background 0.15s;
}
.comment-platform-item:hover { background: var(--soft-stone, #f5f5f7); }
.comment-platform-item.active { background: var(--soft-stone, #f0f0f5); }
.comment-platform-item .platform-icon { font-size: 20px; }
.comment-platform-item .platform-name { font-size: 13px; font-weight: 500; }
.comment-platform-item .platform-url { font-size: 11px; color: var(--action-blue, #1890ff); }
</style>
