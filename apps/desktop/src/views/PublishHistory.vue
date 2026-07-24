<template>
  <div class="publish-history-page">
    <header class="history-header">
      <h1>发布记录</h1>
      <span>{{ totalRecords }} 条发布任务</span>
    </header>

    <div class="history-tabs" role="tablist" aria-label="发布内容">
      <button
        id="records-tab"
        class="history-tab"
        :class="{ active: activeTab === 'records' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'records'"
        aria-controls="records-panel"
        :tabindex="activeTab === 'records' ? 0 : -1"
        data-testid="records-tab"
        @click="activeTab = 'records'"
        @keydown="onTabKeydown($event, 0)"
      >
        发布记录
      </button>
      <button
        id="drafts-tab"
        class="history-tab"
        :class="{ active: activeTab === 'drafts' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'drafts'"
        aria-controls="drafts-panel"
        :tabindex="activeTab === 'drafts' ? 0 : -1"
        data-testid="drafts-tab"
        @click="openDrafts"
        @keydown="onTabKeydown($event, 1)"
      >
        草稿箱
      </button>
    </div>

    <section v-if="activeTab === 'records'" id="records-panel" class="history-panel" role="tabpanel" aria-labelledby="records-tab">
      <div class="history-tools" :class="{ 'selection-mode': selectionMode }">
        <template v-if="!selectionMode">
          <div class="history-search-row">
            <label class="history-search">
              <Search aria-hidden="true" />
              <input
                v-model="searchQuery"
                data-testid="history-search"
                type="search"
                placeholder="搜索作品描述或任务标题..."
                aria-label="搜索作品描述或任务标题"
              >
            </label>
            <div class="history-command-bar">
              <button class="secondary-action" type="button" data-testid="start-selection" @click="selectionMode = true">
                <Operation />批量管理
              </button>
              <div class="view-toggle" role="group" aria-label="记录视图">
                <button
                  class="icon-action"
                  type="button"
                  title="网格视图"
                  aria-label="网格视图"
                  :aria-pressed="viewMode === 'grid'"
                  data-testid="view-grid"
                  @click="viewMode = 'grid'"
                >
                  <Grid />
                </button>
                <button
                  class="icon-action"
                  type="button"
                  title="列表视图"
                  aria-label="列表视图"
                  :aria-pressed="viewMode === 'list'"
                  data-testid="view-list"
                  @click="viewMode = 'list'"
                >
                  <List />
                </button>
              </div>
              <button class="secondary-action" type="button" data-testid="export-history" :disabled="filteredRecords.length === 0" @click="exportHistory">
                <Download />导出
              </button>
              <button class="primary-action" type="button" data-testid="new-publish" @click="goToEditor">
                <CirclePlus />新建发布
              </button>
            </div>
          </div>
          <div class="history-filters">
            <select v-model="publisherFilter" data-testid="publisher-filter" aria-label="发布人筛选">
              <option value="">全部发布人</option>
              <option v-for="publisher in publisherOptions" :key="publisher" :value="publisher">{{ publisher }}</option>
            </select>
            <select v-model="contentTypeFilter" data-testid="content-type-filter" aria-label="作品类型筛选">
              <option value="">全部作品类型</option>
              <option value="article">图文</option>
              <option value="video">视频</option>
              <option value="image">图片</option>
            </select>
            <select v-model="statusFilter" data-testid="status-filter" aria-label="发布状态筛选">
              <option value="">全部发布状态</option>
              <option value="success">发布成功</option>
              <option value="failed">发布失败</option>
              <option value="pending">处理中</option>
            </select>
            <select v-model="publishModeFilter" data-testid="publish-mode-filter" aria-label="发布模式筛选">
              <option value="">全部发布模式</option>
              <option value="immediate">立即发布</option>
              <option value="scheduled">定时发布</option>
            </select>
          </div>
        </template>
        <div v-else class="selection-toolbar">
          <span class="selection-summary">
            <span aria-hidden="true" class="selection-box"></span>
            已选择 {{ selectedIds.length }} 项内容
          </span>
          <button class="toolbar-button" type="button" :disabled="filteredRecords.length === 0" @click="toggleSelectAll">
            {{ allSelected ? '取消全选' : '全选' }}
          </button>
          <button class="toolbar-button danger" type="button" disabled title="发布记录暂不支持删除">
            <Delete />删除
          </button>
          <button class="toolbar-button" type="button" @click="cancelSelection"><Close />取消选择</button>
          <div class="view-toggle" role="group" aria-label="记录视图">
            <button class="icon-action" type="button" title="网格视图" aria-label="网格视图" :aria-pressed="viewMode === 'grid'" data-testid="view-grid" @click="viewMode = 'grid'"><Grid /></button>
            <button class="icon-action" type="button" title="列表视图" aria-label="列表视图" :aria-pressed="viewMode === 'list'" data-testid="view-list" @click="viewMode = 'list'"><List /></button>
          </div>
          <button class="secondary-action" type="button" data-testid="export-history" :disabled="filteredRecords.length === 0" @click="exportHistory"><Download />导出</button>
          <button class="primary-action" type="button" data-testid="new-publish" @click="goToEditor"><CirclePlus />新建发布</button>
        </div>
      </div>

      <div class="panel-toolbar">
        <span class="record-count">共 {{ filteredRecords.length }} 条记录</span>
        <span v-if="hasActiveFilters" class="filter-result">已从 {{ records.length }} 条任务中筛选</span>
      </div>

      <div v-if="loading" class="state-panel" role="status">正在加载发布记录...</div>
      <div v-else-if="errorMessage" class="state-panel state-error" role="alert">
        <p>发布记录加载失败</p>
        <span>{{ errorMessage }}</span>
        <button class="secondary-action" type="button" data-testid="retry-history" @click="loadRecords()">重试</button>
      </div>
      <div v-else-if="records.length === 0" class="state-panel">
        <p>暂无发布记录</p>
        <span>完成一次发布后，任务状态会显示在这里。</span>
      </div>
      <div v-else-if="hasActiveFilters && loadingMore" class="state-panel" role="status">正在检索全部发布记录...</div>
      <div v-else-if="filteredRecords.length === 0" class="state-panel">
        <p>没有匹配的发布记录</p>
        <button class="secondary-action" type="button" @click="clearFilters">清除筛选</button>
      </div>
      <div v-else class="record-list" :class="{ 'grid-view': viewMode === 'grid' }">
        <article v-for="record in filteredRecords" :key="record.id" class="record-card">
          <label v-if="selectionMode" class="record-selector">
            <input
              v-model="selectedIds"
              type="checkbox"
              :value="record.id"
              :aria-label="`选择${recordTitle(record)}`"
            >
          </label>
          <div class="record-preview">
            <img v-if="thumbnailUrl(record)" :src="thumbnailUrl(record)" alt="">
            <span v-else aria-hidden="true">{{ platformIcon(record.platform) }}</span>
            <small>{{ contentTypeLabel(record) }}</small>
          </div>
          <div class="record-main">
            <div class="record-title-row">
              <h2>{{ recordTitle(record) }}</h2>
            </div>
            <div class="record-meta">
              <span><User />{{ publisherName(record) }}</span>
              <span><Clock />{{ formatTime(record.timestamp || record.createdAt || record.publishedAt) }}</span>
              <span>{{ publishModeLabel(record) }}</span>
            </div>
            <div class="record-delivery">
              <span class="status-badge" :class="statusClass(record)">{{ statusLabel(record) }}</span>
              <span class="platform-name"><span aria-hidden="true">{{ platformIcon(record.platform) }}</span>{{ platformName(record.platform) }}</span>
            </div>
          </div>
          <div class="record-stats" aria-label="发布统计">
            <div><span>账号数</span><strong>{{ metricValue(record.accountCount, 1) }}</strong></div>
            <div><span>任务数</span><strong>{{ metricValue(record.taskCount, 1) }}</strong></div>
            <div><span>失败</span><strong class="failure-value">{{ failedCount(record) }}</strong></div>
            <div><span>播放</span><strong>{{ metricValue(record.views) }}</strong></div>
            <div><span>评论</span><strong>{{ metricValue(record.comments) }}</strong></div>
            <div><span>点赞</span><strong>{{ metricValue(record.likes) }}</strong></div>
            <div><span>收藏</span><strong>{{ metricValue(record.favorites) }}</strong></div>
            <div><span>分享</span><strong>{{ metricValue(record.shares) }}</strong></div>
          </div>
        </article>
      </div>
      <div v-if="hasMoreRecords && !loading && !errorMessage" class="pagination-footer">
        <button
          class="secondary-action"
          type="button"
          data-testid="load-more-history"
          :disabled="loadingMore"
          @click="loadMoreRecords"
        >
          {{ loadingMore ? '正在加载...' : `加载更多（已加载 ${records.length}/${totalRecords}）` }}
        </button>
      </div>
    </section>

    <section v-else id="drafts-panel" class="history-panel drafts-panel" role="tabpanel" aria-labelledby="drafts-tab">
      <div class="panel-toolbar">
        <span class="record-count">共 {{ drafts.length }} 个草稿</span>
        <button class="secondary-action" type="button" @click="loadDrafts">刷新</button>
      </div>
      <div v-if="draftLoading" class="state-panel" role="status">正在加载草稿...</div>
      <div v-else-if="draftError" class="state-panel state-error" role="alert">
        <p>草稿箱加载失败</p>
        <span>{{ draftError }}</span>
        <button class="secondary-action" type="button" @click="loadDrafts">重试</button>
      </div>
      <div v-else-if="drafts.length === 0" class="state-panel">
        <p>暂无草稿</p>
        <span>保存草稿后，可以从这里继续编辑。</span>
      </div>
      <div v-else class="record-list">
        <article v-for="draft in drafts" :key="draft.id" class="record-card draft-card">
          <div class="record-preview draft-preview" aria-hidden="true"><span>草</span></div>
          <div class="record-main">
            <div class="record-title-row"><h2>{{ draft.title || '未命名草稿' }}</h2></div>
            <div class="record-meta">
              <span><Clock />{{ formatTime(draft.updated_at || draft.updatedAt || draft.created_at || draft.createdAt) }}</span>
              <span v-if="draft.content">{{ contentPreview(draft.content) }}</span>
            </div>
          </div>
          <button class="secondary-action" type="button" :data-testid="`edit-draft-${draft.id}`" @click="editDraft(draft.id)">继续编辑</button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { CirclePlus, Clock, Close, Delete, Download, Grid, List, Operation, Search, User } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { draftList, historyList } from '@/api/publisher'
