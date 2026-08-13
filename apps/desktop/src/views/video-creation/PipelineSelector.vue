<template>
  <div class="pipeline-selector">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state" data-testid="pipeline-selector-loading">
      <div class="skeleton-grid">
        <div v-for="i in 6" :key="i" class="skeleton-card">
          <div class="skeleton-header"></div>
          <div class="skeleton-title"></div>
          <div class="skeleton-desc"></div>
          <div class="skeleton-meta"></div>
        </div>
      </div>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="error-state">
      <span class="error-icon">⚠️</span>
      <p>{{ error }}</p>
      <button class="retry-btn" @click="$emit('retry')">重试</button>
    </div>

    <template v-else>
      <!-- 背景生成中（轻提示，不可关闭） -->
      <div v-if="anyBgLoading" class="bg-generating" role="status" data-testid="pipeline-bg-generating">
        <span class="bg-generating-spinner" aria-hidden="true"></span>
        <span>{{ t('pipelines.selector.bgGenerating') }}</span>
      </div>

      <!-- 背景不可用/部分失败提示（一次性、可关闭） -->
      <div v-if="bgHint" class="bg-hint" role="status" data-testid="pipeline-bg-hint">
        <span>{{ bgHint }}</span>
        <button class="bg-hint-close" :aria-label="t('pipelines.selector.bgClose')" @click="bgHint = ''">✕</button>
      </div>

      <!-- 流水线网格 -->
      <div class="pipeline-grid" data-testid="pipeline-grid">
        <div
          v-for="(pipeline, index) in pipelines"
          :key="pipeline.name"
          class="pipeline-card"
          :data-pipeline-id="pipeline.name"
          :class="[
            pipeline.category,
            {
              'is-unavailable': pipeline.available === false,
              'has-bg': hasBg(pipeline.name),
              'is-bg-loading': isBgLoading(pipeline.name),
            },
          ]"
          :style="cardDelayStyle(index)"
          tabindex="0"
          role="button"
          :aria-label="pipelineName(pipeline.name)"
          :aria-busy="isBgLoading(pipeline.name) ? 'true' : undefined"
          @click="$emit('select', pipeline)"
          @keydown.enter="$emit('select', pipeline)"
        >
          <!-- 生成背景层（装饰性，对辅助技术隐藏） -->
          <div v-if="hasBg(pipeline.name)" class="card-bg" aria-hidden="true" data-testid="pipeline-card-bg">
            <img :src="bgUrl(pipeline.name)" alt="" loading="lazy" decoding="async" />
            <span class="card-bg-scrim"></span>
          </div>
          <div v-else-if="isBgLoading(pipeline.name)" class="card-bg-loading" aria-hidden="true"></div>

          <div class="card-content">
            <div class="card-header">
              <span class="badge" :class="pipeline.category">{{ pipelineCategory(pipeline.category) }}</span>
              <span class="stability-dot" :class="getStability(pipeline.name)" :title="getStability(pipeline.name)"></span>
            </div>
            <h3 class="card-title">{{ pipelineName(pipeline.name) }}</h3>
            <p class="card-desc">{{ pipelineDescription(pipeline.name) }}</p>
            <div class="card-meta">
              <span class="stage-count">{{ pipeline.stageCount ?? pipeline.stages?.length ?? 0 }} 阶段</span>
              <span class="cost-label" :class="pipeline.estimatedCost">{{ costLabel(pipeline.estimatedCost) }}</span>
              <span class="availability-badge" :class="pipeline.available === false ? 'dev' : 'ready'" :title="availabilityHint(pipeline.available !== false)">
                {{ availabilityLabel(pipeline.available !== false) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
<script>
import '@/styles/pipeline-selector.css'
import { pipelineCardBackgrounds } from '@/api/publisher'
import {
  getPipelineCategory,
  getPipelineDescription,
  getPipelineName,
} from '@/i18n/pipeline-labels'

const CATEGORY_LABELS = {
  generated: 'AI 生成', talking_head: '说话头像', cinematic: '电影感',
  animation: '动画', screen_recording: '屏幕录制', hybrid: '混合', custom: '自定义'
}
const COST_LABELS = { low: '低消耗', medium: '中等', high: '高消耗' }
const STABILITY_MAP = {
  'cinematic': 'production', 'animated-explainer': 'production', 'talking-head': 'beta',
  'documentary-montage': 'beta', 'clip-factory': 'beta', 'screen-demo': 'beta',
  'podcast-repurpose': 'experimental', 'localization-dub': 'experimental',
  'avatar-spokesperson': 'experimental', 'character-animation': 'experimental',
  'animation': 'experimental', 'hybrid': 'experimental', 'framework-smoke': 'experimental'
}
const NAME_RE = /^[A-Za-z0-9_-]{1,80}$/

export default {
  name: 'PipelineSelector',
  props: {
    pipelines: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  emits: ['select', 'retry'],
  data() {
    return {
      backgrounds: {},
      bgLoading: {},
      bgHint: '',
      bgFetchedFor: '',
    }
  },
  computed: {
    anyBgLoading() {
      return Object.values(this.bgLoading).some(Boolean)
    },
  },
  watch: {
    pipelines: {
      deep: true,
      handler() { this.fetchCardBackgrounds() },
    },
  },
  mounted() {
    this.fetchCardBackgrounds()
  },
  methods: {
    pipelineName(id) { return getPipelineName((key) => this.$t?.(key), id) },
    pipelineDescription(id) { return getPipelineDescription((key) => this.$t?.(key), id) },
    pipelineCategory(id) { return getPipelineCategory((key) => this.$t?.(key), id) },
    categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat },
    costLabel(cost) { return COST_LABELS[cost] || cost },
    getStability(name) { return STABILITY_MAP[name] || 'experimental' },
    availabilityHint(available) { return available ? '流水线可用' : '开发中，暂不可用' },
    availabilityLabel(available) { return available ? '可用' : '开发中' },
    t(key, fallback) {
      const value = this.$t?.(key)
      return typeof value === 'string' && value !== key ? value : (fallback || key)
    },
    pipelineNames() {
      return (this.pipelines || [])
        .map((p) => p && p.name)
        .filter((name) => typeof name === 'string' && NAME_RE.test(name))
    },
    async fetchCardBackgrounds() {
      const names = this.pipelineNames()
      if (names.length === 0) return
      const key = names.join('|')
      if (this.bgFetchedFor === key) return
      this.bgFetchedFor = key
      const loading = {}
      names.forEach((name) => { loading[name] = true })
      this.bgLoading = { ...loading }
      try {
        const res = await pipelineCardBackgrounds({ names, force: false })
        if (!res || res.code !== 0) {
          this.bgHint = this.t('pipelines.selector.bgUnavailable')
          return
        }
        const data = res.data || {}
        if (data.available === false) {
          this.bgHint = this.t('pipelines.selector.bgUnavailable')
          return
        }
        const backgrounds = {}
        for (const [name, item] of Object.entries(data.backgrounds || {})) {
          if (item && typeof item.url === 'string' && item.url) backgrounds[name] = item.url
        }
        this.backgrounds = backgrounds
        if (Array.isArray(data.failed) && data.failed.length > 0) {
          this.bgHint = this.t('pipelines.selector.bgPartialFailure')
        }
      } catch (_error) {
        this.bgHint = this.t('pipelines.selector.bgUnavailable')
      } finally {
        this.bgLoading = {}
      }
    },
    hasBg(name) { return Boolean(this.backgrounds[name]) },
    bgUrl(name) { return this.backgrounds[name] || '' },
    isBgLoading(name) { return this.bgLoading[name] === true && !this.backgrounds[name] },
    cardDelayStyle(index) { return { '--i': String(index % 12) } },
  },
}
</script>
