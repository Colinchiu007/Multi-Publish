<template>
  <div class="publish-history-page">
    <header class="history-header">
      <div>
        <p class="eyebrow">发布中心</p>
        <h1>发布记录</h1>
        <p class="history-description">查看已提交的发布任务，也可以从这里继续编辑草稿。</p>
      </div>
      <button class="primary-action" type="button" data-testid="new-publish" @click="goToEditor">
        <span aria-hidden="true">+</span>
        新建发布
      </button>
    </header>

    <div class="history-tabs" role="tablist" aria-label="发布内容">
      <button
        class="history-tab"
        :class="{ active: activeTab === 'records' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'records'"
        data-testid="records-tab"
        @click="activeTab = 'records'"
      >
        发布记录
      </button>
      <button
        class="history-tab"
        :class="{ active: activeTab === 'drafts' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'drafts'"
        data-testid="drafts-tab"
        @click="openDrafts"
      >
        草稿箱
      </button>
    </div>

    <section v-if="activeTab === 'records'" class="history-panel" aria-labelledby="records-tab">
      <div class="panel-toolbar">
        <div class="toolbar-summary">
          <span class="record-count">共 {{ records.length }} 条记录</span>
          <span v-if="selectionMode" class="selection-count">已选择 {{ selectedIds.length }} 项</span>
        </div>
        <div class="toolbar-actions">
          <button
            v-if="!selectionMode"
            class="secondary-action"
            type="button"
            data-testid="start-selection"
            @click="selectionMode = true"
          >
            批量管理
          </button>
          <template v-else>
            <button class="toolbar-button" type="button" :disabled="records.length === 0" @click="toggleSelectAll">
              {{ allSelected ? '取消全选' : '全选' }}
            </button>
            <button class="toolbar-button danger" type="button" disabled title="发布记录暂不支持删除">
              删除
            </button>
            <button class="toolbar-button" type="button" @click="cancelSelection">取消选择</button>
          </template>
        </div>
      </div>

      <div v-if="loading" class="state-panel" role="status">正在加载发布记录...</div>
      <div v-else-if="errorMessage" class="state-panel state-error" role="alert">
        <p>发布记录加载失败</p>
        <span>{{ errorMessage }}</span>
        <button class="secondary-action" type="button" data-testid="retry-history" @click="loadRecords">重试</button>
      </div>
      <div v-else-if="records.length === 0" class="state-panel">
        <p>暂无发布记录</p>
        <span>完成一次发布后，任务状态会显示在这里。</span>
      </div>
      <div v-else class="record-list">
        <article v-for="record in records" :key="record.id" class="record-card">
          <label v-if="selectionMode" class="record-selector">
            <input
              v-model="selectedIds"
              type="checkbox"
              :value="record.id"
              :aria-label="`选择${recordTitle(record)}`"
            />
          </label>
          <div class="record-preview" aria-hidden="true">
            <span>{{ platformIcon(record.platform) }}</span>
          </div>
          <div class="record-main">
            <div class="record-title-row">
              <h2>{{ recordTitle(record) }}</h2>
              <span class="status-badge" :class="statusClass(record)">{{ statusLabel(record) }}</span>
            </div>
            <div class="record-meta">
              <span class="platform-name">{{ platformName(record.platform) }}</span>
              <span>{{ formatTime(record.timestamp || record.createdAt || record.publishedAt) }}</span>
              <span v-if="record.taskId">任务 {{ record.taskId }}</span>
            </div>
          </div>
          <div class="record-stats" aria-label="发布统计">
            <div v-if="record.accountCount !== undefined && record.accountCount !== null">
              <strong>{{ record.accountCount }}</strong>
              <span>账号数</span>
            </div>
            <div v-if="record.taskCount !== undefined && record.taskCount !== null">
              <strong>{{ record.taskCount }}</strong>
              <span>任务数</span>
            </div>
          </div>
        </article>
      </div>
    </section>

    <section v-else class="history-panel" aria-labelledby="drafts-tab">
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
            <div class="record-title-row">
              <h2>{{ draft.title || '未命名草稿' }}</h2>
              <span class="status-badge draft-status">草稿</span>
            </div>
            <div class="record-meta">
              <span>{{ formatTime(draft.updated_at || draft.updatedAt || draft.created_at || draft.createdAt) }}</span>
              <span v-if="draft.content">{{ contentPreview(draft.content) }}</span>
            </div>
          </div>
          <button
            class="secondary-action"
            type="button"
            :data-testid="`edit-draft-${draft.id}`"
            @click="editDraft(draft.id)"
          >
            继续编辑
          </button>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
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

