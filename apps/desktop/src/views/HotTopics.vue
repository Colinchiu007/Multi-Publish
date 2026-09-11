<template>
  <div class="hot-topics-page">
    <div class="cohere-page-header">
      <div>
        <div class="page-title">{{ t('hotTopics.pageTitle') }}</div>
        <div class="page-subtitle">{{ t('hotTopics.pageDesc') }}</div>
      </div>
      <div class="header-actions">
        <span v-if="lastRefreshText" class="last-refresh">{{ lastRefreshText }}</span>
        <button class="cohere-btn-secondary" :disabled="loading || publishing" @click="refresh(true)">
          {{ loading ? t('hotTopics.refreshing') : t('hotTopics.refresh') }}
        </button>
      </div>
    </div>

    <div class="cohere-content">
      <!-- 部分渠道失败警告 -->
      <el-alert
        v-if="failedChannels.length > 0"
        type="warning"
        :title="partialFailText"
        closable
        style="margin-bottom: 12px"
      />

      <!-- 分类筛选 + 渠道筛选 -->
      <div class="filter-row">
        <div class="category-chips" role="tablist" aria-label="category filter">
          <button
            v-for="cat in categoryOptions"
            :key="cat.value"
            role="tab"
            :aria-selected="activeCategory === cat.value"
            class="category-chip"
            :class="{ active: activeCategory === cat.value }"
            @click="activeCategory = cat.value"
          >{{ cat.label }}</button>
        </div>
        <el-select v-model="activeChannel" class="channel-select" style="width: 160px" :disabled="publishing">
          <el-option :label="t('hotTopics.channelAll')" value="all" />
          <el-option
            v-for="ch in channelOptions"
            :key="ch.value"
            :label="ch.label + (channelStats[ch.value] && !channelStats[ch.value].ok ? ' (' + t('hotTopics.channelUnavailable') + ')' : '')"
            :value="ch.value"
          />
        </el-select>
      </div>

      <!-- 批量操作条 / 发布进度区（改写完成后保留进度区展示结果与去发布入口，直到用户返回） -->
      <div v-if="!publishing && !publishDone" class="batch-bar" data-testid="hot-topics-batch-bar">
        <label class="select-all-label">
          <input type="checkbox" :checked="allFilteredSelected" @change="toggleSelectAll" />
          {{ allFilteredSelected ? t('hotTopics.deselectAll') : t('hotTopics.selectAll') }}
        </label>
        <span class="selected-count">{{ selectedCountText }}</span>
        <div class="batch-actions">
          <button class="cohere-btn-secondary" :disabled="selectedIds.size === 0" @click="createCopyBatch">
            {{ t('hotTopics.createCopy') }}
          </button>
          <button class="cohere-btn-primary" :disabled="selectedIds.size === 0" @click="startPublish">
            {{ t('hotTopics.publishBtn') }}
          </button>
        </div>
      </div>
      <div v-else class="publish-progress" data-testid="hot-topics-publish-progress">
        <div class="progress-header">
          <span>{{ progressText }}</span>
          <button v-if="!publishDone" class="cohere-btn-secondary" @click="cancelPublish">{{ t('hotTopics.publishCancel') }}</button>
          <button v-else class="cohere-btn-secondary" @click="backToBatch">{{ t('hotTopics.backToBatch') }}</button>
        </div>
        <el-progress :percentage="progressPct" :stroke-width="10" />
        <div class="progress-items">
          <div v-for="item in publishQueue" :key="item.id" class="progress-item" :class="item.status">
            <span class="pi-topic" :title="item.topic">{{ item.topic }}</span>
            <span class="pi-status">
              <template v-if="item.status === 'pending'">…</template>
              <template v-else-if="item.status === 'rewriting'">⏳</template>
              <template v-else-if="item.status === 'success'">✅</template>
              <template v-else-if="item.status === 'failed'">
                ❌ <button class="retry-btn" @click="retryPublishItem(item)">{{ t('hotTopics.publishRetry') }}</button>
              </template>
            </span>
          </div>
        </div>
        <div v-if="publishDone" class="publish-done">
          <span>{{ publishDoneText }}</span>
          <button class="cohere-btn-primary" @click="goToDestination">{{ t('hotTopics.toPublish') }}</button>
        </div>
      </div>

      <!-- 选题列表 -->
      <div v-if="loading && topics.length === 0" class="loading-box">
        <el-skeleton :rows="6" animated />
      </div>
      <div v-else-if="filteredTopics.length === 0" class="empty-box" data-testid="hot-topics-empty">
        <div class="empty-title">{{ t('hotTopics.emptyTitle') }}</div>
        <div class="empty-desc">{{ t('hotTopics.emptyDesc') }}</div>
        <button class="cohere-btn-primary" @click="refresh(true)">{{ t('hotTopics.emptyAction') }}</button>
      </div>
      <div v-else class="topics-list">
        <div
          v-for="topic in filteredTopics"
          :key="topic.id"
          class="topic-item"
          :class="{ selected: selectedIds.has(topic.id) }"
          data-testid="hot-topic-item"
        >
          <input
            type="checkbox"
            class="topic-check"
            :checked="selectedIds.has(topic.id)"
            :data-testid="'hot-topic-check-' + topic.id"
            @change="toggleSelect(topic.id)"
          />
          <span class="rank-badge">{{ topic.rank }}</span>
          <span class="topic-text" :title="topic.topic">{{ displayTopic(topic.topic) }}</span>
          <span class="tag category-tag" :class="'cat-' + topic.category">{{ t('hotTopics.categories.' + topic.category) }}</span>
          <span class="tag channel-tag">{{ t('hotTopics.channels.' + topic.channel) }}</span>
          <span v-if="topic.hotValue" class="hot-value">{{ formatHotValue(topic.hotValue) }}</span>
          <button class="cohere-btn-secondary item-create-btn" @click="createCopySingle(topic)">
            {{ t('hotTopics.createCopy') }}
          </button>
        </div>
      </div>
    </div>

    <!-- 发布去向弹窗（复用采集页） -->
    <PublishDestinationModal
      :visible="showPublishModal"
      @close="showPublishModal = false"
      @publish-article="onPublishArticle"
      @publish-video="onPublishVideo"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { hotTopicsFetch } from '@/api/hot-topics'
