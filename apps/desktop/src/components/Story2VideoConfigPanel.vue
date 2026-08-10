<template>
  <div class="s2v-config-sections" data-testid="story2video-config-sections">
    <details
      v-for="section in sections"
      :key="section.id"
      class="s2v-config-section"
      :data-testid="'s2v-section-' + section.id"
      :open="openSections[section.id]"
      @toggle="$emit('toggle-section', section.id, $event)"
    >
      <summary class="s2v-section-summary">
        <span>{{ sectionLabel(section.id) }}</span>
        <span class="s2v-summary">{{ sectionSummary(section.id) }}</span>
      </summary>
      <div class="config-grid">
        <template v-if="section.id === 'basic'">
          <div class="config-item">
            <label>内容类型</label>
            <select v-model="localConfig.contentType" class="form-select" @change="emitConfig">
              <option value="general">通用内容</option>
              <option value="history">历史文章（自动识别时代与朝代）</option>
            </select>
          </div>
          <div class="config-item">
            <label>图片生成器</label>
            <select v-model="localConfig.imageProvider" class="form-select" @change="emitConfig">
              <option v-for="p in imageProviders" :key="p.id" :value="p.id">{{ p.displayName }}</option>
            </select>
          </div>
          <div class="config-item config-span-2">
            <label>基础说明</label>
            <p class="config-hint">确认文案和基础参数后，点击"启动流水线"即可自动完成六个阶段；不需要逐步确认。</p>
          </div>
        </template>
        <template v-if="section.id === 'appearance'">
          <div class="config-item">
            <label>图片风格</label>
            <select v-model="localConfig.imageStyle" class="form-select" @change="emitConfig">
              <option value="cinematic">电影感</option>
              <option value="realistic">写实</option>
              <option value="anime">动漫</option>
              <option value="watercolor">水彩</option>
              <option value="minimalist">极简</option>
            </select>
            <span class="config-hint">{{ imageStyleHint }}</span>
          </div>
          <div class="config-item">
            <label>提示词风格</label>
            <select v-model="localConfig.promptStyle" class="form-select" @change="emitConfig">
              <option value="realistic">写实</option>
              <option value="cinematic">电影感</option>
              <option value="anime">动漫</option>
              <option value="watercolor">水彩</option>
              <option value="minimalist">极简</option>
            </select>
            <span class="config-hint">{{ promptStyleHint }}</span>
          </div>
          <div class="config-item">
            <label>图片动效</label>
            <select v-model="localConfig.imageEffect" class="form-select" @change="emitConfig">
              <option value="none">无效果</option>
              <option value="zoom-in">慢慢放大</option>
              <option value="zoom-out">慢慢缩小</option>
              <option value="pan-left">向左平移</option>
              <option value="pan-right">向右平移</option>
              <option value="pan-up">向上平移</option>
              <option value="pan-down">向下平移</option>
              <option value="zoom-pan">放大并平移</option>
              <option value="rotate">缓慢旋转</option>
              <option value="blur-in">模糊渐入</option>
            </select>
          </div>
          <div class="config-item">
            <label>转场</label>
            <select v-model="localConfig.transition" class="form-select" @change="emitConfig">
              <option value="none">直接切换</option>
              <option value="fade">渐隐渐显</option>
              <option value="slide-left">左滑</option>
              <option value="slide-right">右滑</option>
              <option value="slide-up">上滑</option>
              <option value="slide-down">下滑</option>
            </select>
          </div>
          <div class="config-item">
            <label>字幕字号</label>
            <select v-model="localConfig.subtitleSize" class="form-select" @change="emitConfig">
              <option value="size1">特小</option>
              <option value="size2">小</option>
              <option value="size3">中</option>
              <option value="size4">大</option>
              <option value="size5">特大</option>
              <option value="size6">超大</option>
            </select>
          </div>
          <div class="config-item">
            <label>字幕样式</label>
            <select v-model="localConfig.subtitleStyleName" class="form-select" @change="emitConfig">
              <option value="style1">描边</option>
              <option value="style2">背景框</option>
              <option value="style3">粗描边</option>
            </select>
          </div>
          <div class="config-item">
            <label>字幕</label>
            <select v-model="localConfig.subtitleEnabled" class="form-select" @change="emitConfig">
              <option :value="true">启用</option>
              <option :value="false">关闭</option>
            </select>
          </div>
          <div class="config-item">
            <label>背景音乐</label>
            <div class="inline-file-control">
              <button type="button" class="btn-secondary" @click="$refs.bgmInput?.click()">选择音频</button>
              <span class="config-hint">{{ localConfig.bgmPath || '未选择（可选）' }}</span>
            </div>
            <input ref="bgmInput" type="file" accept=".wav,.m4a,.mp3,audio/wav,audio/x-m4a,audio/mpeg" style="display:none" @change="$emit('bgm-file', $event)" />
            <p class="config-hint">{{ bgmHint }}</p>
          </div>
          <div class="config-item">
            <label>背景音乐音量: {{ localConfig.bgmVolume }}</label>
            <input type="range" v-model.number="localConfig.bgmVolume" min="0" max="10" step="1" class="form-range" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>水印文字</label>
            <input v-model.trim="localConfig.watermarkText" class="form-input" placeholder="可选" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>比例与分辨率</label>
            <select :value="outputResolution" class="form-select" @change="$emit('update:resolution', $event.target.value)">
              <option v-for="opt in resolutionOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </template>
        <template v-if="section.id === 'voice'">
          <div class="config-item">
            <label>语音生成器</label>
            <select v-model="localConfig.voiceProvider" class="form-select" @change="$emit('voice-provider-change', localConfig.voiceProvider)">
              <option v-for="p in voiceProviders" :key="p.id" :value="p.id">{{ p.displayName }}</option>
            </select>
          </div>
          <div v-if="localConfig.voiceProvider" class="config-item">
            <label>语音模型</label>
            <select v-if="voiceModelOptions.length > 0" v-model="localConfig.voiceModel" class="form-select" @change="$emit('voice-model-change', localConfig.voiceModel)">
              <option disabled value="">选择模型</option>
              <option v-for="m in voiceModelOptions" :key="m" :value="m">{{ m }}</option>
            </select>
            <span v-else class="config-hint">当前服务商没有可用的语音模型。</span>
          </div>
          <div v-if="localConfig.voiceProvider && localConfig.voiceModel" class="config-item">
            <label>语音 / 音色 ID</label>
            <div class="voice-catalog-row">
              <select v-model="localConfig.voiceId" class="form-select" @change="$emit('voice-select', localConfig.voiceId)">
                <option disabled value="">选择音色</option>
                <option v-for="v in voiceOptions" :key="v.id" :value="v.id">{{ v.name || v.id }}</option>
              </select>
              <button v-if="voiceCatalogRefreshable" type="button" class="btn-secondary btn-sm" @click="$emit('voice-catalog-refresh')">刷新</button>
            </div>
            <span v-if="voiceCatalogError" class="config-hint error-text">{{ voiceCatalogError }}</span>
          </div>
          <div v-if="localConfig.voiceProvider && localConfig.voiceModel" class="config-item config-span-2">
            <label>语音克隆</label>
            <div class="clone-section">
              <select v-model="cloneSelectionId" class="form-select" @change="$emit('clone-select', cloneSelectionId)">
                <option disabled value="">选择克隆音色</option>
                <option v-for="c in voiceClones" :key="c.id" :value="c.id">{{ c.name || c.id }}</option>
              </select>
              <div class="clone-add-row">
                <input v-model="cloneName" class="form-input" placeholder="克隆名称" />
                <button type="button" class="btn-secondary" :disabled="!canAddClone" @click="$emit('clone-add', { selectionId: cloneSelectionId, name: cloneName })">{{ cloneLoading ? '添加中...' : '添加克隆' }}</button>
              </div>
              <span v-if="cloneError" class="config-hint error-text">{{ cloneError }}</span>
            </div>
          </div>
        </template>
        <template v-if="section.id === 'advanced'">
          <div class="config-item">
            <label>分句语言</label>
            <select v-model="localConfig.splitLanguage" class="form-select" @change="emitConfig">
              <option value="auto">自动识别</option>
              <option value="zh">中文</option>
              <option value="en">英文</option>
              <option value="ja">日文</option>
              <option value="ko">韩文</option>
            </select>
          </div>
          <div class="config-item">
            <label>分句模式</label>
            <select v-model="localConfig.splitMode" class="form-select" @change="emitConfig">
              <option value="balanced">均衡</option>
              <option value="aggressive">激进</option>
              <option value="conservative">保守</option>
            </select>
          </div>
          <div class="config-item">
            <label>每句最长字符</label>
            <input type="number" v-model.number="localConfig.splitMaxSentenceLength" class="form-input" min="10" max="500" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>目标时长 (秒)</label>
            <input type="number" v-model.number="localConfig.splitTargetSeconds" class="form-input" min="2" max="30" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>场景时长模式</label>
            <select v-model="localConfig.sceneDurationMode" class="form-select" @change="emitConfig">
              <option value="follow-audio">跟随旁白</option>
              <option value="fixed">固定时长</option>
            </select>
          </div>
          <div v-if="localConfig.sceneDurationMode === 'fixed'" class="config-item">
            <label>最小时长 (秒)</label>
            <input type="number" v-model.number="localConfig.minSceneDuration" class="form-input" min="2" max="30" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>字幕最少字符</label>
            <input type="number" v-model.number="localConfig.splitSubtitleMinChars" class="form-input" min="1" max="30" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>字幕最多字符</label>
            <input type="number" v-model.number="localConfig.splitSubtitleMaxChars" class="form-input" min="5" max="50" @input="emitConfig" />
          </div>
          <div class="config-item">
            <label>字幕时序</label>
            <select v-model="localConfig.splitSubtitleTiming" class="form-select" @change="emitConfig">
              <option value="proportional">按比例</option>
              <option value="even">均分</option>
            </select>
          </div>
          <div class="config-item">
            <label>负面提示词</label>
            <input v-model="localConfig.negativePrompt" class="form-input" placeholder="可选" @input="emitConfig" />
          </div>
        </template>
        <template v-if="section.id === 'publish'">
          <div class="config-item">
            <label>启用发布</label>
            <select v-model="localConfig.publishEnabled" class="form-select" @change="emitConfig">
              <option :value="false">不发布</option>
              <option :value="true">发布到平台</option>
            </select>
          </div>
          <div v-if="localConfig.publishEnabled" class="config-item config-span-2">
            <label>发布标题</label>
            <input v-model="localConfig.title" class="form-input" placeholder="视频标题" @input="emitConfig" />
          </div>
          <div v-if="localConfig.publishEnabled" class="config-item config-span-2">
            <label>标签</label>
            <input v-model="localConfig.tagsText" class="form-input" placeholder="用逗号分隔" @input="emitConfig" />
          </div>
          <div v-if="localConfig.publishEnabled" class="config-item config-span-2">
            <label>发布内容</label>
            <textarea v-model="localConfig.publishContent" class="form-textarea" rows="3" placeholder="发布时的正文描述" @input="emitConfig"></textarea>
          </div>
        </template>
      </div>
    </details>
  </div>