import { PLATFORM_ICONS, PLATFORM_NAMES } from '@multi-publish/shared-utils/src/platform-definitions'

const router = useRouter()
const activeTab = ref('records')
const records = ref([])
const drafts = ref([])
const loading = ref(false)
const draftLoading = ref(false)
const errorMessage = ref('')
const draftError = ref('')
const selectionMode = ref(false)
const selectedIds = ref([])
const totalRecords = ref(0)
const loadingMore = ref(false)
const paginationExhausted = ref(false)
const searchQuery = ref('')
const publisherFilter = ref('')
const contentTypeFilter = ref('')
const statusFilter = ref('')
const publishModeFilter = ref('')
const viewMode = ref('list')
const PAGE_SIZE = 50
let pendingFilterLoad = null
const loadedPageSignatures = new Set()

const publisherOptions = computed(() => [...new Set(records.value.map(publisherName))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const hasActiveFilters = computed(() => Boolean(
  searchQuery.value || publisherFilter.value || contentTypeFilter.value || statusFilter.value || publishModeFilter.value,
))
const filteredRecords = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return records.value.filter(record => {
    if (query) {
      const searchable = [recordTitle(record), record.description, record.content, record.taskId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!searchable.includes(query)) return false
    }
    if (publisherFilter.value && publisherName(record) !== publisherFilter.value) return false
    if (contentTypeFilter.value && contentTypeValue(record) !== contentTypeFilter.value) return false
    if (statusFilter.value && normalizedStatusGroup(record) !== statusFilter.value) return false
    if (publishModeFilter.value && publishModeValue(record) !== publishModeFilter.value) return false
    return true
  })
})
const allSelected = computed(() => (
  filteredRecords.value.length > 0
  && filteredRecords.value.every(record => selectedIds.value.includes(record.id))
))
const hasMoreRecords = computed(() => !paginationExhausted.value && records.value.length < totalRecords.value)

