<template>
  <div class="create-page">
    <div class="page-header">
      <h1>视频创作</h1>
      <p class="text-muted">基于 OpenMontage 管线引擎，AI 驱动从脚本到成片的全流程</p>
    </div>

    <!-- Remotion 状态提示 -->
    <div v-if="renderStatus && !renderStatus.ready" class="status-banner warn">
      <span>⚠️ Remotion 渲染引擎未就绪</span>
      <span class="detail" v-if="!renderStatus.composerExists">缺少 remotion-composer</span>
      <span class="detail" v-else-if="!renderStatus.nodeModulesExist">依赖未安装</span>
      <button v-if="renderStatus.composerExists && !renderStatus.nodeModulesExist" class="btn-install" @click="installDeps" :disabled="installing">{{ installing ? '安装中...' : '安装依赖' }}</button>
    </div>
    <div v-if="installLog" class="install-log">{{ installLog }}</div>

    <!-- 视图切换 -->
    <div class="view-tabs">
      <button :class="['view-tab', { active: view === 'pipelines' }]" @click="view = 'pipelines'">管线创作</button>
      <button :class="['view-tab', { active: view === 'quick' }]" @click="view = 'quick'">快速渲染</button>
      <button :class="['view-tab', { active: view === 'history' }]" @click="view = 'history'; loadHistory()">历史记录</button>
    </div>

    <!-- ==================== 管线创作视图 ==================== -->
    <div v-if="view === 'pipelines'">
      <!-- 管线列表 -->
      <div v-if="!selectedPipeline">
        <div v-if="pipelineLoading" class="loading-state"><span class="spinner"></span><span>加载管线列表...</span></div>
        <div v-else-if="pipelineError" class="error-state">⚠️ {{ pipelineError }}</div>
        <div v-else class="pipeline-grid">
          <div v-for="p in pipelines" :key="p.name" class="pipeline-card" :class="p.category" @click="selectPipeline(p)">
            <div class="card-header">
              <span class="badge" :class="p.category">{{ categoryLabel(p.category) }}</span>
              <span class="stability-dot" :class="getStability(p.name)" :title="getStability(p.name)"></span>
            </div>
            <h3 class="card-title">{{ humanName(p.name) }}</h3>
            <p class="card-desc">{{ p.description }}</p>
            <div class="card-meta">
              <span class="stage-count">{{ p.stages?.length || 0 }} 阶段</span>
              <span class="cost-label" :class="p.estimatedCost">{{ costLabel(p.estimatedCost) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 管线详情 & 配置 -->
      <div v-else class="pipeline-detail">
        <button class="back-btn" @click="selectedPipeline = null">← 返回管线列表</button>

        <div class="detail-header">
          <h2>{{ humanName(selectedPipeline.name) }}</h2>
          <p class="detail-desc">{{ selectedPipeline.description }}</p>
        </div>

        <!-- 阶段进度 -->
        <div v-if="pipelineRunStatus && pipelineRunStatus.stages" class="stages-timeline">
          <div v-for="(stage, i) in pipelineRunStatus.stages" :key="i" class="stage-item" :class="stageStateClass(stage, i)">
            <span class="stage-icon">{{ stageStateIcon(stage, i) }}</span>
            <span class="stage-name">{{ humanName(stage.name) }}</span>
            <span class="stage-status">{{ stageStatusLabel(stage) }}</span>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-section">
          <h3>输入内容</h3>
          <div class="input-tabs">
            <button :class="['input-tab', { active: inputMode === 'text' }]" @click="inputMode = 'text'">文案</button>
            <button :class="['input-tab', { active: inputMode === 'images' }]" @click="inputMode = 'images'">图片</button>
            <button :class="['input-tab', { active: inputMode === 'video' }]" @click="inputMode = 'video'">视频素材</button>
          </div>

          <div v-if="inputMode === 'text'" class="input-area">
            <textarea v-model="pipelineText" placeholder="输入视频文案、主题描述或脚本..." rows="8" class="form-textarea"></textarea>
          </div>
          <div v-if="inputMode === 'images'" class="input-area">
            <div class="upload-zone" @click="$refs.pipelineFileInput?.click()" @dragover.prevent @drop.prevent="handlePipelineDrop">
              <p v-if="pipelineImages.length === 0">点击或拖拽图片到此处</p>
              <div v-else class="image-grid">
                <div v-for="(img, i) in pipelineImages" :key="i" class="image-thumb">
                  <img :src="img.preview" />
                  <button class="remove-btn" @click.stop="pipelineImages.splice(i, 1)">×</button>
                </div>
              </div>
            </div>
            <input ref="pipelineFileInput" type="file" accept="image/*" multiple style="display:none" @change="handlePipelineFiles" />
          </div>
          <div v-if="inputMode === 'video'" class="input-area">
            <div class="upload-zone" @click="$refs.pipelineVideoInput?.click()">
              <p v-if="!pipelineVideo">点击上传参考视频（用于电影感/蒙太奇管线）</p>
              <p v-else>✅ {{ pipelineVideo.name }}</p>
            </div>
            <input ref="pipelineVideoInput" type="file" accept="video/*" style="display:none" @change="handlePipelineVideo" />
          </div>
        </div>

        <!-- 风格选择 -->
        <div class="config-section">
          <h3>视觉风格</h3>
          <div class="style-grid">
            <button v-for="s in styles" :key="s.value" :class="['style-card', { active: selectedStyle === s.value }]" @click="selectedStyle = s.value">
              <span class="style-name">{{ s.label }}</span>
              <span class="style-desc">{{ s.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 高级配置 -->
        <div class="config-section">
          <h3>高级配置</h3>
          <div class="config-grid">
            <div class="config-item">
              <label>LLM 提供商</label>
              <select v-model="llmConfig.provider" class="form-select">
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="openrouter">OpenRouter</option>
                <option value="ollama">Ollama (本地)</option>
              </select>
            </div>
            <div class="config-item">
              <label>模型</label>
              <input v-model="llmConfig.model" placeholder="留空使用默认模型" class="form-input" />
            </div>
            <div class="config-item">
              <label>温度: {{ llmConfig.temperature }}</label>
              <input type="range" v-model.number="llmConfig.temperature" min="0" max="1" step="0.1" class="form-range" />
            </div>
            <div class="config-item">
              <label>预算模式</label>
              <select v-model="budgetConfig.mode" class="form-select">
                <option value="observe">仅观察</option>
                <option value="warn">超额警告</option>
                <option value="cap">硬性上限</option>
              </select>
            </div>
            <div class="config-item">
              <label>预算上限 ($)</label>
              <input type="number" v-model.number="budgetConfig.totalUsd" min="0" step="0.5" class="form-input" />
            </div>
            <div class="config-item">
              <label>检查点策略</label>
              <select v-model="checkpointPolicy" class="form-select">
                <option value="guided">引导式（推荐）</option>
                <option value="manual_all">全部手动确认</option>
                <option value="auto_noncreative">自动跳过非创意阶段</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 输出配置 -->
        <div class="config-section">
          <h3>输出设置</h3>
          <div class="config-grid">
            <div class="config-item">
              <label>分辨率</label>
              <select v-model="outputConfig.resolution" class="form-select">
                <option value="1920x1080">1920×1080 (Full HD)</option>
                <option value="3840x2160">3840×2160 (4K)</option>
                <option value="1080x1920">1080×1920 (竖屏)</option>
                <option value="1080x1440">1080×1440 (小红书)</option>
              </select>
            </div>
            <div class="config-item">
              <label>帧率</label>
              <select v-model.number="outputConfig.fps" class="form-select">
                <option :value="24">24 fps (电影)</option>
                <option :value="30">30 fps (标准)</option>
                <option :value="60">60 fps (流畅)</option>
              </select>
            </div>
            <div class="config-item">
              <label>格式</label>
              <select v-model="outputConfig.format" class="form-select">
                <option value="mp4">MP4 (H.264)</option>
                <option value="webm">WebM (VP9)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 执行控制 -->
        <div class="action-bar">
          <div v-if="!pipelineRunStatus || pipelineRunStatus.status === 'idle'">
            <UiButton class="btn-start" @click="startPipeline" :disabled="!canStartPipeline">
              🚀 启动管线
            </UiButton>
          </div>
          <div v-else class="running-controls">
            <UiButton v-if="pipelineRunStatus.status === 'paused'" @click="resumePipeline">▶ 继续</UiButton>
            <UiButton v-else-if="pipelineRunStatus.status === 'running'" @click="pausePipeline">⏸ 暂停</UiButton>
            <UiButton v-if="needsCheckpoint" @click="advancePipeline">✅ 确认并继续</UiButton>
            <UiButton variant="danger" @click="cancelPipeline">✕ 取消</UiButton>
          </div>
          <div v-if="pipelineRunStatus && pipelineRunStatus.progress !== undefined" class="progress-inline">
            <div class="progress-bar"><div class="progress-fill" :style="{ width: pipelineRunStatus.progress + '%' }"></div></div>
            <span class="progress-text">{{ pipelineRunStatus.progress }}%</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== 快速渲染视图 ==================== -->
    <div v-if="view === 'quick'" class="quick-render">
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

    <!-- ==================== 历史记录视图 ==================== -->
    <div v-if="view === 'history'">
      <div v-if="historyLoading" class="loading-state"><span class="spinner"></span><span>加载中...</span></div>
      <div v-else-if="history.length === 0" class="empty-state"><p>暂无创作记录</p></div>
      <div v-else class="history-list">
        <div v-for="(h, i) in history" :key="i" class="history-item">
          <span class="history-name">{{ humanName(h.pipeline || h.name) }}</span>
          <span class="history-status" :class="h.status">{{ h.status }}</span>
          <span class="history-time">{{ formatTime(h.completedAt || h.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  renderStart, renderCancel, renderGetStatus, renderInstallDeps,
  onRenderProgress, onRenderComplete, onRenderError, onRenderInstallProgress,
  pipelineList, pipelineStart, pipelinePause, pipelineResume, pipelineCancel,
  pipelineStatus, pipelineAdvance, pipelineHistory
} from '@/api/publisher'

const STYLES = [
  { value: 'clean-professional', label: '简洁专业', desc: '干净排版，适合商业内容' },
  { value: 'flat-motion-graphics', label: '扁平动效', desc: '现代扁平化动画风格' },
  { value: 'anime-ghibli', label: '吉卜力动漫', desc: '温暖的手绘动漫质感' },
  { value: 'minimalist-diagram', label: '极简图表', desc: '数据可视化优先' },
  { value: 'cinematic-dark', label: '电影暗调', desc: '深色电影感渲染' },
]

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
  name: 'CreateView',
  data() {
    return {
      // 视图
      view: 'pipelines',
      // 管线
      pipelines: [], pipelineLoading: true, pipelineError: null,
      selectedPipeline: null,
      pipelineRunStatus: null, needsCheckpoint: false, pollTimer: null,
      // 管线输入
      inputMode: 'text', pipelineText: '', pipelineImages: [], pipelineVideo: null,
      // 配置
      selectedStyle: 'clean-professional',
      llmConfig: { provider: 'anthropic', model: '', temperature: 0.7 },
      budgetConfig: { mode: 'warn', totalUsd: 10 },
      checkpointPolicy: 'guided',
      outputConfig: { resolution: '1920x1080', fps: 30, format: 'mp4' },
      // 快速渲染
      quickMode: 'text', quickText: '', quickImages: [],
      quickProfile: 'youtube-landscape', quickTheme: 'clean-professional',
      quickRendering: false, quickProgress: 0, quickStage: '', quickResult: null, quickError: null,
      aiLoading: false,
      // Remotion 状态
      renderStatus: null, installing: false, installLog: '',
      // 历史
      history: [], historyLoading: false,
      // 清理
      _cleanups: [],
      quickModes: [
        { value: 'text', label: '文案生成' },
        { value: 'gallery', label: '图片轮播' },
      ],
    }
  },
  computed: {
    styles() { return STYLES },
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
    canStartPipeline() {
      if (!this.selectedPipeline) return false
      if (this.inputMode === 'text') return this.pipelineText.trim().length > 0
      if (this.inputMode === 'images') return this.pipelineImages.length > 0
      if (this.inputMode === 'video') return !!this.pipelineVideo
      return true
    },
    canQuickRender() {
      if (this.quickRendering) return false
      if (this.quickMode === 'text') return this.quickText.trim().length > 0
      if (this.quickMode === 'gallery') return this.quickImages.length > 0
      return false
    },
  },
  methods: {
    humanName(name) { if (!name) return ''; return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
    categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat },
    costLabel(cost) { return COST_LABELS[cost] || cost },
    getStability(name) { return STABILITY_MAP[name] || 'experimental' },
    formatTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleString('zh-CN') },

    // 管线操作
    async loadPipelines() {
      this.pipelineLoading = true; this.pipelineError = null
      try {
        const res = await pipelineList()
        if (res?.code === 0) this.pipelines = res.data || []
        else this.pipelineError = res?.message || '加载失败'
      } catch (e) { this.pipelineError = e.message }
      finally { this.pipelineLoading = false }
    },
    selectPipeline(p) { this.selectedPipeline = p; this.pipelineRunStatus = null },
    async startPipeline() {
      const params = {
        text: this.pipelineText, style: this.selectedStyle,
        llm: this.llmConfig, budget: this.budgetConfig,
        checkpoint: this.checkpointPolicy, output: this.outputConfig,
        inputMode: this.inputMode,
        images: this.pipelineImages.map(i => i.preview),
        video: this.pipelineVideo?.name || null,
      }
      const res = await pipelineStart(this.selectedPipeline.name, params)
      if (res?.code === 0) {
        await this.updatePipelineStatus()
        this.pollTimer = setInterval(() => this.updatePipelineStatus(), 3000)
      } else { alert(res?.message || '启动失败') }
    },
    async updatePipelineStatus() {
      if (!this.selectedPipeline) return
      const s = await pipelineStatus(this.selectedPipeline.name)
      if (s?.code === 0) {
        this.pipelineRunStatus = s.data || {}
        this.needsCheckpoint = (s.data?.stages || []).some(st => st.status === 'waiting_approval')
      }
    },
    async pausePipeline() { await pipelinePause(); await this.updatePipelineStatus() },
    async resumePipeline() { await pipelineResume(); await this.updatePipelineStatus() },
    async cancelPipeline() {
      await pipelineCancel()
      this.pipelineRunStatus = null; this.needsCheckpoint = false
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
    },
    async advancePipeline() { await pipelineAdvance(); await this.updatePipelineStatus() },
    async loadHistory() {
      this.historyLoading = true
      try { const r = await pipelineHistory(); if (r?.code === 0) this.history = r.data || [] }
      catch (e) { console.error(e) }
      finally { this.historyLoading = false }
    },

    // 文件处理
    handlePipelineFiles(e) {
      Array.from(e.target.files || []).forEach(file => {
        const reader = new FileReader()
        reader.onload = (ev) => { this.pipelineImages.push({ name: file.name, preview: ev.target.result }) }
        reader.readAsDataURL(file)
      })
    },
    handlePipelineDrop(e) {
      Array.from(e.dataTransfer?.files || []).forEach(file => {
        if (!file.type.startsWith('image/')) return
        const reader = new FileReader()
        reader.onload = (ev) => { this.pipelineImages.push({ name: file.name, preview: ev.target.result }) }
        reader.readAsDataURL(file)
      })
    },
    handlePipelineVideo(e) { this.pipelineVideo = e.target.files?.[0] || null },
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

    // 快速渲染
    async startQuickRender() {
      this.quickRendering = true; this.quickProgress = 0; this.quickStage = '开始渲染'; this.quickError = null; this.quickResult = null
      try {
        const cuts = this.quickMode === 'text'
          ? this.quickText.split('\n').filter(l => l.trim()).map((t, i) => ({ id: 'scene-' + i, type: 'text_card', text: t.trim(), in_seconds: i * 8, out_seconds: (i + 1) * 8 - 0.5 }))
          : this.quickImages.map((img, i) => ({ id: 'scene-' + i, type: 'anime_scene', images: [img.preview], animation: 'ken-burns', in_seconds: i * 5, out_seconds: (i + 1) * 5 - 0.5 }))
        const res = await renderStart({ props: { cuts, theme: this.quickTheme, renderer_family: 'explainer-data' }, profile: this.quickProfile })
        if (res?.code === 0) { this.quickResult = res.data }
        else { this.quickError = res?.message || '渲染失败'; this.quickRendering = false }
      } catch (e) { this.quickError = '渲染异常: ' + (e.message || '未知错误'); this.quickRendering = false }
    },
    cancelQuickRender() { renderCancel(); this.quickRendering = false },
    viewQuickResult() { this.$router.push({ path: '/create/result', query: { path: this.quickResult?.outputPath || '' } }) },
    async aiWrite() {
      this.aiLoading = true
      try {
        const { aiGenerate } = await import('@/api/publisher')
        const r = await aiGenerate('text', 'openai', { prompt: '为短视频写一个30秒文案，风格：' + this.quickTheme })
        if (r?.code === 0 && r.data?.text) this.quickText = r.data.text
      } catch (e) { this.quickError = 'AI 写稿失败: ' + (e.message || '未知错误') }
      this.aiLoading = false
    },

    // Remotion 安装
    async installDeps() {
      this.installing = true; this.installLog = ''
      try {
        const result = await renderInstallDeps()
        this.installLog = result?.log || '安装完成'
      } catch (e) { this.installLog = '安装失败: ' + e.message }
      this.installing = false
      const s = await renderGetStatus()
      this.renderStatus = s?.code === 0 ? s.data : { ready: false }
    },

    // 阶段显示
    stageStateClass(stage, i) {
      if (!this.pipelineRunStatus) return ''
      const idx = this.pipelineRunStatus.currentStage || 0
      if (i < idx || stage.status === 'completed') return 'done'
      if (i === idx && stage.status === 'running') return 'active'
      if (stage.status === 'waiting_approval') return 'waiting'
      return 'pending'
    },
    stageStateIcon(stage, i) {
      if (!this.pipelineRunStatus) return '⭕'
      const idx = this.pipelineRunStatus.currentStage || 0
      if (i < idx || stage.status === 'completed') return '✅'
      if (i === idx && stage.status === 'running') return ''
      if (stage.status === 'waiting_approval') return '⚠️'
      return '⭕'
    },
    stageStatusLabel(stage) {
      const labels = { pending: '等待', running: '执行中', completed: '已完成', paused: '已暂停', waiting_approval: '待确认', cancelled: '已取消' }
      return labels[stage.status] || stage.status || '等待'
    },
  },
  async mounted() {
    await this.loadPipelines()
    renderGetStatus().then(s => { this.renderStatus = s?.code === 0 ? s.data : { ready: false } }).catch(() => { this.renderStatus = { ready: false } })
    this._cleanups.push(onRenderProgress((pct, stg) => { if (this.quickRendering) { this.quickProgress = pct; this.quickStage = stg } }))
    this._cleanups.push(onRenderComplete((res) => { this.quickRendering = false; this.quickResult = res }))
    this._cleanups.push(onRenderError((err) => { this.quickRendering = false; this.quickError = err?.message || err || '渲染错误' }))
    this._cleanups.push(onRenderInstallProgress(({ text }) => { this.installLog += text + '\n' }))
  },
  beforeUnmount() {
    this._cleanups.forEach(fn => { try { fn() } catch(e) {} })
    if (this.pollTimer) clearInterval(this.pollTimer)
  },
}
</script>

<style scoped>
.create-page { padding: 24px; max-width: 1100px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.text-muted { color: var(--text-muted); font-size: 14px; }

/* 状态提示 */
.status-banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.warn { background: var(--warning-bg); color: var(--warning); }
.detail { opacity: 0.7; }
.btn-install { padding: 4px 12px; border: 1px solid var(--warning); border-radius: 4px; background: transparent; color: var(--warning); cursor: pointer; font-size: 12px; margin-left: auto; }
.install-log { padding: 8px 12px; background: var(--bg); border-radius: 4px; font-size: 11px; font-family: monospace; max-height: 100px; overflow-y: auto; margin-bottom: 16px; white-space: pre-wrap; }

/* 视图切换 */
.view-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.view-tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: #666; border-bottom: 2px solid transparent; }
.view-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }

/* 管线网格 */
.pipeline-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }
.pipeline-card { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 20px; cursor: pointer; transition: all 0.2s; }
.pipeline-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); transform: translateY(-2px); border-color: var(--primary); }
.pipeline-card.generated { border-left: 3px solid #3b82f6; }
.pipeline-card.talking_head { border-left: 3px solid #8b5cf6; }
.pipeline-card.cinematic { border-left: 3px solid #ef4444; }
.pipeline-card.animation { border-left: 3px solid #f59e0b; }
.pipeline-card.screen_recording { border-left: 3px solid #10b981; }
.pipeline-card.hybrid { border-left: 3px solid #06b6d4; }
.pipeline-card.custom { border-left: 3px solid #6b7280; }
.card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.badge { font-size: 11px; padding: 2px 8px; border-radius: 4px; font-weight: 600; text-transform: uppercase; }
.badge.generated { background: #dbeafe; color: #1d4ed8; }
.badge.talking_head { background: #ede9fe; color: #7c3aed; }
.badge.cinematic { background: #fee2e2; color: #dc2626; }
.badge.animation { background: #fef3c7; color: #b45309; }
.badge.screen_recording { background: #d1fae5; color: #047857; }
.badge.hybrid { background: #cffafe; color: #0891b2; }
.badge.custom { background: #f3f4f6; color: #4b5563; }
.stability-dot { width: 8px; height: 8px; border-radius: 50%; }
.stability-dot.production { background: #22c55e; }
.stability-dot.beta { background: #3b82f6; }
.stability-dot.experimental { background: #f59e0b; }
.card-title { font-size: 16px; margin: 0 0 6px 0; }
.card-desc { font-size: 13px; color: #666; line-height: 1.4; margin: 0 0 12px 0; }
.card-meta { display: flex; gap: 12px; font-size: 12px; color: #999; }
.cost-label.low { color: #10b981; }
.cost-label.medium { color: #f59e0b; }
.cost-label.high { color: #ef4444; }

/* 管线详情 */
.pipeline-detail { }
.back-btn { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 14px; padding: 0; margin-bottom: 16px; }
.detail-header { margin-bottom: 20px; }
.detail-header h2 { font-size: 20px; margin: 0 0 4px; }
.detail-desc { color: #666; font-size: 14px; margin: 0; }

/* 阶段时间线 */
.stages-timeline { display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; padding: 16px; background: var(--bg); border-radius: 8px; }
.stage-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; font-size: 14px; }
.stage-item.done { color: #666; }
.stage-item.active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.stage-item.waiting { background: #fef3c7; color: #92400e; }
.stage-item.pending { color: #999; }
.stage-icon { width: 24px; text-align: center; }
.stage-name { flex: 1; }
.stage-status { font-size: 12px; }

/* 输入区域 */
.input-section { margin-bottom: 24px; }
.input-section h3 { font-size: 16px; margin: 0 0 12px; }
.input-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
.input-tab { padding: 6px 16px; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); cursor: pointer; font-size: 13px; }
.input-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
.input-area { }
.form-textarea { width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; font-family: inherit; line-height: 1.6; resize: vertical; box-sizing: border-box; }

/* 上传区域 */
.upload-zone { border: 2px dashed var(--border); border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; min-height: 100px; display: flex; align-items: center; justify-content: center; }
.upload-zone:hover { border-color: var(--primary); }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; width: 100%; }
.image-thumb { position: relative; aspect-ratio: 1; border-radius: 4px; overflow: hidden; }
.image-thumb img { width: 100%; height: 100%; object-fit: cover; }
.remove-btn { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: white; cursor: pointer; font-size: 12px; }
.image-index { position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.5); color: white; font-size: 10px; padding: 1px 5px; border-radius: 3px; }

/* 风格选择 */
.config-section { margin-bottom: 24px; }
.config-section h3 { font-size: 16px; margin: 0 0 12px; }
.style-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.style-card { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); cursor: pointer; text-align: left; transition: all 0.2s; }
.style-card:hover { border-color: var(--primary); }
.style-card.active { border-color: var(--primary); background: #f5f3ff; }
.style-name { display: block; font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.style-desc { display: block; font-size: 11px; color: #999; }

/* 配置网格 */
.config-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.config-item { }
.config-item label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.form-select, .form-input { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; box-sizing: border-box; }
.form-range { width: 100%; }

/* 操作栏 */
.action-bar { display: flex; align-items: center; gap: 12px; padding: 16px 0; border-top: 1px solid var(--border); }
.btn-start { padding: 12px 32px; font-size: 16px; }
.running-controls { display: flex; gap: 8px; }
.progress-inline { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.progress-bar { height: 8px; background: #e0e0e0; border-radius: 4px; overflow: hidden; width: 120px; }
.progress-fill { height: 100%; background: var(--primary); transition: width 0.3s; }
.progress-text { font-size: 13px; color: #666; }

/* 快速渲染 */
.quick-render { max-width: 800px; }
.mode-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.mode-tab { padding: 8px 20px; border: 1px solid var(--border); border-radius: 20px; background: var(--surface); cursor: pointer; font-size: 14px; }
.mode-tab.active { background: var(--primary); color: white; border-color: var(--primary); }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.form-input { width: 100%; padding: 10px 12px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.textarea { resize: vertical; font-family: inherit; line-height: 1.6; }
.btn-secondary { padding: 8px 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); cursor: pointer; font-size: 13px; margin-top: 8px; }
.actions { display: flex; gap: 12px; align-items: center; }
.progress-section { margin-top: 24px; }
.result-banner { margin-top: 20px; padding: 16px; border-radius: 8px; display: flex; align-items: center; gap: 16px; }
.success { background: #d4edda; color: #155724; }
.error { background: #f8d7da; color: #721c24; }

/* 历史 */
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; }
.history-name { flex: 1; }
.history-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.history-status.completed { background: #d1fae5; color: #065f46; }
.history-status.failed { background: #fee2e2; color: #991b1b; }
.history-status.cancelled { background: #f3f4f6; color: #6b7280; }
.history-time { color: #999; font-size: 12px; }

/* 通用 */
.loading-state, .empty-state, .error-state { display: flex; align-items: center; gap: 8px; padding: 40px; color: #666; justify-content: center; }
.error-state { color: #dc2626; background: #fef2f2; border-radius: 8px; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>