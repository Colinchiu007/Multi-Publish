<template>
  <div class="create-view-history">
    <div v-if="historyLocalMode" class="history-local-mode-banner" data-testid="history-local-mode-banner">
      {{ historyLocalModeText || tr('localMode') }}
    </div>

    <div class="history-toolbar">
      <div
        class="history-status-tabs"
        role="tablist"
        :aria-label="tr('statusFilter')"
        @keydown="onTablistKeydown"
      >
        <button
          v-for="status in statusTabs"
          :key="status"
          ref="historyTabs"
          type="button"
          role="tab"
          class="history-status-tab"
          :class="{ active: activeFilter === status }"
          :data-status="status"
          :aria-selected="activeFilter === status ? 'true' : 'false'"
          :tabindex="activeFilter === status ? 0 : -1"
          @click="selectFilter(status)"
        >
          <span>{{ tr('tabs.' + status) }}</span>
          <span class="history-status-tab-count" aria-hidden="true">{{ statusCounts[status] }}</span>
        </button>
      </div>
      <span class="history-count">{{ statusCounts.all }} {{ tr('records') }}</span>
    </div>

    <div v-if="historyLoading" class="loading-state">
      <span class="spinner" aria-hidden="true"></span>
      <span>{{ tr('loading') }}</span>
    </div>
    <div v-else-if="history.length === 0" class="empty-state">
      <div class="empty-icon" aria-hidden="true"></div>
      <p>{{ tr('emptyTitle') }}</p>
      <p class="empty-hint">{{ tr('emptyHint') }}</p>
    </div>
    <div v-else-if="filteredHistory.length === 0" class="empty-state compact">
      <p>{{ tr('emptyFilter') }}</p>
    </div>

    <div v-else class="history-list" role="list">
      <div
        v-for="(item, index) in filteredHistory"
        :key="historyIdentity(item, index)"
        class="history-item"
        :class="[
          'status-' + (item.status || 'unknown'),
          { 'is-running': item.status === 'running', 'is-interactive': item.status !== 'cancelled', 'is-cancelled': item.status === 'cancelled' },
        ]"
        :data-history-id="historyIdentity(item, index)"
      >
        <div
          class="history-item-body"
          :class="{ 'is-interactive': item.status !== 'cancelled' }"
          :role="item.status !== 'cancelled' ? 'button' : undefined"
          :tabindex="item.status !== 'cancelled' ? 0 : undefined"
          :aria-label="item.status !== 'cancelled' ? tr('viewDetail') + ': ' + historyTitle(item) : undefined"
          @click="openDetail(item)"
          @keydown.enter.prevent="openDetail(item)"
          @keydown.space.prevent="openDetail(item)"
        >
          <div class="history-item-row history-item-heading">
            <div class="history-heading-copy">
              <span class="history-name" :title="historyTitle(item)">{{ historyTitle(item) }}</span>
              <span v-if="item.pipeline || item.name" class="history-pipeline-tag">
                {{ pipelineName(item.pipeline || item.name) }}
              </span>
            </div>
            <span class="history-status" :class="item.status || 'unknown'">
              <span aria-hidden="true">{{ historyStatusIcon(item.status) }}</span>
              {{ historyStatusLabel(item.status) }}
            </span>
          </div>

          <div v-if="firstSegmentPreview(item)" class="history-item-row history-prompt-preview">
            <span class="history-field-label">{{ tr('promptPreview') }}</span>
            <span class="prompt-preview-text">{{ truncate(firstSegmentPreview(item), 120) }}</span>
            <div v-if="currentLocale() !== 'en' && firstSegmentTranslation(item)" class="prompt-translation-readonly">
              <span class="translation-label">{{ tr('translation') }}</span>
              <span class="translation-text">{{ truncate(firstSegmentTranslation(item), 140) }}</span>
            </div>
          </div>

          <div v-if="item.status === 'running'" class="history-state-detail history-running-hint">
            {{ tr('runningHint') }}
          </div>
          <div v-if="item.status === 'paused'" class="history-state-detail history-paused-hint">
            <div class="history-state-detail-row">
              <span class="history-field-label">{{ tr('pausedStage') }}</span>
              <span>{{ localizedStage(item.pausedStage || activeStage(item)) || tr('notAvailable') }}</span>
            </div>
            <div v-if="pauseEnvironment(item)" class="history-state-detail-row">
              <span class="history-field-label">{{ tr('pauseEnvironment') }}</span>
              <span>{{ localizedEnvironment(pauseEnvironment(item)) }}</span>
            </div>
          </div>
          <div v-if="item.status === 'failed'" class="history-state-detail history-failed-hint">
            <div class="history-state-detail-row">
              <span class="history-field-label">{{ tr('failedStage') }}</span>
              <span>{{ localizedStage(item.pausedStage || failedStage(item)) || tr('notAvailable') }}</span>
            </div>
            <div class="history-state-detail-row">
              <span class="history-field-label">{{ tr('errorSummary') }}</span>
              <span>{{ item.error ? truncate(item.error, 160) : tr('genericFailure') }}</span>
            </div>
            <div v-if="policyResumeHintFor(item)" class="history-state-detail-row history-policy-resume-hint" data-testid="history-policy-resume-hint">
              <span class="history-field-label">{{ tr('policyResumeBlockedLabel') }}</span>
              <span>{{ policyResumeHintFor(item) }}</span>
            </div>
          </div>

          <dl class="history-meta-grid">
            <div v-if="displayTime(item)" class="history-meta-item">
              <dt>{{ tr('updatedAt') }}</dt><dd>{{ formatTime(displayTime(item)) }}</dd>
            </div>
            <div v-if="createdTime(item)" class="history-meta-item">
              <dt>{{ tr('createdAt') }}</dt><dd>{{ formatTime(createdTime(item)) }}</dd>
            </div>
            <div v-if="item.duration || item.duration === 0" class="history-meta-item">
              <dt>{{ tr('duration') }}</dt><dd>{{ formatDuration(item.duration) }}</dd>
            </div>
            <div v-if="item.mode" class="history-meta-item">
              <dt>{{ tr('mode') }}</dt><dd>{{ localizedMode(item) }}</dd>
            </div>
            <div v-if="historyTaskId(item)" class="history-meta-item">
              <dt>{{ item.projectId ? tr('projectId') : tr('taskId') }}</dt>
              <dd :title="historyTaskId(item)">{{ shortenId(historyTaskId(item)) }}</dd>
            </div>
          </dl>

          <div v-if="Array.isArray(item.stages) && item.stages.length" class="history-progress">
            <span
              v-for="(stage, stageIndex) in item.stages"
              :key="stageIndex"
              class="history-progress-seg"
              :class="historyStageState(stage)"
              :title="historyStageTitle(stage)"
            >{{ historyStageLabel(stage) }}</span>
          </div>

          <span class="history-detail-hint">{{ item.status === 'cancelled' ? tr('cancelledHint') : tr('viewDetailHint') }}</span>
        </div>

        <div class="history-item-footer">
          <div class="history-actions">
              <button
                v-if="['failed', 'paused'].includes(item.status) && historyItemResumable(item)"
                type="button"
                class="s2v-btn-resume s2v-btn-sm"
                :disabled="story2videoResuming"
                @click.stop="$emit('resume-history', item)"
              >{{ story2videoResuming ? tr('resuming') : tr('resume') }}</button>
              <button
                v-else-if="item.status === 'running'"
                type="button"
                class="s2v-btn-resume s2v-btn-sm"
                :disabled="story2videoResuming"
                @click.stop="$emit('resume-history', item)"
              >{{ story2videoResuming ? tr('resuming') : tr('continue') }}</button>
              <button
                v-if="policyEditTarget(item)"
                type="button"
                class="s2v-btn-secondary s2v-btn-sm"
                data-testid="history-policy-edit-button"
                :disabled="story2videoResuming"
                @click.stop="$emit('open-result', item)"
              >{{ tr('policyEditAndRegenerate') }}</button>
              <button
                v-if="item.status === 'completed' && item.projectId"
                type="button"
                class="s2v-btn-secondary s2v-btn-sm"
                data-testid="history-edit-recompose-button"
                @click.stop="$emit('open-result', item)"
              >{{ tr('editAndRecompose') }}</button>
              <button
                v-if="item.projectId"
                type="button"
                class="s2v-btn-danger s2v-btn-sm"
                @click.stop="$emit('delete-history', item)"
              >{{ tr('delete') }}</button>
          </div>
        </div>
      </div>
    </div>

    <UiModal :visible="Boolean(selectedHistoryItem)" :title="tr('detailTitle')" size="lg" @close="closeDetail">
      <div v-if="selectedHistoryItem" class="history-detail-content" data-testid="history-detail-modal">
        <div class="history-detail-header">
          <strong>{{ historyTitle(selectedHistoryItem) }}</strong>
          <span class="history-status" :class="selectedHistoryItem.status || 'unknown'">
            {{ historyStatusLabel(selectedHistoryItem.status) }}
          </span>
        </div>
        <dl class="history-detail-list">
          <div><dt>{{ tr('pipeline') }}</dt><dd>{{ pipelineName(selectedHistoryItem.pipeline || selectedHistoryItem.name) }}</dd></div>
          <div><dt>{{ tr('status') }}</dt><dd>{{ historyStatusLabel(selectedHistoryItem.status) }}</dd></div>
          <div v-if="displayTime(selectedHistoryItem)"><dt>{{ tr('updatedAt') }}</dt><dd>{{ formatTime(displayTime(selectedHistoryItem)) }}</dd></div>
          <div v-if="createdTime(selectedHistoryItem)"><dt>{{ tr('createdAt') }}</dt><dd>{{ formatTime(createdTime(selectedHistoryItem)) }}</dd></div>
          <div v-if="selectedHistoryItem.duration !== undefined && selectedHistoryItem.duration !== null" data-testid="history-detail-duration"><dt>{{ tr('duration') }}</dt><dd>{{ formatDuration(selectedHistoryItem.duration) }}</dd></div>
          <div v-if="historyTaskId(selectedHistoryItem)"><dt>{{ selectedHistoryItem.projectId ? tr('projectId') : tr('taskId') }}</dt><dd>{{ historyTaskId(selectedHistoryItem) }}</dd></div>
          <div v-if="selectedHistoryItem.mode"><dt>{{ tr('mode') }}</dt><dd>{{ localizedMode(selectedHistoryItem) }}</dd></div>
          <div v-if="firstSegmentPreview(selectedHistoryItem)" data-testid="history-detail-prompt"><dt>{{ tr('promptPreview') }}</dt><dd>{{ firstSegmentPreview(selectedHistoryItem) }}</dd></div>
          <div v-if="currentLocale() !== 'en' && firstSegmentTranslation(selectedHistoryItem)" data-testid="history-detail-translation"><dt>{{ tr('translation') }}</dt><dd>{{ firstSegmentTranslation(selectedHistoryItem) }}</dd></div>
          <div v-if="selectedHistoryItem.status === 'paused'"><dt>{{ tr('pausedStage') }}</dt><dd>{{ localizedStage(selectedHistoryItem.pausedStage || activeStage(selectedHistoryItem)) || tr('notAvailable') }}</dd></div>
          <div v-if="selectedHistoryItem.status === 'paused' && pauseEnvironment(selectedHistoryItem)"><dt>{{ tr('pauseEnvironment') }}</dt><dd>{{ localizedEnvironment(pauseEnvironment(selectedHistoryItem)) }}</dd></div>
          <div v-if="selectedHistoryItem.status === 'failed'"><dt>{{ tr('failedStage') }}</dt><dd>{{ localizedStage(selectedHistoryItem.pausedStage || failedStage(selectedHistoryItem)) || tr('notAvailable') }}</dd></div>
          <div v-if="selectedHistoryItem.status === 'failed'" data-testid="history-detail-error"><dt>{{ tr('errorSummary') }}</dt><dd>{{ formatError(selectedHistoryItem) }}</dd></div>
          <div v-if="policyResumeHintFor(selectedHistoryItem)" data-testid="history-detail-policy-resume-hint">
            <dt>{{ tr('policyResumeBlockedLabel') }}</dt>
            <dd class="history-detail-policy-hint">{{ policyResumeHintFor(selectedHistoryItem) }}</dd>
          </div>
        </dl>
        <div v-if="Array.isArray(selectedHistoryItem.stages) && selectedHistoryItem.stages.length" class="history-detail-stages">
          <span class="history-field-label">{{ tr('stages') }}</span>
          <div class="history-progress">
            <span v-for="(stage, index) in selectedHistoryItem.stages" :key="index" class="history-progress-seg" :class="historyStageState(stage)">
              {{ historyStageLabel(stage) }}
            </span>
          </div>
        </div>
        <div v-if="detailScenes(selectedHistoryItem).length" class="history-detail-scenes" data-testid="history-detail-scenes">
          <span class="history-field-label">{{ tr('sceneListLabel') }}</span>
          <ol class="history-detail-scene-list">
            <li v-for="(scene, index) in detailScenes(selectedHistoryItem)" :key="scene.id || index" class="history-detail-scene-item">
              <span class="history-detail-scene-index">{{ index + 1 }}</span>
              <span class="history-detail-scene-body">
                <span v-if="scene.text" class="history-detail-scene-row"><span class="history-detail-scene-row-label">{{ tr('sceneNarration') }}</span>{{ scene.text }}</span>
                <span v-if="scene.prompt" class="history-detail-scene-row"><span class="history-detail-scene-row-label">{{ tr('scenePrompt') }}</span>{{ scene.prompt }}</span>
              </span>
            </li>
          </ol>
          <p class="history-detail-hint">{{ tr('sceneListHint') }}</p>
        </div>
      </div>
      <template #footer>
        <button
          v-if="selectedHistoryItem && historyItemResumable(selectedHistoryItem)"
          type="button"
          class="s2v-btn-resume s2v-btn-sm"
          :disabled="story2videoResuming"
          @click="resumeFromDetail"
        >{{ story2videoResuming ? tr('resuming') : tr('resume') }}</button>
        <button
          v-if="selectedHistoryItem && policyEditTarget(selectedHistoryItem)"
          type="button"
          class="s2v-btn-secondary s2v-btn-sm"
          data-testid="history-detail-policy-edit-button"
          :disabled="story2videoResuming"
          @click="openResultFromDetail"
        >{{ tr('policyEditAndRegenerate') }}</button>
        <button
          v-if="selectedHistoryItem && selectedHistoryItem.status === 'completed' && selectedHistoryItem.projectId"
          type="button"
          class="s2v-btn-secondary s2v-btn-sm"
          data-testid="history-detail-edit-recompose-button"
          @click="openResultFromDetail"
        >{{ tr('editAndRecompose') }}</button>
        <button type="button" class="s2v-btn-secondary s2v-btn-sm" @click="closeDetail">{{ tr('close') }}</button>
      </template>
    </UiModal>
  </div>
