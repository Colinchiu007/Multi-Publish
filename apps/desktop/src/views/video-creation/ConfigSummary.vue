<template>
  <div class="config-summary" v-if="hasConfig">
    <div class="summary-header">
      <h4 class="summary-title">{{ $t('videoConfig.title') }}</h4>
      <button class="reset-btn" @click="$emit('reset')">{{ $t('videoConfig.reset') }}</button>
    </div>
    <div class="summary-grid">
      <div class="summary-item" v-if="config.imageStyle">
        <span class="item-label">{{ $t('videoConfig.imageStyle') }}</span>
        <span class="item-value">{{ imageStyleLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.imageEffect">
        <span class="item-label">{{ $t('videoConfig.imageEffect') }}</span>
        <span class="item-value">{{ imageEffectLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.voiceProvider">
        <span class="item-label">{{ $t('videoConfig.voiceProvider') }}</span>
        <span class="item-value">{{ config.voiceProvider }}</span>
      </div>
      <div class="summary-item" v-if="config.voiceModel">
        <span class="item-label">{{ $t('videoConfig.voiceModel') }}</span>
        <span class="item-value">{{ config.voiceModel }}</span>
      </div>
      <div class="summary-item" v-if="config.voiceId">
        <span class="item-label">{{ $t('videoConfig.voiceId') }}</span>
        <span class="item-value">{{ $t('videoConfig.voiceSelected') }}</span>
      </div>
      <div class="summary-item" v-if="config.videoMode && config.videoMode !== 'off'">
        <span class="item-label">{{ $t('videoConfig.videoMode') }}</span>
        <span class="item-value">{{ videoModeLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.splitLanguage">
        <span class="item-label">{{ $t('videoConfig.splitLanguage') }}</span>
        <span class="item-value">{{ splitLanguageLabel }}</span>
      </div>
      <div class="summary-item" v-if="config.splitMode">
        <span class="item-label">{{ $t('videoConfig.splitMode') }}</span>
        <span class="item-value">{{ splitModeLabel }}</span>
      </div>
      <div class="summary-item" v-if="outputConfig.resolution">
        <span class="item-label">{{ $t('videoConfig.resolution') }}</span>
        <span class="item-value">{{ outputConfig.resolution }}</span>
      </div>
      <div class="summary-item" v-if="outputConfig.fps">
        <span class="item-label">{{ $t('videoConfig.fps') }}</span>
        <span class="item-value">{{ $t('videoConfig.fpsUnit', { fps: outputConfig.fps }) }}</span>
      </div>
      <div class="summary-item" v-if="config.platforms && config.platforms.length > 0">
        <span class="item-label">{{ $t('videoConfig.platforms') }}</span>
        <span class="item-value">{{ $t('videoConfig.countUnit', { count: config.platforms.length }) }}</span>
      </div>
    </div>
  </div>
</template>

<script>
import "@/styles/config-summary.css"
const IMAGE_STYLES = {
  cinematic: 'styleCinematic', realistic: 'styleRealistic', anime: 'styleAnime', watercolor: 'styleWatercolor', minimalist: 'styleMinimalist'
}
const IMAGE_EFFECTS = {
  none: 'effectNone', 'zoom-in': 'effectZoomIn', 'zoom-out': 'effectZoomOut',
  'pan-left': 'effectPanLeft', 'pan-right': 'effectPanRight', 'pan-up': 'effectPanUp',
  'pan-down': 'effectPanDown', 'zoom-pan': 'effectZoomPan', rotate: 'effectRotate', 'blur-in': 'effectBlurIn'
}
const VIDEO_MODES = { off: 'videoModeOff', fixed: 'videoModeFixed', 'ai-judged': 'videoModeAiJudged' }
const SPLIT_LANGUAGES = { auto: 'langAuto', zh: 'langZh', en: 'langEn' }
const SPLIT_MODES = { fast: 'splitFast', balanced: 'splitBalanced', precise: 'splitPrecise' }

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
      const key = IMAGE_STYLES[this.config.imageStyle]
      return key ? this.$t('videoConfig.' + key) : this.config.imageStyle
    },
    imageEffectLabel() {
      const key = IMAGE_EFFECTS[this.config.imageEffect]
      return key ? this.$t('videoConfig.' + key) : this.config.imageEffect
    },
    videoModeLabel() {
      const key = VIDEO_MODES[this.config.videoMode]
      return key ? this.$t('videoConfig.' + key) : this.config.videoMode
    },
    splitLanguageLabel() {
      const key = SPLIT_LANGUAGES[this.config.splitLanguage]
      return key ? this.$t('videoConfig.' + key) : this.config.splitLanguage
    },
    splitModeLabel() {
      const key = SPLIT_MODES[this.config.splitMode]
      return key ? this.$t('videoConfig.' + key) : this.config.splitMode
    },
  },
}
</script>
