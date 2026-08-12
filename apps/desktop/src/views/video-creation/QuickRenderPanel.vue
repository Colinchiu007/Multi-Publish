<template>
  <div class="quick-render">
    <div class="mode-tabs">
      <button v-for="m in quickModes" :key="m.value" :class="['mode-tab', { active: quickMode === m.value }]" @click="quickMode = m.value">{{ m.label }}</button>
    </div>
    <div class="form-group" v-if="quickMode === 'text'">
      <label>输入文案</label>
      <textarea v-model="quickText" placeholder="输入视频文案，每行一个场景..." rows="8" class="form-input textarea"></textarea>
      <button class="btn-secondary" @click="aiWrite" :disabled="aiLoading">{{ aiLoading ? '生成中...' : 'AI 写稿' }}</button>
    </div>
    <div class="form-group" v-if="quickMode === 'gallery'">
      <label>上传图片</label>
      <div class="upload-zone" @click="$refs.quickFileInput?.click()" @dragover.prevent @drop.prevent="handleQuickDrop">
        <p v-if="quickImages.length === 0">点击或拖拽图片到此处</p>
        <div v-else class="image-grid">
          <div v-for="(img, i) in quickImages" :key="i" class="image-thumb">
            <img :src="img.preview" />
            <button class="remove-btn" @click.stop="quickImages.splice(i, 1)">×</button>
            <span class="image-index">{{ i + 1 }}</span>
          </div>
        </div>
      </div>
      <input ref="quickFileInput" type="file" accept="image/*" multiple style="display:none" @change="handleQuickFiles" />
    </div>
    <div class="form-group">
      <label>输出平台</label>
      <UiSelect v-model="quickProfile" :options="profileOptions" />
    </div>
    <div class="form-group">
      <label>视频主题</label>
      <UiSelect v-model="quickTheme" :options="themeOptions" />
    </div>
    <div class="actions">
      <UiButton @click="startQuickRender" :disabled="!canQuickRender || quickRendering">{{ quickRendering ? '渲染中...' : '开始渲染' }}</UiButton>
      <button v-if="quickRendering" class="btn-secondary" @click="cancelQuickRender">取消</button>
    </div>
    <div v-if="quickRendering" class="progress-section">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: quickProgress + '%' }"></div></div>
      <p class="progress-text">{{ quickProgress }}% — {{ quickStage }}</p>
    </div>
    <div v-if="quickResult" class="result-banner success"><p>视频渲染完成</p><UiButton @click="viewQuickResult">查看视频</UiButton></div>
    <div v-if="quickError" class="result-banner error"><p>{{ quickError }}</p><button class="btn-secondary" @click="quickError = null">重试</button></div>
  </div>
</template>

<script>
import UiButton from '@/components/UiButton.vue'
import UiSelect from '@/components/UiSelect.vue'
import { renderStart, renderCancel } from '@/api/publisher'
import { formatUserError } from '@/utils/user-facing-error'
import { STYLES } from '../create-view-utils'

export default {
  name: 'QuickRenderPanel',
  components: { UiButton, UiSelect },
  data() {
    return {
      quickMode: 'text',
      quickText: '',
      quickImages: [],
      quickProfile: 'youtube-landscape',
      quickTheme: 'clean-professional',
      quickRendering: false,
      quickProgress: 0,
      quickStage: '',
      quickResult: null,
      quickError: null,
      aiLoading: false,
      quickModes: [
        { value: 'text', label: '文案生成' },
        { value: 'gallery', label: '图片轮播' },
      ],
    }
  },
  computed: {
    profileOptions() {
      return [
        { value: 'youtube-landscape', label: 'YouTube 横屏 (1920x1080)' },
        { value: 'youtube-shorts', label: 'YouTube Shorts (1080x1920)' },
        { value: 'tiktok', label: '抖音/TikTok (1080x1920)' },
        { value: 'bilibili', label: 'B站 (1920x1080)' },
        { value: 'wechat', label: '微信视频号 (1080x1920)' },
        { value: 'xiaohongshu', label: '小红书 (1080x1440)' },
      ]
    },
    themeOptions() {
      return STYLES.map(s => ({ value: s.value, label: s.label }))
    },
    canQuickRender() {
      if (this.quickRendering) return false
      if (this.quickMode === 'text') return this.quickText.trim().length > 0
      if (this.quickMode === 'gallery') return this.quickImages.length > 0
      return false
    },
  },
  methods: {
    handleQuickFiles(e) {
      Array.from(e.target.files || []).forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => { this.quickImages.push({ name: file.name, preview: ev.target.result }) }
        reader.readAsDataURL(file)
      })
    },
    handleQuickDrop(e) {
      Array.from(e.dataTransfer?.files || []).forEach(file => {
        if (!file.type.startsWith('image/')) return
        const reader = new FileReader()
        reader.onload = (ev) => { this.quickImages.push({ name: file.name, preview: ev.target.result }) }
        reader.readAsDataURL(file)
      })
    },
    async startQuickRender() {
      this.quickRendering = true; this.quickProgress = 0; this.quickStage = '开始渲染'; this.quickError = null; this.quickResult = null
      try {
        const cuts = this.quickMode === 'text'
          ? this.quickText.split('\n').filter(l => l.trim()).map((t, i) => ({ id: 'scene-' + i, type: 'text_card', text: t.trim(), in_seconds: i * 8, out_seconds: (i + 1) * 8 - 0.5 }))
          : this.quickImages.map((img, i) => ({ id: 'scene-' + i, type: 'anime_scene', images: [img.preview], animation: 'ken-burns', in_seconds: i * 5, out_seconds: (i + 1) * 5 - 0.5 }))
        const res = await renderStart({ props: { cuts, theme: this.quickTheme, renderer_family: 'explainer-data' }, profile: this.quickProfile })
        if (res?.code === 0) { this.quickResult = res.data }
        else { this.quickError = formatUserError(res, { fallback: '渲染失败' }).message; this.quickRendering = false }
      } catch (e) { this.quickError = '渲染异常: ' + formatUserError(e, { fallback: '未知错误' }).message; this.quickRendering = false }
    },
    cancelQuickRender() { renderCancel(); this.quickRendering = false },
    viewQuickResult() { this.$router.push({ path: '/create/result', query: { path: this.quickResult?.outputPath || '' } }) },
    async aiWrite() {
      this.aiLoading = true
      try {
        const { aiGenerate } = await import('@/api/publisher')
        const r = await aiGenerate('text', 'openai', { prompt: '为短视频写一个30秒文案，风格：' + this.quickTheme })
        if (r?.code === 0 && r.data?.text) this.quickText = r.data.text
      } catch (e) { this.quickError = 'AI 写稿失败: ' + formatUserError(e, { fallback: '未知错误' }).message }
      this.aiLoading = false
    },
    // 供父组件桥接主进程渲染进度事件
    applyRenderProgress(pct, stg) {
      if (this.quickRendering) { this.quickProgress = pct; this.quickStage = stg }
    },
    applyRenderComplete(res) {
      this.quickRendering = false; this.quickResult = res
    },
    applyRenderError(err) {
      this.quickRendering = false; this.quickError = err?.message || err || '渲染错误'
    },
  },
}
</script>
