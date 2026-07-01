<template>
  <div class="create-page">
    <div class="page-header">
      <h1>视频创作</h1>
      <p class="text-muted">输入文案或上传素材，快速生成视频</p>
    </div>

    <!-- 状态提示: RenderEngine 就绪检查 -->
    <div v-if="status && !status.ready" class="status-banner warn">
      <span>⚠️ Remotion 渲染引擎未就绪</span>
      <span class="detail" v-if="!status.composerExists">缺少 remotion-composer</span>
      <span class="detail" v-else-if="!status.nodeModulesExist">请运行 npm install</span>
    </div>

    <!-- 创作表单 -->
    <div class="create-form">
      <!-- 模式选择 -->
      <div class="mode-tabs">
        <button
          v-for="m in modes"
          :key="m.value"
          :class="['mode-tab', { active: mode === m.value }]"
          @click="mode = m.value"
        >{{ m.label }}</button>
      </div>

      <!-- 文案输入 -->
      <div class="form-group" v-if="mode === 'text'">
        <label>输入文案</label>
        <textarea
          v-model="text"
          placeholder="输入视频文案，或点击 AI 写稿自动生成..."
          rows="8"
          class="form-input textarea"
        ></textarea>
        <button class="btn-secondary" @click="aiWrite" :disabled="aiLoading">
          {{ aiLoading ? '生成中...' : '🤖 AI 写稿' }}
        </button>
      </div>

      <!-- 主题选择 -->
      <div class="form-group">
        <label>视频主题</label>
        <select v-model="theme" class="form-input">
          <option value="clean-professional">专业清晰</option>
          <option value="flat-motion-graphics">动感深色</option>
          <option value="minimalist-diagram">极简图示</option>
        </select>
      </div>

      <!-- 操作按钮 -->
      <div class="actions">
        <button
          class="btn-primary"
          @click="startRender"
          :disabled="!canRender || rendering"
        >
          {{ rendering ? '渲染中...' : '生成视频' }}
        </button>
        <button v-if="rendering" class="btn-secondary" @click="cancelRender">取消</button>
      </div>
    </div>

    <!-- 进度 -->
    <div v-if="rendering" class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progress + '%' }"></div>
      </div>
      <p class="progress-text">{{ progress }}% — {{ stage }}</p>
    </div>

    <!-- 渲染完成 -->
    <div v-if="result" class="result-banner success">
      <p>✅ 视频渲染完成</p>
      <button class="btn-primary" @click="viewResult">查看视频</button>
    </div>

    <!-- 错误 -->
    <div v-if="error" class="result-banner error">
      <p>❌ {{ error }}</p>
      <button class="btn-secondary" @click="error = null">重试</button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'CreateView',
  data() {
    return {
      mode: 'text',
      text: '',
      theme: 'clean-professional',
      rendering: false,
      progress: 0,
      stage: '',
      result: null,
      error: null,
      status: null,
      aiLoading: false,
      modes: [
        { value: 'text', label: '文案生成' },
        { value: 'gallery', label: '图片轮播' },
      ],
    }
  },
  computed: {
    canRender() {
      return (this.mode === 'text' && this.text.trim().length > 0) && !this.rendering
    },
  },
  mounted() {
    this.checkStatus()
    this.setupListeners()
  },
  beforeUnmount() {
    this.cleanup()
  },
  methods: {
    checkStatus() {
      if (renderGetStatus) {
        renderGetStatus().then(s => this.status = s)
      }
    },
    setupListeners() {
      if (!window.electronAPI) return
      this._unsubProgress = onRenderProgress(({ percent, stage }) => {
        this.progress = percent
        this.stage = stage
      })
      this._unsubComplete = onRenderComplete(({ outputPath }) => {
        this.rendering = false
        this.progress = 100
        this.result = { outputPath }
      })
      this._unsubError = onRenderError(({ error }) => {
        this.rendering = false
        this.error = error
      })
    },
    cleanup() {
      this._unsubProgress?.()
      this._unsubComplete?.()
      this._unsubError?.()
    },
    async aiWrite() {
      this.aiLoading = true
      // TODO: 接入 AI 写稿 API (prompt-engine)
      await new Promise(r => setTimeout(r, 1000))
      this.text = '这是 AI 自动生成的文案。\n\n人工智能正在改变我们创作视频的方式。'
      this.aiLoading = false
    },
    async startRender() {
      this.rendering = true
      this.progress = 0
      this.stage = '准备中'
      this.error = null
      this.result = null

      const props = this.buildProps()
      /* render APIs from @/api/publisher */
  if (!window.electronAPI) {
        this.error = '渲染引擎不可用'
        this.rendering = false
        return
      }
      renderStart(props)
    },
    buildProps() {
      const cuts = this.mode === 'text'
        ? this.text.split('\n').filter(l => l.trim()).map((text, i) => ({
            id: `scene-${i}`,
            type: 'text-card',
            text: text.trim(),
            in_seconds: i * 8,
            out_seconds: (i + 1) * 8 - 0.5,
          }))
        : []
      return {
        cuts,
        theme: this.theme,
        renderer_family: 'explainer-data',
      }
    },
    cancelRender() {
      if (renderCancel) {
        renderCancel()
      }
      this.rendering = false
    },
    viewResult() {
      this.$router.push(`/result/${Date.now()}`, { state: { result: this.result } })
    },
  },
}
</script>

<style scoped>
.create-page { padding: 24px; max-width: 800px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.text-muted { color: #888; font-size: 14px; }
.status-banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
.warn { background: #fff3cd; color: #856404; }
.detail { margin-left: 8px; opacity: 0.7; }
.mode-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.mode-tab { padding: 8px 20px; border: 1px solid #ddd; border-radius: 20px; background: #fff; cursor: pointer; font-size: 14px; }
.mode-tab.active { background: #1a73e8; color: #fff; border-color: #1a73e8; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.form-input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.textarea { resize: vertical; font-family: inherit; line-height: 1.6; }
select.form-input { height: 40px; }
.btn-secondary { padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px; background: #fff; cursor: pointer; font-size: 13px; margin-top: 8px; }
.btn-primary { padding: 10px 24px; border: none; border-radius: 6px; background: #1a73e8; color: #fff; cursor: pointer; font-size: 14px; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.actions { display: flex; gap: 12px; align-items: center; }
.progress-section { margin-top: 24px; }
.progress-bar { height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; }
.progress-fill { height: 100%; background: #1a73e8; transition: width 0.3s; }
.progress-text { font-size: 13px; color: #666; margin-top: 6px; }
.result-banner { margin-top: 20px; padding: 16px; border-radius: 8px; display: flex; align-items: center; gap: 16px; }
.success { background: #d4edda; color: #155724; }
.error { background: #f8d7da; color: #721c24; }
</style>
