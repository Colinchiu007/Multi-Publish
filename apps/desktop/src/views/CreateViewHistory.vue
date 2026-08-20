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
          { 'is-running': item.status === 'running', 'is-interactive': historyItemOpenable(item), 'is-cancelled': item.status === 'cancelled' },
        ]"
        :data-history-id="historyIdentity(item, index)"
      >
        <div
          class="history-item-body"
          :class="{ 'is-interactive': historyItemOpenable(item) }"
          :role="historyItemOpenable(item) ? 'button' : undefined"
          :tabindex="historyItemOpenable(item) ? 0 : undefined"
          :aria-label="historyItemOpenable(item) ? tr('viewDetail') + ': ' + historyTitle(item) : undefined"
          @click="openDetail(item)"
          @keydown.enter.prevent="openDetail(item)"
          @keydown.space.prevent="openDetail(item)"
        >
          <div class="history-item-row history-item-heading">
            <div class="history-heading-copy">
              <span class="history-name" :title="publishTitle(item)">{{ publishTitle(item) }}</span>
              <span v-if="item.pipeline || item.name" class="history-pipeline-tag">
                {{ pipelineName(item.pipeline || item.name) }}
              </span>
            </div>
            <span class="history-status" :class="item.status || 'unknown'">
              <span aria-hidden="true">{{ historyStatusIcon(item.status) }}</span>
              {{ historyStatusLabel(item.status) }}
            </span>
          </div>

          <div class="history-card-main">
            <div class="history-thumbnail" :class="{ 'is-empty': !item.thumbnailUrl }" data-testid="history-thumbnail">
              <img v-if="item.thumbnailUrl" :src="item.thumbnailUrl" :alt="historyTitle(item)" @error="onThumbnailError(item)" />
              <span v-else>{{ tr('notGenerated') }}</span>
            </div>
            <div class="history-card-copy">
              <div class="history-item-row history-prompt-preview">
                <span class="history-field-label">{{ tr('contentPreview') }}</span>
                <span class="prompt-preview-text">{{ truncate(taskContent(item), 120) || tr('notGenerated') }}</span>
              </div>
              <div v-if="currentLocale() !== 'en' && firstSegmentTranslation(item)" class="prompt-translation-readonly">
                <span class="translation-label">{{ tr('translation') }}</span>
                <span class="translation-text">{{ truncate(firstSegmentTranslation(item), 140) }}</span>
              </div>
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
              <span data-testid="history-failure-reason">{{ formatError(item) }}</span>
            </div>
            <div v-if="policyResumeHintFor(item)" class="history-state-detail-row history-policy-resume-hint" data-testid="history-policy-resume-hint">
              <span class="history-field-label">{{ tr('policyResumeBlockedLabel') }}</span>
              <span>{{ policyResumeHintFor(item) }}</span>
            </div>
          </div>

          <dl class="history-meta-grid">
            <div v-if="item.pipeline || item.name" class="history-meta-item">
              <dt>{{ tr('pipeline') }}</dt><dd>{{ pipelineName(item.pipeline || item.name) }}</dd>
            </div>
            <div v-if="displayTime(item)" class="history-meta-item">
              <dt>{{ tr('updatedAt') }}</dt><dd>{{ formatTime(displayTime(item)) }}</dd>
            </div>
            <div v-if="createdTime(item)" class="history-meta-item">
              <dt>{{ tr('createdAt') }}</dt><dd>{{ formatTime(createdTime(item)) }}</dd>
            </div>
            <div v-if="historyDuration(item) !== null" class="history-meta-item">
              <dt>{{ tr('duration') }}</dt><dd>{{ formatDuration(historyDuration(item)) }}</dd>
            </div>
            <div class="history-meta-item">
              <dt>{{ tr('videoDuration') }}</dt><dd>{{ videoDurationText(item) }}</dd>
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

          <span class="history-detail-hint">{{ item.status === 'cancelled' ? tr('cancelledHint') : (historyItemOpenable(item) ? tr('viewDetailHint') : '') }}</span>
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
                v-if="detailEditable(item)"
                type="button"
                class="s2v-btn-secondary s2v-btn-sm"
                data-testid="history-edit-recompose-button"
                @click.stop="$emit('open-result', item)"
              >{{ tr('editAndRecompose') }}</button>
              <button
                type="button"
                class="s2v-btn-danger s2v-btn-sm"
                data-testid="history-delete-button"
                @click.stop="$emit('delete-history', item)"
              >{{ tr('delete') }}</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import '@/styles/history-panel.css'
