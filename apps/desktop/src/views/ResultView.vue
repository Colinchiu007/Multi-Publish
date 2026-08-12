<template>
  <div class="result-page">
    <div class="page-header">
      <button class="back-to-list" data-testid="back-to-pipeline-list" @click="$router.push('/create')">
        ← 返回流水线列表
      </button>
      <div>
        <h1>视频预览</h1>
        <p v-if="projectId" class="page-subtitle">项目 {{ projectId }}</p>
      </div>
      <span v-if="project?.dirty" class="status-badge">有未合成修改</span>
    </div>

    <!-- BGM 被跳过提示（由 CreateView 完成态透传 query.bgmSkipped/bgmReason） -->
    <div v-if="bgmSkippedNotice" class="bgm-skipped-notice" role="alert" data-testid="story2video-result-bgm-skipped-notice">
      🎵 {{ bgmSkippedNotice }}
    </div>

    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>

    <div v-else-if="!videoPath" class="empty-state">
      <p>没有可预览的视频</p>
      <UiButton @click="$router.push('/create')">去创作</UiButton>
    </div>

    <div v-else class="video-section">
      <video
        ref="videoPlayer"
        :src="videoSrc"
        controls
        class="video-player"
        @loadedmetadata="handleVideoMetadata"
        @timeupdate="handleTrimPreviewProgress"
        @error="handleError"
      ></video>

      <div class="video-info">
        <p v-if="completionSummary" class="completion-summary" data-testid="completion-summary">{{ completionSummary }}</p>
        <p>格式: {{ formatLabel }}</p>
        <p class="path-text">位置: {{ videoPath }}</p>
      </div>

      <div class="actions">
        <UiButton @click="download">下载视频</UiButton>
        <UiButton variant="secondary" @click="exportZip">导出 ZIP</UiButton>
        <UiButton variant="secondary" @click="copyLocalPath">复制路径</UiButton>
        <UiButton variant="secondary" @click="showInFolder">打开文件夹</UiButton>
        <UiButton variant="secondary" @click="$router.push('/publish')">去发布</UiButton>
        <UiButton variant="ghost" @click="$router.push('/create')">重新创作</UiButton>
      </div>
    </div>

    <section v-if="videoPath" class="project-section trim-section">
      <div class="section-heading">
        <div>
          <h2>视频裁剪</h2>
          <p>导出一个新的 MP4 片段，不覆盖原视频</p>
        </div>
      </div>
      <div v-if="videoDuration" class="trim-range-panel">
        <div class="trim-range-values" aria-live="polite">
          <span>{{ formatTrimTime(trimStart) }}</span>
          <span>{{ formatTrimTime(trimEnd) }}</span>
        </div>
        <label class="trim-range-control">
          <span>开始</span>
          <input
            data-testid="trim-start-range"
            aria-label="裁剪开始时间"
            type="range"
            min="0"
            :max="trimMax"
            step="0.1"
            :value="trimStart"
            @input="setTrimBoundary('start', $event.target.value)"
          />
        </label>
        <label class="trim-range-control">
          <span>结束</span>
          <input
            data-testid="trim-end-range"
            aria-label="裁剪结束时间"
            type="range"
            min="0.1"
            :max="trimMax"
            step="0.1"
            :value="trimEnd"
            @input="setTrimBoundary('end', $event.target.value)"
          />
        </label>
      </div>
      <div class="trim-controls">
        <label>
          开始时间（秒）
          <input
            :value="trimStart"
            type="number"
            min="0"
            :max="trimEnd || videoDuration || undefined"
            step="0.1"
            @change="setTrimBoundary('start', $event.target.value)"
          />
        </label>
        <label>
          结束时间（秒）
          <input
            :value="trimEnd"
            type="number"
            :min="Number(trimStart || 0) + 0.1"
            :max="videoDuration || undefined"
            step="0.1"
            @change="setTrimBoundary('end', $event.target.value)"
          />
        </label>
        <UiButton variant="secondary" :disabled="!canTrim" @click="previewTrimRange">预览区间</UiButton>
        <UiButton :disabled="trimming || !canTrim" @click="trimVideo">
          {{ trimming ? '裁剪中...' : '导出片段' }}
        </UiButton>
      </div>
      <progress v-if="trimming" class="trim-progress" aria-label="视频裁剪进度"></progress>
      <p v-if="videoDuration" class="trim-duration">视频时长：{{ videoDuration.toFixed(1) }} 秒</p>
      <div v-if="trimmedPath" class="trim-result">
        <video :src="trimmedSrc" controls class="trimmed-player"></video>
        <div class="section-actions">
          <UiButton size="sm" variant="secondary" @click="downloadTrimmed">下载裁剪片段</UiButton>
          <UiButton size="sm" variant="ghost" @click="showTrimmedInFolder">打开所在文件夹</UiButton>
        </div>
      </div>
    </section>

    <section v-if="projectId && audioPath" class="project-section narration-section">
      <div class="section-heading">
        <div>
          <h2>完整旁白</h2>
          <p>由全部分段音频按顺序合并</p>
        </div>
        <UiButton size="sm" variant="secondary" @click="downloadNarration">下载旁白</UiButton>
      </div>
      <audio :src="audioSrc" controls class="audio-player"></audio>
    </section>

    <section v-if="projectId && segments.length" class="project-section">
      <div class="section-heading">
        <div>
          <h2>分段编辑</h2>
          <p>{{ segments.length }} 个分段</p>
        </div>
        <div class="section-actions">
          <UiButton size="sm" variant="secondary" :disabled="saving" @click="saveSegments">
            {{ saving ? '保存中...' : '保存分段' }}
          </UiButton>
          <UiButton size="sm" :disabled="recomposing" @click="recomposeProject">
            {{ recomposing ? '合成中...' : '重新合成' }}
          </UiButton>
        </div>
      </div>

      <div class="segment-list">
        <article v-for="(segment, index) in segments" :key="segment.id" class="segment-item">
          <div v-if="segment.imageUrl" class="segment-thumb">
            <img :src="segment.imageUrl" :alt="'分段 ' + (index + 1) + ' 图片'" />
          </div>
          <div class="segment-header">
            <strong>分段 {{ index + 1 }}</strong>
            <span class="segment-status" :class="segment.status">{{ segment.status || 'completed' }}</span>
            <div class="segment-order">
              <button type="button" :disabled="index === 0" title="上移" @click="moveSegment(index, -1)">上移</button>
              <button type="button" :disabled="index === segments.length - 1" title="下移" @click="moveSegment(index, 1)">下移</button>
              <button type="button" :disabled="segments.length === 1" title="删除分段" @click="removeSegment(index)">删除</button>
            </div>
          </div>

          <label class="field-label">
            旁白文字
            <textarea v-model="segment.text" rows="3" @input="segmentsDirty = true"></textarea>
          </label>
          <label class="field-label">
            画面提示词
            <textarea v-model="segment.prompt" rows="3" @input="segmentsDirty = true"></textarea>
          </label>
          <div v-if="showPromptTranslation(segment)" class="segment-prompt-translation" data-testid="segment-prompt-translation">
            <span class="segment-prompt-translation-label">{{ promptTranslationLabel }}</span>
            <p class="segment-prompt-translation-text">{{ segment.promptTranslation }}</p>
          </div>

          <div class="segment-actions">
            <label class="segment-file-action" :class="{ disabled: isSegmentBusy(segment.id) }">
              替换旁白
              <input
                type="file"
                accept=".wav,.m4a,.mp3,audio/wav,audio/x-m4a,audio/mpeg"
                :disabled="isSegmentBusy(segment.id)"
                @change="replaceSegmentAudio(segment.id, $event)"
              />
            </label>
            <UiButton size="sm" variant="secondary" :disabled="isSegmentBusy(segment.id)" @click="retrySegment(segment.id, 'image')">{{ isSegmentBusy(segment.id) === 'image' ? '重试中...' : '重试图片' }}</UiButton>
            <UiButton size="sm" variant="secondary" :disabled="isSegmentBusy(segment.id)" @click="retrySegment(segment.id, 'video')">{{ isSegmentBusy(segment.id) === 'video' ? '重试中...' : '重试视频' }}</UiButton>
            <UiButton v-if="segment.imagePath" size="sm" variant="ghost" @click="downloadArtifact(segment.imagePath, segmentName(index, 'image', segment.imagePath))">下载图片</UiButton>
            <UiButton v-if="segment.audioPath" size="sm" variant="ghost" @click="downloadArtifact(segment.audioPath, segmentName(index, 'audio', segment.audioPath))">下载音频</UiButton>
            <UiButton v-if="segment.videoPath" size="sm" variant="ghost" @click="downloadArtifact(segment.videoPath, segmentName(index, 'video', segment.videoPath))">下载视频</UiButton>
          </div>
        </article>
      </div>
    </section>

  </div>

  <UiModal :visible="story2videoNotificationDialog.visible" :title="story2videoNotificationDialogUiText.dialogTitle" size="sm" @close="closeStory2VideoNotificationDialog">
    <p class="story2video-error-dialog-message">{{ story2videoNotificationDialogMessage }}</p>
    <template #footer>
      <UiButton @click="closeStory2VideoNotificationDialog">{{ story2videoNotificationDialogUiText.acknowledge }}</UiButton>
    </template>
  </UiModal>