const allSelected = computed(() => records.value.length > 0 && selectedIds.value.length === records.value.length)

function normalizeRecords (result) {
  if (!result || result.code !== 0) throw new Error(result?.message || '发布记录读取失败')
  const data = result.data
  return Array.isArray(data) ? data : (Array.isArray(data?.records) ? data.records : [])
}

async function loadRecords () {
  loading.value = true
  errorMessage.value = ''
  try {
    records.value = normalizeRecords(await historyList({ limit: 50 }))
    selectedIds.value = selectedIds.value.filter(id => records.value.some(record => record.id === id))
  } catch {
    records.value = []
    errorMessage.value = '请检查服务连接后重试'
  } finally {
    loading.value = false
  }
}

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
  selectedIds.value = allSelected.value ? [] : records.value.map(record => record.id)
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

function statusValue (record) {
  if (record?.success === false) return 'failed'
  return String(record?.status || 'success').toLowerCase()
}

function statusLabel (record) {
  const labels = {
    success: '发布成功',
    completed: '发布成功',
    published: '发布成功',
    failed: '发布失败',
    error: '发布失败',
    running: '发布中',
    pending: '等待发布',
    scheduled: '已排期',
  }
  return labels[statusValue(record)] || '处理中'
}

function statusClass (record) {
  const value = statusValue(record)
  if (['success', 'completed', 'published'].includes(value)) return 'success'
  if (['failed', 'error'].includes(value)) return 'failed'
  return 'pending'
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

onMounted(loadRecords)
</script>

<style scoped>
.publish-history-page {
  min-height: 100%;
  padding: 28px 32px 48px;
  background: var(--canvas, #f7f8fb);
  color: var(--text, #263248);
}

.history-header,
.panel-toolbar,
.record-title-row,
.record-meta,
.toolbar-actions,
.history-tabs {
  display: flex;
  align-items: center;
}

.history-header {
  justify-content: space-between;
  gap: 24px;
  max-width: 1180px;
  margin: 0 auto 24px;
}

.eyebrow {
  margin: 0 0 6px;
  color: var(--text-muted, #718096);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 6px;
  color: var(--primary, #4f46e5);
  font-size: 28px;
  line-height: 1.2;
}

.history-description {
  margin-bottom: 0;
  color: var(--text-muted, #718096);
  font-size: 14px;
}

.primary-action,
.secondary-action,
.toolbar-button {
  min-height: 36px;
  border-radius: 6px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.primary-action {
  border: 1px solid var(--primary, #4f46e5);
  background: var(--primary, #4f46e5);
  color: #fff;
  white-space: nowrap;
}

.primary-action span {
  margin-right: 5px;
  font-size: 18px;
  line-height: 0;
}

.secondary-action,
.toolbar-button {
  border: 1px solid var(--border, #dfe3eb);
  background: var(--surface, #fff);
  color: var(--text, #263248);
}

.secondary-action:hover,
.toolbar-button:hover:not(:disabled) {
  border-color: var(--primary, #4f46e5);
  color: var(--primary, #4f46e5);
}

.history-tabs {
  max-width: 1180px;
  margin: 0 auto;
  gap: 24px;
  border-bottom: 1px solid var(--border, #dfe3eb);
}

.history-tab {
  border: 0;
  border-bottom: 3px solid transparent;
  margin-bottom: -1px;
  padding: 12px 2px 10px;
  background: transparent;
  color: var(--text-muted, #718096);
  font-size: 14px;
  cursor: pointer;
}

.history-tab.active {
  border-bottom-color: var(--primary, #4f46e5);
  color: var(--primary, #4f46e5);
  font-weight: 700;
}

.history-panel {
  max-width: 1180px;
  margin: 0 auto;
  border: 1px solid var(--border, #dfe3eb);
  border-top: 0;
  background: var(--surface, #fff);
}

.panel-toolbar {
  justify-content: space-between;
  min-height: 60px;
  gap: 16px;
  border-bottom: 1px solid var(--border, #dfe3eb);
  padding: 0 18px;
}

.toolbar-actions {
  gap: 8px;
}

.toolbar-button:disabled {
  color: #a5adba;
  cursor: not-allowed;
  opacity: 0.7;
}

.toolbar-button.danger {
  color: #c24141;
}

.record-count,
.selection-count {
  color: var(--text-muted, #718096);
  font-size: 13px;
}

.selection-count {
  margin-left: 12px;
  color: var(--primary, #4f46e5);
  font-weight: 600;
}

.state-panel {
  display: flex;
  min-height: 220px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 32px;
  color: var(--text-muted, #718096);
  text-align: center;
}

.state-panel p {
  margin-bottom: 0;
  color: var(--text, #263248);
  font-size: 16px;
  font-weight: 600;
}

.state-panel span {
  font-size: 13px;
}

.state-error p {
  color: #b33b3b;
}

.record-list {
  display: flex;
  flex-direction: column;
}

.record-card {
  display: flex;
  min-height: 112px;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid var(--border, #dfe3eb);
  padding: 16px 18px;
}

.record-card:last-child {
  border-bottom: 0;
}

.record-card:hover {
  background: #fbfcfe;
}

.record-selector {
  flex: 0 0 18px;
}

.record-selector input {
  width: 16px;
  height: 16px;
  accent-color: var(--primary, #4f46e5);
}

.record-preview {
  display: grid;
  width: 92px;
  height: 76px;
  flex: 0 0 92px;
  place-items: center;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #eef2f7;
  color: var(--primary, #4f46e5);
  font-size: 30px;
}

.draft-preview {
  background: #f1f5f9;
  color: #64748b;
  font-size: 18px;
  font-weight: 700;
}

.record-main {
  min-width: 0;
  flex: 1;
}

.record-title-row {
  justify-content: space-between;
  gap: 12px;
}

.record-title-row h2 {
  overflow: hidden;
  margin-bottom: 8px;
  color: var(--text, #263248);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-badge {
  flex: 0 0 auto;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
}

.status-badge.success {
  background: #e8f7ef;
  color: #15803d;
}

.status-badge.failed {
  background: #fcebea;
  color: #b42318;
}

.status-badge.pending,
.draft-status {
  background: #fff6df;
  color: #9a6700;
}

.record-meta {
  flex-wrap: wrap;
  gap: 8px 16px;
  color: var(--text-muted, #718096);
  font-size: 12px;
}

.platform-name {
  color: var(--text, #263248);
  font-weight: 600;
}

.record-stats {
  display: flex;
  min-width: 112px;
  justify-content: flex-end;
  gap: 24px;
  text-align: center;
}

.record-stats div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.record-stats strong {
  color: var(--text, #263248);
  font-size: 18px;
}

.record-stats span {
  color: var(--text-muted, #718096);
  font-size: 11px;
}

@media (max-width: 720px) {
  .publish-history-page {
    padding: 20px 16px 36px;
  }

  .history-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 16px;
  }

  .history-panel {
    overflow: hidden;
  }

  .panel-toolbar {
    align-items: flex-start;
    flex-direction: column;
    padding: 14px 16px;
  }

  .toolbar-actions {
    width: 100%;
    flex-wrap: wrap;
  }

  .record-card {
    align-items: flex-start;
    flex-wrap: wrap;
    padding: 14px 16px;
  }

  .record-preview {
    width: 64px;
    height: 56px;
    flex-basis: 64px;
  }

  .record-main {
    width: auto;
    flex: 1 1 0;
  }

  .record-stats {
    width: 100%;
    justify-content: flex-start;
    padding-left: 80px;
    text-align: left;
  }
}
</style>
