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

<style scoped>
.pipeline-selector {
  width: 100%;
}

.pipeline-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.pipeline-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 20px;
  cursor: pointer;
  transition: all 0.2s;
}

.pipeline-card:hover {
  box-shadow: 0 4px 16px rgba(0,0,0,0.08);
  transform: translateY(-2px);
  border-color: var(--primary);
}

.pipeline-card:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

.pipeline-card.generated { border-left: 3px solid var(--pipe-generated); }
.pipeline-card.talking_head { border-left: 3px solid var(--pipe-talking-head); }
.pipeline-card.cinematic { border-left: 3px solid var(--pipe-cinematic); }
.pipeline-card.animation { border-left: 3px solid var(--pipe-animation); }
.pipeline-card.screen_recording { border-left: 3px solid var(--pipe-screen-recording); }
.pipeline-card.hybrid { border-left: 3px solid var(--pipe-hybrid); }
.pipeline-card.custom { border-left: 3px solid var(--pipe-custom); }
.pipeline-card.is-unavailable { opacity: 0.72; }
.pipeline-card.is-unavailable:hover { transform: none; box-shadow: none; }

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 600;
}

.stability-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stability-dot.production { background: var(--stability-production); }
.stability-dot.beta { background: var(--stability-beta); }
.stability-dot.experimental { background: var(--stability-experimental); }

.card-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 4px;
  color: var(--text);
}

.card-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 12px;
  line-height: 1.4;
}

.card-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-light);
}

.stage-count {
  font-weight: 500;
}

.cost-label {
  padding: 1px 6px;
  border-radius: 3px;
}

.cost-label.low { background: var(--status-completed-bg); color: var(--status-completed-text); }
.cost-label.medium { background: var(--status-waiting-bg); color: var(--status-waiting-text); }
.cost-label.high { background: var(--status-failed-bg); color: var(--status-failed-text); }

.availability-badge {
  padding: 1px 6px;
  border-radius: 3px;
}

.availability-badge.ready { background: var(--status-completed-bg); color: var(--status-completed-text); }
.availability-badge.dev { background: var(--status-waiting-bg); color: var(--status-waiting-text); }

/* 加载骨架屏 */
.loading-state {
  padding: 20px 0;
}

.skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.skeleton-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px 20px;
}

.skeleton-header {
  height: 20px;
  width: 60px;
  background: var(--skeleton-bg);
  border-radius: 4px;
  margin-bottom: 12px;
}

.skeleton-title {
  height: 24px;
  width: 80%;
  background: var(--skeleton-bg);
  border-radius: 4px;
  margin-bottom: 8px;
}

.skeleton-desc {
  height: 16px;
  width: 100%;
  background: var(--skeleton-bg);
  border-radius: 4px;
  margin-bottom: 12px;
}

.skeleton-meta {
  height: 16px;
  width: 60%;
  background: var(--skeleton-bg);
  border-radius: 4px;
}

/* 错误状态 */
.error-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-muted);
}

.error-icon {
  font-size: 32px;
  margin-bottom: 12px;
}

.retry-btn {
  margin-top: 12px;
  padding: 8px 16px;
  border: 1px solid var(--primary);
  border-radius: 6px;
  background: transparent;
  color: var(--primary);
  cursor: pointer;
  font-size: 14px;
}

.retry-btn:hover {
  background: var(--primary);
  color: #fff;
}

/* 响应式 */
@media (max-width: 768px) {
  .pipeline-grid {
    grid-template-columns: 1fr;
  }
}
</style>
