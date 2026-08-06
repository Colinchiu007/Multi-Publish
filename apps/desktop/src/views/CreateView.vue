<template>
  <div class="create-page">
    <div class="page-header">
      <h1>视频创作</h1>
      <p class="text-muted">基于 OpenMontage 流水线引擎，AI 驱动从脚本到成片的全流程</p>
    </div>

    <!-- Remotion 状态提示 -->
    <div v-if="renderStatus && !renderStatus.ready" class="status-banner warn">
      <span>⚠️ Remotion 渲染引擎未就绪</span>
      <span class="detail" v-if="renderStatus.ipcError">IPC 调用失败：{{ renderStatus.message || '检查 preload 是否暴露该方法' }}</span>
      <span class="detail" v-else-if="!renderStatus.composerExists">缺少 remotion-composer</span>
      <span class="detail" v-else-if="!renderStatus.nodeModulesExist">依赖未安装</span>
      <button v-if="!renderStatus.ipcError && renderStatus.composerExists && !renderStatus.nodeModulesExist" class="btn-install" @click="installDeps" :disabled="installing">{{ installing ? '安装中...' : '安装依赖' }}</button>
    </div>
    <div v-if="installLog" class="install-log">{{ installLog }}</div>

    <!-- 视图切换 -->
    <div class="view-tabs">
      <button :class="['view-tab', { active: view === 'pipelines' }]" @click="view = 'pipelines'">流水线创作</button>
      <button :class="['view-tab', { active: view === 'quick' }]" @click="view = 'quick'">快速渲染</button>
      <button :class="['view-tab', { active: view === 'history' }]" @click="view = 'history'; loadHistory()">历史记录</button>
    </div>

    <!-- ==================== 流水线创作视图 ==================== -->
    <div v-if="view === 'pipelines'">
      <!-- 流水线列表 -->
      <div v-if="!selectedPipeline">
        <div v-if="pipelineLoading" class="loading-state"><span class="spinner"></span><span>加载流水线列表...</span></div>
        <div v-else-if="pipelineError" class="error-state">⚠️ {{ pipelineError }}</div>
        <div v-else class="pipeline-grid">
          <div v-for="p in pipelines" :key="p.name" class="pipeline-card" :data-pipeline-id="p.name" :class="[p.category, { 'is-unavailable': p.available === false }]" @click="selectPipeline(p)">
            <div class="card-header">
              <span class="badge" :class="p.category">{{ pipelineCategory(p.category) }}</span>
              <span class="stability-dot" :class="getStability(p.name)" :title="getStability(p.name)"></span>
            </div>
            <h3 class="card-title">{{ pipelineName(p.name) }}</h3>
            <p class="card-desc">{{ pipelineDescription(p.name) }}</p>
            <div class="card-meta">
              <span class="stage-count">{{ p.stageCount ?? p.stages?.length ?? 0 }} 阶段</span>
              <span class="cost-label" :class="p.estimatedCost">{{ costLabel(p.estimatedCost) }}</span>
              <span class="availability-badge" :class="p.available === false ? 'dev' : 'ready'" :title="availabilityHint(p.available !== false)">
                {{ availabilityLabel(p.available !== false) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 流水线详情 & 配置 -->
      <div v-else class="pipeline-detail">
        <button class="back-btn" @click="selectedPipeline = null">← 返回流水线列表</button>

        <div class="detail-header">
          <h2>{{ pipelineName(selectedPipeline.name) }}</h2>
          <p class="detail-desc">{{ pipelineDescription(selectedPipeline.name) }}</p>
        </div>

        <!-- 阶段进度 -->
        <div v-if="pipelineRunStatus && (pipelineRunStatus.stages || orchestrationStages).length" class="stages-timeline" data-testid="story2video-stage-list">
          <div v-for="(stage, i) in (pipelineRunStatus.stages || orchestrationStages)" :key="stage.id || stage.name || i" class="stage-item" :class="stageStateClass(stage, i)" :data-testid="`story2video-stage-${stage.name || i}`">
            <span class="stage-icon">{{ stageStateIcon(stage, i) }}</span>
            <span class="stage-name">{{ pipelineStage(stage.name) }}</span>
            <span class="stage-status">{{ stageStatusLabel(stage, i) }}</span>
          </div>
        </div>

        <!-- 编排模式中间结果预览 -->
        <div v-if="orchestrationContext" class="orchestration-context">
          <h4>中间结果</h4>
          <div v-for="(value, key) in orchestrationContext" :key="key" class="context-item">
            <span class="context-key">{{ humanName(String(key)) }}</span>
            <span class="context-value">{{ typeof value === 'object' ? JSON.stringify(value).slice(0, 200) : String(value).slice(0, 200) }}</span>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-section">
          <h3>输入内容</h3>
          <div class="input-tabs">
            <button :class="['input-tab', { active: inputMode === 'text' }]" @click="inputMode = 'text'">文案</button>
            <button v-if="!isAutoPipeline(selectedPipeline.name)" :class="['input-tab', { active: inputMode === 'images' }]" @click="inputMode = 'images'">图片</button>
            <button v-if="!isAutoPipeline(selectedPipeline.name)" :class="['input-tab', { active: inputMode === 'audio' }]" @click="inputMode = 'audio'">旁白/批量音频</button>
            <button v-if="!isAutoPipeline(selectedPipeline.name) || isMediaAutoPipeline(selectedPipeline.name)" :class="['input-tab', { active: inputMode === 'video' }]" @click="inputMode = 'video'">视频素材</button>
          </div>

          <div v-if="inputMode === 'text'" class="input-area">
            <textarea v-model="pipelineText" placeholder="输入视频文案、主题描述或脚本..." rows="8" class="form-textarea" @input="enforceStory2VideoTextLimit"></textarea>
            <p v-if="isOrchestratedPipeline(selectedPipeline.name)" class="story2video-text-count">{{ story2videoTextCharacterCount }}/{{ MAX_STORY2VIDEO_TEXT_CHARACTERS }} 字符</p>
          </div>
          <div v-if="inputMode === 'images' && !isOrchestratedPipeline(selectedPipeline.name)" class="input-area">
            <div class="upload-zone" @click="$refs.pipelineFileInput?.click()" @dragover.prevent @drop.prevent="handlePipelineDrop">
              <p v-if="pipelineImages.length === 0">点击或拖拽图片到此处</p>
              <div v-else class="image-grid">
                <div v-for="(img, i) in pipelineImages" :key="i" class="image-thumb">
                  <img :src="img.preview" />
                  <button class="remove-btn" @click.stop="pipelineImages.splice(i, 1)">×</button>
                </div>
              </div>
            </div>
            <input ref="pipelineFileInput" type="file" accept="image/jpeg,image/png,image/webp" multiple style="display:none" @change="handlePipelineFiles" />
          </div>
          <div v-if="inputMode === 'audio' && !isOrchestratedPipeline(selectedPipeline.name)" class="input-area">
            <div class="upload-zone" @click="$refs.pipelineAudioInput?.click()">
              <p v-if="pipelineAudio.length === 0">点击选择旁白音频，可一次选择多个片段</p>
              <div v-else class="file-list">
                <div v-for="(audio, i) in pipelineAudio" :key="audio.path || i" class="audio-file-row" @click.stop>
                  <div class="file-row">
                    <span>{{ i + 1 }}. {{ audio.name }}</span>
                    <button class="remove-btn" @click.stop="pipelineAudio.splice(i, 1)">×</button>
                  </div>
                  <textarea
                    v-model="audio.transcript"
                    class="form-textarea audio-transcript"
                    rows="2"
                    :placeholder="'输入或识别第 ' + (i + 1) + ' 段旁白文字'"
                  ></textarea>
                  <div class="audio-row-actions">
                    <button
                      type="button"
                      class="btn-secondary"
                      :disabled="audio.transcribing"
                      @click.stop="transcribePipelineAudio(i)"
                    >{{ audio.transcribing ? '识别中...' : '识别旁白' }}</button>
                    <span v-if="audio.transcriptionError" class="inline-error">{{ audio.transcriptionError }}</span>
                  </div>
                </div>
              </div>
            </div>
            <input ref="pipelineAudioInput" type="file" accept=".wav,.m4a,.mp3,audio/wav,audio/x-m4a,audio/mpeg" multiple style="display:none" @change="handlePipelineAudio" />
          </div>
          <div v-if="inputMode === 'video' && !isOrchestratedPipeline(selectedPipeline.name)" class="input-area">
            <div class="upload-zone" @click="$refs.pipelineVideoInput?.click()">
              <p v-if="!pipelineVideo">点击上传参考视频（用于电影感/蒙太奇流水线）</p>
              <p v-else>✅ {{ pipelineVideo.name }}</p>
            </div>
            <input ref="pipelineVideoInput" type="file" accept="video/*" style="display:none" @change="handlePipelineVideo" />
            <textarea
              v-if="isMediaAutoPipeline(selectedPipeline.name)"
              v-model="pipelineText"
              placeholder="口播文案（口播视频流水线必填，逐行或分段）..."
              rows="6"
              class="form-textarea media-script-input"
            ></textarea>
          </div>
        </div>

        <!-- 风格选择 -->
        <div v-if="!isOrchestratedPipeline(selectedPipeline.name)" class="config-section">
          <h3>视觉风格</h3>
          <div class="style-grid">
            <button v-for="s in styles" :key="s.value" :class="['style-card', { active: selectedStyle === s.value }]" @click="selectedStyle = s.value">
              <span class="style-name">{{ s.label }}</span>
              <span class="style-desc">{{ s.desc }}</span>
            </button>
          </div>
        </div>

        <!-- 常规流水线高级配置 -->
        <div v-if="!isOrchestratedPipeline(selectedPipeline.name)" class="config-section">
          <h3>高级配置</h3>
          <div class="config-grid">
            <div class="config-item">
              <label>LLM 模型</label>
              <span class="config-hint">使用默认模型（可在模型服务商设置中配置）</span>
              <a href="#/model-providers" class="config-hint-link">前往配置 →</a>
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

        <!-- Story2Video 配置：快速模式 + 五个折叠区 -->
        <div v-if="isOrchestratedPipeline(selectedPipeline.name)" class="s2v-config-sections" data-testid="story2video-config-sections">
          <details
            class="s2v-config-section"
            data-testid="s2v-section-basic"
            :open="s2vOpenSections.basic"
            @toggle="setS2VSectionOpen('basic', $event)"
          >
            <summary class="s2v-section-summary">
              <span>{{ s2vSectionLabel('basic') }}</span>
              <span class="s2v-summary">{{ s2vSectionSummary('basic') }}</span>
            </summary>
            <div class="config-grid">
              <div class="config-item">
                <label>内容类型</label>
                <select v-model="s2vConfig.contentType" class="form-select">
                  <option value="general">通用内容</option>
                  <option value="history">历史文章（自动识别时代与朝代）</option>
                </select>
              </div>
              <div class="config-item">
                <label>图片生成器</label>
                <select v-model="s2vConfig.imageProvider" class="form-select">
                  <option v-for="provider in s2vImageProviderOptions" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
                </select>
              </div>
              <div class="config-item config-span-2">
                <label>基础说明</label>
                <p class="config-hint">确认文案和基础参数后，点击“启动流水线”即可自动完成六个阶段；不需要逐步确认。</p>
              </div>
            </div>
          </details>

          <details
            class="s2v-config-section"
            data-testid="s2v-section-appearance"
            :open="s2vOpenSections.appearance"
            @toggle="setS2VSectionOpen('appearance', $event)"
          >
            <summary class="s2v-section-summary">
              <span>{{ s2vSectionLabel('appearance') }}</span>
              <span class="s2v-summary">{{ s2vSectionSummary('appearance') }}</span>
            </summary>
            <div class="config-grid">
              <div class="config-item">
                <label>图片风格</label>
                <select v-model="s2vConfig.imageStyle" class="form-select">
                  <option value="cinematic">电影感</option>
                  <option value="realistic">写实</option>
                  <option value="anime">动漫</option>
                  <option value="watercolor">水彩</option>
                  <option value="minimalist">极简</option>
                </select>
                <span class="config-hint">{{ story2videoImageStyleHint }}</span>
              </div>
              <div class="config-item">
                <label>提示词风格</label>
                <select v-model="s2vConfig.promptStyle" class="form-select">
                  <option value="realistic">写实</option>
                  <option value="cinematic">电影感</option>
                  <option value="anime">动漫</option>
                  <option value="watercolor">水彩</option>
                  <option value="minimalist">极简</option>
                </select>
                <span class="config-hint">{{ story2videoPromptStyleHint }}</span>
              </div>
              <div class="config-item">
                <label>图片动效</label>
                <select v-model="s2vConfig.imageEffect" class="form-select">
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
                <select v-model="s2vConfig.transition" class="form-select">
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
                <select v-model="s2vConfig.subtitleSize" class="form-select">
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
                <select v-model="s2vConfig.subtitleStyleName" class="form-select">
                  <option value="style1">描边</option>
                  <option value="style2">背景框</option>
                  <option value="style3">粗描边</option>
                </select>
              </div>
              <div class="config-item">
                <label>字幕</label>
                <select v-model="s2vConfig.subtitleEnabled" class="form-select">
                  <option :value="true">启用</option>
                  <option :value="false">关闭</option>
                </select>
              </div>
              <div class="config-item">
                <label>背景音乐</label>
                <div class="inline-file-control">
                  <button type="button" class="btn-secondary" @click="$refs.s2vBgmInput?.click()">选择音频</button>
                  <span class="config-hint">{{ s2vConfig.bgmPath || '未选择（可选）' }}</span>
                </div>
                <input ref="s2vBgmInput" type="file" accept=".wav,.m4a,.mp3,audio/wav,audio/x-m4a,audio/mpeg" style="display:none" @change="handleS2VBgmFile" />
              </div>
              <div class="config-item">
                <label>背景音乐音量: {{ s2vConfig.bgmVolume }}</label>
                <input type="range" v-model.number="s2vConfig.bgmVolume" min="0" max="10" step="1" class="form-range" />
              </div>
              <div class="config-item">
                <label>水印文字</label>
                <input v-model.trim="s2vConfig.watermarkText" class="form-input" placeholder="可选" />
              </div>
            </div>
          </details>

          <details
            class="s2v-config-section"
            data-testid="s2v-section-voice"
            :open="s2vOpenSections.voice"
            @toggle="setS2VSectionOpen('voice', $event)"
          >
            <summary class="s2v-section-summary">
              <span>{{ s2vSectionLabel('voice') }}</span>
              <span class="s2v-summary">{{ s2vSectionSummary('voice') }}</span>
            </summary>
            <div class="config-grid">
              <div class="config-item">
                <label>语音生成器</label>
                <select v-model="s2vConfig.voiceProvider" class="form-select" @change="handleS2VVoiceProviderChange">
                  <option v-for="provider in s2vVoiceProviderOptions" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
                </select>
              </div>
              <div v-if="s2vConfig.voiceProvider" class="config-item">
                <label>语音模型</label>
                <select
                  v-if="s2vVoiceModelOptions.length > 0"
                  v-model="s2vConfig.voiceModel"
                  class="form-select"
                  @change="handleS2VVoiceModelChange"
                >
                  <option disabled value="">选择模型</option>
                  <option v-for="model in s2vVoiceModelOptions" :key="model" :value="model">{{ model }}</option>
                </select>
                <span v-else class="config-hint">当前服务商没有可用的语音模型。</span>
              </div>
              <div v-if="s2vConfig.voiceProvider && s2vConfig.voiceModel" class="config-item">
                <label>语音 / 音色 ID</label>
                <select
                  id="s2v-voice-catalog"
                  v-model="s2vConfig.voiceId"
                  class="form-select"
                  :disabled="s2vVoiceCatalogLoading || s2vVoiceOptions.length === 0"
                  @change="handleS2VVoiceSelection"
                >
                  <option value="">使用服务商默认音色</option>
                  <option v-for="voice in s2vVoiceOptions" :key="voice.id" :value="voice.id">{{ voice.name }}</option>
                </select>
                <span v-if="s2vVoiceCatalogLoading" class="config-hint">正在加载音色目录…</span>
                <span v-else-if="s2vVoiceCatalogError" class="inline-error">{{ s2vVoiceCatalogError }}</span>
                <span v-else-if="s2vVoiceOptions.length === 0" class="config-hint">当前模型没有可用音色。</span>
              </div>
              <div v-if="s2vVoiceCapability?.type === 'provider_personal_slot'" class="config-item config-span-2 voice-slot-hint">
                <label>个人音色槽位</label>
                <p class="config-hint">请先在服务商官方控制台创建或管理个人音色，再刷新本地目录并在上方下拉列表中选择。当前页面不会伪造或复制服务商槽位。</p>
              </div>
              <div
                v-if="s2vVoiceCapability?.type === 'user_clone' && s2vVoiceCapability?.clone?.enabled === true"
                class="config-item config-span-2 voice-clone-panel"
              >
                <label>音色复制 / 克隆</label>
                <p v-if="s2vVoiceCloneRequirements" class="config-hint">
                  支持格式：{{ s2vVoiceCloneRequirements.allowedExtensions?.join('、') || '音频' }}；最多 {{ s2vVoiceCloneRequirements.maxSampleCount }} 个文件；单文件 {{ formatS2VVoiceCloneBytes(s2vVoiceCloneRequirements.maxSampleBytes) }}，合计 {{ formatS2VVoiceCloneBytes(s2vVoiceCloneRequirements.maxTotalBytes) }}；单条 {{ formatS2VVoiceCloneDuration(s2vVoiceCloneRequirements.maxSampleDurationSeconds) }}，合计 {{ formatS2VVoiceCloneDuration(s2vVoiceCloneRequirements.maxTotalDurationSeconds) }}。
                </p>
                <p v-if="s2vVoiceCloneRequirements" class="config-hint">以上为当前模型能力数据驱动的本地校验提示，具体以供应商官方 API 合同为准。</p>
                <div class="voice-clone-actions">
                  <button type="button" class="btn-secondary" :disabled="s2vVoiceCloneLoading" @click="chooseS2VVoiceCloneSamples">
                    {{ s2vVoiceCloneSelection ? '重新选择样本' : '选择本地音频样本' }}
                  </button>
                  <span v-if="s2vVoiceCloneSelection" class="config-hint">已选择 {{ s2vVoiceCloneSelection.sampleCount }} 个样本</span>
                </div>
                <label class="checkbox-label voice-clone-consent">
                  <input v-model="s2vVoiceCloneConsent" type="checkbox" />
                  <span>我确认已取得样本上传、使用和克隆的权利，并已作出明确同意。</span>
                </label>
                <p class="config-hint">已授权样本只由可信主进程写入当前用户的本机私有目录，用于管理此克隆音色；页面不会接收原始文件路径或音频内容。</p>
                <div class="voice-clone-actions">
                  <input v-model.trim="s2vVoiceCloneName" class="form-input" maxlength="128" placeholder="克隆音色名称" />
                  <button type="button" class="btn-secondary" :disabled="!canAddS2VVoiceClone" @click="addS2VVoiceClone">{{ s2vVoiceCloneLoading ? '处理中…' : '添加克隆音色' }}</button>
                </div>
                <p v-if="s2vVoiceCloneError" class="inline-error">{{ s2vVoiceCloneError }}</p>
                <div v-if="s2vVoiceClones.length > 0" class="voice-clone-list">
                  <div v-for="voice in s2vVoiceClones" :key="voice.id" class="voice-clone-row">
                    <span>{{ voice.name }}</span>
                    <div class="voice-clone-actions">
                      <button type="button" class="btn-secondary" :disabled="s2vVoiceCloneLoading" @click="selectS2VVoice(voice.id)">设为默认</button>
                      <button type="button" class="btn-secondary danger" :disabled="s2vVoiceCloneLoading" @click="deleteS2VVoiceClone(voice.id)">删除</button>
                    </div>
                  </div>
                </div>
              </div>
              <div v-else-if="s2vVoiceCapability?.type === 'user_clone'" class="config-item config-span-2 voice-slot-hint">
                <label>音色复制 / 克隆</label>
                <p class="config-hint">当前服务商尚未接入可用的音色克隆能力。</p>
              </div>
              <div class="config-item">
                <label>语速: {{ Number(s2vConfig.voiceSpeed).toFixed(1) }}x</label>
                <input type="range" v-model.number="s2vConfig.voiceSpeed" min="0.5" max="2" step="0.1" class="form-range" />
              </div>
              <div class="config-item">
                <label>旁白音量: {{ Number(s2vConfig.voiceVolume).toFixed(2) }}</label>
                <input type="range" v-model.number="s2vConfig.voiceVolume" min="0" max="2" step="0.05" class="form-range" />
              </div>
            </div>
          </details>

          <details
            class="s2v-config-section"
            data-testid="s2v-section-advanced"
            :open="s2vOpenSections.advanced"
            @toggle="setS2VSectionOpen('advanced', $event)"
          >
            <summary class="s2v-section-summary">
              <span>{{ s2vSectionLabel('advanced') }}</span>
              <span class="s2v-summary">{{ s2vSectionSummary('advanced') }}</span>
            </summary>
            <div class="s2v-subgroup">
              <h4 class="s2v-subgroup-title">{{ s2vSubgroupLabel('splitTiming') }}</h4>
              <div class="config-grid">
                <div class="config-item">
                  <label>分句语言</label>
                  <select v-model="s2vConfig.splitLanguage" class="form-select">
                    <option value="auto">自动识别</option>
                    <option value="zh">中文</option>
                    <option value="en">英文</option>
                  </select>
                </div>
                <div class="config-item">
                  <label>分句模式</label>
                  <select v-model="s2vConfig.splitMode" class="form-select">
                    <option value="fast">快速</option>
                    <option value="balanced">均衡</option>
                    <option value="precise">精确</option>
                  </select>
                </div>
                <div class="config-item">
                  <label>单句最大长度</label>
                  <input type="number" v-model.number="s2vConfig.splitMaxSentenceLength" min="20" max="1000" class="form-input" />
                </div>
                <div class="config-item">
                  <label>分镜目标时长（秒）</label>
                  <input type="number" v-model.number="s2vConfig.splitTargetSeconds" min="1" max="60" step="0.5" class="form-input" />
                </div>
                <div class="config-item">
                  <label>无旁白场景时长（秒）</label>
                  <input type="number" v-model.number="s2vConfig.perImageDuration" min="1" max="60" step="0.5" class="form-input" />
                </div>
                <div class="config-item config-span-2">
                  <label>负向提示词</label>
                  <textarea v-model.trim="s2vConfig.negativePrompt" rows="2" maxlength="500" class="form-textarea"></textarea>
                </div>
              </div>
            </div>
            <div class="s2v-subgroup">
              <h4 class="s2v-subgroup-title">{{ s2vSubgroupLabel('templateOutput') }}</h4>
              <div class="config-grid">
                <div class="config-item">
                  <label>模板分类</label>
                  <select v-model="s2vTemplateCategory" class="form-select">
                    <option value="all">全部模板</option>
                    <option value="popular">热门</option>
                    <option value="business">商务</option>
                    <option value="creative">创意</option>
                    <option value="vlog">Vlog</option>
                    <option value="education">知识讲解</option>
                    <option value="custom">我的模板</option>
                  </select>
                </div>
                <div class="config-item">
                  <label>视频模板</label>
                  <select v-model="s2vConfig.templateId" class="form-select" @change="applyS2VTemplate">
                    <option v-for="template in s2vTemplates" :key="template.value" :value="template.value">{{ template.label }}</option>
                  </select>
                </div>
                <div class="config-item config-span-2">
                  <label>自定义模板</label>
                  <div class="template-editor">
                    <input v-model.trim="s2vCustomTemplateName" class="form-input" maxlength="80" placeholder="输入模板名称" />
                    <button type="button" class="btn-secondary" :disabled="!s2vCustomTemplateName" @click="saveCurrentS2VTemplate">保存当前参数</button>
                    <button v-if="selectedS2VTemplate?.category === 'custom'" type="button" class="btn-secondary danger" @click="requestTemplateDeletion">删除模板</button>
                  </div>
                </div>
                <div class="config-item">
                  <label>输出分辨率</label>
                  <select v-model="activeOutputConfig.resolution" class="form-select">
                    <option value="720x1280">720×1280 (Story2Video)</option>
                    <option value="1920x1080">1920×1080 (Full HD)</option>
                    <option value="3840x2160">3840×2160 (4K)</option>
                    <option value="1080x1920">1080×1920 (竖屏)</option>
                    <option value="1080x1440">1080×1440 (小红书)</option>
                  </select>
                </div>
                <div class="config-item">
                  <label>帧率</label>
                  <select v-model.number="activeOutputConfig.fps" class="form-select">
                    <option :value="24">24 fps (电影)</option>
                    <option :value="30">30 fps (标准)</option>
                    <option :value="60">60 fps (流畅)</option>
                  </select>
                </div>
                <div class="config-item">
                  <label>格式</label>
                  <select v-model="activeOutputConfig.format" class="form-select">
                    <option value="mp4">MP4 (H.264)</option>
                    <option value="webm">WebM (VP9)</option>
                  </select>
                </div>
              </div>
            </div>
            <p class="s2v-controlled-defaults">部分高级运行参数由系统默认值管理。</p>
          </details>
        </div>

        <details v-if="isOrchestratedPipeline(selectedPipeline.name)" class="s2v-config-section" data-testid="s2v-section-publish" :open="s2vOpenSections.publish" @toggle="setS2VSectionOpen('publish', $event)">
          <summary class="s2v-section-summary">
            <span>{{ s2vSectionLabel('publish') }}</span>
            <span class="s2v-summary">{{ s2vSectionSummary('publish') }}</span>
          </summary>
          <div class="config-grid">
            <div class="config-item config-span-2">
              <label>发布平台</label>
              <div class="platform-checkboxes">
                <label v-for="platform in s2vPlatforms" :key="platform.value" class="checkbox-label">
                  <input v-model="s2vConfig.platforms" type="checkbox" :value="platform.value" />
                  <span>{{ platform.label }}</span>
                </label>
              </div>
            </div>
            <div class="config-item">
              <label>发布标题</label>
              <input v-model.trim="s2vConfig.title" class="form-input" placeholder="可选" />
            </div>
            <div class="config-item">
              <label>发布标签</label>
              <input v-model.trim="s2vConfig.tagsText" class="form-input" placeholder="用逗号分隔" />
            </div>
            <div class="config-item config-span-2">
              <label>发布正文</label>
              <textarea v-model.trim="s2vConfig.publishContent" rows="3" maxlength="20000" class="form-textarea"></textarea>
            </div>
            <div class="config-item config-span-2">
              <label>封面 URL</label>
              <input v-model.trim="s2vConfig.coverUrl" class="form-input" maxlength="4096" />
            </div>
          </div>
        </details>
        <!-- 输出配置 -->
        <div v-if="!isOrchestratedPipeline(selectedPipeline?.name)" class="config-section">
          <h3>输出设置</h3>
          <div class="config-grid">
            <div class="config-item">
              <label>分辨率</label>
              <select v-model="activeOutputConfig.resolution" class="form-select">
                <option value="720x1280">720×1280 (Story2Video)</option>
                <option value="1920x1080">1920×1080 (Full HD)</option>
                <option value="3840x2160">3840×2160 (4K)</option>
                <option value="1080x1920">1080×1920 (竖屏)</option>
                <option value="1080x1440">1080×1440 (小红书)</option>
              </select>
            </div>
            <div class="config-item">
              <label>帧率</label>
              <select v-model.number="activeOutputConfig.fps" class="form-select">
                <option :value="24">24 fps (电影)</option>
                <option :value="30">30 fps (标准)</option>
                <option :value="60">60 fps (流畅)</option>
              </select>
            </div>
            <div class="config-item">
              <label>格式</label>
              <select v-model="activeOutputConfig.format" class="form-select">
                <option value="mp4">MP4 (H.264)</option>
                <option value="webm">WebM (VP9)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- 执行控制 -->
        <div class="action-bar">
          <div v-if="!pipelineRunStatus || pipelineRunStatus.status === 'idle'">
            <UiButton class="btn-start" data-testid="start-story2video" @click="startPipeline" :disabled="!canStartPipeline">
              {{ translateWithLocaleFallback('create.story2video.startPipeline', '启动流水线', 'Start pipeline') }}
            </UiButton>
            <p v-if="!pipelineAvailable(selectedPipeline?.name)" class="unavailable-hint" data-testid="pipeline-unavailable-hint">
              {{ translateWithLocaleFallback('pipelines.availability.notImplementedHint', '该流水线尚未实现执行引擎，暂不能生成视频', 'This pipeline has no execution engine yet.') }}
            </p>
          </div>
          <div v-else class="running-controls">
            <template v-if="orchestrationRunId">
              <p v-if="pipelineRunStatus?.checkpoint?.reason === 'content_policy'" class="orchestration-attention">
                {{ pipelineRunStatus.checkpoint.recommendation || '图片内容需要处理；取消后修改文案并重新启动流水线。' }}
              </p>
            </template>
            <template v-else>
              <UiButton v-if="pipelineRunStatus.status === 'paused'" @click="resumePipeline">▶ 继续</UiButton>
              <UiButton v-else-if="pipelineRunStatus.status === 'running'" @click="pausePipeline">⏸ 暂停</UiButton>
              <UiButton v-if="needsCheckpoint" @click="advancePipeline">✅ 确认并继续</UiButton>
            </template>
            <UiButton variant="danger" @click="cancelPipeline">✕ 取消</UiButton>
          </div>
          <div v-if="!isOrchestratedPipeline(selectedPipeline?.name) && pipelineRunStatus && pipelineRunStatus.progress !== undefined" class="progress-inline">
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
      <div v-else>
        <div v-if="history.length === 0" class="empty-state"><p>暂无创作记录</p></div>
        <div v-else>
          <div class="history-toolbar">
            <label for="history-status-filter">状态</label>
            <select id="history-status-filter" v-model="historyFilter" class="form-select history-filter">
              <option value="all">全部</option>
              <option value="completed">已完成</option>
              <option value="failed">失败</option>
              <option value="cancelled">已取消</option>
              <option value="running">进行中</option>
            </select>
          </div>
          <div v-if="filteredHistory.length === 0" class="empty-state compact"><p>没有符合条件的记录</p></div>
          <div v-else class="history-list">
            <div v-for="(h, i) in filteredHistory" :key="h.projectId || h.id || i" class="history-item">
              <span class="history-name">{{ h.title || pipelineName(h.pipeline || h.name) }}</span>
              <span class="history-status" :class="h.status">{{ historyStatusLabel(h.status) }}</span>
              <span class="history-time">{{ formatTime(h.updatedAt || h.completedAt || h.createdAt) }}</span>
              <button v-if="h.projectId && h.recoverable !== false" class="history-open" @click="openHistory(h)">打开</button>
              <button v-if="h.projectId" class="history-delete" @click="requestProjectDeletion(h)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <UiModal
      :visible="story2videoErrorDialog.visible"
      :title="story2videoErrorDialogUiText.dialogTitle"
      size="sm"
      @close="closeStory2VideoErrorDialog"
    >
      <p class="story2video-error-dialog-message">{{ story2videoErrorDialogMessage }}</p>
      <template #footer>
        <UiButton @click="closeStory2VideoErrorDialog">{{ story2videoErrorDialogUiText.acknowledge }}</UiButton>
      </template>
    </UiModal>

    <UiModal
      :visible="story2videoProjectDeleteDialog.visible"
      :title="story2videoErrorDialogUiText.dialogTitle"
      size="sm"
      @close="closeProjectDeletionDialog"
    >
      <p class="story2video-error-dialog-message">{{ story2videoProjectDeleteDialogMessage }}</p>
      <template #footer>
        <UiButton variant="secondary" @click="closeProjectDeletionDialog">{{ story2videoErrorDialogUiText.cancel }}</UiButton>
        <UiButton variant="danger" @click="confirmProjectDeletion">{{ story2videoErrorDialogUiText.confirmDelete }}</UiButton>
      </template>
    </UiModal>

    <UiModal
      :visible="story2videoTemplateDeleteDialog.visible"
      :title="story2videoErrorDialogUiText.dialogTitle"
      size="sm"
      @close="closeTemplateDeletionDialog"
    >
      <p class="story2video-error-dialog-message">{{ story2videoTemplateDeleteDialogMessage }}</p>
      <template #footer>
        <UiButton variant="secondary" @click="closeTemplateDeletionDialog">{{ story2videoErrorDialogUiText.cancel }}</UiButton>
        <UiButton variant="danger" @click="confirmTemplateDeletion">{{ story2videoErrorDialogUiText.confirmDelete }}</UiButton>
      </template>
    </UiModal>
  </div>
</template>

<script>
import UiButton from '@/components/UiButton.vue'
import UiModal from '@/components/UiModal.vue'
import UiSelect from '@/components/UiSelect.vue'
import {
  deleteCustomTemplate,
  getAllTemplates,
  getTemplateById,
  saveCustomTemplate,
} from '@multi-publish/story2video-engine/template-library'

import {
  renderStart, renderCancel, renderGetStatus, renderInstallDeps,
  onRenderProgress, onRenderComplete, onRenderError, onRenderInstallProgress,
  pipelineList, pipelineStart, pipelinePause, pipelineResume, pipelineCancel,
  pipelineStatus, pipelineAdvance, pipelineHistory,
  pipelineStartOrchestrated, pipelineAdvanceToNextCheckpoint, pipelineGetRunContext,
  story2videoImportMedia, story2videoImportMediaPath, story2videoTranscribe, story2videoListProjects,
  story2videoDeleteProject
} from '@/api/publisher'
import { modelProviderList } from '@/api/model-providers'
import {
  getTtsVoiceCatalog,
  getTtsVoiceCapability,
  selectTtsVoice,
  clearTtsVoicePreference,
} from '@/api/tts-voice-catalog'
import {
  addTtsVoiceClone,
  chooseTtsVoiceCloneSamples,
  deleteTtsVoiceClone,
  getTtsVoiceCloneRequirements,
  listTtsVoiceClones,
} from '@/api/tts-voice-clone'
import {
  getPipelineCategory,
  getPipelineDescription,
  getPipelineName,
  getPipelineStage,
  getPipelineStatus,
} from '@/i18n/pipeline-labels'
import {
  MAX_STORY2VIDEO_TEXT_CHARACTERS,
  STORY2VIDEO_NOTIFICATION_KEYS,
  countStory2VideoTextCharacters,
  formatStory2VideoNotification,
  getStory2VideoNotificationUiText,
  resolveStory2VideoNotification,
} from '@/story2video/story2video-notifications'

const HISTORY_LOAD_TIMEOUT_MS = 5000
const STORY2VIDEO_OUTPUT_ASPECT_RATIOS = Object.freeze({
  '720x1280': '9:16',
  '1920x1080': '16:9',
  '3840x2160': '16:9',
  '1080x1920': '9:16',
  '1080x1440': '3:4',
})

// 已实现真实执行引擎的流水线（与 pipeline-engine 注册表 available 字段保持一致；此处为前端兜底）
const IMPLEMENTED_PIPELINES = ['story2video-compose', 'animated-explainer', 'talking-head', 'cinematic', 'clip-factory', 'framework-smoke', 'documentary-montage', 'localization-dub', 'animation', 'avatar-spokesperson', 'character-animation', 'hybrid']

function prioritizeStory2VideoPipeline(pipelines) {
  const values = Array.isArray(pipelines) ? pipelines : []
  return [
    ...values.filter(pipeline => pipeline?.name === 'story2video-compose'),
    ...values.filter(pipeline => pipeline?.name !== 'story2video-compose'),
  ]
}

function getStory2VideoOutputAspectRatio(resolution) {
  return STORY2VIDEO_OUTPUT_ASPECT_RATIOS[resolution] || '9:16'
}

function settleHistoryRequest (request) {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(Object.assign(new Error('历史记录加载超时'), { code: 'HISTORY_LOAD_TIMEOUT' })), HISTORY_LOAD_TIMEOUT_MS)
  })
  return Promise.race([Promise.resolve().then(request), timeout]).finally(() => clearTimeout(timeoutId))
}

