<template>
  <div class="copy-library-page">
    <header class="copy-library-header">
      <h1 data-testid="copy-library-title">{{ t('copyLibrary.pageTitle') }}</h1>
      <p class="copy-library-subtitle">{{ t('copyLibrary.pageSubtitle') }}</p>
    </header>

    <div class="copy-library-toolbar">
      <div class="copy-library-filters" role="group" :aria-label="t('copyLibrary.filterLabel')">
        <button
          v-for="f in ORIGIN_FILTERS"
          :key="f.value"
          type="button"
          class="copy-library-filter-btn"
          :class="{ active: originFilter === f.value }"
          :aria-pressed="originFilter === f.value"
          :data-testid="'copy-library-filter-' + f.value"
          @click="originFilter = f.value"
        >{{ t(f.labelKey) }}</button>
      </div>
      <label class="copy-library-search">
        <input
          v-model="searchQuery"
          type="search"
          data-testid="copy-library-search"
          :placeholder="t('copyLibrary.searchPlaceholder')"
          :aria-label="t('copyLibrary.searchAria')"
        >
      </label>
    </div>

    <div v-if="loading" class="copy-library-state" data-testid="copy-library-loading">{{ t('copyLibrary.loading') }}</div>

    <EmptyState
      v-else-if="items.length === 0"
      data-testid="copy-library-empty"
      icon="Document"
      :title="t('copyLibrary.emptyTitle')"
      :description="t('copyLibrary.emptyDesc')"
    />

    <EmptyState
      v-else-if="filteredItems.length === 0"
      compact
      data-testid="copy-library-filter-empty"
      icon="Search"
      :title="t('copyLibrary.filterEmptyTitle')"
      :description="t('copyLibrary.filterEmptyDesc')"
      :action-text="t('copyLibrary.filterEmptyAction')"
      @action="originFilter = 'all'; searchQuery = ''"
    />

    <div v-else class="copy-library-grid" data-testid="copy-library-list">
      <article
        v-for="entry in renderedItems"
        :key="entry.id"
        class="copy-library-card"
        :data-testid="'copy-library-item-' + entry.id"
        role="button"
        tabindex="0"
        :aria-label="t('copyLibrary.viewDetailAria') + '：' + (entry.title || t('copyLibrary.untitled'))"
        @click="openDetail(entry)"
        @keydown.enter.prevent="openDetail(entry)"
        @keydown.space.prevent="openDetail(entry)"
      >
        <div class="copy-library-card-top">
          <span class="copy-library-origin-badge" :class="'is-' + entry.origin">{{ originLabel(entry.origin) }}</span>
          <span class="copy-library-title">{{ entry.title || t('copyLibrary.untitled') }}</span>
          <el-icon class="copy-library-view-icon" aria-hidden="true"><View /></el-icon>
        </div>
        <p class="copy-library-content">{{ entry.content }}</p>
        <div class="copy-library-meta">
          <span>{{ t('copyLibrary.wordCount', { count: entry.wordCount }) }}</span>
          <span v-if="entry.createdAt"> · {{ formatTime(entry.createdAt) }}</span>
          <span v-if="entry.metadata.truncated" :data-testid="'copy-library-truncated-' + entry.id"> · {{ t('copyLibrary.truncated') }}</span>
        </div>
      </article>
    </div>

    <!-- M-15：截断提示 + 加载更多（文案列表可能长期积累，一次全量渲染必然劣化） -->
    <LoadMoreRow v-if="itemsTruncated" data-testid="load-more-copies"
      :hint="t('copyLibrary.shownTruncated', { shown: renderedItems.length, total: filteredItems.length })"
      :button-text="t('copyLibrary.loadMoreCopies')"
      @more="copyRenderLimit += 30" />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { View } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import EmptyState from '@/components/EmptyState.vue'
import LoadMoreRow from '@/components/LoadMoreRow.vue'
import { useNotify } from '@/composables/useNotify'
import { story2videoGetProject } from '@/api/publisher'
import { setCopyDetailHandoff } from '@/utils/copy-detail-handoff'
import { useCopyLibrarySources, ORIGIN_DRAFT, ORIGIN_VIDEO } from '@/composables/useCopyLibrarySources'
import { ORIGIN_COLLECT, ORIGIN_REWRITE } from '@/composables/useCopyLibrary'

const { t } = useI18n()
const router = useRouter()
const { notifyWarning } = useNotify()
const { items, loading, loadAll } = useCopyLibrarySources()

/** 来源筛选：全部 / 采集 / 改写 / 草稿 / 视频创作 */
const ORIGIN_FILTERS = [
  { value: 'all', labelKey: 'copyLibrary.filterAll' },
  { value: ORIGIN_COLLECT, labelKey: 'copyLibrary.filterCollect' },
  { value: ORIGIN_REWRITE, labelKey: 'copyLibrary.filterRewrite' },
  { value: ORIGIN_DRAFT, labelKey: 'copyLibrary.filterDraft' },
  { value: ORIGIN_VIDEO, labelKey: 'copyLibrary.filterVideo' },
]
const originFilter = ref('all')
const searchQuery = ref('')