</template>

<script>
import UiButton from '../components/UiButton.vue'
import UiModal from '../components/UiModal.vue'
import { getAppLocale } from '@/i18n'
import { STORY2VIDEO_NOTIFICATION_KEYS, formatBgmSkippedNotification, formatStory2VideoNotification, getStory2VideoNotificationUiText, resolveStory2VideoNotification } from '@/story2video/story2video-notifications'
import {
  story2videoExportZip,
  story2videoCreateShareUrl,
  story2videoCopyPath,
  story2videoShowInFolder,
  story2videoSaveAs,
  story2videoGetProject,
  story2videoImportMedia,
  story2videoUpdateSegments,
  story2videoReplaceSegmentAudio,
  story2videoRetrySegment,
  story2videoRecomposeProject,
  videoProcess,
} from '@/api/publisher'

export default {
  name: 'ResultView',
  components: { UiButton, UiModal },
  data() {
    return {
      videoPath: null,
      loading: true,
      videoSrc: null,
      projectId: null,
      project: null,
      audioPath: null,
      audioSrc: null,
      segments: [],
      segmentsDirty: false,
      saving: false,
      recomposing: false,
      segmentBusy: {},
      trimStart: 0,
      trimEnd: null,
      videoDuration: null,
      trimming: false,
      trimPreviewing: false,
      trimmedPath: null,
      trimmedSrc: null,
      story2videoNotificationDialog: { visible: false, messageKey: '', messageParams: {} },
      degradedAssetsWarningProjectId: null,
    }
  },
  async mounted() {
    const projectId = this.$route?.query?.project
    const filePath = this.$route?.query?.path
    if (projectId) await this.loadProject(String(projectId))
    else if (filePath) await this.loadVideoPath(String(filePath))
    else this.loading = false
  },
  computed: {
    // 历史记录提示词翻译（2026-08-12）：非 en 界面且分段存在翻译时展示只读文案
    promptTranslationLabel() {
      const locale = getAppLocale()
      return locale === 'zh' ? '中文翻译' : (locale === 'en' ? '' : '翻译')
    },
    bgmSkippedNotice() {
      const query = this.$route?.query || {}
      if (query.bgmSkipped !== '1') return ''
      return formatBgmSkippedNotification(query.bgmReason).message
    },
    completionSummary() {
      const query = this.$route?.query || {}
      const parts = []
      if (Number.isFinite(Number(query.durationMs)) && Number(query.durationMs) > 0) {
        const total = Math.floor(Number(query.durationMs) / 1000)
        const minutes = Math.floor(total / 60)
        const seconds = total % 60
        parts.push('完成时间共 ' + (minutes > 0 ? minutes + ' 分 ' + seconds + ' 秒' : seconds + ' 秒'))
      }
      if (Number.isFinite(Number(query.sizeBytes)) && Number(query.sizeBytes) > 0) {
        parts.push('文件大小 ' + (Number(query.sizeBytes) / 1048576).toFixed(1) + ' M')
      }
      return parts.join(' · ')
    },
    formatLabel() {
      const extension = String(this.videoPath || '').split('.').pop()
      return extension ? extension.toUpperCase() : '视频'
    },
    canTrim() {
      const start = Number(this.trimStart)
      const end = Number(this.trimEnd)
      const duration = Number(this.videoDuration)
      return Boolean(this.videoPath) && Number.isFinite(start) && start >= 0 && Number.isFinite(end) && end > start &&
        (!Number.isFinite(duration) || duration <= 0 || end <= duration)
    },
    trimMax() {
      const duration = Number(this.videoDuration)
      if (Number.isFinite(duration) && duration > 0) return duration
      const end = Number(this.trimEnd)
      return Number.isFinite(end) && end > 0 ? end : 0.1
    },
    degradedAssetKinds() {
      const kinds = new Set()
      for (const segment of this.segments) {
        if (segment?.imageMeta?.degraded === true) kinds.add('placeholder_image')
        if (segment?.audioMeta?.degraded === true) kinds.add('silent_narration')
      }
      return [...kinds]
    },
    hasDegradedAssets() {
      return this.degradedAssetKinds.length > 0
    },
    story2videoNotificationDialogMessage() {
      return formatStory2VideoNotification({
        messageKey: this.story2videoNotificationDialog.messageKey,
        messageParams: this.story2videoNotificationDialog.messageParams,
      }).message
    },
    story2videoNotificationDialogUiText() {
      return getStory2VideoNotificationUiText()
    },
  },
  methods: {
    showStory2VideoNotification(notification = {}) {
      const resolved = resolveStory2VideoNotification(notification)
      this.story2videoNotificationDialog = { visible: true, messageKey: resolved.key, messageParams: resolved.params }
    },
    closeStory2VideoNotificationDialog() {
      this.story2videoNotificationDialog.visible = false
    },
    showStory2VideoOperationFailure() {
      this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.OPERATION_FAILED })
    },
    maybeShowDegradedAssetsWarning() {
      if (!this.projectId || !this.hasDegradedAssets || this.degradedAssetsWarningProjectId === this.projectId) return
      this.degradedAssetsWarningProjectId = this.projectId
      this.showStory2VideoNotification({
        messageKey: STORY2VIDEO_NOTIFICATION_KEYS.DEGRADED_ASSETS_WARNING,
        messageParams: { assetKinds: this.degradedAssetKinds },
      })
    },
    showPromptTranslation(segment) {
      if (getAppLocale() === 'en') return false
      const translation = segment && segment.promptTranslation
      return typeof translation === 'string' && translation.trim() !== ''
    },
    async resolveLocalUrl(filePath) {
      if (!filePath) return null
      const result = await story2videoCreateShareUrl(filePath)
      const url = result?.code === 0 ? (result.data?.url || result.data) : null
      if (!url) throw new Error(result?.message || '无法读取本地文件')
      return url
    },
    async refreshSegmentImageUrls() {
      await Promise.all((this.segments || []).map(async (segment) => {
        if (!segment || !segment.imagePath) return
        try {
          segment.imageUrl = await this.resolveLocalUrl(segment.imagePath)
        } catch (_) {
          segment.imageUrl = null
        }
      }))
    },
    async loadVideoPath(filePath) {
      this.loading = true
      this.videoPath = filePath || null
      if (!this.videoPath) {
        this.videoSrc = null
        this.loading = false
        return false
      }
      try {
        this.videoSrc = await this.resolveLocalUrl(this.videoPath)
        return true
      } catch (_error) {
        this.videoSrc = null
        this.showStory2VideoOperationFailure()
        return false
      } finally {
        this.loading = false
      }
    },
    async loadProject(projectId) {
      this.loading = true
      try {
        const result = await story2videoGetProject(projectId)
        if (result?.code === -3) {
          // 防御：未来若访问控制收紧，未登录打开项目应引导登录而非泛化失败
          this.project = null
          this.projectId = null
          this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ACCESS_DENIED })
          return
        }
        if (result?.code !== 0 || !result.data) throw new Error(result?.message || '项目加载失败')
        const project = result.data
        this.project = project
        this.projectId = project.projectId
        this.segments = Array.isArray(project.segments) ? project.segments.map(segment => ({ ...segment })) : []
        this.segmentsDirty = false
        await this.refreshSegmentImageUrls()
        this.audioPath = project.audioPath || null
        this.audioSrc = this.audioPath ? await this.resolveLocalUrl(this.audioPath) : null
        this.videoPath = project.videoPath || null
        this.videoSrc = this.videoPath ? await this.resolveLocalUrl(this.videoPath) : null
        this.maybeShowDegradedAssetsWarning()
      } catch (_error) {
        this.project = null
        this.projectId = null
        this.showStory2VideoOperationFailure()
      } finally {
        this.loading = false
      }
    },
    handleError() {
      this.showStory2VideoOperationFailure()
    },
    handleVideoMetadata(event) {
      const duration = Number(event?.target?.duration)
      if (!Number.isFinite(duration) || duration <= 0) return
      this.videoDuration = duration
      if (!Number.isFinite(Number(this.trimEnd)) || Number(this.trimEnd) <= Number(this.trimStart) || Number(this.trimEnd) > duration) {
        this.trimEnd = duration
      }
      this.normalizeTrimRange('start')
    },
    normalizeTrimRange(preferredBoundary = 'start') {
      const maximum = Number(this.trimMax)
      if (!Number.isFinite(maximum) || maximum <= 0) return
      const gap = Math.min(0.1, maximum)
      let start = Number(this.trimStart)
      let end = Number(this.trimEnd)
      if (!Number.isFinite(start)) start = 0
      if (!Number.isFinite(end)) end = maximum
      start = Math.min(Math.max(start, 0), Math.max(0, maximum - gap))
      end = Math.min(Math.max(end, gap), maximum)
      if (end - start < gap) {
        if (preferredBoundary === 'end') start = Math.max(0, end - gap)
        else end = Math.min(maximum, start + gap)
      }
      if (end - start < gap) start = Math.max(0, end - gap)
      this.trimStart = start
      this.trimEnd = end
    },
    setTrimBoundary(boundary, value) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric) || !['start', 'end'].includes(boundary)) return
      if (boundary === 'start') this.trimStart = numeric
      else this.trimEnd = numeric
      this.normalizeTrimRange(boundary)
      this.seekTrimPreview(boundary === 'start' ? this.trimStart : this.trimEnd)
    },
    seekTrimPreview(value) {
      const player = this.$refs.videoPlayer
      const time = Number(value)
      if (!player || !Number.isFinite(time)) return
      player.currentTime = Math.min(Math.max(time, 0), Number(this.trimMax))
    },
    async previewTrimRange() {
      if (!this.canTrim) return
      const player = this.$refs.videoPlayer
      if (!player || typeof player.play !== 'function') return
      this.seekTrimPreview(this.trimStart)
      this.trimPreviewing = true
      try {
        const playback = player.play()
        if (playback && typeof playback.then === 'function') await playback
      } catch (_error) {
        this.trimPreviewing = false
        this.showStory2VideoOperationFailure()
      }
    },
    handleTrimPreviewProgress(event) {
      if (!this.trimPreviewing) return
      const player = event?.target || this.$refs.videoPlayer
      if (!player || Number(player.currentTime) < Number(this.trimEnd)) return
      if (typeof player.pause === 'function') player.pause()
      player.currentTime = Number(this.trimStart)
      this.trimPreviewing = false
    },
    formatTrimTime(value) {
      const seconds = Math.max(0, Number(value) || 0)
      const minutes = Math.floor(seconds / 60)
      const remainder = (seconds % 60).toFixed(1).padStart(4, '0')
      return String(minutes).padStart(2, '0') + ':' + remainder
    },
    // 下载统一走主进程保存对话框：renderer 的 <a download> 对跨源/本地 HTTP
    // 媒体 URL 无效（会静默失败），必须用 dialog.showSaveDialog + 文件复制。
    async saveFileAs(filePath, suggestedName) {
      try {
        const result = await story2videoSaveAs(filePath, suggestedName)
        if (result?.code !== 0) throw new Error(result?.message || '保存失败')
        if (result.data?.cancelled) return
        this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.SAVE_COMPLETED })
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      }
    },
    async download() {
      if (!this.videoPath) return
      await this.saveFileAs(this.videoPath, 'video_' + Date.now() + '.' + this.formatLabel.toLowerCase())
    },
    async downloadArtifact(filePath, name) {
      if (!filePath) return
      await this.saveFileAs(filePath, name)
    },
    async downloadNarration() {
      if (!this.audioPath) return
      await this.downloadArtifact(this.audioPath, this.fileName(this.audioPath, 'narration.m4a'))
    },
    fileName(filePath, fallback) {
      return String(filePath || '').split(/[\\/]/).pop() || fallback
    },
    extension(filePath, fallback) {
      const name = this.fileName(filePath, '')
      const match = name.match(/(\.[a-z0-9]{2,5})$/i)
      return match ? match[1].toLowerCase() : fallback
    },
    segmentName(index, kind, filePath) {
      const fallback = kind === 'image' ? '.png' : kind === 'audio' ? '.mp3' : '.mp4'
      return 'segment-' + String(index + 1).padStart(3, '0') + '-' + kind + this.extension(filePath, fallback)
    },
    exportFiles() {
      const files = []
      if (this.videoPath) files.push({ path: this.videoPath, name: this.fileName(this.videoPath, 'video.mp4') })
      if (this.audioPath) files.push({ path: this.audioPath, name: this.fileName(this.audioPath, 'narration.m4a') })
      this.segments.forEach((segment, index) => {
        if (segment.imagePath) files.push({ path: segment.imagePath, name: this.segmentName(index, 'image', segment.imagePath) })
        if (segment.audioPath) files.push({ path: segment.audioPath, name: this.segmentName(index, 'audio', segment.audioPath) })
        if (segment.videoPath) files.push({ path: segment.videoPath, name: this.segmentName(index, 'video', segment.videoPath) })
      })
      return files
    },
    async exportZip() {
      const files = this.exportFiles()
      if (!files.length) return
      try {
        const result = await story2videoExportZip(files)
        if (result?.code !== 0) throw new Error('ZIP 导出失败')
        this.showStory2VideoNotification({
          messageKey: result.data?.cancelled
            ? STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_CANCELLED
            : STORY2VIDEO_NOTIFICATION_KEYS.EXPORT_COMPLETED,
        })
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      }
    },
    async copyLocalPath() {
      if (!this.videoPath) return
      try {
        const result = await story2videoCopyPath(this.videoPath)
        if (result?.code !== 0) throw new Error('复制路径失败')
        this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PATH_COPIED })
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      }
    },
    async showInFolder() {
      if (!this.videoPath) return
      try {
        const result = await story2videoShowInFolder(this.videoPath)
        if (result?.code !== 0) throw new Error('打开文件夹失败')
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      }
    },
    async trimVideo() {
      if (!this.canTrim || this.trimming) return
      this.trimPreviewing = false
      if (this.$refs.videoPlayer && typeof this.$refs.videoPlayer.pause === 'function') this.$refs.videoPlayer.pause()
      this.trimming = true
      try {
        const result = await videoProcess('trim', {
          input_path: this.videoPath,
          start_seconds: Number(this.trimStart),
          end_seconds: Number(this.trimEnd),
          codec: 'libx264',
        })
        const output = result?.data?.output || result?.data?.data?.output
        if (result?.code !== 0 || !result.data?.success || !output) {
          throw new Error(result?.message || result?.data?.error || '视频裁剪失败')
        }
        this.trimmedPath = output
        this.trimmedSrc = await this.resolveLocalUrl(output)
        this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TRIM_COMPLETED })
      } catch (_error) {
        this.trimmedPath = null
        this.trimmedSrc = null
        this.showStory2VideoOperationFailure()
      } finally {
        this.trimming = false
      }
    },
    async downloadTrimmed() {
      if (!this.trimmedPath) return
      await this.saveFileAs(this.trimmedPath, this.fileName(this.trimmedPath, 'video-clip.mp4'))
    },
    async showTrimmedInFolder() {
      if (!this.trimmedPath) return
      try {
        const result = await story2videoShowInFolder(this.trimmedPath)
        if (result?.code !== 0) throw new Error('打开裁剪片段所在文件夹失败')
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      }
    },
    moveSegment(index, offset) {
      const target = index + offset
      if (target < 0 || target >= this.segments.length) return
      const next = this.segments.slice()
      const [segment] = next.splice(index, 1)
      next.splice(target, 0, segment)
      this.segments = next
      this.segmentsDirty = true
    },
    removeSegment(index) {
      if (this.segments.length <= 1) return
      this.segments.splice(index, 1)
      this.segmentsDirty = true
    },
    async saveSegments() {
      if (!this.projectId || !this.segments.length) return false
      this.saving = true
      try {
        const updates = this.segments.map(segment => ({
          id: segment.id,
          text: segment.text || '',
          prompt: segment.prompt || '',
        }))
        const result = await story2videoUpdateSegments(this.projectId, updates)
        if (result?.code !== 0) throw new Error(result?.message || '分段保存失败')
        if (Array.isArray(result.data?.segments) && result.data.segments.length) {
          this.segments = result.data.segments.map(segment => ({ ...segment }))
        }
        this.project = result.data || this.project
        this.segmentsDirty = false
        this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.SEGMENTS_SAVED })
        return true
      } catch (_error) {
        this.showStory2VideoOperationFailure()
        return false
      } finally {
        this.saving = false
      }
    },
    isSegmentBusy(segmentId) {
      return Boolean(this.segmentBusy[segmentId])
    },
    async replaceSegmentAudio(segmentId, event) {
      const input = event?.target
      const file = input?.files?.[0]
      if (!file || !this.projectId || this.isSegmentBusy(segmentId)) return
      this.segmentBusy = { ...this.segmentBusy, [segmentId]: 'audio' }
      try {
        const imported = await story2videoImportMedia(file, 'audio')
        const filePath = imported?.code === 0 ? imported.data?.path : null
        if (!filePath) throw new Error(imported?.message || '旁白导入失败')
        const result = await story2videoReplaceSegmentAudio(this.projectId, segmentId, filePath)
        if (result?.code !== 0 || !result.data) throw new Error(result?.message || '旁白替换失败')
        this.project = result.data
        this.segments = Array.isArray(result.data.segments)
          ? result.data.segments.map(segment => ({ ...segment }))
          : this.segments
        this.segmentsDirty = true
        this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_AUDIO_REPLACED })
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      } finally {
        if (input) input.value = ''
        const next = { ...this.segmentBusy }
        delete next[segmentId]
        this.segmentBusy = next
      }
    },
    async retrySegment(segmentId, mode) {
      if (!this.projectId || this.isSegmentBusy(segmentId)) return
      this.segmentBusy = { ...this.segmentBusy, [segmentId]: mode }
      try {
        const result = await story2videoRetrySegment(this.projectId, segmentId, mode)
        if (result?.code !== 0) throw new Error(result?.message || '分段重试失败')
        if (Array.isArray(result.data?.segments) && result.data.segments.length) {
          this.segments = result.data.segments.map(segment => ({ ...segment }))
        }
        this.project = result.data || this.project
        this.segmentsDirty = true
        // 重试图片/视频会生成新文件，必须重新解析本地媒体 URL，否则分段图片仍显示旧图或空白。
        await this.refreshSegmentImageUrls()
        this.showStory2VideoNotification({
          messageKey: mode === 'image'
            ? STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_IMAGE_RETRIED
            : STORY2VIDEO_NOTIFICATION_KEYS.SEGMENT_VIDEO_RETRIED,
        })
      } catch (_error) {
        // 重试失败也刷新一次：服务端可能部分更新了分段（新图片已落盘但结果未完全返回）
        await this.refreshSegmentImageUrls().catch(() => {})
        this.showStory2VideoOperationFailure()
      } finally {
        const next = { ...this.segmentBusy }
        delete next[segmentId]
        this.segmentBusy = next
      }
    },
    async recomposeProject() {
      if (!this.projectId || this.recomposing) return
      if (this.segmentsDirty && !(await this.saveSegments())) return
      this.recomposing = true
      try {
        const result = await story2videoRecomposeProject(this.projectId)
        if (result?.code !== 0 || !result.data) throw new Error(result?.message || '重新合成失败')
        this.project = result.data
        if (Array.isArray(result.data.segments) && result.data.segments.length) {
          this.segments = result.data.segments.map(segment => ({ ...segment }))
        }
        this.audioPath = result.data.audioPath || this.audioPath
        this.audioSrc = this.audioPath ? await this.resolveLocalUrl(this.audioPath) : null
        if (!result.data.videoPath) {
          this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING })
          return
        }
        const videoLoaded = await this.loadVideoPath(result.data.videoPath)
        if (!videoLoaded) return
        this.projectId = result.data.projectId || this.projectId
        this.segmentsDirty = false
        this.showStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_RECOMPOSED })
      } catch (_error) {
        this.showStory2VideoOperationFailure()
      } finally {
        this.recomposing = false
      }
    },
  },
}
</script>