const STYLES = [
  { value: 'clean-professional', label: '简洁专业', desc: '干净排版，适合商业内容' },
  { value: 'flat-motion-graphics', label: '扁平动效', desc: '现代扁平化动画风格' },
  { value: 'anime-ghibli', label: '吉卜力动漫', desc: '温暖的手绘动漫质感' },
  { value: 'minimalist-diagram', label: '极简图表', desc: '数据可视化优先' },
  { value: 'cinematic-dark', label: '电影暗调', desc: '深色电影感渲染' },
]

const STORY2VIDEO_STAGE_NAMES = Object.freeze([
  'split',
  'domain_enrich',
  'optimize',
  'generate_assets',
  'compose',
  'publish',
])

// 自动流水线的真实阶段名（列表接口不返回 stages，按流水线名映射，避免回退到 s2v 阶段名）
const AUTO_PIPELINE_STAGES = Object.freeze({
  'story2video-compose': STORY2VIDEO_STAGE_NAMES,
  'animated-explainer': ['research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish'],
  'framework-smoke': ['verify', 'report'],
  'documentary-montage': ['research', 'ingest', 'edit', 'narrate', 'render'],
  'localization-dub': ['transcribe', 'translate', 'tts', 'sync'],
  'animation': ['concept', 'storyboard', 'animate', 'render'],
  'avatar-spokesperson': ['avatar_select', 'script', 'generate', 'render'],
  'character-animation': ['character_design', 'rigging', 'animate', 'render'],
  'hybrid': ['plan', 'generate', 'merge', 'render'],
})