</template>

<script>
export default {
  name: 'Story2VideoConfigPanel',
  props: {
    config: { type: Object, required: true },
    openSections: { type: Object, required: true },
    imageProviders: { type: Array, default: () => [] },
    voiceProviders: { type: Array, default: () => [] },
    voiceModelOptions: { type: Array, default: () => [] },
    voiceOptions: { type: Array, default: () => [] },
    voiceCatalogError: { type: String, default: '' },
    voiceCatalogRefreshable: { type: Boolean, default: false },
    voiceClones: { type: Array, default: () => [] },
    cloneLoading: { type: Boolean, default: false },
    cloneError: { type: String, default: '' },
    resolutionOptions: { type: Array, default: () => [] },
    outputResolution: { type: String, default: '720x1280' },
    imageStyleHint: { type: String, default: '' },
    promptStyleHint: { type: String, default: '' },
    bgmHint: { type: String, default: '' },
  },
  emits: ['update:config','toggle-section','voice-provider-change','voice-model-change','voice-select','voice-catalog-refresh','clone-select','clone-add','bgm-file','update:resolution'],
  data() {
    return {
      cloneSelectionId: '',
      cloneName: '',
      localConfig: { ...this.config },
      sections: [
        { id: 'basic', label: '基础' },
        { id: 'appearance', label: '画面' },
        { id: 'voice', label: '声音' },
        { id: 'advanced', label: '高级' },
        { id: 'publish', label: '发布' },
      ],
    }
  },
  computed: {
    canAddClone() {
      return Boolean(this.cloneSelectionId && String(this.cloneName || '').trim() && !this.cloneLoading)
    },
  },
  watch: {
    config: { handler(val) { this.localConfig = { ...val } }, deep: true },
  },
  methods: {
    emitConfig() { this.$emit('update:config', { ...this.localConfig }) },
    sectionLabel(id) {
      const s = this.sections.find(s => s.id === id)
      return s ? s.label : id
    },
    sectionSummary(id) {
      const c = this.localConfig
      const m = {
        basic: `${c.contentType === 'history' ? '历史内容' : '通用内容'} · ${c.imageProvider || '默认图片模型'}`,
        appearance: `${c.imageStyle || '电影感'} · ${c.imageEffect || '无效果'}`,
        voice: `${c.voiceProvider || '自动 Edge TTS'}${c.voiceModel ? ' · ' + c.voiceModel : ''}${c.voiceId ? ' · 已选音色' : ''}`,
        advanced: `${c.splitLanguage === 'auto' ? '自动识别' : c.splitLanguage} · ${c.splitMode || '均衡'}`,
        publish: c.platforms?.length ? `已选 ${c.platforms.length} 个平台` : '不发布',
      }
      return m[id] || ''
    },
  },
}
</script>