<style scoped>
.result-page { padding: 24px; max-width: 1040px; margin: 0 auto; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0; }
.back-to-list { align-self: flex-start; border: none; background: none; color: var(--primary); font-size: 14px; cursor: pointer; padding: 4px 8px; border-radius: 6px; margin-right: auto; }
.back-to-list:hover { background: var(--border-light); }
.page-subtitle { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
.status-badge { padding: 5px 8px; border-radius: 4px; background: var(--warning-bg); color: var(--warning); font-size: 12px; }
.bgm-skipped-notice { display: flex; align-items: center; gap: 8px; padding: 10px 14px; margin-bottom: 16px; color: var(--banner-info-color); background: var(--banner-info-bg); border: 1px solid var(--banner-info-border); border-radius: 8px; font-size: 13px; line-height: 1.5; }
.loading-state, .empty-state { text-align: center; padding: 60px 0; color: var(--text-muted); }
.video-player { width: 100%; max-height: 68vh; border-radius: 8px; background: var(--ink); }
.video-info { margin: 12px 0; font-size: 13px; color: var(--text-muted); }
.completion-summary { color: var(--banner-success-text); font-weight: 600; margin-bottom: 4px; }
.video-info p { margin: 4px 0; }
.path-text { overflow-wrap: anywhere; }
.actions, .section-actions, .segment-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.actions { margin-top: 16px; }
.project-section { margin-top: 28px; padding-top: 24px; border-top: 1px solid var(--border); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.section-heading h2 { margin: 0; font-size: 18px; }
.section-heading p { margin: 4px 0 0; color: var(--text-muted); font-size: 13px; }
.audio-player { width: 100%; height: 42px; }
.trim-range-panel { display: grid; gap: 8px; margin-bottom: 14px; padding: 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.trim-range-values { display: flex; justify-content: space-between; color: var(--text-muted); font-variant-numeric: tabular-nums; font-size: 12px; }
.trim-range-control { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 10px; color: var(--text-muted); font-size: 12px; font-weight: 600; }
.trim-range-control input { width: 100%; min-width: 0; accent-color: var(--primary); }
.trim-controls { display: grid; grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) auto auto; gap: 12px; align-items: end; }
.trim-controls label { display: grid; gap: 6px; color: var(--text-muted); font-size: 12px; font-weight: 600; }
.trim-controls input { min-width: 0; border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px; background: var(--bg); color: var(--text); }
.trim-progress { width: 100%; height: 4px; margin-top: 10px; accent-color: var(--primary); }
.trim-duration { margin: 8px 0 0; color: var(--text-muted); font-size: 12px; }
.trim-result { display: grid; gap: 10px; margin-top: 14px; }
.trimmed-player { width: 100%; max-height: 360px; background: var(--ink); border-radius: 6px; }
.segment-list { display: grid; gap: 12px; }
.segment-item { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: var(--surface); }
.segment-thumb { margin-bottom: 12px; border-radius: 6px; overflow: hidden; background: var(--bg); max-width: 320px; }
.segment-thumb img { display: block; width: 100%; height: auto; object-fit: cover; }
.segment-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.segment-status { padding: 3px 6px; border-radius: 4px; background: var(--border-light); color: var(--text-muted); font-size: 11px; }
.segment-status.failed { background: var(--status-failed-bg); color: var(--status-failed-text); }
.segment-status.processing { background: var(--warning-bg); color: var(--warning); }
.segment-order { display: flex; gap: 4px; margin-left: auto; }
.segment-order button { border: 1px solid var(--border); background: var(--surface); color: var(--text-muted); border-radius: 4px; padding: 5px 8px; cursor: pointer; }
.segment-order button:disabled { opacity: 0.4; cursor: not-allowed; }
.field-label { display: grid; gap: 6px; margin-top: 10px; color: var(--text-muted); font-size: 12px; font-weight: 600; }
.field-label textarea { width: 100%; box-sizing: border-box; resize: vertical; border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px; background: var(--bg); color: var(--text); font: inherit; font-size: 13px; line-height: 1.5; }
.segment-actions { margin-top: 12px; }
.segment-file-action { display: inline-flex; align-items: center; min-height: 30px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 12px; font-weight: 600; }
.segment-file-action:hover { border-color: var(--primary); color: var(--primary); }
.segment-file-action.disabled { opacity: 0.45; cursor: not-allowed; }
.segment-file-action input { display: none; }

@media (max-width: 720px) {
  .result-page { padding: 16px; }
  .section-heading, .segment-header { align-items: flex-start; flex-direction: column; }
  .trim-controls { grid-template-columns: 1fr; }
  .segment-order { margin-left: 0; }
  .actions > *, .section-actions > * { flex: 1 1 auto; }
}
</style>