import { aiRewrite, draftSave } from '@/api/publisher'
import { useNotify } from '@/composables/useNotify'
import PublishDestinationModal from '@/components/PublishDestinationModal.vue'

const router = useRouter()
const { t } = useI18n()
const { notifyError, notifyInfo } = useNotify()

// ── 状态 ──
const topics = ref([])
const channelStats = ref({})
const loading = ref(false)
const lastRefresh = ref(0)
const activeCategory = ref('all')
const activeChannel = ref('all')
const selectedIds = ref(new Set())

// 发布流程
const showPublishModal = ref(false)
const publishing = ref(false)
const publishQueue = ref([])
const publishMode = ref('article') // article | video
const publishDone = ref(false)
const publishCancelled = ref(false)
let refreshTimer = null
let requestSeq = 0
let disposed = false // 组件卸载标记：in-flight 改写/草稿保存不再写回状态

// ── 常量 ──
const CATEGORY_KEYS = ['general', 'society', 'finance', 'tech', 'entertainment', 'sports', 'emotion', 'education', 'health', 'international']
const CHANNEL_KEYS = ['zhihu', 'toutiao', 'tencent', 'bilibili', 'douyin', 'baidu', 'tophub']
const BATCH_LIMIT = 20
const TOPIC_PREFIX_KEY = 'hotTopics.topicPrefix'
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

// ── 计算 ──
const categoryOptions = computed(() => [
  { value: 'all', label: t('hotTopics.categoryAll') },
  ...CATEGORY_KEYS.map(k => ({ value: k, label: t('hotTopics.categories.' + k) })),
])
const channelOptions = computed(() => CHANNEL_KEYS.map(k => ({ value: k, label: t('hotTopics.channels.' + k) })))

const filteredTopics = computed(() => {
  return topics.value.filter(x =>
    (activeCategory.value === 'all' || x.category === activeCategory.value) &&
    (activeChannel.value === 'all' || x.channel === activeChannel.value),
  )
})

const allFilteredSelected = computed(() =>
  filteredTopics.value.length > 0 && filteredTopics.value.every(x => selectedIds.value.has(x.id)),
)

const selectedCountText = computed(() => t('hotTopics.selectedCount', { count: selectedIds.value.size }))

const failedChannels = computed(() =>
  Object.entries(channelStats.value)
    .filter(([, s]) => s && s.error)
    .map(([id]) => t('hotTopics.channels.' + id)),
)

const partialFailText = computed(() => t('hotTopics.partialFail', { channels: failedChannels.value.join('、') }))

const lastRefreshText = computed(() =>
  lastRefresh.value > 0 ? t('hotTopics.lastRefresh', { time: formatTime(lastRefresh.value) }) : '',
)

