<template>
  <div class="yixiaoer-home" data-testid="yixiaoer-home">
    <!-- 欢迎区 -->
    <section class="yixiaoer-home-welcome">
      <div class="yixiaoer-home-greeting">
        <h2>{{ greetingText }}，{{ displayName }}</h2>
        <p>多平台内容一键发布</p>
      </div>
      <div class="yixiaoer-home-quick-actions">
        <button class="yixiaoer-home-action-btn yixiaoer-home-action-btn--primary" data-testid="home-new-publish" @click="go('/publish')">
          <span class="action-icon">✏️</span>
          <span>新建发布</span>
        </button>
        <button class="yixiaoer-home-action-btn" data-testid="home-add-account" @click="go('/accounts')">
          <span class="action-icon">👤</span>
          <span>添加账号</span>
        </button>
        <button class="yixiaoer-home-action-btn" @click="go('/publish/history')">
          <span class="action-icon">📋</span>
          <span>发布记录</span>
        </button>
      </div>
    </section>

    <!-- 数据概览 -->
    <section class="yixiaoer-home-stats" data-testid="yixiaoer-home-stats">
      <div class="yixiaoer-home-stat-card">
        <div class="stat-number">{{ stats.total }}</div>
        <div class="stat-label">总发布</div>
      </div>
      <div class="yixiaoer-home-stat-card yixiaoer-home-stat-card--success">
        <div class="stat-number">{{ stats.success }}</div>
        <div class="stat-label">成功</div>
      </div>
      <div class="yixiaoer-home-stat-card yixiaoer-home-stat-card--danger">
        <div class="stat-number">{{ stats.failed }}</div>
        <div class="stat-label">失败</div>
      </div>
      <div class="yixiaoer-home-stat-card yixiaoer-home-stat-card--info">
        <div class="stat-number">{{ accountCount }}</div>
        <div class="stat-label">已绑定账号</div>
      </div>
    </section>

    <!-- 快捷入口 -->
    <section class="yixiaoer-home-shortcuts" data-testid="yixiaoer-home-shortcuts">
      <h3 class="yixiaoer-home-section-title">快捷入口</h3>
      <div class="yixiaoer-home-shortcut-grid">
        <div class="yixiaoer-home-shortcut" @click="go('/publish')">
          <span class="shortcut-icon">🚀</span>
          <span class="shortcut-label">一键发布</span>
        </div>
        <div class="yixiaoer-home-shortcut" @click="go('/accounts')">
          <span class="shortcut-icon">🔐</span>
          <span class="shortcut-label">账号管理</span>
        </div>
        <div class="yixiaoer-home-shortcut" @click="go('/publish/history')">
          <span class="shortcut-icon">📊</span>
          <span class="shortcut-label">发布记录</span>
        </div>
        <div class="yixiaoer-home-shortcut" @click="go('/dashboard')">
          <span class="shortcut-icon">📈</span>
          <span class="shortcut-label">数据看板</span>
        </div>
        <div class="yixiaoer-home-shortcut" @click="go('/collection')">
          <span class="shortcut-icon">📋</span>
          <span class="shortcut-label">内容采集</span>
        </div>
        <div class="yixiaoer-home-shortcut" @click="go('/comments')">
          <span class="shortcut-icon">💬</span>
          <span class="shortcut-label">私信评论</span>
        </div>
      </div>
    </section>

    <!-- 支持平台 -->
    <section class="yixiaoer-home-platforms" data-testid="yixiaoer-home-platforms">
      <h3 class="yixiaoer-home-section-title">支持平台</h3>
      <div class="yixiaoer-home-platform-list">
        <span v-for="p in platforms" :key="p.id" class="yixiaoer-home-platform-tag">
          {{ p.icon }} {{ p.label }}
        </span>
      </div>
    </section>

    <!-- 近期动态 -->
    <section class="yixiaoer-home-recent" data-testid="yixiaoer-home-recent">
      <h3 class="yixiaoer-home-section-title">近期动态</h3>
      <div v-if="recentItems.length === 0" class="yixiaoer-home-empty">
        <span>暂无发布记录，开始你的第一次发布吧！</span>
      </div>
      <div v-else class="yixiaoer-home-recent-list">
        <div v-for="item in recentItems" :key="item.id" class="yixiaoer-home-recent-item">
          <div class="recent-item-info">
            <span class="recent-item-title">{{ item.title || '无标题' }}</span>
            <span class="recent-item-platform">{{ getPlatformLabel(item.platform) }}</span>
          </div>
          <div class="recent-item-status" :class="`status-${item.status || 'unknown'}`">
            {{ statusLabel(item.status) }}
          </div>
          <span class="recent-item-time">{{ formatTime(item.created_at || item.createdAt) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useIdentityStore } from '@/stores/identity'
import { usePlatformStore } from '@/stores/platforms'
import { reportError } from '../utils/report-error'

const router = useRouter()
const identityStore = useIdentityStore()
const platformStore = usePlatformStore()

const stats = ref({ total: 0, success: 0, failed: 0 })
const accountCount = ref(0)
const recentItems = ref([])

const displayName = computed(() => identityStore.displayName || '用户')

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

const platforms = computed(() => {
  if (platformStore.platforms.length > 0) {
    return platformStore.platforms.map(p => ({
      id: p.id,
      label: p.label,
      icon: platformStore.getIcon(p.id) || '',
    }))
  }
  return [
    { id: 'wechat_mp', label: '微信公众号', icon: '💬' },
    { id: 'zhihu', label: '知乎', icon: '❓' },
    { id: 'weibo', label: '微博', icon: '✧' },
    { id: 'douyin', label: '抖音', icon: '🎵' },
    { id: 'xiaohongshu', label: '小红书', icon: '📕' },
    { id: 'tencent_video', label: '视频号', icon: '▶' },
    { id: 'kuaishou', label: '快手', icon: '🎬' },
    { id: 'toutiao', label: '今日头条', icon: '📰' },
    { id: 'bilibili', label: 'B站', icon: '📺' },
    { id: 'youtube', label: 'YouTube', icon: '▶️' },
    { id: 'tiktok', label: 'TikTok', icon: '🎶' },
  ]
})

function getPlatformLabel(id) {
  return platformStore.getLabel(id) || id
}

function statusLabel(status) {
  const map = { success: '成功', failed: '失败', pending: '等待中', publishing: '发布中', error: '异常' }
  return map[status] || '未知'
}

function formatTime(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

function go(path) {
  router.push(path)
}

onMounted(async () => {
  try {
    platformStore.load()
    const api = window.electronAPI
    if (api) {
      if (api.storeGetPublishStats) {
        const res = await api.storeGetPublishStats()
        if (res && res.code === 0) stats.value = res.data
      }
      if (api.storeListAccounts) {
        const res = await api.storeListAccounts()
        if (res && res.code === 0) accountCount.value = (res.data || []).length
      }
      if (api.historyList) {
        const res = await api.historyList({ limit: 5, offset: 0 })
        if (res && res.code === 0 && Array.isArray(res.data)) {
          recentItems.value = res.data.slice(0, 5)
        }
      }
    }
  } catch (e) {
    reportError('加载首页数据失败', e)
  }
})
</script>

<style scoped>
.yixiaoer-home {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
}

.yixiaoer-home-welcome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;
}

.yixiaoer-home-greeting h2 {
  margin: 0 0 4px;
  color: #25252b;
  font-size: 22px;
  font-weight: 600;
}

.yixiaoer-home-greeting p {
  margin: 0;
  color: #8b8e9a;
  font-size: 14px;
}

.yixiaoer-home-quick-actions {
  display: flex;
  gap: 10px;
}

.yixiaoer-home-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  border: 1px solid #e0e0e8;
  border-radius: 8px;
  background: #fff;
  color: #4d4f6f;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.yixiaoer-home-action-btn:hover {
  border-color: #5048e5;
  color: #5048e5;
}

