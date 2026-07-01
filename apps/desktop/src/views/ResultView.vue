<template>
  <div class="result-page">
    <div class="page-header">
      <h1>视频预览</h1>
    </div>

    <!-- 加载 -->
    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 无结果 -->
    <div v-else-if="!videoPath" class="empty-state">
      <p>没有可预览的视频</p>
      <button class="btn-primary" @click="$router.push('/create')">去创作</button>
    </div>

    <!-- 视频播放器 -->
    <div v-else class="video-section">
      <video
        ref="videoPlayer"
        :src="videoSrc"
        controls
        class="video-player"
        @error="handleError"
      ></video>

      <div class="video-info">
        <p>格式: MP4</p>
        <p>位置: {{ videoPath }}</p>
      </div>

      <div class="actions">
        <button class="btn-primary" @click="download">下载视频</button>
        <button class="btn-secondary" @click="$router.push('/publish')">去发布</button>
        <button class="btn-secondary" @click="$router.push('/create')">重新创作</button>
      </div>
    </div>

    <!-- 错误 -->
    <div v-if="error" class="error-banner">
      <p>❌ {{ error }}</p>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ResultView',
  data() {
    return {
      videoPath: null,
      loading: true,
      error: null,
      videoSrc: null,
    }
  },
  mounted() {
    const state = this.$router.currentRoute?.query?.path || this.$route?.state?.result?.outputPath
    if (state) {
      this.videoPath = state
      this.videoSrc = `file://${state}`
    }
    this.loading = false
  },
  methods: {
    handleError() {
      this.error = '视频无法播放，文件可能已被移动'
    },
    download() {
      if (!this.videoPath) return
      const a = document.createElement('a')
      a.href = this.videoSrc
      a.download = `video_${Date.now()}.mp4`
      a.click()
    },
  },
}
</script>

<style scoped>
.result-page { padding: 24px; max-width: 900px; margin: 0 auto; }
.page-header { margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0; }
.loading-state, .empty-state { text-align: center; padding: 60px 0; color: #888; }
.video-section { }
.video-player { width: 100%; max-height: 70vh; border-radius: 8px; background: #000; }
.video-info { margin: 12px 0; font-size: 13px; color: #666; }
.actions { display: flex; gap: 12px; margin-top: 16px; }
.btn-primary { padding: 10px 24px; border: none; border-radius: 6px; background: #1a73e8; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-secondary { padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; }
.error-banner { margin-top: 16px; padding: 12px; background: #f8d7da; color: #721c24; border-radius: 8px; }
</style>
