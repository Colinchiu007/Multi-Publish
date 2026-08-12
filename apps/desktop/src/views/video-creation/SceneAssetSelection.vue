<template>
  <div class="scene-asset-selection" data-testid="scene-asset-selection">
    <div class="sas-header">
      <h3 class="sas-title">{{ titleText }}</h3>
      <p class="sas-subtitle">{{ subtitleText }}</p>
      <p class="sas-hint">{{ selectHintText }}</p>
    </div>

    <div v-if="error" class="sas-error" role="alert" data-testid="sas-error">{{ error }}</div>

    <div v-if="!candidates || candidates.length === 0" class="sas-empty" data-testid="sas-empty">
      {{ notReadyText }}
    </div>

    <div v-else class="sas-scene-list">
      <div v-for="scene in candidates" :key="scene.index" class="sas-scene" :data-testid="'sas-scene-' + scene.index">
        <div class="sas-scene-header">
          <span class="sas-scene-label">{{ sceneLabelText(scene.index) }}</span>
          <span v-if="defaultHint(scene)" class="sas-default-hint">{{ defaultHint(scene) }}</span>
        </div>
        <p v-if="scene.text" class="sas-scene-text">{{ scene.text }}</p>
        <p class="sas-scene-prompt" :title="scene.prompt">{{ scene.prompt }}</p>

        <div class="sas-candidates">
          <label
            v-for="candidate in scene.candidates"
            :key="candidate.id"
            class="sas-candidate"
            :class="{ 'is-selected': selected[scene.index] === candidate.id }"
            :data-testid="'sas-candidate-' + scene.index + '-' + candidate.id"
          >
            <input
              type="radio"
              class="sas-radio"
              :name="'sas-scene-' + scene.index"
              :value="candidate.id"
              :checked="selected[scene.index] === candidate.id"
              @change="select(scene, candidate.id)"
            />
            <span class="sas-candidate-badge">{{ candidateLabel(candidate) }}</span>
            <img
              v-if="candidate.kind === 'image' && urls[candidate.path]"
              class="sas-thumb"
              :src="urls[candidate.path]"
              :alt="candidateLabel(candidate)"
            />
            <video
              v-else-if="candidate.kind === 'video' && urls[candidate.path]"
              class="sas-thumb"
              :src="urls[candidate.path]"
              muted
              playsinline
              preload="metadata"
              controls
            ></video>
            <span v-else class="sas-thumb sas-thumb-loading">…</span>
          </label>
        </div>
      </div>
    </div>

    <div class="sas-actions">
      <button
        type="button"
        class="s2v-btn-primary"
        :disabled="confirming || !allSelected"
        data-testid="sas-confirm"
        @click="confirm"
      >
        {{ confirming ? confirmingText : confirmText }}
      </button>
    </div>
  </div>
</template>

<script>
import { story2videoCreateShareUrl } from '@/api/publisher'