function normalizeRecords (result) {
  if (!result || result.code !== 0) throw new Error(result?.message || '发布记录读取失败')
  const data = result.data
  if (Array.isArray(data)) return { total: data.length, records: data }
  const pageRecords = Array.isArray(data?.records) ? data.records : []
  const total = Number.isFinite(Number(data?.total)) ? Math.max(0, Number(data.total)) : pageRecords.length
  return { total, records: pageRecords }
}

function stableRecordId (record) {
  const id = record?.id
  return id === undefined || id === null || id === '' ? null : String(id)
}

function pageSignature (pageRecords) {
  return pageRecords.map(record => {
    const id = stableRecordId(record)
    if (id !== null) return `id:${id}`
    try {
      return `record:${JSON.stringify(record)}`
    } catch {
      return 'record:unserializable'
    }
  }).join('\u001e')
}

function appendDistinctRecords (currentRecords, pageRecords) {
  const seenIds = new Set(currentRecords.map(stableRecordId).filter(id => id !== null))
  return pageRecords.filter(record => {
    const id = stableRecordId(record)
    if (id === null) return true
    if (seenIds.has(id)) return false
    seenIds.add(id)
    return true
  })
}

async function loadRecords (options = {}) {
  const append = options?.append === true
  if (append) loadingMore.value = true
  else loading.value = true
  errorMessage.value = ''
  try {
    const offset = append ? records.value.length : 0
    const page = normalizeRecords(await historyList({ limit: PAGE_SIZE, offset }))
    const signature = pageSignature(page.records)
    const repeatedPage = append && loadedPageSignatures.has(signature)
    const recordsToAppend = repeatedPage ? [] : appendDistinctRecords(records.value, page.records)
    const addedCount = append ? recordsToAppend.length : page.records.length

    if (!append) {
      loadedPageSignatures.clear()
      loadedPageSignatures.add(signature)
      records.value = page.records
    } else if (!repeatedPage) {
      loadedPageSignatures.add(signature)
      records.value = [...records.value, ...recordsToAppend]
    }
    totalRecords.value = page.total
    paginationExhausted.value = page.records.length === 0
      || repeatedPage
      || (append && addedCount === 0)
      || records.value.length >= page.total
    selectedIds.value = selectedIds.value.filter(id => records.value.some(record => record.id === id))
    if (!append && hasActiveFilters.value) void loadRemainingRecordsForFilters()
    return page.records.length > 0 && (!append || addedCount > 0)
  } catch {
    if (!append) {
      records.value = []
      totalRecords.value = 0
      paginationExhausted.value = true
      loadedPageSignatures.clear()
    }
    errorMessage.value = '请检查服务连接后重试'
    return false
  } finally {
    if (append) loadingMore.value = false
    else loading.value = false
  }
}