</template>

<script>
import '@/styles/history-panel.css'
import UiModal from '@/components/UiModal.vue'
import { getAppLocale } from '@/i18n'
import zhLocale from '@/locales/zh'
import enLocale from '@/locales/en'
import { getPipelineMode, getPipelineName, getPipelineStage } from '@/i18n/pipeline-labels'
import { RESUME_BLOCKING_ERROR_PATTERN, contentPolicyScenes, filterHistoryByStatus, historyDisplayTime, historyStatusCounts } from './history-utils'
import { formatPipelineError } from '@/utils/pipeline-error-formatter'

const HISTORY_STATUSES = Object.freeze(['all', 'running', 'paused', 'failed', 'completed', 'cancelled'])

export default {
  name: 'CreateViewHistory',
  components: { UiModal },
  props: {
    history: { type: Array, default: () => [] },
    historyLoading: { type: Boolean, default: false },
    historyLocalMode: { type: Boolean, default: false },
    historyLocalModeText: { type: String, default: '' },
    historyFilter: { type: String, default: 'all' },
    story2videoResuming: { type: Boolean, default: false },
  },
  emits: ['update:historyFilter', 'open-history-detail', 'resume-history', 'open-result', 'delete-history'],
  data () {
    return {
      activeFilter: HISTORY_STATUSES.includes(this.historyFilter) ? this.historyFilter : 'all',
      selectedHistoryItem: null,
      statusTabs: HISTORY_STATUSES,
    }
  },
  computed: {
    filteredHistory () { return filterHistoryByStatus(this.history, this.activeFilter) },
    statusCounts () { return historyStatusCounts(this.history) },
    // 每张失败卡片只计算一次不可恢复提示文本，避免模板 v-if + 文本处重复跑正则。
    policyResumeHints () {
      const hints = new Map()
      this.filteredHistory.forEach((item, index) => {
        if (!item || item.status !== 'failed') return
        const text = this.policyResumeBlockedText(item)
        if (text) hints.set(this.historyIdentity(item, index), text)
      })
      return hints
    },
  },
  watch: {
    historyFilter (value) { this.activeFilter = HISTORY_STATUSES.includes(value) ? value : 'all' },
  },
  methods: {
    resolveLocaleRef (ref, locale, params) {
      if (typeof ref !== 'string' || !ref.startsWith('@')) return ref
      const keyPath = ref.slice(1).split('.')
      const trees = { zh: zhLocale, en: enLocale }
      let node = trees[locale] || trees.zh
      for (const seg of keyPath) {
        node = node?.[seg]
        if (node == null) return ref
      }
      const resolved = typeof node === 'string' ? node : ref
      if (params && resolved.includes('{')) {
        return resolved.replace(/\{([^{}]+)\}/g, (_, k) => String(params[k] ?? ''))
      }
      return resolved
    },
    formatError (item) {
      if (!item || !item.error) return this.tr('genericFailure')
      const result = formatPipelineError(item.error, { locale: this.currentLocale() })
      if (result.message) return result.message
      if (result.key) {
        try {
          let msg = this.$t?.(result.key) || ''
          if (result.params && typeof msg === 'string') {
            for (const [k, v] of Object.entries(result.params)) {
              msg = msg.replace(new RegExp('\\{' + k + '\\}', 'g'), String(this.resolveLocaleRef(v, this.currentLocale(), result.params) ?? ''))
            }
          }
          return msg || this.tr('genericFailure')
        } catch (_) { /* fallback */ }
      }
      return this.tr('genericFailure')
    },
    tr (path) {
      const key = 'create.history.' + path
      try {
        const value = this.$t?.(key)
        return typeof value === 'string' && value !== key ? value : key
      } catch (_) { return key }
    },
    currentLocale () { try { return getAppLocale() } catch (_) { return 'zh' } },
    selectFilter (status) {
      if (!HISTORY_STATUSES.includes(status)) return
      this.activeFilter = status
      this.$emit('update:historyFilter', status)
    },
    onTablistKeydown (event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const current = Math.max(0, HISTORY_STATUSES.indexOf(this.activeFilter))
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? HISTORY_STATUSES.length - 1
          : event.key === 'ArrowLeft' ? (current - 1 + HISTORY_STATUSES.length) % HISTORY_STATUSES.length
            : (current + 1) % HISTORY_STATUSES.length
      this.selectFilter(HISTORY_STATUSES[next])
      this.$nextTick(() => this.$refs.historyTabs?.[next]?.focus())
    },
    historyIdentity (item, index) { return String(item?.id || item?.projectId || item?.runId || index) },
    historyTaskId (item) { return item?.projectId || item?.id || item?.runId || '' },
    historyTitle (item) { return item?.title || this.pipelineName(item?.pipeline || item?.name) || this.tr('untitled') },
    openDetail (item) {
      if (!item || item.status === 'cancelled') return
      this.selectedHistoryItem = item
      this.$emit('open-history-detail', item)
    },
    closeDetail () { this.selectedHistoryItem = null },
    resumeFromDetail () {
      const item = this.selectedHistoryItem
      if (!item) return
      this.closeDetail()
      this.$emit('resume-history', item)
    },
    openResultFromDetail () {
      const item = this.selectedHistoryItem
      if (!item?.projectId) return
      this.closeDetail()
      this.$emit('open-result', item)
    },
    firstSegmentPreview (item) {
      return (Array.isArray(item?.segments) ? item.segments : []).find(segment => segment?.text)?.text || ''
    },
    firstSegmentTranslation (item) {
      return (Array.isArray(item?.segments) ? item.segments : []).find(segment => segment?.promptTranslation)?.promptTranslation || ''
    },
    detailScenes (item) {
      if (!item) return []
      return (Array.isArray(item?.segments) ? item.segments : [])
        .filter(segment => segment && (segment.text || segment.prompt))
    },
    truncate (value, max) {
      const text = String(value || '')
      return text.length > max ? text.slice(0, max - 1) + '…' : text
    },
    pipelineName (id) { return getPipelineName(key => this.$t?.(key), id) },
    localizedMode (item) {
      return getPipelineMode(key => this.$t?.(key), item?.pipeline || item?.name) || String(item?.mode || '')
    },
    localizedStage (stage) { return stage ? getPipelineStage(key => this.$t?.(key), String(stage)) : '' },
    historyStatusLabel (status) { return this.tr('statuses.' + (status || 'unknown')) },
    historyStatusIcon (status) { return ({ completed: '✓', failed: '×', cancelled: '–', running: '↻', paused: 'Ⅱ', pending: '○' })[status] || '•' },
    displayTime (item) { return historyDisplayTime(item) },
    createdTime (item) { return historyDisplayTime({ createdAt: item?.createdAt, created_at: item?.created_at }) },
    formatTime (value) {
      const date = new Date(value)
      if (!Number.isFinite(date.getTime())) return this.tr('notAvailable')
      return new Intl.DateTimeFormat(this.currentLocale() === 'en' ? 'en-US' : 'zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
      }).format(date)
    },
    historyItemResumable (item) {
      if (!item || !['failed', 'paused'].includes(item.status) || !(item.id || item.runId)) return false
      return !RESUME_BLOCKING_ERROR_PATTERN.test(String(item.error || ''))
    },
    policyResumeHintFor (item) {
      if (!item) return ''
      const cached = this.policyResumeHints.get(this.historyIdentity(item, -1))
      return cached !== undefined ? cached : this.policyResumeBlockedText(item)
    },
    policyEditTarget (item) {
      if (!item || item.status !== 'failed' || !item.projectId) return false
      return RESUME_BLOCKING_ERROR_PATTERN.test(String(item.error || ''))
    },
    policyResumeBlockedText (item) {
      if (!item || item.status !== 'failed' || !(item.id || item.runId)) return ''
      if (!RESUME_BLOCKING_ERROR_PATTERN.test(String(item.error || ''))) return ''
      const scenes = contentPolicyScenes(item.error, this.currentLocale())
      if (!scenes) return this.tr('policyResumeBlockedGeneric')
      try {
        const message = this.$t?.('create.history.policyResumeBlockedHint', { scenes })
        return typeof message === 'string' && message !== 'create.history.policyResumeBlockedHint' ? message : this.tr('policyResumeBlockedGeneric')
      } catch (_) {
        return this.tr('policyResumeBlockedGeneric')
      }
    },
    activeStage (item) {
      const stage = (Array.isArray(item?.stages) ? item.stages : []).find(value => ['running', 'paused', 'waiting_approval'].includes(value?.status))
      return stage ? (stage.name || stage.stage || '') : ''
    },
    failedStage (item) {
      const stage = (Array.isArray(item?.stages) ? item.stages : []).find(value => value?.status === 'failed')
      return stage ? (stage.name || stage.stage || '') : ''
    },
    pauseEnvironment (item) {
      return item?.pausedEnvironment || item?.pauseEnvironment || item?.environment || item?.checkpoint?.environment || item?.checkpoint?.type || ''
    },
    localizedEnvironment (value) {
      const normalized = String(value || '').replace(/-/g, '_')
      const known = {
        scene_asset_selection: 'environments.sceneAssetSelection',
        waiting_approval: 'environments.waitingApproval',
        needs_user_input: 'environments.needsUserInput',
        local: 'environments.local',
      }
      return known[normalized] ? this.tr(known[normalized]) : String(value)
    },
    historyStageState (stage) {
      const status = stage && typeof stage === 'object' ? stage.status : ''
      if (status === 'completed') return 'done'
      if (status === 'running') return 'active'
      if (['failed', 'needs_user_input', 'cancelled'].includes(status)) return 'failed'
      return 'pending'
    },
    historyStageRawLabel (stage) { return typeof stage === 'object' ? (stage?.name || stage?.stage || '') : String(stage || '') },
    historyStageLabel (stage) {
      const label = this.localizedStage(this.historyStageRawLabel(stage))
      const progress = stage && typeof stage === 'object' ? stage.sceneProgress : null
      return progress && Number.isFinite(progress.completed) && Number.isFinite(progress.total) && progress.total > 0
        ? label + ' (' + progress.completed + '/' + progress.total + ')'
        : label
    },
    historyStageTitle (stage) {
      const status = stage && typeof stage === 'object' ? stage.status : ''
      return this.historyStageLabel(stage) + (status ? ' · ' + this.historyStatusLabel(status) : '')
    },
    formatDuration (milliseconds) {
      const value = Number(milliseconds)
      if (!Number.isFinite(value) || value < 0) return this.tr('notAvailable')
      const minutes = Math.floor(value / 60000)
      const seconds = Math.floor((value % 60000) / 1000)
      return minutes > 0 ? minutes + ' ' + this.tr('minutes') + ' ' + seconds + ' ' + this.tr('seconds') : seconds + ' ' + this.tr('seconds')
    },
    shortenId (value) {
      const id = String(value || '')
      return id.length > 14 ? id.slice(0, 8) + '…' + id.slice(-4) : id
    },
  },
}
</script>

<style scoped>
.history-detail-scenes { margin-top: 14px; }
.history-detail-scene-list { margin: 8px 0 0; padding: 0; list-style: none; display: grid; gap: 6px; max-height: 260px; overflow-y: auto; }
.history-detail-scene-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
.history-detail-scene-index { flex: none; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--border-light); color: var(--text-muted); font-size: 12px; }
.history-detail-scene-body { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; color: var(--text); font-size: 13px; }
.history-detail-scene-row { min-width: 0; white-space: normal; word-break: break-word; line-height: 1.6; }
.history-detail-scene-row-label { display: inline-block; flex: none; margin-right: 8px; color: var(--text-muted); font-size: 12px; }
.history-detail-hint { margin: 10px 0 0; color: var(--text-muted); font-size: 12px; line-height: 1.6; }
</style>


