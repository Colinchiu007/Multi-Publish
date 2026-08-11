<template>
  <div class="pipeline-selector">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
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

    <!-- 流水线网格 -->
    <div v-else class="pipeline-grid">
      <div
        v-for="pipeline in pipelines"
        :key="pipeline.name"
        class="pipeline-card" :data-pipeline-id="pipeline.name"
        :class="[pipeline.category, { 'is-unavailable': pipeline.available === false }]"
        tabindex="0"
        role="button"
        :aria-label="pipelineName(pipeline.name)"
        @click="$emit('select', pipeline)"
        @keydown.enter="$emit('select', pipeline)"
      >
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

<script>
import '@/styles/pipeline-selector.css'
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

export default {
  name: 'PipelineSelector',
  props: {
    pipelines: { type: Array, default: () => [] },
    loading: { type: Boolean, default: false },
    error: { type: String, default: null },
  },
  emits: ['select', 'retry'],
  methods: {
    pipelineName(id) { return getPipelineName((key) => this.$t?.(key), id) },
    pipelineDescription(id) { return getPipelineDescription((key) => this.$t?.(key), id) },
    pipelineCategory(id) { return getPipelineCategory((key) => this.$t?.(key), id) },
    categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat },
    costLabel(cost) { return COST_LABELS[cost] || cost },
    getStability(name) { return STABILITY_MAP[name] || 'experimental' },
    availabilityHint(available) { return available ? '流水线可用' : '开发中，暂不可用' },
    availabilityLabel(available) { return available ? '可用' : '开发中' },
  },
}
</script>
