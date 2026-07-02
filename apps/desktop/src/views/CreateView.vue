<template>
  <div class="create-page">
    <div class="page-header">
      <h1>视频创作</h1>
      <p class="text-muted">输入文案或上传素材，快速生成视频</p>
    </div>
    <div v-if="status && !status.ready" class="status-banner warn">
      <span>⚠️ Remotion 渲染引擎未就绪</span>
      <span class="detail" v-if="!status.composerExists">缺少 remotion-composer</span>
      <span class="detail" v-else-if="!status.nodeModulesExist">依赖未安装</span>
      <button v-if="status.composerExists && !status.nodeModulesExist" class="btn-install" @click="installDeps" :disabled="installing">{{ installing ? '安装中...' : '安装依赖' }}</button>
    </div>
    <div v-if="installLog" class="install-log">{{ installLog }}</div>
    <div class="create-form">
      <div class="mode-tabs">
        <button v-for="m in modes" :key="m.value" :class="['mode-tab', { active: mode === m.value }]" @click="mode = m.value">{{ m.label }}</button>
      </div>
      <div class="form-group" v-if="mode === 'text'">
        <label>输入文案</label>
        <textarea v-model="text" placeholder="输入视频文案，每行一个场景..." rows="8" class="form-input textarea"></textarea>
        <button class="btn-secondary" @click="aiWrite" :disabled="aiLoading">{{ aiLoading ? '生成中...' : 'AI 写稿' }}</button>
      </div>
      <div class="form-group" v-if="mode === 'gallery'">
        <label>上传图片</label>
        <div class="image-upload-zone" @click="triggerUpload" @dragover.prevent @drop.prevent="handleDrop">
          <p v-if="images.length === 0" class="upload-hint">点击或拖拽图片到此处</p>
          <div class="image-grid" v-else>
            <div v-for="(img, i) in images" :key="i" class="image-thumb">
              <img :src="img.preview" />
              <button class="remove-btn" @click.stop="removeImage(i)">x</button>
              <span class="image-index">{{ i + 1 }}</span>
            </div>
          </div>
        </div>
        <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="handleFiles" />
        <p class="tip" v-if="images.length > 0">{{ images.length }} 张图片，每张约 5 秒</p>
      </div>
      <div class="form-group">
        <label>输出平台</label>
        <select v-model="profile" class="form-input">
          <option value="youtube-landscape">YouTube 横屏 (1920x1080)</option>
          <option value="youtube-shorts">YouTube Shorts (1080x1920)</option>
          <option value="tiktok">抖音/TikTok (1080x1920)</option>
          <option value="bilibili">B站 (1920x1080)</option>
          <option value="wechat">微信视频号 (1080x1920)</option>
          <option value="xiaohongshu">小红书 (1080x1440)</option>
          <option value="generic-hd">通用 HD (1920x1080)</option>
        </select>
      </div>
      <div class="form-group">
        <label>视频主题</label>
        <select v-model="theme" class="form-input">
          <option value="clean-professional">专业清晰</option>
          <option value="flat-motion-graphics">动感深色</option>
          <option value="minimalist-diagram">极简图示</option>
        </select>
      </div>
      <div class="actions">
        <button class="btn-primary" @click="startRender" :disabled="!canRender || rendering">{{ rendering ? '渲染中...' : '生成视频' }}</button>
        <button v-if="rendering" class="btn-secondary" @click="cancelRender">取消</button>
      </div>
    </div>
    <div v-if="rendering" class="progress-section">
      <div class="progress-bar"><div class="progress-fill" :style="{ width: progress + '%' }"></div></div>
      <p class="progress-text">{{ progress }}% — {{ stage }}</p>
    </div>
    <div v-if="result" class="result-banner success"><p>视频渲染完成</p><button class="btn-primary" @click="viewResult">查看视频</button></div>
    <div v-if="error" class="result-banner error"><p>{{ error }}</p><button class="btn-secondary" @click="error = null">重试</button></div>
  </div>
