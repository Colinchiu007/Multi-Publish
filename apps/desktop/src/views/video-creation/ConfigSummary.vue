<template>
  <div class="config-summary" v-if="hasConfig">
    <div class="summary-header">
      <h4 class="summary-title">当前配置</h4>
      <button class="reset-btn" @click="$emit('reset')">重置</button>
    </div>
    <div class="summary-grid">
      <div class="summary-item" v-if="config.imageStyle">
        <span class="item-label">图片风格</span>
        <span class="item-value">{{ imageStyleLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.imageEffect">
        <span class="item-label">图片动效</span>
        <span class="item-value">{{ imageEffectLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.voiceProvider">
        <span class="item-label">语音服务</span>
        <span class="item-value">{{ config.voiceProvider }}</span>
      </div>
      <div class="summary-item" v-if="config.voiceModel">
        <span class="item-label">语音模型</span>
        <span class="item-value">{{ config.voiceModel }}</span>
      </div>
      <div class="summary-item" v-if="config.voiceId">
        <span class="item-label">音色</span>
        <span class="item-value">已选择</span>
      </div>
      <div class="summary-item" v-if="config.videoMode && config.videoMode !== 'off'">
        <span class="item-label">视频增强</span>
        <span class="item-value">{{ videoModeLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.splitLanguage">
        <span class="item-label">分句语言</span>
        <span class="item-value">{{ splitLanguageLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.splitMode">
        <span class="item-label">分句模式</span>
        <span class="item-value">{{ splitModeLabel }}</span>
      </div>
      <div class="summary-item" v-if="outputConfig.resolution">
        <span class="item-label">分辨率</span>
        <span class="item-value">{{ outputConfig.resolution }}</span>
      </div>
      <div class="summary-item" v-if="outputConfig.fps">
        <span class="item-label">帧率</span>
        <span class="item-value">{{ outputConfig.fps }} fps</span>
      </div>
      <div class="summary-item" v-if="config.platforms && config.platforms.length > 0">
        <span class="item-label">发布平台</span>
        <span class="item-value">{{ config.platforms.length }} 个</span>
      </div>
    </div>
  </div>
</template>

<script>
const IMAGE_STYLES = {
  cinematic: '电影感', realistic: '写实', anime: '动漫', watercolor: '水彩', minimalist: '极简'
}
const IMAGE_EFFECTS = {
  none: '无效果', 'zoom-in': '慢慢放大', 'zoom-out': '慢慢缩小',
  'pan-left': '向左平移', 'pan-right': '向右平移', 'pan-up': '向上平移',
  'pan-down': '向下平移', 'zoom-pan': '放大并平移', rotate: '缓慢旋转', 'blur-in': '模糊渐入'
}
const VIDEO_MODES = { off: '关闭', fixed: '固定比例', 'ai-judged': 'AI 智能选择' }
const SPLIT_LANGUAGES = { auto: '自动识别', zh: '中文', en: '英文' }
const SPLIT_MODES = { fast: '快速', balanced: '均衡', precise: '精确' }

export default {
  name: 'ConfigSummary',
  props: {
    config: { type: Object, default: () => ({}) },
    outputConfig: { type: Object, default: () => ({}) },
  },
  emits: ['reset'],
  computed: {
    hasConfig() {
      return this.config && Object.keys(this.config).length > 0
    },
    imageStyleLabel() {
      return IMAGE_STYLES[this.config.imageStyle] || this.config.imageStyle
    },
    imageEffectLabel() {
      return IMAGE_EFFECTS[this.config.imageEffect] || this.config.imageEffect
    },
    videoModeLabel() {
      return VIDEO_MODES[this.config.videoMode] || this.config.videoMode
    },
    splitLanguageLabel() {
      return SPLIT_LANGUAGES[this.config.splitLanguage] || this.config.splitLanguage
    },
    splitModeLabel() {
      return SPLIT_MODES[this.config.splitMode] || this.config.splitMode
    },
  },
}
</script>

<style scoped>
.config-summary {
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 16px;
}

.summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.summary-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0;
  color: var(--text);
}

.reset-btn {
  font-size: 12px;
  color: var(--primary);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.reset-btn:hover {
  background: var(--primary-bg, rgba(124, 92, 191, 0.1));
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-label {
  font-size: 11px;
  color: var(--text-muted);
}

.item-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--text);
}

/* 响应式 */
@media (max-width: 768px) {
  .summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