import { getAppLocale } from '@/i18n'
import zhLocale from '@/locales/zh'
import enLocale from '@/locales/en'
import { getPipelineMode, getPipelineName, getPipelineStage } from '@/i18n/pipeline-labels'
import { CONTENT_POLICY_ERROR_PATTERN, RESUME_BLOCKING_ERROR_PATTERN, contentPolicyScenes, filterHistoryByStatus, historyDisplayTime, historyStatusCounts } from './history-utils'
import { formatPipelineError } from '@/utils/pipeline-error-formatter'

const HISTORY_STATUSES = Object.freeze(['all', 'running', 'paused', 'failed', 'completed', 'cancelled'])

export default {
  name: 'CreateViewHistory',
  props: {
    history: { type: Array, default: () => [] },
    historyLoading: { type: Boolean, default: false },
    historyLocalMode: { type: Boolean, default: false },
    historyLocalModeText: { type: String, default: '' },
    historyFilter: { type: String, default: 'all' },
    story2videoResuming: { type: Boolean, default: false },
  },
  emits: ['update:historyFilter', 'resume-history', 'open-result', 'delete-history'],
  data () {
    return {
      activeFilter: HISTORY_STATUSES.includes(this.historyFilter) ? this.historyFilter : 'all',
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
    // 发布标题（原文案前 60 字免回）
    publishTitle (item) { return this.historyTitle(item) },
    // 任务标题回退链：发布标题（project.title / params.title）→ 原文案前 60 字 → 流水线名
    historyTitle (item) {
      if (!item) return this.tr('untitled')
      if (typeof item.title === 'string' && item.title.trim()) return item.title.trim()
      const paramsTitle = item.params && (item.params.title || item.params.publishTitle)
      if (typeof paramsTitle === 'string' && paramsTitle.trim()) return paramsTitle.trim()
      const content = this.taskContent(item)
      if (content) return this.truncate(content, 60)
      return this.pipelineName(item.pipeline || item.name) || this.tr('untitled')
    },
    // 已启动且非运行中的项目进入视频任务编辑页；running 只保留流水线控制入口。
    historyItemOpenable (item) {
      return this.detailEditable(item)
    },
    detailEditable (item) {
      return Boolean(item && item.projectId && item.startedPipeline !== false && item.status !== 'running')
    },
    openDetail (item) {
      if (!this.historyItemOpenable(item)) return
      this.$emit('open-result', item)
    },
    firstSegmentPreview (item) {
      return (Array.isArray(item?.segments) ? item.segments : []).find(segment => segment?.text)?.text || ''
    },
    taskContent (item) {
      if (!item) return ''
      if (typeof item.sourceText === 'string' && item.sourceText.trim()) return item.sourceText
      if (typeof item.text === 'string' && item.text.trim()) return item.text
      return (Array.isArray(item.segments) ? item.segments : [])
        .map(segment => typeof segment?.text === 'string' ? segment.text.trim() : '')
        .filter(Boolean)
        .join(' ')
    },
    firstSegmentTranslation (item) {
      return (Array.isArray(item?.segments) ? item.segments : []).find(segment => segment?.promptTranslation)?.promptTranslation || ''
    },
    truncate (value, max) {
      const text = String(value || '')
      return text.length > max ? text.slice(0, max - 1) + '…' : text
    },
    onThumbnailError (item) {
      if (!item || typeof item !== 'object') return
      item.thumbnailUrl = null
      item.thumbnailStatus = 'failed'
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
    historyDuration (item) {
      const value = item?.activeMs ?? item?.duration
      return Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null
    },
    videoDuration (item) {
      // duration is pipeline execution time for history runs; only explicit
      // media-duration fields are eligible for the video duration row.
      const candidates = [
        item?.videoDuration,
        item?.video_duration,
        item?.video?.duration,
        item?.composeDuration,
        item?.durationSeconds,
      ]
      for (const candidate of candidates) {
        if (candidate === null || candidate === undefined || candidate === '') continue
        const value = Number(candidate)
        if (Number.isFinite(value) && value >= 0) return value
      }
      return null
    },
    videoDurationText (item) {
      const value = this.videoDuration(item)
      return value === null ? this.tr('notGenerated') : this.formatSeconds(value)
    },
    formatSeconds (seconds) {
      const value = Number(seconds)
      if (!Number.isFinite(value) || value < 0) return this.tr('notGenerated')
      const totalSeconds = Math.round(value)
      const minutes = Math.floor(totalSeconds / 60)
      const remainder = totalSeconds % 60
      return minutes > 0 ? minutes + ' ' + this.tr('minutes') + ' ' + remainder + ' ' + this.tr('seconds') : remainder + ' ' + this.tr('seconds')
    },
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
      // 提示条只针对内容政策/需用户输入的具体原因；空结果失败（服务波动/账号问题）
      // 由门控正则拦截恢复但不显示「内容政策拦截」提示（2026-08-16 复审解耦）。
      if (!CONTENT_POLICY_ERROR_PATTERN.test(String(item.error || ''))) return ''
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
</style>