export default {
  name: 'SceneAssetSelection',
  props: {
    runId: { type: String, default: '' },
    candidates: { type: Array, default: () => [] },
    confirming: { type: Boolean, default: false },
    error: { type: String, default: '' },
  },
  emits: ['confirm'],
  data() {
    return {
      selected: {},
      urls: {},
    }
  },
  computed: {
    titleText() {
      return this.$t?.('story2video.sceneAssetSelection.title') || '选择分镜素材'
    },
    subtitleText() {
      return this.$t?.('story2video.sceneAssetSelection.subtitle') || '每个分镜的成品由您自主选择；全部选定后将生成旁白并完成视频合成。'
    },
    selectHintText() {
      return this.$t?.('story2video.sceneAssetSelection.selectHint') || '请为每个场景选择最终使用的素材（单选）。'
    },
    confirmText() {
      return this.$t?.('story2video.sceneAssetSelection.confirm') || '确认选择并继续（生成旁白 + 合成）'
    },
    confirmingText() {
      return this.$t?.('story2video.sceneAssetSelection.confirming') || '提交中...'
    },
    notReadyText() {
      return this.$t?.('story2video.sceneAssetSelection.notReadyHint') || '素材生成中，请稍候…'
    },
    allSelected() {
      return Array.isArray(this.candidates) && this.candidates.length > 0
        && this.candidates.every(scene => this.selected[scene.index] !== undefined && this.selected[scene.index] !== '')
    },
  },
  watch: {
    candidates: {
      immediate: true,
      deep: true,
      handler(value) {
        if (!Array.isArray(value) || value.length === 0) return
        const next = { ...this.selected }
        let changed = false
        for (const scene of value) {
          if (next[scene.index] === undefined) {
            next[scene.index] = this.defaultCandidateId(scene)
            changed = true
          }
        }
        if (changed) this.selected = next
        this.resolveUrls(value)
      },
    },
  },
  methods: {
    defaultCandidateId(scene) {
      const list = Array.isArray(scene.candidates) ? scene.candidates : []
      const video = list.find(c => c && c.kind === 'video')
      if (video) return video.id
      const first = [...list].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))[0]
      return first ? first.id : ''
    },
    defaultHint(scene) {
      const id = this.defaultCandidateId(scene)
      if (!id) return ''
      const candidate = (scene.candidates || []).find(c => c && c.id === id)
      if (!candidate) return ''
      const videoHint = this.$t?.('story2video.sceneAssetSelection.defaultVideoHint') || '默认选中视频'
      const imageHint = this.$t?.('story2video.sceneAssetSelection.defaultFirstImageHint') || '默认选中第 1 张图片'
      return candidate.kind === 'video' ? videoHint : imageHint
    },
    candidateLabel(candidate) {
      if (!candidate) return ''
      const imageLabel = this.$t?.('story2video.sceneAssetSelection.imageLabel') || '图片 {n}'
      const videoLabel = this.$t?.('story2video.sceneAssetSelection.videoLabel') || '视频'
      if (candidate.kind === 'video') return videoLabel
      const n = (candidate.seq ?? 0) + 1
      return typeof imageLabel === 'string' ? imageLabel.replace('{n}', String(n)) : ('图片 ' + n)
    },
    sceneLabelText(index) {
      const template = this.$t?.('story2video.sceneAssetSelection.sceneLabel') || '场景 {index}'
      return typeof template === 'string' ? template.replace('{index}', String((index ?? 0) + 1)) : ('场景 ' + ((index ?? 0) + 1))
    },
    select(scene, candidateId) {
      this.selected = { ...this.selected, [scene.index]: candidateId }
    },
    async resolveUrls(scenes) {
      const pending = []
      for (const scene of scenes) {
        for (const candidate of (scene.candidates || [])) {
          if (!candidate || !candidate.path || this.urls[candidate.path]) continue
          pending.push({ path: candidate.path, id: candidate.id })
        }
      }
      if (pending.length === 0) return
      const results = await Promise.allSettled(pending.map(async ({ path }) => {
        const result = await story2videoCreateShareUrl(path)
        return { path, url: result?.code === 0 ? (result.data?.url || result.data) : null }
      }))
      const next = { ...this.urls }
      let changed = false
      results.forEach((entry, i) => {
        if (entry.status === 'fulfilled' && entry.value.url) {
          next[pending[i].path] = entry.value.url
          changed = true
        }
      })
      if (changed) this.urls = next
    },
    confirm() {
      if (!this.allSelected || this.confirming) return
      const selections = (this.candidates || []).map(scene => ({
        index: scene.index,
        candidateId: this.selected[scene.index],
      }))
      this.$emit('confirm', selections)
    },
  },
}
</script>

<style scoped>
.scene-asset-selection { padding: 4px 0; }
.sas-header { margin-bottom: 10px; }
.sas-title { margin: 0 0 4px; font-size: 15px; }
.sas-subtitle, .sas-hint { margin: 2px 0; font-size: 12px; color: #8a8f98; }
.sas-error { color: #e5534b; font-size: 12px; margin: 6px 0; }
.sas-empty { color: #8a8f98; font-size: 13px; padding: 12px 0; }
.sas-scene { border: 1px solid #33373f; border-radius: 8px; padding: 10px; margin-bottom: 10px; background: #1d2026; }
.sas-scene-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sas-scene-label { font-weight: 600; font-size: 13px; }
.sas-default-hint { font-size: 11px; color: #58a6ff; }
.sas-scene-text { margin: 6px 0 2px; font-size: 12px; color: #c9d1d9; }
.sas-scene-prompt { margin: 0 0 8px; font-size: 11px; color: #8a8f98; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.sas-candidates { display: flex; flex-wrap: wrap; gap: 8px; }
.sas-candidate { display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid #33373f; border-radius: 8px; padding: 6px; cursor: pointer; min-width: 108px; }
.sas-candidate.is-selected { border-color: #58a6ff; box-shadow: 0 0 0 1px #58a6ff; }
.sas-radio { accent-color: #58a6ff; }
.sas-candidate-badge { font-size: 11px; color: #c9d1d9; }
.sas-thumb { width: 96px; height: 128px; object-fit: cover; border-radius: 4px; background: #0d1117; display: flex; align-items: center; justify-content: center; }
.sas-thumb-loading { color: #8a8f98; font-size: 16px; }
.sas-actions { margin-top: 12px; text-align: right; }
.s2v-btn-primary { background: #2f81f7; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; }
.s2v-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