<style scoped>
.config-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; padding: 16px; }
.config-item { display: flex; flex-direction: column; gap: 4px; }
.config-item label { font-size: 13px; font-weight: 600; color: var(--text); }
.config-span-2 { grid-column: span 2; }
.config-hint { font-size: 12px; color: var(--text-muted); margin: 0; }
.error-text { color: var(--error); }
.form-select, .form-input, .form-textarea, .form-range { width: 100%; padding: 6px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; background: var(--surface); color: var(--text); }
.form-textarea { resize: vertical; min-height: 60px; }
.btn-secondary { padding: 5px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; font-size: 12px; }
.btn-secondary:hover { border-color: var(--primary); color: var(--primary); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-sm { padding: 3px 8px; font-size: 11px; }
.inline-file-control { display: flex; align-items: center; gap: 8px; }
.voice-catalog-row { display: flex; gap: 8px; align-items: center; }
.voice-catalog-row .form-select { flex: 1; }
.clone-section { display: flex; flex-direction: column; gap: 8px; }
.clone-add-row { display: flex; gap: 8px; align-items: center; }
.clone-add-row .form-input { flex: 1; }
@media (max-width: 720px) { .config-grid { grid-template-columns: 1fr; } .config-span-2 { grid-column: span 1; } }
</style>