const filteredItems = computed(() => {
  let list = items.value
  if (originFilter.value !== 'all') list = list.filter((e) => e.origin === originFilter.value)
  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((e) => ((e.title || '') + ' ' + e.content).toLowerCase().includes(query))
  }
  return list
})

// M-15：渲染层截断 —— 文案列表可能长期积累，一次全量渲染必然劣化
const copyRenderLimit = ref(30)
const renderedItems = computed(() => filteredItems.value.slice(0, copyRenderLimit.value))
const itemsTruncated = computed(() => filteredItems.value.length > renderedItems.value.length)

/**
 * 打开文案详情（一键发布页承载，2026-10-09 PRD-COPY-LIBRARY-DETAIL-ENTRY）。
 *
 * - 一次性交接载荷（copy-detail-handoff，读后即焚）携带正文/标题/来源跳转发布页；
 * - 视频来源先拉全文（列表态仅 500 字截断预览），失败降级预览并提示，不阻塞跳转；
 * - 载荷写入失败（存储不可用/content 空）不跳转并提示，避免「点了没反应」或空详情。
 * @param {object} entry 文案库统一条目（UNIFIED_ITEM）
 */
let openingDetail = false
async function openDetail (entry) {
  if (!entry || !entry.id || openingDetail) return
  openingDetail = true
  try {
  const sep = entry.id.indexOf(':')
  const origin = sep > 0 ? entry.id.slice(0, sep) : entry.origin
  const sourceId = sep > 0 ? entry.id.slice(sep + 1) : ''
  let content = entry.content || ''
  if (origin === ORIGIN_VIDEO && entry.metadata && entry.metadata.videoProjectId) {
    try {
      const res = await story2videoGetProject(entry.metadata.videoProjectId)
      const fullText = res && res.code === 0 && res.data && typeof res.data.sourceText === 'string' ? res.data.sourceText : ''
      if (fullText.trim()) {
        content = fullText
      } else {
        notifyWarning('copyLibrary.videoFullTextFailed')
      }
    } catch {
      notifyWarning('copyLibrary.videoFullTextFailed')
    }
  }
  const ok = setCopyDetailHandoff({
    content,
    title: entry.title || '',
    origin,
    sourceId,
    platform: entry.platform || '',
    sourceUrl: entry.sourceUrl || '',
  })
  if (!ok) {
    notifyWarning('copyLibrary.handoffFailed')
    return
  }
  router.push({ path: '/publish', query: { from: 'copy-library' } })
  } finally {
    openingDetail = false
  }
}
function originLabel (origin) {
  const map = {
    [ORIGIN_COLLECT]: t('copyLibrary.originCollect'),
    [ORIGIN_REWRITE]: t('copyLibrary.originRewrite'),
    [ORIGIN_DRAFT]: t('copyLibrary.originDraft'),
    [ORIGIN_VIDEO]: t('copyLibrary.originVideo'),
  }
  return map[origin] || origin
}

function formatTime (value) {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
}

onMounted(() => { loadAll() })
</script>

<style scoped>
.copy-library-page {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.copy-library-header h1 {
  margin: 0 0 4px;
  font-size: var(--font-size-lg);
}
.copy-library-subtitle {
  margin: 0 0 16px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}
.copy-library-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.copy-library-filters {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.copy-library-filter-btn {
  padding: 4px 12px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-size-sm);
}
.copy-library-filter-btn.active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.copy-library-search input {
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  min-width: 220px;
  font-size: var(--font-size-sm);
}
.copy-library-state {
  color: var(--color-text-secondary);
  text-align: center;
  padding: 40px 0;
}
.copy-library-grid {
  display: grid;
}
.load-more-row { display: flex; align-items: center; justify-content: center; gap: 14px; padding: 14px 0 4px; }
.load-more-hint { color: #85858f; font-size: var(--font-size-sm); }
.load-more-btn { padding: 6px 18px; border: 1px solid var(--color-border); border-radius: 8px; background: transparent; color: var(--color-text-primary); cursor: pointer; font-size: var(--font-size-sm); }
.load-more-btn:hover { background: var(--color-bg-inset); }
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.copy-library-card {
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
}
.copy-library-card:hover,
.copy-library-card:focus-visible {
  border-color: var(--color-primary);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  outline: none;
}
.copy-library-view-icon {
  margin-left: auto;
  color: var(--color-text-secondary);
  flex-shrink: 0;
}
.copy-library-card:hover .copy-library-view-icon {
  color: var(--color-primary);
}
.copy-library-card-static {
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.copy-library-card-top {
  display: flex;
  align-items: center;
  gap: 8px;
}
.copy-library-origin-badge {
  font-size: var(--font-size-xs);
  padding: 1px 8px;
  border-radius: 10px;
  white-space: nowrap;
  background: var(--color-bg-inset);
  color: var(--color-text-secondary);
}
.copy-library-origin-badge.is-rewrite { color: var(--color-primary); }
.copy-library-origin-badge.is-draft { color: var(--color-warning); }
.copy-library-origin-badge.is-video { color: var(--color-info-text); }
.copy-library-title {
  font-weight: 600;
  font-size: var(--font-size-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.copy-library-content {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-line;
}
.copy-library-meta {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}
</style>