function loadMoreRecords () {
  if (loadingMore.value || !hasMoreRecords.value) return
  return loadRecords({ append: true })
}

async function loadRemainingRecordsForFilters () {
  if (!hasActiveFilters.value || !hasMoreRecords.value || pendingFilterLoad) return pendingFilterLoad

  pendingFilterLoad = (async () => {
    while (hasActiveFilters.value && hasMoreRecords.value) {
      const loaded = await loadRecords({ append: true })
      if (!loaded) break
    }
  })().finally(() => {
    pendingFilterLoad = null
  })
  return pendingFilterLoad
}

watch(
  [searchQuery, publisherFilter, contentTypeFilter, statusFilter, publishModeFilter],
  () => {
    if (hasActiveFilters.value) void loadRemainingRecordsForFilters()
  },
)

async function loadDrafts () {
  draftLoading.value = true
  draftError.value = ''
  try {
    const result = await draftList()
    if (!result || result.code !== 0) throw new Error(result?.message || '草稿读取失败')
    drafts.value = Array.isArray(result.data) ? result.data : []
  } catch {
    drafts.value = []
    draftError.value = '请检查服务连接后重试'
  } finally {
    draftLoading.value = false
  }
}

function openDrafts () {
  activeTab.value = 'drafts'
  loadDrafts()
}