const S2V_PLATFORMS = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'bilibili', label: 'B站' },
  { value: 'wechat', label: '微信视频号' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
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
  components: { UiButton, UiModal, UiSelect },
  data() {
    return {
      // 视图
      view: 'pipelines',
      // 流水线
      pipelines: [], pipelineLoading: true, pipelineError: null,
      selectedPipeline: null,
      pipelineRunStatus: null, needsCheckpoint: false, pollTimer: null, orchestrationStages: [],
      // 流水线输入
      inputMode: 'text', pipelineText: '', pipelineImages: [], pipelineAudio: [], pipelineVideo: null,
      // 配置
      selectedStyle: 'clean-professional',
      llmConfig: { temperature: 0.7 },
      budgetConfig: { mode: 'warn', totalUsd: 10 },
      checkpointPolicy: 'guided',
      outputConfig: { resolution: '1920x1080', fps: 30, format: 'mp4' },
      s2vOutputConfig: { resolution: '720x1280', fps: 30, format: 'mp4' },
      // 快速渲染
      quickMode: 'text', quickText: '', quickImages: [],
      quickProfile: 'youtube-landscape', quickTheme: 'clean-professional',
      quickRendering: false, quickProgress: 0, quickStage: '', quickResult: null, quickError: null,
      aiLoading: false,
      // Remotion 状态
      renderStatus: null, installing: false, installLog: '',
      // S2V 编排模式（story2video-compose）
      s2vConfig: {
        contentType: 'general', imageStyle: 'cinematic',
        imageProvider: '', imageModel: '',
        voiceId: '', voiceProvider: '', voiceModel: '',
        voiceSpeed: 1, voicePitch: 0, voiceVolume: 1,
        concurrency: 3, templateId: '', imageEffect: 'zoom-in',
        perImageDuration: 6,
        splitLanguage: 'auto', splitMode: 'balanced', splitMaxSentenceLength: 200, splitTargetSeconds: 6,
        splitBaseWordsPerSecond: 3.3, splitSpeechRate: 1, splitMinWords: 10, splitMaxWords: 50,
        splitEnforceSentenceBoundary: true, splitOverflowToNext: true,
        splitSubtitleMinChars: 8, splitSubtitleMaxChars: 15, splitSubtitleTiming: 'proportional',
        promptStyle: 'realistic', creativeLevel: 5, negativePrompt: '',
        transition: 'fade', subtitleEnabled: false,
        subtitleSize: 'size3', subtitleStyleName: 'style1',
        subtitleStyle: { size: 'md', style: 'style1', color: 'white' },
        bgmPath: '', bgmVolume: 5, watermark: false, watermarkText: '',
        watermarkConfig: { enabled: false, position: 'bottom-right', fontSize: 24, opacity: 0.6, color: 'white' },
        autoAdvance: true, platforms: [], publishEnabled: false, title: '', tagsText: '', publishContent: '', coverUrl: '',
      },
      orchestrationRunId: null, orchestrationContext: null, orchestrationResultPath: null, orchestrationError: '',
      story2videoErrorDialog: { visible: false, messageKey: '', messageParams: {} },
      story2videoProjectDeleteDialog: { visible: false, projectId: null },
      story2videoTemplateDeleteDialog: { visible: false, templateId: null },
      MAX_STORY2VIDEO_TEXT_CHARACTERS,
      s2vImageProviders: [], s2vVoiceProviders: [],
      s2vVoiceCatalog: [], s2vVoiceCatalogLoading: false, s2vVoiceCatalogError: '', s2vVoiceCapability: null,
      s2vVoiceProviderRequestId: 0, s2vVoiceRequestId: 0, s2vVoiceSelectionRequestId: 0, s2vVoiceCloneRequestId: 0, s2vPersistedVoiceId: '',
      s2vVoiceCloneRequirements: null, s2vVoiceClones: [],
      s2vVoiceCloneSelection: null, s2vVoiceCloneName: '', s2vVoiceCloneConsent: false, s2vVoiceCloneLoading: false, s2vVoiceCloneError: '',
      s2vTemplateLibrary: [], s2vTemplateCategory: 'all', s2vCustomTemplateName: '',
      s2vOpenSections: { basic: true, appearance: false, voice: false, advanced: false, publish: false },
      // 历史
      history: [], historyLoading: false, historyFilter: 'all', historyRequestId: 0,
      // 清理
      cleanups: [],
      quickModes: [
        { value: 'text', label: '文案生成' },
        { value: 'gallery', label: '图片轮播' },
      ],
    }
  },
  computed: {
    styles() { return STYLES },
    s2vTemplates() {
      const templates = this.s2vTemplateCategory === 'all'
        ? this.s2vTemplateLibrary
        : this.s2vTemplateLibrary.filter(template => template.category === this.s2vTemplateCategory)
      return [
        { value: '', label: '自定义参数' },
        ...templates.map(template => ({ value: template.id, label: template.name })),
      ]
    },
    selectedS2VTemplate() {
      return this.s2vTemplateLibrary.find(template => template.id === this.s2vConfig.templateId) || null
    },
    filteredHistory() {
      if (this.historyFilter === 'all') return this.history
      return this.history.filter(item => item.status === this.historyFilter)
    },
    activeOutputConfig() {
      return this.isOrchestratedPipeline(this.selectedPipeline?.name) ? this.s2vOutputConfig : this.outputConfig
    },
    s2vImageProviderOptions() { return this.s2vImageProviders },
    s2vVoiceProviderOptions() { return [{ id: '', name: '自动 Edge TTS' }, ...this.s2vVoiceProviders] },
    s2vVoiceModelOptions() {
      const provider = this.s2vVoiceProviders.find(item => item?.id === this.s2vConfig.voiceProvider)
      const models = Array.isArray(provider?.models) ? provider.models : []
      return models.filter(model => typeof model === 'string' && model)
    },
    s2vVoiceOptions() {
      const voices = [
        ...(Array.isArray(this.s2vVoiceCatalog) ? this.s2vVoiceCatalog : []),
        ...(Array.isArray(this.s2vVoiceClones) ? this.s2vVoiceClones : []),
      ]
      return [...new Map(voices.map(voice => [voice.id, voice])).values()]
    },
    story2videoConfigurationTitle() {
      return this.translateWithLocaleFallback(
        'create.story2video.configurationTitle',
        '图片轮播配置',
        'Image Carousel Configuration'
      )
    },
    canAddS2VVoiceClone() {
      return Boolean(
        this.s2vVoiceCloneSelection?.selectionId
          && String(this.s2vVoiceCloneName || '').trim()
          && this.s2vVoiceCloneConsent === true
          && this.s2vVoiceCloneLoading !== true
      )
    },
    story2videoImageStyleHint() {
      return this.translateWithLocaleFallback(
        'create.story2video.imageStyleHint',
        '控制每张生成图片的视觉外观。',
        'Controls the visual appearance of generated images.'
      )
    },
    story2videoPromptStyleHint() {
      return this.translateWithLocaleFallback(
        'create.story2video.promptStyleHint',
        '仅控制分镜图片提示词的写法与组织方式，不替代图片风格。',
        'Controls how image prompts are written and organized; it does not replace image style.'
      )
    },
    s2vPlatforms() { return S2V_PLATFORMS },
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
      if (!this.pipelineAvailable(this.selectedPipeline.name)) return false
      if (this.isOrchestratedPipeline(this.selectedPipeline.name)) {
        return this.inputMode === 'text' && this.pipelineText.trim().length > 0
      }
      if (this.inputMode === 'text') return this.pipelineText.trim().length > 0
      if (this.inputMode === 'images') return this.pipelineImages.length > 0
      if (this.inputMode === 'audio') return this.pipelineAudio.length > 0
      if (this.inputMode === 'video') {
        return !this.isOrchestratedPipeline(this.selectedPipeline.name) && !!this.pipelineVideo
      }
      return true
    },
    story2videoTextCharacterCount() {
      return countStory2VideoTextCharacters(this.pipelineText)
    },
    story2videoErrorDialogMessage() {
      return formatStory2VideoNotification({ messageKey: this.story2videoErrorDialog.messageKey, messageParams: this.story2videoErrorDialog.messageParams }).message
    },
    story2videoErrorDialogUiText() {
      return getStory2VideoNotificationUiText()
    },
    story2videoProjectDeleteDialogMessage() {
      return formatStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_CONFIRM }).message
    },
    story2videoTemplateDeleteDialogMessage() {
      return formatStory2VideoNotification({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEMPLATE_DELETE_CONFIRM }).message
    },
    canQuickRender() {
      if (this.quickRendering) return false
      if (this.quickMode === 'text') return this.quickText.trim().length > 0
      if (this.quickMode === 'gallery') return this.quickImages.length > 0
      return false
    },
  },
  methods: {
    translateWithLocaleFallback(key, zhFallback, enFallback) {
      const translated = typeof this.$t === 'function' ? this.$t(key) : key
      if (typeof translated === 'string' && translated !== key) return translated
      return this.$i18n?.locale === 'en' ? enFallback : zhFallback
    },
    pipelineName(id) { return getPipelineName((key) => this.$t?.(key), id) },
    pipelineDescription(id) { return getPipelineDescription((key) => this.$t?.(key), id) },
    pipelineCategory(id) { return getPipelineCategory((key) => this.$t?.(key), id) },
    pipelineStage(id) { return getPipelineStage((key) => this.$t?.(key), id) },
    pipelineStatus(id) { return getPipelineStatus((key) => this.$t?.(key), id) },
    humanName(name) { if (!name) return ''; return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) },
    s2vSectionLabel(section) {
      const key = `create.story2video.sections.${section}`
      const fallback = { basic: '基础', appearance: '外观', voice: '声音', advanced: '高级', publish: '发布' }[section] || section
      const english = { basic: 'Basics', appearance: 'Appearance', voice: 'Voice', advanced: 'Advanced', publish: 'Publish' }[section] || section
      return this.translateWithLocaleFallback(key, fallback, english)
    },
    s2vSubgroupLabel(subgroup) {
      const key = `create.story2video.subgroups.${subgroup}`
      const fallback = { splitTiming: '分句与时长', templateOutput: '模板与输出' }[subgroup] || subgroup
      const english = { splitTiming: 'Split & Timing', templateOutput: 'Template & Output' }[subgroup] || subgroup
      return this.translateWithLocaleFallback(key, fallback, english)
    },
    s2vSectionSummary(section) {
      const summaries = {
        basic: `${this.s2vConfig.contentType === 'history' ? '历史内容' : '通用内容'} · ${this.s2vConfig.imageProvider || '默认图片模型'}`,
        appearance: `${this.s2vConfig.imageStyle || '电影感'} · ${this.s2vConfig.imageEffect || '无效果'}`,
        voice: `${this.s2vConfig.voiceProvider || '自动 Edge TTS'}${this.s2vConfig.voiceModel ? ` · ${this.s2vConfig.voiceModel}` : ''}${this.s2vConfig.voiceId ? ' · 已选音色' : ''}`,
        advanced: `${this.s2vConfig.splitLanguage === 'auto' ? '自动识别' : this.s2vConfig.splitLanguage} · ${this.s2vConfig.splitMode || '均衡'}`,
        publish: this.s2vConfig.platforms?.length ? `已选 ${this.s2vConfig.platforms.length} 个平台` : '不发布',
      }
      return summaries[section] || ''
    },
    setS2VSectionOpen(section, event) {
      if (!Object.prototype.hasOwnProperty.call(this.s2vOpenSections, section)) return
      this.s2vOpenSections[section] = Boolean(event?.target?.open)
    },
    categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat },
    costLabel(cost) { return COST_LABELS[cost] || cost },
    getStability(name) { return STABILITY_MAP[name] || 'experimental' },
    formatTime(iso) { if (!iso) return ''; return new Date(iso).toLocaleString('zh-CN') },
    historyStatusLabel(status) {
      return { completed: '已完成', failed: '失败', cancelled: '已取消', running: '进行中', pending: '等待中' }[status] || status || '未知'
    },

    // 流水线操作
    async loadPipelines() {
      this.pipelineLoading = true; this.pipelineError = null
      try {
        const res = await pipelineList()
        if (res?.code === 0) this.pipelines = prioritizeStory2VideoPipeline(res.data)
        else this.pipelineError = res?.message || '加载失败'
      } catch (e) { this.pipelineError = e.message }
      finally { this.pipelineLoading = false }
    },
    selectPipeline(p) {
      this.stopPipelinePolling()
      this.selectedPipeline = p
      this.pipelineRunStatus = null
      this.orchestrationStages = (this.isAutoPipeline(p?.name) || this.isMediaAutoPipeline(p?.name)) ? this.getDefaultPipelineStages(p.name) : []
      this.orchestrationRunId = null
      this.orchestrationContext = null
      this.orchestrationResultPath = null
      this.orchestrationError = ''
      this.closeStory2VideoErrorDialog()
      if (this.isOrchestratedPipeline(p?.name) && this.inputMode !== 'text') this.inputMode = 'text'
    },
    isOrchestratedPipeline(name) { return name === 'story2video-compose' },
    isAutoPipeline(name) { return ['story2video-compose', 'animated-explainer', 'framework-smoke', 'documentary-montage', 'animation', 'avatar-spokesperson', 'character-animation', 'hybrid'].includes(name) },
    isMediaAutoPipeline(name) { return ['clip-factory', 'cinematic', 'talking-head', 'localization-dub'].includes(name) },
    pipelineAvailable(name) {
      const selected = this.selectedPipeline
      if (selected && selected.name === name && typeof selected.available === 'boolean') return selected.available
      const pipeline = (this.pipelines || []).find(item => item.name === name)
      if (pipeline && typeof pipeline.available === 'boolean') return pipeline.available
      return IMPLEMENTED_PIPELINES.includes(name)
    },
    availabilityLabel(available) {
      return this.translateWithLocaleFallback(
        available ? 'pipelines.availability.ready' : 'pipelines.availability.dev',
        available ? '可用' : '开发中',
        available ? 'Available' : 'In Development'
      )
    },
    availabilityHint(available) {
      return this.translateWithLocaleFallback(
        available ? 'pipelines.availability.readyHint' : 'pipelines.availability.notImplementedHint',
        available ? '该流水线可生成视频' : '该流水线尚未实现执行引擎，暂不能生成视频',
        available ? 'This pipeline can generate videos' : 'This pipeline has no execution engine yet.'
      )
    },
    getDefaultPipelineStages(name) {
      const pipeline = (this.pipelines || []).find(item => item.name === name)
      const stages = pipeline?.stages || AUTO_PIPELINE_STAGES[name] || STORY2VIDEO_STAGE_NAMES
      return stages.map(stageName => ({ name: stageName, status: 'pending' }))
    },
    getDefaultStory2VideoStages() {
      return STORY2VIDEO_STAGE_NAMES.map(name => ({ name, status: 'pending' }))
    },
    async startPipeline() {
      if (!this.pipelineAvailable(this.selectedPipeline?.name)) {
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PIPELINE_NOT_IMPLEMENTED })
        return
      }
      if (this.isAutoPipeline(this.selectedPipeline.name) || this.isMediaAutoPipeline(this.selectedPipeline.name)) {
        return this.startOrchestratedPipeline()
      }
      const params = {
        text: this.pipelineText, style: this.selectedStyle,
        llm: this.llmConfig, budget: this.budgetConfig,
        checkpoint: this.checkpointPolicy, output: this.outputConfig,
        inputMode: this.inputMode,
        images: this.pipelineImages.map(i => i.preview),
        audio: this.pipelineAudio.map(a => ({ name: a.name, path: a.path })),
        video: this.pipelineVideo?.path || null,
      }
      const res = await pipelineStart(this.selectedPipeline.name, params)
      if (res?.code === 0) {
        await this.updatePipelineStatus()
        this.pollTimer = setInterval(() => this.updatePipelineStatus(), 3000)
      } else { alert(res?.message || '启动失败') }
    },
    async startExplainerPipeline() {
      try {
        const text = this.pipelineText.trim()
        if (!text) {
          this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED })
          return
        }
        const output = this.cloneForIpc(this.activeOutputConfig)
        const params = {
          text,
          inputMode: 'text',
          checkpointPolicy: 'none',
          autoAdvance: true,
          background: true,
          style: this.selectedStyle,
          resolution: output.resolution,
          fps: output.fps,
          format: output.format,
        }
        const res = await pipelineStartOrchestrated(this.selectedPipeline.name, this.cloneForIpc(params))
        const outcome = res?.data
        if (res?.code === 0 && outcome?.runId && outcome.success !== false) {
          this.orchestrationRunId = outcome.runId
          if (this.applyOrchestrationOutcome(outcome)) return
          await this.updateOrchestrationStatus()
          if (this.orchestrationRunId && !this.pollTimer) {
            this.pollTimer = setInterval(() => this.updateOrchestrationStatus(), 3000)
          }
        } else { this.setOrchestrationError({ code: res?.code, errorCode: outcome?.errorCode, errorParams: outcome?.errorParams, error: res?.message || outcome?.error }) }
      } catch (_) {
        this.setOrchestrationError({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED, messageParams: { reason: '' } })
      }
    },
    async startMediaPipeline() {
      try {
        const videoPath = this.pipelineVideo?.path
        if (!videoPath) {
          this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED })
          return
        }
        const params = {
          video: videoPath,
          text: this.pipelineText.trim(),
          inputMode: 'video',
          checkpointPolicy: 'none',
          autoAdvance: true,
          background: true,
        }
        const res = await pipelineStartOrchestrated(this.selectedPipeline.name, this.cloneForIpc(params))
        const outcome = res?.data
        if (res?.code === 0 && outcome?.runId && outcome.success !== false) {
          this.orchestrationRunId = outcome.runId
          if (this.applyOrchestrationOutcome(outcome)) return
          await this.updateOrchestrationStatus()
          if (this.orchestrationRunId && !this.pollTimer) {
            this.pollTimer = setInterval(() => this.updateOrchestrationStatus(), 3000)
          }
        } else { this.setOrchestrationError({ code: res?.code, errorCode: outcome?.errorCode, errorParams: outcome?.errorParams, error: res?.message || outcome?.error }) }
      } catch (_) {
        this.setOrchestrationError({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED, messageParams: { reason: '' } })
      }
    },
    async startOrchestratedPipeline() {
      if (this.selectedPipeline.name !== 'story2video-compose' && this.isAutoPipeline(this.selectedPipeline.name)) {
        return this.startExplainerPipeline()
      }
      if (this.isMediaAutoPipeline(this.selectedPipeline.name)) {
        return this.startMediaPipeline()
      }
      try {
        if (this.inputMode !== 'text') {
          this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_INPUT_ONLY })
          return
        }
        const text = this.pipelineText.trim()
        if (!text) {
          this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_REQUIRED })
          return
        }
        if (countStory2VideoTextCharacters(text) > MAX_STORY2VIDEO_TEXT_CHARACTERS) {
          this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG, messageParams: { max: MAX_STORY2VIDEO_TEXT_CHARACTERS } })
          return
        }
        this.orchestrationError = ''
        const output = this.cloneForIpc(this.s2vOutputConfig)
        const config = this.cloneForIpc(this.s2vConfig)
        const tags = String(config.tagsText || '')
          .split(',')
          .map(tag => tag.trim())
          .filter(Boolean)
        const story2videoTextConfig = {
          version: 1,
          mode: 'text',
          prompt: text,
          size: output.resolution,
          contentType: config.contentType,
          split: {
            language: config.splitLanguage,
            mode: config.splitMode,
            maxSentenceLength: config.splitMaxSentenceLength,
            targetSeconds: config.splitTargetSeconds,
            baseWordsPerSecond: config.splitBaseWordsPerSecond,
            speechRate: config.splitSpeechRate,
            minWords: config.splitMinWords,
            maxWords: config.splitMaxWords,
            enforceSentenceBoundary: config.splitEnforceSentenceBoundary,
            overflowToNext: config.splitOverflowToNext,
            subtitleMinChars: config.splitSubtitleMinChars,
            subtitleMaxChars: config.splitSubtitleMaxChars,
            subtitleTiming: config.splitSubtitleTiming,
          },
          optimize: {
            style: config.promptStyle,
            creativeLevel: config.creativeLevel,
            negativePrompt: config.negativePrompt,
          },
          image: {
            provider: config.imageProvider || '',
            model: config.imageModel || '',
            style: config.imageStyle,
            effect: config.imageEffect,
            aspectRatio: getStory2VideoOutputAspectRatio(output.resolution),
          },
          voice: {
            provider: config.voiceProvider || '',
            model: config.voiceModel || '',
            id: config.voiceId,
            speed: config.voiceSpeed,
            volume: config.voiceVolume,
            pitch: config.voicePitch,
          },
          subtitle: {
            enabled: config.subtitleEnabled,
            size: config.subtitleSize,
            style: config.subtitleStyleName,
            color: config.subtitleStyle?.color || 'white',
          },
          bgm: { enabled: Boolean(config.bgmPath), path: config.bgmPath || '', volume: config.bgmVolume },
          perImageDuration: config.perImageDuration,
          transition: config.transition,
          templateId: config.templateId || '',
          concurrency: config.concurrency,
          watermark: {
            ...config.watermarkConfig,
            enabled: Boolean(config.watermarkText),
            text: config.watermarkText || '',
          },
          output: { fps: output.fps, format: output.format },
          publish: {
            enabled: config.publishEnabled === true || (Array.isArray(config.platforms) && config.platforms.length > 0),
            platforms: Array.isArray(config.platforms) ? config.platforms : [],
            title: config.title || '',
            content: config.publishContent || text,
            tags,
            coverUrl: config.coverUrl || '',
          },
        }
        const params = {
          text,
          inputMode: 'text',
          checkpointPolicy: 'none',
          autoAdvance: true,
          background: true,
          story2videoTextConfig,
        }
        const res = await pipelineStartOrchestrated(this.selectedPipeline.name, this.cloneForIpc(params))
        const outcome = res?.data
        if (res?.code === 0 && outcome?.runId && outcome.success !== false) {
          this.orchestrationRunId = outcome.runId
          if (this.applyOrchestrationOutcome(outcome)) return
          await this.updateOrchestrationStatus()
          if (this.orchestrationRunId && !this.pollTimer) {
            this.pollTimer = setInterval(() => this.updateOrchestrationStatus(), 3000)
          }
        } else { this.setOrchestrationError({ code: res?.code, errorCode: outcome?.errorCode, errorParams: outcome?.errorParams, error: res?.message || outcome?.error }) }
      } catch (_) {
        this.setOrchestrationError({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.ORCHESTRATION_FAILED, messageParams: { reason: '' } })
      }
    },
    cloneForIpc(value) {
      try { return JSON.parse(JSON.stringify(value)) } catch { return {} }
    },
    applyS2VTemplate() {
      const template = getTemplateById(this.s2vConfig.templateId, window.localStorage)
      if (!template) return
      this.s2vConfig.imageEffect = template.imageEffect
      this.s2vConfig.transition = template.transitionEffect
      this.s2vConfig.perImageDuration = Number(template.perImageDuration) || 6
      this.s2vConfig.subtitleEnabled = template.subtitleStyle?.enabled !== false
      this.s2vConfig.subtitleSize = template.subtitleStyle?.size || 'size3'
      this.s2vConfig.subtitleStyleName = template.subtitleStyle?.style || this.s2vConfig.subtitleStyleName
      this.s2vConfig.subtitleStyle = {
        ...this.s2vConfig.subtitleStyle,
        size: template.subtitleStyle?.size || 'md',
        style: template.subtitleStyle?.style || this.s2vConfig.subtitleStyle.style,
        color: template.subtitleStyle?.color || this.s2vConfig.subtitleStyle.color,
      }
      if (template.bgm && Number.isFinite(Number(template.bgm.volume))) {
        this.s2vConfig.bgmVolume = Math.min(10, Math.max(0, Number(template.bgm.volume)))
      }
      if (template.size) this.s2vOutputConfig.resolution = template.size
    },
    refreshS2VTemplates() {
      this.s2vTemplateLibrary = getAllTemplates('all', window.localStorage)
    },
    getS2VVoiceContext() {
      const providerId = typeof this.s2vConfig.voiceProvider === 'string' ? this.s2vConfig.voiceProvider.trim() : ''
      const model = typeof this.s2vConfig.voiceModel === 'string' ? this.s2vConfig.voiceModel.trim() : ''
      return providerId && model ? { providerId, model } : null
    },
    getS2VVoiceProvider(providerId = this.s2vConfig.voiceProvider) {
      return this.s2vVoiceProviders.find(provider => provider?.id === providerId) || null
    },
    getS2VDefaultVoiceModel(providerId = this.s2vConfig.voiceProvider) {
      const provider = this.getS2VVoiceProvider(providerId)
      const models = Array.isArray(provider?.models)
        ? provider.models.filter(model => typeof model === 'string' && model)
        : []
      const configuredDefault = typeof provider?.defaultModel === 'string' ? provider.defaultModel : ''
      return models.includes(configuredDefault) ? configuredDefault : (models[0] || '')
    },
    isCurrentS2VVoiceRequest(requestId, context) {
      return requestId === this.s2vVoiceRequestId
        && this.s2vConfig.voiceProvider === context.providerId
        && this.s2vConfig.voiceModel === context.model
    },
    isCurrentS2VVoiceCloneRequest(requestId, context) {
      return requestId === this.s2vVoiceCloneRequestId
        && this.s2vConfig.voiceProvider === context.providerId
        && this.s2vConfig.voiceModel === context.model
    },
    isCurrentS2VVoiceSelectionRequest(requestId, context, voiceId) {
      return requestId === this.s2vVoiceSelectionRequestId
        && this.s2vConfig.voiceProvider === context.providerId
        && this.s2vConfig.voiceModel === context.model
        && this.s2vConfig.voiceId === voiceId
    },
    toS2VVoiceOption(voice) {
      const id = typeof voice?.id === 'string' ? voice.id.trim() : ''
      const name = typeof voice?.name === 'string' ? voice.name.trim() : ''
      return id && name ? { id, name } : null
    },
    toS2VVoiceCloneRequirements(requirements) {
      if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return null
      const toFiniteNumber = (value) => Number.isFinite(value) && value >= 0 ? value : null
      return {
        allowedExtensions: Array.isArray(requirements.allowedExtensions)
          ? requirements.allowedExtensions.filter(extension => typeof extension === 'string' && extension)
          : [],
        maxSampleCount: toFiniteNumber(requirements.maxSampleCount),
        maxSampleBytes: toFiniteNumber(requirements.maxSampleBytes),
        maxTotalBytes: toFiniteNumber(requirements.maxTotalBytes),
        maxSampleDurationSeconds: toFiniteNumber(requirements.maxSampleDurationSeconds),
        maxTotalDurationSeconds: toFiniteNumber(requirements.maxTotalDurationSeconds),
      }
    },
    resetS2VVoiceData() {
      this.s2vVoiceCatalog = []
      this.s2vVoiceCatalogLoading = false
      this.s2vVoiceCatalogError = ''
      this.s2vVoiceCapability = null
      this.s2vPersistedVoiceId = ''
      this.s2vVoiceCloneRequirements = null
      this.s2vVoiceClones = []
      this.s2vVoiceCloneSelection = null
      this.s2vVoiceCloneName = ''
      this.s2vVoiceCloneConsent = false
      this.s2vVoiceCloneLoading = false
      this.s2vVoiceCloneError = ''
    },
    async loadS2VVoiceData(options = {}) {
      const context = this.getS2VVoiceContext()
      const requestId = ++this.s2vVoiceRequestId
      this.s2vVoiceSelectionRequestId += 1
      this.s2vVoiceCloneRequestId += 1
      this.resetS2VVoiceData()
      if (!context) return

      this.s2vVoiceCatalogLoading = true
      const catalogInput = this.cloneForIpc({ ...context, refresh: options.refresh === true })
      const capabilityInput = this.cloneForIpc(context)
      const [catalogResult, capabilityResult] = await Promise.allSettled([
        getTtsVoiceCatalog(catalogInput),
        getTtsVoiceCapability(capabilityInput),
      ])
      if (!this.isCurrentS2VVoiceRequest(requestId, context)) return

      const catalogResponse = catalogResult.status === 'fulfilled' ? catalogResult.value : null
      const capabilityResponse = capabilityResult.status === 'fulfilled' ? capabilityResult.value : null
      const catalogData = catalogResponse?.code === 0 && catalogResponse.data && typeof catalogResponse.data === 'object'
        ? catalogResponse.data
        : null
      const capabilityData = capabilityResponse?.code === 0 && capabilityResponse.data && typeof capabilityResponse.data === 'object'
        ? capabilityResponse.data
        : null
      this.s2vVoiceCatalog = Array.isArray(catalogData?.voices)
        ? catalogData.voices.map(voice => this.toS2VVoiceOption(voice)).filter(Boolean)
        : []
      this.s2vVoiceCapability = capabilityData
        ? {
            type: capabilityData.type,
            clone: { enabled: capabilityData.clone?.enabled === true },
          }
        : null
      this.s2vVoiceCatalogLoading = false
      if (!catalogData) {
        this.s2vVoiceCatalogError = catalogResponse?.message || '无法加载当前模型的音色目录。'
      }

      const cloneEnabled = this.s2vVoiceCapability?.type === 'user_clone'
        && this.s2vVoiceCapability?.clone?.enabled === true
      if (cloneEnabled) {
        const cloneRequestId = ++this.s2vVoiceCloneRequestId
        this.s2vVoiceCloneLoading = true
        const [requirementsResult, clonesResult] = await Promise.allSettled([
          getTtsVoiceCloneRequirements(this.cloneForIpc(context)),
          listTtsVoiceClones(this.cloneForIpc(context)),
        ])
        if (!this.isCurrentS2VVoiceRequest(requestId, context)
          || !this.isCurrentS2VVoiceCloneRequest(cloneRequestId, context)) return

        const requirementsResponse = requirementsResult.status === 'fulfilled' ? requirementsResult.value : null
        const clonesResponse = clonesResult.status === 'fulfilled' ? clonesResult.value : null
        this.s2vVoiceCloneRequirements = requirementsResponse?.code === 0
          ? this.toS2VVoiceCloneRequirements(requirementsResponse.data)
          : null
        this.s2vVoiceClones = clonesResponse?.code === 0 && Array.isArray(clonesResponse.data?.voices)
          ? clonesResponse.data.voices.map(voice => this.toS2VVoiceOption(voice)).filter(Boolean)
          : []
        this.s2vVoiceCloneError = requirementsResponse?.code === 0 && clonesResponse?.code === 0
          ? ''
          : (requirementsResponse?.message || clonesResponse?.message || '无法加载克隆音色信息。')
        this.s2vVoiceCloneLoading = false
      }

      if (!this.isCurrentS2VVoiceRequest(requestId, context)) return
      const selectedVoiceId = typeof catalogData?.selectedVoiceId === 'string' ? catalogData.selectedVoiceId : ''
      const configuredVoiceId = typeof this.s2vConfig.voiceId === 'string' ? this.s2vConfig.voiceId : ''
      const availableVoiceIds = new Set(this.s2vVoiceOptions.map(voice => voice.id))
      if (selectedVoiceId && availableVoiceIds.has(selectedVoiceId)) {
        this.s2vConfig.voiceId = selectedVoiceId
        this.s2vPersistedVoiceId = selectedVoiceId
      } else if (configuredVoiceId && availableVoiceIds.has(configuredVoiceId)) {
        this.s2vPersistedVoiceId = configuredVoiceId
      } else {
        this.s2vConfig.voiceId = ''
      }
    },
    async loadS2VProviders() {
      const providerRequestId = ++this.s2vVoiceProviderRequestId
      const [imageResult, voiceResult] = await Promise.allSettled([
        modelProviderList('image'),
        modelProviderList('tts'),
      ])
      if (providerRequestId !== this.s2vVoiceProviderRequestId) return

      const enabledProviders = (result) => result.status === 'fulfilled' && result.value?.code === 0 && Array.isArray(result.value.data)
        ? result.value.data.filter(provider => provider?.enabled === true && provider.id && provider.name)
        : []
      this.s2vImageProviders = enabledProviders(imageResult)
      this.s2vVoiceProviders = enabledProviders(voiceResult)
      if (!this.s2vConfig.imageProvider && this.s2vImageProviders[0]) this.s2vConfig.imageProvider = this.s2vImageProviders[0].id

      const configuredProvider = this.getS2VVoiceProvider()
      const nextProviderId = configuredProvider?.id || this.s2vVoiceProviders[0]?.id || ''
      const nextModel = nextProviderId
        ? (this.s2vVoiceModelOptions.includes(this.s2vConfig.voiceModel)
          ? this.s2vConfig.voiceModel
          : this.getS2VDefaultVoiceModel(nextProviderId))
        : ''
      const contextChanged = nextProviderId !== this.s2vConfig.voiceProvider || nextModel !== this.s2vConfig.voiceModel
      this.s2vConfig.voiceProvider = nextProviderId
      this.s2vConfig.voiceModel = nextModel
      if (contextChanged) this.s2vConfig.voiceId = ''
      await this.loadS2VVoiceData()
    },
    async handleS2VVoiceProviderChange() {
      const nextProviderId = this.getS2VVoiceProvider()?.id || ''
      this.s2vConfig.voiceProvider = nextProviderId
      this.s2vConfig.voiceModel = nextProviderId ? this.getS2VDefaultVoiceModel(nextProviderId) : ''
      this.s2vConfig.voiceId = ''
      await this.loadS2VVoiceData()
    },
    async handleS2VVoiceModelChange() {
      const nextModel = this.s2vVoiceModelOptions.includes(this.s2vConfig.voiceModel)
        ? this.s2vConfig.voiceModel
        : this.getS2VDefaultVoiceModel()
      this.s2vConfig.voiceModel = nextModel
      this.s2vConfig.voiceId = ''
      await this.loadS2VVoiceData()
    },
    async handleS2VVoiceSelection() {
      await this.selectS2VVoice(this.s2vConfig.voiceId)
    },
    async selectS2VVoice(voiceId = this.s2vConfig.voiceId) {
      const context = this.getS2VVoiceContext()
      const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : ''
      if (!context) return false
      if (!normalizedVoiceId) {
        const requestId = ++this.s2vVoiceSelectionRequestId
        const result = await clearTtsVoicePreference(this.cloneForIpc(context))
        if (!this.isCurrentS2VVoiceSelectionRequest(requestId, context, this.s2vConfig.voiceId)) return false
        if (result?.code !== 0) {
          this.s2vVoiceCatalogError = result?.message || '音色默认值恢复失败。'
          return false
        }
        const selectedVoiceId = typeof result.data?.selectedVoiceId === 'string' ? result.data.selectedVoiceId : ''
        this.s2vConfig.voiceId = selectedVoiceId
        this.s2vPersistedVoiceId = selectedVoiceId
        this.s2vVoiceCatalogError = ''
        return true
      }
      if (!this.s2vVoiceOptions.some(voice => voice.id === normalizedVoiceId)) {
        this.s2vVoiceCatalogError = '所选音色不在当前目录中。'
        return false
      }

      const requestId = ++this.s2vVoiceSelectionRequestId
      const result = await selectTtsVoice(this.cloneForIpc({ ...context, voiceId: normalizedVoiceId }))
      if (!this.isCurrentS2VVoiceSelectionRequest(requestId, context, normalizedVoiceId)) return false
      if (result?.code !== 0) {
        this.s2vVoiceCatalogError = result?.message || '音色选择保存失败。'
        return false
      }
      this.s2vPersistedVoiceId = typeof result.data?.selectedVoiceId === 'string'
        ? result.data.selectedVoiceId
        : normalizedVoiceId
      this.s2vVoiceCatalogError = ''
      return true
    },
    async chooseS2VVoiceCloneSamples() {
      const context = this.getS2VVoiceContext()
      const cloneEnabled = this.s2vVoiceCapability?.type === 'user_clone'
        && this.s2vVoiceCapability?.clone?.enabled === true
      if (!context || !cloneEnabled) return

      const requestId = ++this.s2vVoiceCloneRequestId
      this.s2vVoiceCloneLoading = true
      this.s2vVoiceCloneError = ''
      try {
        const result = await chooseTtsVoiceCloneSamples(this.cloneForIpc(context))
        if (!this.isCurrentS2VVoiceCloneRequest(requestId, context)) return
        const selectionId = typeof result?.data?.selectionId === 'string' ? result.data.selectionId : ''
        const sampleCount = Array.isArray(result?.data?.samples) ? result.data.samples.length : 0
        if (result?.code === 0 && selectionId && sampleCount > 0) {
          this.s2vVoiceCloneSelection = { selectionId, sampleCount }
          this.s2vVoiceCloneConsent = false
          return
        }
        this.s2vVoiceCloneSelection = null
        if (result?.code !== 0) this.s2vVoiceCloneError = result?.message || '无法选择本地音频样本。'
      } finally {
        if (this.isCurrentS2VVoiceCloneRequest(requestId, context)) this.s2vVoiceCloneLoading = false
      }
    },
    async addS2VVoiceClone() {
      const context = this.getS2VVoiceContext()
      const selectionId = this.s2vVoiceCloneSelection?.selectionId
      const name = String(this.s2vVoiceCloneName || '').trim()
      if (!context || !selectionId || !name || this.s2vVoiceCloneConsent !== true || this.s2vVoiceCloneLoading) return

      const requestId = ++this.s2vVoiceCloneRequestId
      this.s2vVoiceCloneLoading = true
      this.s2vVoiceCloneError = ''
      try {
        const result = await addTtsVoiceClone(this.cloneForIpc({
          ...context,
          name,
          selectionId,
          consent: true,
        }))
        if (!this.isCurrentS2VVoiceCloneRequest(requestId, context)) return
        const voice = result?.code === 0 ? this.toS2VVoiceOption(result.data?.voice) : null
        if (!voice) {
          this.s2vVoiceCloneError = result?.message || '无法添加克隆音色。'
          return
        }
        this.s2vVoiceClones = [
          ...this.s2vVoiceClones.filter(item => item.id !== voice.id),
          voice,
        ]
        this.s2vVoiceCloneSelection = null
        this.s2vVoiceCloneName = ''
        this.s2vVoiceCloneConsent = false
        this.s2vConfig.voiceId = voice.id
        await this.selectS2VVoice(voice.id)
      } finally {
        if (this.isCurrentS2VVoiceCloneRequest(requestId, context)) this.s2vVoiceCloneLoading = false
      }
    },
    async deleteS2VVoiceClone(voiceId) {
      const context = this.getS2VVoiceContext()
      const normalizedVoiceId = typeof voiceId === 'string' ? voiceId.trim() : ''
      if (!context || !normalizedVoiceId || this.s2vVoiceCloneLoading) return

      const requestId = ++this.s2vVoiceCloneRequestId
      this.s2vVoiceCloneLoading = true
      this.s2vVoiceCloneError = ''
      try {
        const result = await deleteTtsVoiceClone(this.cloneForIpc({ ...context, voiceId: normalizedVoiceId }))
        if (!this.isCurrentS2VVoiceCloneRequest(requestId, context)) return
        if (result?.code !== 0) {
          this.s2vVoiceCloneError = result?.message || '无法删除克隆音色。'
          return
        }
        this.s2vVoiceClones = this.s2vVoiceClones.filter(voice => voice.id !== normalizedVoiceId)
        this.s2vVoiceCatalog = this.s2vVoiceCatalog.filter(voice => voice.id !== normalizedVoiceId)
        if (this.s2vConfig.voiceId === normalizedVoiceId) {
          const fallbackVoiceId = this.s2vVoiceOptions[0]?.id || ''
          this.s2vConfig.voiceId = fallbackVoiceId
          this.s2vPersistedVoiceId = ''
          if (fallbackVoiceId) await this.selectS2VVoice(fallbackVoiceId)
        }
      } finally {
        if (this.isCurrentS2VVoiceCloneRequest(requestId, context)) this.s2vVoiceCloneLoading = false
      }
    },
    formatS2VVoiceCloneBytes(value) {
      if (!Number.isFinite(value) || value < 0) return '—'
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
      return `${(value / (1024 * 1024)).toFixed(value % (1024 * 1024) === 0 ? 0 : 1)} MB`
    },
    formatS2VVoiceCloneDuration(value) {
      if (!Number.isFinite(value) || value < 0) return '—'
      const seconds = Math.floor(value)
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return minutes > 0 ? `${minutes} 分${remainingSeconds ? ` ${remainingSeconds} 秒` : ''}` : `${seconds} 秒`
    },
    saveCurrentS2VTemplate() {
      const name = String(this.s2vCustomTemplateName || '').trim()
      if (!name) return
      const id = 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
      saveCustomTemplate({
        id,
        name,
        description: '由 Story2Video 当前创作参数保存',
        category: 'custom',
        imageEffect: this.s2vConfig.imageEffect,
        transitionEffect: this.s2vConfig.transition,
        perImageDuration: Number(this.s2vConfig.perImageDuration) || 6,
        size: this.s2vOutputConfig.resolution,
        subtitleStyle: {
          enabled: this.s2vConfig.subtitleEnabled !== false,
          size: this.s2vConfig.subtitleSize || 'size3',
          style: this.s2vConfig.subtitleStyleName || 'style1',
          color: this.s2vConfig.subtitleStyle.color || 'white',
        },
        bgm: this.s2vConfig.bgmPath
          ? { url: '', name: '自定义背景音乐', volume: Math.round(Number(this.s2vConfig.bgmVolume || 0)) }
          : undefined,
      }, window.localStorage)
      this.refreshS2VTemplates()
      this.s2vTemplateCategory = 'custom'
      this.s2vConfig.templateId = id
      this.s2vCustomTemplateName = ''
    },
    deleteSelectedS2VTemplate(templateId = this.selectedS2VTemplate?.id) {
      const template = this.s2vTemplateLibrary.find(item => item.id === templateId)
      if (!template || template.category !== 'custom') return
      deleteCustomTemplate(template.id, window.localStorage)
      if (this.s2vConfig.templateId === template.id) this.s2vConfig.templateId = ''
      this.refreshS2VTemplates()
    },
    requestTemplateDeletion() {
      const template = this.selectedS2VTemplate
      if (!template || template.category !== 'custom') return
      this.story2videoTemplateDeleteDialog = { visible: true, templateId: template.id }
    },
    closeTemplateDeletionDialog() {
      this.story2videoTemplateDeleteDialog = { visible: false, templateId: null }
    },
    confirmTemplateDeletion() {
      const templateId = this.story2videoTemplateDeleteDialog.templateId
      this.closeTemplateDeletionDialog()
      if (templateId) this.deleteSelectedS2VTemplate(templateId)
    },
    enforceStory2VideoTextLimit() {
      if (!this.selectedPipeline || !this.isOrchestratedPipeline(this.selectedPipeline.name)) return
      const characters = Array.from(this.pipelineText)
      if (characters.length <= MAX_STORY2VIDEO_TEXT_CHARACTERS) return
      this.pipelineText = characters.slice(0, MAX_STORY2VIDEO_TEXT_CHARACTERS).join('')
      this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.TEXT_TOO_LONG, messageParams: { max: MAX_STORY2VIDEO_TEXT_CHARACTERS } })
    },
    showStory2VideoErrorDialog(notification = {}) {
      const resolved = resolveStory2VideoNotification(notification)
      this.story2videoErrorDialog = { visible: true, messageKey: resolved.key, messageParams: resolved.params }
    },
    closeStory2VideoErrorDialog() {
      this.story2videoErrorDialog.visible = false
    },
    requestProjectDeletion(item) {
      if (!item?.projectId) return
      this.story2videoProjectDeleteDialog = { visible: true, projectId: item.projectId }
    },
    closeProjectDeletionDialog() {
      this.story2videoProjectDeleteDialog = { visible: false, projectId: null }
    },
    async confirmProjectDeletion() {
      const projectId = this.story2videoProjectDeleteDialog.projectId
      this.closeProjectDeletionDialog()
      if (projectId) await this.deleteHistory({ projectId })
    },
    setOrchestrationError(notification) {
      this.orchestrationError = ''
      this.showStory2VideoErrorDialog(notification)
      this.stopPipelinePolling()
      this.needsCheckpoint = false
      if (this.pipelineRunStatus?.status !== 'completed') {
        this.pipelineRunStatus = { status: 'failed', progress: this.pipelineRunStatus?.progress || 0, stages: this.pipelineRunStatus?.stages || this.orchestrationStages }
      }
    },
    async updateOrchestrationStatus() {
      if (!this.orchestrationRunId) return
      try {
        const statusResult = await pipelineGetRunContext(this.orchestrationRunId)
        if (statusResult?.code !== 0) {
          this.setOrchestrationError({ code: statusResult?.code, error: statusResult?.message })
          return
        }
        if (!statusResult.data) {
          this.setOrchestrationError({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.RUN_STATUS_UNAVAILABLE })
          return
        }
        this.orchestrationContext = statusResult.data.context || null
        const snapshotStatus = statusResult.data.status || {}
        const stages = Array.isArray(statusResult.data.stages)
          ? statusResult.data.stages
          : (Array.isArray(snapshotStatus.stages) ? snapshotStatus.stages : (this.orchestrationStages.length ? this.orchestrationStages : this.getDefaultStory2VideoStages()))
        this.orchestrationStages = stages
        this.pipelineRunStatus = {
          ...snapshotStatus,
          currentStage: statusResult.data.currentStage ?? snapshotStatus.currentStage,
          stages,
          checkpoint: statusResult.data.checkpoint || snapshotStatus.checkpoint || null,
        }
        this.needsCheckpoint = false
        if (['completed', 'failed', 'cancelled'].includes(statusResult.data.status?.status)) {
          this.applyOrchestrationOutcome({
            success: statusResult.data.status.status === 'completed',
            completed: statusResult.data.status.status === 'completed',
            context: statusResult.data.context,
            error: statusResult.data.error || statusResult.data.status.error,
          })
        }
      } catch (_error) {
        this.setOrchestrationError({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.RUN_STATUS_UNAVAILABLE })
      }
    },
    async advanceOrchestration() {
      if (!this.orchestrationRunId) return
      const res = await pipelineAdvanceToNextCheckpoint(this.orchestrationRunId)
      if (res?.code === 0 && res.data?.success !== false) {
        if (!this.applyOrchestrationOutcome(res.data || {})) await this.updateOrchestrationStatus()
      }
      else { this.setOrchestrationError({ code: res?.code, error: res?.message || res?.data?.error }) }
    },
    extractOrchestrationVideoPath(context) {
      const publish = context?.publish?.data || context?.publish
      const compose = context?.compose?.data || context?.compose
      const clipExport = context?.export?.data || context?.export
      const cinematicRender = context?.render?.data || context?.render
      const smokeReport = context?.report?.data || context?.report
      return publish?.videoPath || publish?.path || compose?.videoPath || compose?.path ||
        clipExport?.videoPath || clipExport?.path ||
        cinematicRender?.videoPath || cinematicRender?.path ||
        smokeReport?.videoPath || smokeReport?.path || null
    },
    applyOrchestrationOutcome(outcome) {
      if (Array.isArray(outcome?.stages)) this.orchestrationStages = outcome.stages
      if (outcome?.context) this.orchestrationContext = outcome.context
      if (outcome?.paused) {
        this.pipelineRunStatus = { status: 'paused', progress: this.pipelineRunStatus?.progress || 0 }
        this.needsCheckpoint = false
      }
      if (outcome?.success === false) {
        this.setOrchestrationError({ errorCode: outcome.errorCode, errorParams: outcome.errorParams, error: outcome.error })
        return true
      }
      if (!outcome?.completed) return false
      const context = outcome.context || this.orchestrationContext
      const videoPath = this.extractOrchestrationVideoPath(context)
      const projectId = context?.story2videoProject?.projectId || null
      this.stopPipelinePolling()
      this.pipelineRunStatus = { status: 'completed', progress: 100, stages: this.orchestrationStages }
      this.needsCheckpoint = false
      this.orchestrationRunId = null
      if (!videoPath) {
        this.setOrchestrationError({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PREVIEW_MISSING })
        return true
      }
      if (this.orchestrationResultPath === videoPath) return true
      this.orchestrationResultPath = videoPath
      this.$router.push({
        path: '/create/result',
        query: projectId ? { project: projectId, path: videoPath } : { path: videoPath },
      })
      return true
    },
    stopPipelinePolling() {
      if (this.pollTimer) {
        clearInterval(this.pollTimer)
        this.pollTimer = null
      }
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
      this.orchestrationRunId = null; this.orchestrationContext = null; this.orchestrationError = ''
      this.orchestrationStages = (this.isAutoPipeline(this.selectedPipeline?.name) || this.isMediaAutoPipeline(this.selectedPipeline?.name)) ? this.getDefaultPipelineStages(this.selectedPipeline?.name) : []
      this.closeStory2VideoErrorDialog()
      this.stopPipelinePolling()
    },
    async advancePipeline() { await pipelineAdvance(); await this.updatePipelineStatus() },
    async loadHistory() {
      const requestId = ++this.historyRequestId
      this.historyLoading = true
      try {
        const [projectsResult, pipelineResult] = await Promise.allSettled([
          settleHistoryRequest(() => story2videoListProjects()),
          settleHistoryRequest(() => pipelineHistory()),
        ])
        if (requestId !== this.historyRequestId) return
        const hasProjects = projectsResult.status === 'fulfilled'
          && projectsResult.value?.code === 0
          && Array.isArray(projectsResult.value.data)
        const hasRuns = pipelineResult.status === 'fulfilled'
          && pipelineResult.value?.code === 0
          && Array.isArray(pipelineResult.value.data)
        const projects = hasProjects
          ? projectsResult.value.data.map(project => ({ ...project, historyType: 'story2video-project' }))
          : []
        const projectIds = new Set(projects.map(project => project.projectId))
        const runs = hasRuns
          ? pipelineResult.value.data.filter(run => !projectIds.has(run.id))
          : []
        this.history = [...projects, ...runs]
        if (!hasProjects || !hasRuns) {
          this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOAD_FAILED })
        }
      } catch (_) {
        if (requestId !== this.historyRequestId) return
        this.history = []
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.HISTORY_LOAD_FAILED })
      } finally {
        if (requestId === this.historyRequestId) this.historyLoading = false
      }
    },
    openHistory(item) {
      if (!item?.projectId) return
      this.$router.push({ path: '/create/result', query: { project: item.projectId } })
    },
    async deleteHistory(item) {
      if (!item?.projectId) return
      const result = await story2videoDeleteProject(item.projectId)
      if (result?.code === 0) this.history = this.history.filter(entry => entry.projectId !== item.projectId)
      else this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.PROJECT_DELETE_FAILED })
    },

    // 文件处理
    handlePipelineFiles(e) {
      Array.from(e.target.files || []).forEach(file => {
        if (!this.validateStory2VideoFile(file, 'image')) return
        const reader = new FileReader()
        reader.onload = (ev) => { this.pipelineImages.push({ name: file.name, preview: ev.target.result }) }
        reader.readAsDataURL(file)
      })
    },
    handlePipelineDrop(e) {
      Array.from(e.dataTransfer?.files || []).forEach(file => {
        if (!this.validateStory2VideoFile(file, 'image')) return
        const reader = new FileReader()
        reader.onload = (ev) => { this.pipelineImages.push({ name: file.name, preview: ev.target.result }) }
        reader.readAsDataURL(file)
      })
    },
    validateStory2VideoFile(file, kind) {
      const extension = String(file?.name || '').toLowerCase().match(/\.[^.]+$/)?.[0] || ''
      const rules = {
        image: { extensions: ['.jpg', '.jpeg', '.png', '.webp'], maxBytes: 10 * 1024 * 1024, label: '图片' },
        audio: { extensions: ['.wav', '.m4a', '.mp3'], maxBytes: 50 * 1024 * 1024, label: '旁白音频' },
        bgm: { extensions: ['.wav', '.m4a', '.mp3'], maxBytes: 15 * 1024 * 1024, label: '背景音乐' },
        video: { extensions: ['.mp4', '.mov', '.webm', '.mkv', '.avi'], maxBytes: 512 * 1024 * 1024, label: '视频素材' },
      }
      const rule = rules[kind]
      if (!rule || !rule.extensions.includes(extension)) {
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID })
        return false
      }
      if (Number(file?.size) > rule.maxBytes) {
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID })
        return false
      }
      return true
    },
    async importStory2VideoMedia(file, kind) {
      if (!file || !this.validateStory2VideoFile(file, kind)) return null
      try {
        const result = await story2videoImportMedia(file, kind)
        return result?.code === 0 && result.data?.path ? result.data : null
      } catch (_) {
        return null
      }
    },
    async handlePipelineAudio(e) {
      const files = Array.from(e.target.files || [])
      const resolved = []
      for (const file of files) {
        const imported = await this.importStory2VideoMedia(file, 'audio')
        if (imported?.path) {
          resolved.push({
            name: file.name || imported.originalName,
            path: imported.path,
            transcript: '',
            transcribing: false,
            transcriptionError: '',
          })
        }
      }
      if (resolved.length !== files.length) {
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID })
      }
      this.pipelineAudio = resolved
    },
    async transcribePipelineAudio(index) {
      const audio = this.pipelineAudio[index]
      if (!audio?.path || audio.transcribing) return
      audio.transcribing = true
      audio.transcriptionError = ''
      try {
        const result = await story2videoTranscribe(audio.path)
        const transcript = result?.code === 0 ? String(result.data?.text || '').trim() : ''
        if (!transcript) throw new Error(result?.message || '语音识别未返回文字')
        audio.transcript = transcript
      } catch (error) {
        audio.transcriptionError = error?.message || '旁白识别失败'
      } finally {
        audio.transcribing = false
      }
    },
    async handlePipelineVideo(e) {
      const file = e.target.files?.[0]
      if (!file) return
      if (!this.validateStory2VideoFile(file, 'video')) {
        this.pipelineVideo = null
        return
      }
      // File 对象跨 contextBridge 后路径会丢失；先经 getPathForFile 拿到真实路径，
      // 再走基于路径的导入（复制到应用控制目录，供后续 canonical 白名单校验）。
      const filePath = typeof window.electronAPI?.getPathForFile === 'function'
        ? await window.electronAPI.getPathForFile(file)
        : ''
      if (!filePath) {
        this.pipelineVideo = null
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID })
        return
      }
      const imported = await story2videoImportMediaPath(filePath, 'video')
      if (!imported || imported.code !== 0 || !imported.data?.path) {
        this.pipelineVideo = null
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID })
        return
      }
      this.pipelineVideo = { name: file.name || imported.data.originalName, path: imported.data.path }
    },
    async handleS2VBgmFile(e) {
      const file = e.target.files?.[0]
      if (!file) return
      const imported = await this.importStory2VideoMedia(file, 'bgm')
      if (!imported?.path) {
        this.s2vConfig.bgmPath = ''
        this.showStory2VideoErrorDialog({ messageKey: STORY2VIDEO_NOTIFICATION_KEYS.MEDIA_INVALID })
        return
      }
      this.s2vConfig.bgmPath = imported.path
    },
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
      this.renderStatus = s?.code === 0 && s.data ? s.data : { ready: false, ipcError: true, message: s?.message || 'IPC 调用失败' }
    },

    // 阶段显示
    stageStateClass(stage, i) {
      if (!this.pipelineRunStatus) return ''
      const idx = this.pipelineRunStatus.currentStage || 0
      if (stage.status === 'failed') return 'failed'
      if (stage.status === 'needs_user_input') return 'needs-user-input'
      if (stage.status === 'cancelled') return 'cancelled'
      if (i < idx || stage.status === 'completed') return 'done'
      if (i === idx && stage.status === 'running') return 'active'
      if (stage.status === 'waiting_approval') return 'waiting'
      return 'pending'
    },
    stageStateIcon(stage, i) {
      if (!this.pipelineRunStatus) return '⭕'
      const idx = this.pipelineRunStatus.currentStage || 0
      if (stage.status === 'failed') return '❌'
      if (stage.status === 'needs_user_input') return '⚠️'
      if (stage.status === 'cancelled') return '⏹️'
      if (i < idx || stage.status === 'completed') return '✅'
      if (i === idx && stage.status === 'running') return ''
      if (stage.status === 'waiting_approval') return '⚠️'
      return '⭕'
    },
    stageStatusLabel(stage) {
      return this.pipelineStatus(stage?.status || 'pending')
    },
  },
  async mounted() {
    this.refreshS2VTemplates()
    await Promise.all([this.loadPipelines(), this.loadS2VProviders()])
        renderGetStatus().then(s => { this.renderStatus = s?.code === 0 && s.data ? s.data : { ready: false, ipcError: true, message: s?.message || 'IPC 调用失败' } }).catch(() => { this.renderStatus = { ready: false, ipcError: true, message: 'renderGetStatus 异常' } })
    this.cleanups.push(onRenderProgress((pct, stg) => { if (this.quickRendering) { this.quickProgress = pct; this.quickStage = stg } }))
    this.cleanups.push(onRenderComplete((res) => { this.quickRendering = false; this.quickResult = res }))
    this.cleanups.push(onRenderError((err) => { this.quickRendering = false; this.quickError = err?.message || err || '渲染错误' }))
    this.cleanups.push(onRenderInstallProgress(({ text }) => { this.installLog += text + '\n' }))
  },
  beforeUnmount() {
    this.cleanups.forEach(fn => { try { fn() } catch(_e) { /* ignore cleanup errors */ } })
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
.story2video-text-count { margin: 8px 0 0; color: var(--text-muted); font-size: 12px; text-align: right; }

/* 视图切换 */
.view-tabs { display: flex; gap: 4px; margin-bottom: 24px; border-bottom: 1px solid var(--border); }
.view-tab { padding: 10px 20px; border: none; background: none; cursor: pointer; font-size: 14px; color: #666; border-bottom: 2px solid transparent; }
.view-tab.active { color: var(--primary); border-bottom-color: var(--primary); font-weight: 600; }

/* 流水线网格 */
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
.card-meta { display: flex; gap: 12px; font-size: 12px; color: #999; align-items: center; }
.cost-label.low { color: #10b981; }
.cost-label.medium { color: #f59e0b; }
.cost-label.high { color: #ef4444; }
.availability-badge { font-size: 11px; padding: 1px 8px; border-radius: 10px; font-weight: 600; margin-left: auto; }
.availability-badge.ready { background: #d1fae5; color: #047857; }
.availability-badge.dev { background: #fef3c7; color: #b45309; }
.pipeline-card.is-unavailable { opacity: 0.72; }
.pipeline-card.is-unavailable:hover { transform: none; box-shadow: none; }
.unavailable-hint { color: #b45309; font-size: 12px; margin-top: 8px; }

/* 流水线详情 */
.pipeline-detail { }
.back-btn { background: none; border: none; color: var(--primary); cursor: pointer; font-size: 14px; padding: 0; margin-bottom: 16px; }
.detail-header { margin-bottom: 20px; }
.detail-header h2 { font-size: 20px; margin: 0 0 4px; }
.detail-desc { color: #666; font-size: 14px; margin: 0; }

/* 阶段时间线 */
.stages-timeline { display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; padding: 16px; background: var(--bg); border-radius: 8px; max-width: 100%; overflow-wrap: anywhere; }
.stage-item { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 6px; font-size: 14px; min-width: 0; max-width: 100%; }
.orchestration-context { max-width: 100%; overflow-wrap: anywhere; word-break: break-word; padding: 12px 16px; background: var(--bg); border-radius: 8px; margin-bottom: 16px; }
.context-item { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; max-width: 100%; min-width: 0; }
.context-key { flex: 0 0 auto; font-weight: 600; color: var(--text-muted); font-size: 12px; }
.context-value { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; word-break: break-word; color: var(--text-muted); font-size: 12px; }
.stage-item.done { color: #666; }
.stage-item.active { background: #eff6ff; color: #1d4ed8; font-weight: 600; }
.stage-item.waiting { background: #fef3c7; color: #92400e; }
.stage-item.failed { background: #fef2f2; color: #b91c1c; }
.stage-item.needs-user-input { background: #fff7ed; color: #c2410c; }
.stage-item.cancelled { color: #6b7280; }
.stage-item.pending { color: #999; }
.stage-icon { width: 24px; text-align: center; }
.stage-name { flex: 1; }
.stage-status { font-size: 12px; }
.orchestration-attention { margin: 0; color: #c2410c; font-size: 13px; }

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
.file-list { width: 100%; text-align: left; }
.file-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-bottom: 1px solid var(--border); font-size: 13px; }
.file-row:last-child { border-bottom: none; }
.file-row .remove-btn { position: static; flex: 0 0 auto; }

/* 风格选择 */
.config-section { margin-bottom: 24px; }
.s2v-config-sections { display: grid; gap: 10px; margin-bottom: 16px; }
.s2v-config-section { border: 1px solid var(--border); border-radius: 10px; background: var(--surface); overflow: hidden; }
.s2v-section-summary { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; list-style: none; font-weight: 700; }
.s2v-section-summary::-webkit-details-marker { display: none; }
.s2v-section-summary::before { content: '›'; display: inline-block; color: var(--text-muted); font-size: 20px; line-height: 1; transform: rotate(0deg); transition: transform .15s ease; }
.s2v-config-section[open] > .s2v-section-summary::before { transform: rotate(90deg); }
.s2v-summary { margin-left: auto; color: var(--text-muted); font-size: 12px; font-weight: 400; text-align: right; }
.s2v-config-section > .config-grid { padding: 0 16px 16px; }
.s2v-subgroup { margin: 0 16px 12px; }
.s2v-subgroup:first-of-type { margin-top: 2px; }
.s2v-subgroup-title { font-size: 12px; font-weight: 600; color: var(--text-muted); margin: 0 0 8px; padding-bottom: 4px; border-bottom: 1px dashed var(--border); }
.s2v-controlled-defaults { margin: -4px 16px 16px; color: var(--text-muted); font-size: 12px; }
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
.config-span-2 { grid-column: span 2; }
.inline-file-control { display: flex; align-items: center; gap: 8px; min-width: 0; }
.inline-file-control .config-hint { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.platform-checkboxes { display: flex; flex-wrap: wrap; gap: 8px 14px; }
.checkbox-label { display: inline-flex !important; align-items: center; gap: 5px; font-weight: 400 !important; white-space: nowrap; }
.config-item label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; }
.form-select, .form-input { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px; box-sizing: border-box; }
.form-range { width: 100%; }
.voice-slot-hint p { margin: 0; }
.voice-clone-panel { display: grid; gap: 8px; }
.voice-clone-panel > label { margin-bottom: 0; }
.voice-clone-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.voice-clone-actions .form-input { flex: 1 1 180px; }
.voice-clone-actions .btn-secondary { margin-top: 0; }
.voice-clone-consent { align-items: flex-start; margin: 2px 0; white-space: normal; }
.voice-clone-list { display: grid; gap: 8px; }
.voice-clone-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; }

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
.history-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.history-toolbar label { color: var(--text-muted); font-size: 13px; font-weight: 600; }
.history-filter { width: min(220px, 100%); }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item { display: flex; align-items: center; gap: 16px; padding: 12px 16px; border: 1px solid var(--border); border-radius: 6px; font-size: 14px; }
.history-name { flex: 1; }
.history-status { font-size: 12px; padding: 2px 8px; border-radius: 4px; }
.history-status.completed { background: #d1fae5; color: #065f46; }
.history-status.failed { background: #fee2e2; color: #991b1b; }
.history-status.cancelled { background: #f3f4f6; color: #6b7280; }
.history-time { color: #999; font-size: 12px; }
.history-open, .history-delete { border: 1px solid var(--border); border-radius: 4px; background: var(--surface); color: var(--text); padding: 5px 9px; cursor: pointer; font-size: 12px; }
.history-open:hover { border-color: var(--primary); color: var(--primary); }
.history-delete:hover { border-color: var(--error); color: var(--error); }
.empty-state.compact { padding: 28px 0; }
.template-editor { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto; gap: 8px; align-items: start; }
.template-editor .btn-secondary { margin-top: 0; min-height: 38px; }
.btn-secondary.danger { border-color: var(--error); color: var(--error); }
.audio-file-row { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); }
.audio-file-row + .audio-file-row { margin-top: 8px; }
.audio-transcript { margin-top: 8px; min-height: 58px; }
.audio-row-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.inline-error { color: var(--error); font-size: 12px; }

/* 通用 */
.loading-state, .empty-state, .error-state { display: flex; align-items: center; gap: 8px; padding: 40px; color: #666; justify-content: center; }
.error-state { color: #dc2626; background: #fef2f2; border-radius: 8px; }
.spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: var(--primary); border-radius: 50%; animation: spin 0.6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 720px) {
  .template-editor { grid-template-columns: 1fr; }
  .history-item { align-items: flex-start; flex-wrap: wrap; }
  .history-name { flex-basis: 100%; }
}
</style>