</template>
<script>
import { renderStart, renderCancel, renderGetStatus, renderInstallDeps, onRenderProgress, onRenderComplete, onRenderError, onRenderInstallProgress } from '@/api/publisher'
export default {
  name: 'CreateView',
  data() { return { mode: 'text', text: '', theme: 'clean-professional', profile: 'youtube-landscape', images: [], rendering: false, progress: 0, stage: '', result: null, error: null, status: null, aiLoading: false, installing: false, installLog: '', modes: [{ value: 'text', label: '文案生成' }, { value: 'gallery', label: '图片轮播' }] } },
  computed: { canRender() { if (this.rendering) return false; if (this.mode === 'text') return this.text.trim().length > 0; if (this.mode === 'gallery') return this.images.length > 0; return false; } },
  mounted() { this.checkStatus(); this.setupListeners(); },
  beforeUnmount() { this.cleanup(); },
  methods: {
    checkStatus() { if (renderGetStatus) renderGetStatus().then(s => this.status = s); },
    setupListeners() {
      if (!window.electronAPI) return;
      this._unsubProgress = onRenderProgress(({ percent, stage }) => { this.progress = percent; this.stage = stage; });
      this._unsubComplete = onRenderComplete(({ outputPath }) => { this.rendering = false; this.progress = 100; this.result = { outputPath }; });
      this._unsubError = onRenderError(({ error }) => { this.rendering = false; this.error = error; });
      this._unsubInstall = onRenderInstallProgress(({ text }) => { this.installLog += text; });
    },
    cleanup() { this._unsubProgress?.(); this._unsubComplete?.(); this._unsubError?.(); this._unsubInstall?.(); },
    async installDeps() { this.installing = true; this.installLog = ''; const r = await renderInstallDeps(); this.installing = false; if (r?.success) this.checkStatus(); },
    async aiWrite() { this.aiLoading = true; await new Promise(r => setTimeout(r, 1000)); this.text = '这是 AI 自动生成的文案。\n\n人工智能正在改变我们创作视频的方式。'; this.aiLoading = false; },
    triggerUpload() { this.$refs.fileInput?.click(); },
    handleFiles(e) { this.addImages(Array.from(e.target.files || [])); },
    handleDrop(e) { this.addImages(Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'))); },
    addImages(files) { for (const file of files) this.images.push({ file, preview: URL.createObjectURL(file), path: file.path || URL.createObjectURL(file) }); },
    removeImage(i) { URL.revokeObjectURL(this.images[i].preview); this.images.splice(i, 1); },
    async startRender() {
      this.rendering = true; this.progress = 0; this.stage = '准备中'; this.error = null; this.result = null;
      if (!window.electronAPI) { this.error = '渲染引擎不可用'; this.rendering = false; return; }
      renderStart({ props: this.buildProps(), profile: this.profile });
    },
    buildProps() {
      let cuts;
      if (this.mode === 'text') cuts = this.text.split('\n').filter(l => l.trim()).map((t, i) => ({ id: `scene-${i}`, type: 'text_card', text: t.trim(), in_seconds: i * 8, out_seconds: (i + 1) * 8 - 0.5 }));
      else if (this.mode === 'gallery') cuts = this.images.map((img, i) => ({ id: `scene-${i}`, type: 'anime_scene', images: [img.path || img.preview], animation: 'ken-burns', in_seconds: i * 5, out_seconds: (i + 1) * 5 - 0.5 }));
      else cuts = [];
      return { cuts, theme: this.theme, renderer_family: 'explainer-data' };
    },
    cancelRender() { if (renderCancel) renderCancel(); this.rendering = false; },
    viewResult() { this.$router.push({ path: '/create/result', query: { path: this.result?.outputPath || '' } }); },
  },
}
</script>
<style scoped>
.create-page { padding: 24px; max-width: 800px; margin: 0 auto; }
.page-header { margin-bottom: 24px; }
.page-header h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
.text-muted { color: #888; font-size: 14px; }
.status-banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; display: flex; align-items: center; gap: 8px; }
.warn { background: #fff3cd; color: #856404; }
.detail { opacity: 0.7; }
.btn-install { padding: 4px 12px; border: 1px solid #856404; border-radius: 4px; background: transparent; color: #856404; cursor: pointer; font-size: 12px; margin-left: auto; }
.btn-install:disabled { opacity: 0.5; }
.install-log { padding: 8px 12px; background: #f8f9fa; border-radius: 4px; font-size: 11px; font-family: monospace; max-height: 100px; overflow-y: auto; margin-bottom: 16px; white-space: pre-wrap; }
.mode-tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.mode-tab { padding: 8px 20px; border: 1px solid #ddd; border-radius: 20px; background: #fff; cursor: pointer; font-size: 14px; }
.mode-tab.active { background: #1a73e8; color: #fff; border-color: #1a73e8; }
.form-group { margin-bottom: 20px; }
.form-group label { display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px; }
.form-input { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.textarea { resize: vertical; font-family: inherit; line-height: 1.6; }
select.form-input { height: 40px; }
.tip { font-size: 12px; color: #888; margin-top: 6px; }
.image-upload-zone { border: 2px dashed #ddd; border-radius: 8px; padding: 24px; text-align: center; cursor: pointer; min-height: 120px; display: flex; align-items: center; justify-content: center; }
.image-upload-zone:hover { border-color: #1a73e8; }
.upload-hint { color: #888; font-size: 14px; margin: 0; }
.image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; width: 100%; }
.image-thumb { position: relative; aspect-ratio: 1; border-radius: 4px; overflow: hidden; }
.image-thumb img { width: 100%; height: 100%; object-fit: cover; }
.remove-btn { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 50%; border: none; background: rgba(0,0,0,0.6); color: #fff; cursor: pointer; font-size: 12px; }
.image-index { position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.5); color: #fff; font-size: 10px; padding: 1px 5px; border-radius: 3px; }
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