function onTabKeydown (event, index) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : index === 0 ? 1 : 0
  if (nextIndex === 0) activeTab.value = 'records'
  else openDrafts()
  nextTick(() => {
    event.currentTarget?.parentElement?.querySelectorAll('[role="tab"]')?.[nextIndex]?.focus()
  })
}

function goToEditor () {
  router.push('/publish')
}

function editDraft (id) {
  if (!id) return
  router.push('/publish?draft=' + encodeURIComponent(id))
}

function cancelSelection () {
  selectionMode.value = false
  selectedIds.value = []
}

function toggleSelectAll () {
  if (allSelected.value) {
    const visibleIds = new Set(filteredRecords.value.map(record => record.id))
    selectedIds.value = selectedIds.value.filter(id => !visibleIds.has(id))
    return
  }
  selectedIds.value = [...new Set([...selectedIds.value, ...filteredRecords.value.map(record => record.id)])]
}

function clearFilters () {
  searchQuery.value = ''
  publisherFilter.value = ''
  contentTypeFilter.value = ''
  statusFilter.value = ''
  publishModeFilter.value = ''
}

function platformName (platform) {
  return PLATFORM_NAMES[platform] || platform || '未指定平台'
}

function platformIcon (platform) {
  return PLATFORM_ICONS[platform] || '•'
}

function recordTitle (record) {
  return record?.title || record?.name || '未命名发布任务'
}

function publisherName (record) {
  return record?.publisher || record?.author || record?.operator || '系统账号'
}

function statusValue (record) {
  if (record?.success === false) return 'failed'
  return String(record?.status || 'success').toLowerCase()
}

function normalizedStatusGroup (record) {
  const value = statusValue(record)
  if (['success', 'completed', 'published'].includes(value)) return 'success'
  if (['failed', 'error'].includes(value)) return 'failed'
  return 'pending'
}

function statusLabel (record) {
  const labels = {
    success: '全部发布成功',
    completed: '全部发布成功',
    published: '全部发布成功',
    failed: '发布失败',
    error: '发布失败',
    running: '发布中',
    pending: '等待发布',
    scheduled: '已排期',
  }
  return labels[statusValue(record)] || '处理中'
}

function statusClass (record) {
  return normalizedStatusGroup(record)
}

function contentTypeValue (record) {
  const value = String(record?.contentType || record?.type || '').toLowerCase()
  if (['video', 'short_video', 'short-video'].includes(value)) return 'video'
  if (['image', 'gallery'].includes(value)) return 'image'
  if (value) return 'article'
  return ['douyin', 'bilibili', 'kuaishou', 'tencent_video', 'youtube', 'tiktok'].includes(record?.platform)
    ? 'video'
    : 'article'
}

function contentTypeLabel (record) {
  return { article: '图文', video: '视频', image: '图片' }[contentTypeValue(record)]
}

function publishModeValue (record) {
  const value = String(record?.publishMode || record?.mode || '').toLowerCase()
  return ['scheduled', 'schedule', 'timed'].includes(value) || statusValue(record) === 'scheduled'
    ? 'scheduled'
    : 'immediate'
}

function publishModeLabel (record) {
  return publishModeValue(record) === 'scheduled' ? '定时发布' : '立即发布'
}