const progressText = computed(() => {
  const done = publishQueue.value.filter(x => x.status === 'success' || x.status === 'failed').length
  return t('hotTopics.publishProgress', { done, total: publishQueue.value.length })
})
const progressPct = computed(() => {
  if (publishQueue.value.length === 0) return 0
  const done = publishQueue.value.filter(x => x.status === 'success' || x.status === 'failed').length
  return Math.round((done / publishQueue.value.length) * 100)
})
const publishDoneText = computed(() => {
  const ok = publishQueue.value.filter(x => x.status === 'success').length
  if (publishCancelled.value) return t('hotTopics.publishCancelled', { count: ok })
  return t('hotTopics.publishDone', { count: ok })
})

// ── 方法 ──
function formatTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes())
}

function displayTopic(topic) {
  return topic.length > 60 ? topic.slice(0, 60) + '…' : topic
}

function formatHotValue(v) {
  if (v >= 10000) return (v / 10000).toFixed(1) + t('hotTopics.tenThousand')
  return String(v)
}

function toggleSelect(id) {
  const s = new Set(selectedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selectedIds.value = s
}

function toggleSelectAll() {
  if (allFilteredSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredTopics.value.map(x => x.id))
  }
}

/** 竞态守卫：刷新请求序号 */
async function refresh(force = false) {
  if (loading.value || publishing.value) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const res = await hotTopicsFetch(force)
    if (seq !== requestSeq) return // 旧响应丢弃
    if (res && res.code === 0 && res.data) {
      topics.value = Array.isArray(res.data.topics) ? res.data.topics : []
      channelStats.value = res.data.channelStats || {}
      lastRefresh.value = res.data.fetchedAt || Date.now()
      if (topics.value.length === 0 && failedChannels.value.length > 0) {
        notifyError('hotTopics.loadFailed')
      }
    } else {
      notifyError('hotTopics.loadFailed')
    }
  } catch (_) {
    if (seq === requestSeq) notifyError('hotTopics.loadFailed')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

/** 构造改写输入：<20 字符补引导语（与 RewriteView ≥20 校验对齐） */
function buildRewriteInput(topicText) {
  const prefix = t(TOPIC_PREFIX_KEY)
  return topicText.length >= 20 ? topicText : prefix + '\n' + topicText
}

function createCopySingle(topic) {
  router.push('/rewrite?topic=' + encodeURIComponent(topic.topic))
}

function createCopyBatch() {
  const selected = filteredTopics.value.filter(x => selectedIds.value.has(x.id))
  if (selected.length === 0) {
    notifyInfo('hotTopics.noSelection')
    return
  }
  if (selected.length > BATCH_LIMIT) {
    notifyInfo('hotTopics.batchLimit')
    return
  }
  // 本期简化：批量创作 = 逐条跳转首条自动开始；session 队列消费属后续迭代（PRD 3.4 已注明）
  router.push('/rewrite?topic=' + encodeURIComponent(selected[0].topic))
}

function startPublish() {
  const selected = filteredTopics.value.filter(x => selectedIds.value.has(x.id))
  if (selected.length === 0) {
    notifyInfo('hotTopics.noSelection')
    return
  }
  if (selected.length > BATCH_LIMIT) {
    notifyInfo('hotTopics.batchLimit')
    return
  }
  showPublishModal.value = true
}

function onPublishArticle() {
  showPublishModal.value = false
  publishMode.value = 'article'
  startBatchRewrite()
}

function onPublishVideo(pipelineId) {
  showPublishModal.value = false
  publishMode.value = 'video'
  startBatchRewrite(pipelineId)
}

function startBatchRewrite(pipelineId) {
  const selected = filteredTopics.value.filter(x => selectedIds.value.has(x.id))
  publishQueue.value = selected.map(x => ({
    id: x.id, topic: x.topic, status: 'pending', draftId: null, pipelineId: pipelineId || null,
  }))
  publishing.value = true
  publishDone.value = false
  publishCancelled.value = false
  runQueue()
}

async function runQueue() {
  for (const item of publishQueue.value) {
    if (item.status !== 'pending') continue
    if (!publishing.value) break // 已取消
    item.status = 'rewriting'
    await rewriteOne(item)
  }
  publishing.value = false
  publishDone.value = true
}

async function rewriteOne(item) {
  try {
    const res = await aiRewrite({ mode: 'create', content: buildRewriteInput(item.topic) })
    if (res && res.code === 0 && res.data && res.data.success) {
      const content = res.data.result || ''
      const draft = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: item.topic.slice(0, 64),
        content,
        source: 'hot-topics',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const saved = await draftSave(draft)
      if (disposed) return // 已卸载：草稿已保存但不更新 UI 状态
      if (saved && saved.code === 0) {
        item.status = 'success'
        item.draftId = draft.id
        return
      }
      throw new Error('draft save failed')
    }
    throw new Error((res && res.message) || 'rewrite failed')
  } catch (e) {
    item.status = 'failed'
    item.error = (e && e.message) || ''
  }
}

async function retryPublishItem(item) {
  if (!publishing.value && !publishDone.value) return
  item.status = 'rewriting'
  await rewriteOne(item)
}

function cancelPublish() {
  publishing.value = false
  publishCancelled.value = true
  publishDone.value = true
}

/** 完成后返回批量操作条（重置发布状态，允许开始新一轮） */
function backToBatch() {
  publishDone.value = false
  publishCancelled.value = false
  publishQueue.value = []
  selectedIds.value = new Set()
}

function goToDestination() {
  const okItems = publishQueue.value.filter(x => x.status === 'success' && x.draftId)
  if (okItems.length === 0) return
  if (publishMode.value === 'video') {
    const last = okItems[okItems.length - 1]
    router.push({ path: '/create', query: { draft: last.draftId } })
  } else {
    router.push('/publish')
  }
}

// ── 生命周期 ──
onMounted(() => {
  refresh(false)
  refreshTimer = setInterval(() => {
    if (document.hidden) return
    if (Date.now() - lastRefresh.value >= REFRESH_INTERVAL_MS) refresh(false)
  }, 60 * 1000)
})

onUnmounted(() => {
  disposed = true
  if (refreshTimer) clearInterval(refreshTimer)
  requestSeq++ // 使 in-flight 响应失效
  publishing.value = false
})
</script>

<style scoped>
.hot-topics-page { padding: 20px; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.last-refresh { font-size: 12px; color: #999; }
.filter-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.category-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.category-chip { padding: 4px 12px; border: 1px solid #ddd; border-radius: 14px; background: #fff; font-size: 12px; cursor: pointer; color: #666; }
.category-chip.active { border-color: #5149e8; color: #5149e8; background: #f0efff; font-weight: 600; }
.batch-bar { display: flex; align-items: center; gap: 14px; padding: 10px 14px; background: #fafaff; border: 1px solid #e9e8f6; border-radius: 8px; margin-bottom: 12px; }
.select-all-label { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #666; cursor: pointer; }
.selected-count { font-size: 13px; color: #5149e8; }
.batch-actions { margin-left: auto; display: flex; gap: 8px; }
.topics-list { display: flex; flex-direction: column; gap: 6px; }
.topic-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: #fff; border: 1px solid #eee; border-radius: 8px; }
.topic-item.selected { border-color: #5149e8; background: #f7f6ff; }
.rank-badge { min-width: 26px; height: 26px; display: grid; place-items: center; border-radius: 6px; background: #f0efff; color: #5149e8; font-size: 12px; font-weight: 700; }
.topic-text { flex: 1; font-size: 14px; color: #333; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; flex-shrink: 0; }
.category-tag { background: #f5f5f5; color: #666; }
.cat-general { background: #f5f5f5; color: #666; }
.cat-society { background: #e8f4ff; color: #1976d2; }
.cat-finance { background: #fff4e5; color: #f57c00; }
.cat-tech { background: #f3e8ff; color: #7b1fa2; }
.cat-entertainment { background: #ffe4f1; color: #c2185b; }
.cat-sports { background: #e8f7e8; color: #388e3c; }
.cat-emotion { background: #ffe8e8; color: #d32f2f; }
.cat-education { background: #e0f7fa; color: #0097a7; }
.cat-health { background: #e0f2f1; color: #00796b; }
.cat-international { background: #e3f2fd; color: #1565c0; }
.channel-tag { background: #f0f2f5; color: #888; }
.hot-value { font-size: 12px; color: #ff5722; flex-shrink: 0; }
.item-create-btn { font-size: 12px; padding: 4px 10px; flex-shrink: 0; }
.empty-box { text-align: center; padding: 60px 20px; }
.empty-title { font-size: 16px; font-weight: 600; color: #555; margin-bottom: 8px; }
.empty-desc { font-size: 13px; color: #999; margin-bottom: 16px; }
.loading-box { padding: 20px 0; }
.publish-progress { padding: 12px 14px; background: #fafaff; border: 1px solid #e9e8f6; border-radius: 8px; margin-bottom: 12px; }
.progress-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #5149e8; }
.progress-items { margin-top: 10px; max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.progress-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; padding: 4px 8px; border-radius: 4px; }
.progress-item.failed { background: #fff3f3; color: #d32f2f; }
.progress-item.success { background: #f3faf3; }
.pi-topic { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.retry-btn { border: 1px solid #d32f2f; background: transparent; color: #d32f2f; border-radius: 4px; font-size: 11px; padding: 1px 8px; cursor: pointer; }
.publish-done { margin-top: 12px; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #388e3c; }
</style>