.yixiaoer-home-action-btn--primary {
  border-color: #5048e5;
  background: #5048e5;
  color: #fff;
}

.yixiaoer-home-action-btn--primary:hover {
  background: #3f37c9;
  color: #fff;
}

.action-icon {
  font-size: 15px;
}

/* 数据概览 */
.yixiaoer-home-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}

.yixiaoer-home-stat-card {
  padding: 20px;
  border: 1px solid #e8eaf2;
  border-radius: 12px;
  background: #fff;
  text-align: center;
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  color: #25252b;
}

.stat-label {
  margin-top: 4px;
  color: #8b8e9a;
  font-size: 13px;
}

.yixiaoer-home-stat-card--success .stat-number { color: #2fc27a; }
.yixiaoer-home-stat-card--danger .stat-number { color: #f56c6c; }
.yixiaoer-home-stat-card--info .stat-number { color: #5048e5; }

/* 快捷入口 */
.yixiaoer-home-section-title {
  margin: 0 0 16px;
  color: #25252b;
  font-size: 16px;
  font-weight: 600;
}

.yixiaoer-home-shortcuts {
  margin-bottom: 32px;
}

.yixiaoer-home-shortcut-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
}

.yixiaoer-home-shortcut {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  border: 1px solid #e8eaf2;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: all 0.15s ease;
}

.yixiaoer-home-shortcut:hover {
  border-color: #5048e5;
  box-shadow: 0 4px 12px rgba(80, 72, 229, 0.08);
}

.shortcut-icon {
  font-size: 24px;
}

.shortcut-label {
  color: #4d4f6f;
  font-size: 13px;
}

/* 平台列表 */
.yixiaoer-home-platforms {
  margin-bottom: 32px;
}

.yixiaoer-home-platform-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.yixiaoer-home-platform-tag {
  padding: 6px 14px;
  border: 1px solid #e8eaf2;
  border-radius: 20px;
  background: #f9f9fc;
  color: #4d4f6f;
  font-size: 13px;
}

/* 近期动态 */
.yixiaoer-home-recent {
  margin-bottom: 32px;
}

.yixiaoer-home-empty {
  padding: 40px 20px;
  border: 1px dashed #e8eaf2;
  border-radius: 10px;
  background: #fafaff;
  color: #8b8e9a;
  text-align: center;
  font-size: 14px;
}

.yixiaoer-home-recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.yixiaoer-home-recent-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  border: 1px solid #e8eaf2;
  border-radius: 10px;
  background: #fff;
}

.recent-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.recent-item-title {
  overflow: hidden;
  color: #25252b;
  font-size: 14px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-item-platform {
  padding: 2px 8px;
  border-radius: 4px;
  background: #f0efff;
  color: #5048e5;
  font-size: 11px;
  flex: 0 0 auto;
}

.recent-item-status {
  padding: 2px 10px;
  border-radius: 12px;
  font-size: 12px;
  flex: 0 0 auto;
}

.status-success { background: #e8f8ef; color: #2fc27a; }
.status-failed, .status-error { background: #fef0f0; color: #f56c6c; }
.status-pending, .status-publishing { background: #f0efff; color: #5048e5; }
.status-unknown { background: #f5f5f5; color: #999; }

.recent-item-time {
  color: #8b8e9a;
  font-size: 12px;
  flex: 0 0 auto;
}

@media (max-width: 768px) {
  .yixiaoer-home-stats { grid-template-columns: repeat(2, 1fr); }
  .yixiaoer-home-shortcut-grid { grid-template-columns: repeat(3, 1fr); }
  .yixiaoer-home-welcome { flex-direction: column; align-items: flex-start; }
}

@media (max-width: 480px) {
  .yixiaoer-home { padding: 16px 12px; }
  .yixiaoer-home-shortcut-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