function thumbnailUrl (record) {
  return record?.thumbnail || record?.thumbnailUrl || record?.cover || record?.coverUrl || ''
}

function failedCount (record) {
  if (record?.failedCount !== undefined && record?.failedCount !== null) return record.failedCount
  return normalizedStatusGroup(record) === 'failed' ? 1 : 0
}

function metricValue (value, fallback = '-') {
  if (value === undefined || value === null || value === '') return fallback
  return value
}

function formatTime (value) {
  if (!value) return '时间未知'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-CN')
}

function contentPreview (content) {
  const text = String(content).replace(/\s+/g, ' ').trim()
  return text.length > 48 ? text.slice(0, 48) + '...' : text
}

function csvCell (value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function exportHistory () {
  const headers = ['标题', '发布人', '平台', '作品类型', '发布状态', '发布模式', '发布时间', '账号数', '任务数', '失败', '播放', '评论', '点赞', '收藏', '分享']
  const rows = filteredRecords.value.map(record => [
    recordTitle(record),
    publisherName(record),
    platformName(record.platform),
    contentTypeLabel(record),
    statusLabel(record),
    publishModeLabel(record),
    formatTime(record.timestamp || record.createdAt || record.publishedAt),
    metricValue(record.accountCount, 1),
    metricValue(record.taskCount, 1),
    failedCount(record),
    metricValue(record.views),
    metricValue(record.comments),
    metricValue(record.likes),
    metricValue(record.favorites),
    metricValue(record.shares),
  ])
  const csv = '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `publish-history-${new Date().toISOString().slice(0, 10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

onMounted(loadRecords)
</script>

<style scoped>
.publish-history-page {
  min-height: 100%;
  padding: 20px 24px 40px;
  background: #f6f7fb;
  color: var(--text-primary, #25252b);
}

.history-header,
.history-tabs,
.history-search-row,
.history-command-bar,
.selection-toolbar,
.panel-toolbar,
.record-title-row,
.record-meta,
.record-delivery,
.view-toggle {
  display: flex;
  align-items: center;
}

.history-header {
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
}

.history-header h1 { margin: 0; color: var(--text-primary, #25252b); font-size: 20px; line-height: 28px; }
.history-header > span { color: var(--text-muted, #707080); font-size: 12px; }

.history-tabs {
  gap: 24px;
  border-bottom: 1px solid var(--border-light, #e8e8ec);
  background: #fff;
  padding: 0 4px;
}

.history-tab {
  min-height: 44px;
  border: 0;
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
  padding: 8px 0 7px;
  background: transparent;
  color: var(--text-muted, #707080);
  font-size: 14px;
  cursor: pointer;
}

.history-tab.active { border-bottom-color: var(--primary, #5048e5); color: var(--primary, #5048e5); font-weight: 700; }
.history-panel { min-width: 0; background: transparent; }

.history-tools {
  margin-top: 16px;
  border: 1px solid var(--border-light, #e8e8ec);
  border-radius: 8px;
  padding: 16px;
  background: #fff;
}

.history-tools.selection-mode { min-height: 58px; display: flex; align-items: center; justify-content: flex-end; }
.history-search-row { justify-content: space-between; gap: 20px; }

.history-search {
  position: relative;
  width: min(100%, 450px);
  display: flex;
  align-items: center;
}

.history-search svg { position: absolute; left: 12px; width: 17px; height: 17px; color: #92939c; }
.history-search input {
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  border: 1px solid var(--border, #dedee5);
  border-radius: 6px;
  padding: 7px 12px 7px 38px;
  background: #fafafd;
  color: var(--text-primary, #25252b);
  font-size: 13px;
  outline: none;
}
.history-search input:focus { border-color: var(--primary, #5048e5); box-shadow: 0 0 0 2px rgba(80, 72, 229, 0.1); }

.history-command-bar,
.selection-toolbar { justify-content: flex-end; flex-wrap: wrap; gap: 10px; }

.history-filters { display: grid; grid-template-columns: repeat(4, minmax(140px, 190px)); gap: 12px; margin-top: 14px; }
.history-filters select {
  width: 100%;
  height: 36px;
  border: 1px solid var(--border, #dedee5);
  border-radius: 6px;
  padding: 0 32px 0 12px;
  background: #fafafd;
  color: #4f505a;
  font-size: 13px;
}

.primary-action,
.secondary-action,
.toolbar-button,
.icon-action {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border-radius: 6px;
  padding: 0 13px;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}

.primary-action { border: 1px solid var(--primary, #5048e5); background: var(--primary, #5048e5); color: #fff; }
.secondary-action,
.toolbar-button,
.icon-action { border: 1px solid var(--border, #dedee5); background: #fff; color: #4f505a; }
.primary-action svg,
.secondary-action svg,
.toolbar-button svg { width: 15px; height: 15px; }
.primary-action:hover { background: #443ccf; }
.secondary-action:hover:not(:disabled),
.toolbar-button:hover:not(:disabled),
.icon-action:hover { border-color: var(--primary, #5048e5); color: var(--primary, #5048e5); }
.secondary-action:disabled,
.toolbar-button:disabled { opacity: 0.5; cursor: not-allowed; }
.toolbar-button.danger { color: #c43d4d; }

.view-toggle { gap: 2px; border-radius: 6px; padding: 2px; background: #f5f5f8; }
.icon-action { width: 32px; min-height: 32px; border: 0; padding: 0; background: transparent; }
.icon-action[aria-pressed='true'] { background: #fff; color: var(--primary, #5048e5); box-shadow: 0 1px 3px rgba(28, 28, 35, 0.12); }
.icon-action svg { width: 16px; height: 16px; }

.selection-toolbar { width: 100%; }
.selection-summary { min-height: 36px; display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border, #dedee5); border-radius: 6px; padding: 0 12px; color: #6b6c76; font-size: 13px; }
.selection-box { width: 15px; height: 15px; border: 1px solid #8e87ed; border-radius: 4px; }

.panel-toolbar { min-height: 44px; justify-content: space-between; gap: 12px; padding: 0 4px; }
.record-count,
.filter-result { color: var(--text-muted, #707080); font-size: 12px; }
.filter-result { color: var(--primary, #5048e5); }

.state-panel {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  border: 1px solid var(--border-light, #e8e8ec);
  border-radius: 8px;
  padding: 32px;
  background: #fff;
  color: var(--text-muted, #707080);
  text-align: center;
}
.state-panel p { margin: 0; color: var(--text-primary, #25252b); font-size: 15px; font-weight: 600; }
.state-panel span { font-size: 13px; }
.state-error p { color: #b33b3b; }

.record-list { display: flex; flex-direction: column; gap: 16px; }
.pagination-footer { display: flex; justify-content: center; padding: 18px 0 4px; }
.record-card {
  min-width: 0;
  min-height: 156px;
  display: flex;
  align-items: center;
  gap: 14px;
  border: 1px solid var(--border-light, #e8e8ec);
  border-radius: 8px;
  padding: 18px 20px;
  background: #fff;
}
.record-card:hover { border-color: #d8d6ef; box-shadow: 0 3px 12px rgba(40, 40, 55, 0.05); }
.record-selector { flex: 0 0 18px; }
.record-selector input { width: 16px; height: 16px; accent-color: var(--primary, #5048e5); }

.record-preview {
  position: relative;
  width: 200px;
  height: 112px;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: 0 0 200px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #eef1f6;
  color: var(--primary, #5048e5);
  font-size: 30px;
}
.record-preview img { width: 100%; height: 100%; object-fit: cover; }
.record-preview small { position: absolute; right: 5px; bottom: 5px; border-radius: 4px; padding: 2px 5px; background: rgba(26, 27, 34, 0.78); color: #fff; font-size: 10px; }
.draft-preview { background: #f1f5f9; color: #64748b; font-size: 18px; font-weight: 700; }

.record-main { min-width: 0; flex: 1; }
.record-title-row { justify-content: space-between; gap: 12px; }
.record-title-row h2 { overflow: hidden; margin: 0; color: var(--text-primary, #25252b); font-size: 15px; font-weight: 700; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.record-meta { flex-wrap: wrap; gap: 8px 14px; margin-top: 7px; color: var(--text-muted, #707080); font-size: 12px; }
.record-meta span { display: inline-flex; align-items: center; gap: 4px; }
.record-meta svg { width: 13px; height: 13px; }
.record-delivery { flex-wrap: wrap; gap: 10px; margin-top: 11px; }
.status-badge { border-radius: 4px; padding: 3px 7px; font-size: 11px; font-weight: 600; }
.status-badge.success { background: #e8f7ef; color: #15803d; }
.status-badge.failed { background: #fcebea; color: #b42318; }
.status-badge.pending { background: #fff6df; color: #9a6700; }
.platform-name { display: inline-flex; align-items: center; gap: 5px; color: #5d5e68; font-size: 12px; font-weight: 600; }

.record-stats { min-width: 430px; display: grid; grid-template-columns: repeat(8, minmax(42px, 1fr)); border-left: 1px solid var(--border-light, #efeff2); padding-left: 14px; }
.record-stats div { min-width: 0; display: flex; align-items: center; flex-direction: column; gap: 7px; text-align: center; }
.record-stats span { color: #90919b; font-size: 11px; white-space: nowrap; }
.record-stats strong { color: var(--text-primary, #25252b); font-size: 14px; }
.record-stats .failure-value { color: #e24a5a; }

.record-list.grid-view { display: grid; grid-template-columns: repeat(auto-fill, minmax(390px, 1fr)); align-items: start; }
.grid-view .record-card { align-items: flex-start; flex-wrap: wrap; }
.grid-view .record-preview { width: 108px; height: 82px; flex-basis: 108px; }
.grid-view .record-stats { width: 100%; min-width: 0; border-top: 1px solid var(--border-light, #efeff2); border-left: 0; padding-top: 12px; padding-left: 0; }
.drafts-panel { padding-top: 8px; }

.primary-action:focus-visible,
.secondary-action:focus-visible,
.toolbar-button:focus-visible,
.icon-action:focus-visible,
.history-tab:focus-visible,
.record-selector input:focus-visible,
.history-filters select:focus-visible {
  outline: 2px solid var(--primary, #5048e5);
  outline-offset: 2px;
}

@media (max-width: 1180px) {
  .history-search-row { align-items: stretch; flex-direction: column; }
  .history-search { width: 100%; max-width: none; }
  .history-command-bar { justify-content: flex-start; }
  .record-card { align-items: flex-start; flex-wrap: wrap; }
  .record-stats { width: 100%; min-width: 0; border-top: 1px solid var(--border-light, #efeff2); border-left: 0; padding-top: 12px; padding-left: 0; }
}

@media (max-width: 720px) {
  .publish-history-page { padding: 16px 12px 28px; }
  .history-header { align-items: flex-start; }
  .history-tools { padding: 12px; }
  .history-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .history-command-bar,
  .selection-toolbar { justify-content: flex-start; }
  .record-card { align-items: flex-start; flex-wrap: wrap; padding: 12px; }
  .record-selector { padding-top: 5px; }
  .record-preview { width: 78px; height: 66px; flex-basis: 78px; }
  .record-main { width: auto; flex: 1 1 0; }
  .record-title-row h2 { white-space: normal; }
  .record-stats { grid-template-columns: repeat(4, 1fr); gap: 12px 0; }
  .record-list.grid-view { grid-template-columns: 1fr; }
  .draft-card .secondary-action { width: 100%; }
}

@media (max-width: 460px) {
  .history-filters { grid-template-columns: 1fr; }
  .history-command-bar > .secondary-action,
  .history-command-bar > .primary-action { flex: 1 1 auto; }
  .record-preview { width: 68px; height: 60px; flex-basis: 68px; }
  .record-meta { gap: 6px 10px; }
}
</style>
