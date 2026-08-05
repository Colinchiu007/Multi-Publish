// @ts-check
/**
 * documentary-stages - documentary-montage（纪录蒙太奇）流水线的自定义阶段执行器
 *
 * 注册与 documentary-montage 流水线配套的自定义 STAGE_TYPES：
 *   - documentary_research:  主题 → 默认 LLM 生成纪录片风格解说大纲
 *   - documentary_ingest:    大纲 → 默认 LLM 生成场景数组 [{ prompt, text, duration }]
 *   - documentary_edit:      复用 story2video_generate_assets（图片+TTS，含内容政策重试）
 *   - documentary_narrate:   旁白与资源清单校验（真实动效/转场由 compose 引擎执行）
 *
 * render 阶段复用内置 compose（story2video 合成引擎）。
 * 注册方式：在 container.setup.js 中调用 registerDocumentaryStages(pipelineEngine)
 */

'use strict'

const DOCUMENTARY_STAGE_TYPES = {
  RESEARCH: 'documentary_research',
  INGEST: 'documentary_ingest',
  EDIT: 'documentary_edit',
  NARRATE: 'documentary_narrate',
}

const MAX_SCENES = 30
const DEFAULT_SCENE_DURATION = 6
const MIN_SCENE_TEXT_LENGTH = 4

function getAiGenerator (pipelineEngine) {
  return pipelineEngine.aiGenerator ||
    (pipelineEngine.container && typeof pipelineEngine.container.get === 'function'
      ? pipelineEngine.container.get('aiGenerator')
      : null)
}

function getDefaultLlmConfig (aiGenerator) {
  const manager = aiGenerator && aiGenerator._modelProviderManager
  const provider = manager && typeof manager.getDefault === 'function'
    ? manager.getDefault('llm')
    : null
  if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) return null
  const model = Array.isArray(provider.models)
    ? provider.models.find(item => typeof item === 'string' && item.trim())
    : null
  return model ? { providerId: provider.id.trim(), model: model.trim() } : null
}

function getDefaultProviderConfig (aiGenerator, type) {
  const manager = aiGenerator && aiGenerator._modelProviderManager
  const provider = manager && typeof manager.getDefault === 'function'
    ? manager.getDefault(type)
    : null
  if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) return null
  const model = Array.isArray(provider.models)
    ? provider.models.find(item => typeof item === 'string' && item.trim())
    : null
  return model ? { providerId: provider.id.trim(), model: model.trim() } : null
}

async function callDefaultLlm (aiGenerator, systemPrompt, userContent, maxTokens) {
  if (!aiGenerator || typeof aiGenerator.generateWithDefault !== 'function') {
    throw new Error('默认 LLM 不可用，请先完成模型设置')
  }
  if (!getDefaultLlmConfig(aiGenerator)) {
    throw new Error('未找到需要的相关模型，请在设置中添加模型')
  }
  const result = await aiGenerator.generateWithDefault('llm', {
    temperature: 0.7,
    max_tokens: Number.isFinite(maxTokens) ? maxTokens : 1600,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
  })
  const content = result && typeof result.content === 'string' ? result.content.trim() : ''
  if (!content) throw new Error('默认 LLM 返回空内容')
  return content
}

function buildResearchPrompt (topic, options = {}) {
  const scope = typeof options.scope === 'string' && options.scope.trim()
    ? '\n内容范围：' + options.scope.trim()
    : ''
  return {
    system: '你是资深纪录片策划。根据用户给的主题，输出一份纪录片风格解说大纲：3-6 个要点，每点一行，格式「序号. 要点标题：一句话说明」。每个要点应指出适合的资料画面方向（真实影像、历史资料、数据图表、场景再现）。只输出大纲本身，不要任何其他文字或 markdown。',
    user: '主题：' + String(topic || '').trim() + scope,
  }
}

function buildIngestPrompt (outline, options = {}) {
  return {
    system: '你是纪录片分镜导演。根据大纲把内容拆分为若干视频场景。输出严格的 JSON 数组，不要包含任何其他文字或 markdown 代码块标记。每个元素格式：{"prompt": "该场景的画面提示词（描述主体、动作、构图、光线、纪实风格视觉语言，供 AI 生图直接使用）", "text": "该场景对应的旁白文本（纪录片口吻）", "duration": 秒数（4 到 10 的整数）}。场景数量不超过 ' + MAX_SCENES + ' 个。',
    user: '纪录片大纲：\n' + String(outline || '').trim(),
  }
}

/** 从 LLM 输出中提取 JSON 数组（容忍 markdown 围栏、说明文字与对象包装）。 */
function parseScenesJson (text) {
  const source = String(text || '').trim()
  if (!source) return null

  try {
    const parsed = JSON.parse(source)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const firstArray = Object.values(parsed).find(Array.isArray)
      if (firstArray) return firstArray
    }
  } catch {
    // fallthrough
  }

  const start = source.indexOf('[')
  const end = source.lastIndexOf(']')
  if (start !== -1 && end > start) {
    const candidate = source.slice(start, end + 1)
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) return parsed
    } catch {
      // fallthrough
    }
  }

  const propertyMatch = source.match(/["']?scenes["']?\s*:\s*(\[[\s\S]*\])/i)
  if (propertyMatch) {
    try {
      const parsed = JSON.parse(propertyMatch[1])
      if (Array.isArray(parsed)) return parsed
    } catch {
      // fallthrough
    }
  }

  return null
}

/** 行级兜底：把大纲按行拆成场景（JSON 解析失败时保证流水线可继续）。 */
function fallbackScenes (outline, options = {}) {
  const duration = Number(options.duration)
  const sceneDuration = Number.isFinite(duration) && duration >= 1 ? duration : DEFAULT_SCENE_DURATION
  const blocks = String(outline || '')
    .split(/\n\s*\n|\r?\n/)
    .map(block => block.trim())
    .filter(block => block.length >= MIN_SCENE_TEXT_LENGTH)
  if (blocks.length === 0) return null
  return blocks.slice(0, MAX_SCENES).map(text => ({
    text,
    prompt: '以纪实影像风格呈现「' + text.slice(0, 40) + '」的解说画面，真实质感，自然光线，构图沉稳。',
    duration: sceneDuration,
  }))
}

function normalizeScenes (raw, fallbackSource) {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const scenes = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    if (!prompt || !text) continue
    const duration = Number(item.duration)
    scenes.push({
      prompt,
      text,
      duration: Number.isFinite(duration) && duration >= 1 ? duration : DEFAULT_SCENE_DURATION,
    })
  }
  if (scenes.length === 0) return null
  return scenes.slice(0, MAX_SCENES)
}

/**
 * 注册 documentary-montage 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例（需已注入 serviceBus）
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerDocumentaryStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return {
      success: false,
      error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)',
    }
  }

  const registered = []
  const log = pipelineEngine.log

  // ----------------------------------------------------------
  // RESEARCH - 主题 → 纪录片风格解说大纲
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    DOCUMENTARY_STAGE_TYPES.RESEARCH,
    async ({ stage, params }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const topic = typeof params.text === 'string' ? params.text.trim() : ''
      if (!topic) {
        return { success: false, error: 'documentary-montage research 需要非空主题（params.text）' }
      }
      const { system, user } = buildResearchPrompt(topic, stage.options || {})
      try {
        const outline = await callDefaultLlm(aiGenerator, system, user)
        return { success: true, output: outline }
      } catch (error) {
        return { success: false, error: 'research 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(DOCUMENTARY_STAGE_TYPES.RESEARCH)

  // ----------------------------------------------------------
  // INGEST - 大纲 → 场景数组 [{ prompt, text, duration }]
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    DOCUMENTARY_STAGE_TYPES.INGEST,
    async ({ stage, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const outline = typeof context.research === 'string' ? context.research.trim() : ''
      if (!outline) {
        return { success: false, error: 'documentary-montage ingest 需要 context.research' }
      }
      const { system, user } = buildIngestPrompt(outline, stage.options || {})
      try {
        const raw = await callDefaultLlm(aiGenerator, system, user)
        let scenes = normalizeScenes(parseScenesJson(raw), outline)
        if (!scenes) {
          scenes = fallbackScenes(outline, stage.options || {})
        }
        if (!scenes) {
          const snippet = raw.length > 120 ? raw.slice(0, 120) + '…' : raw
          return {
            success: false,
            error: 'ingest 阶段无法解析场景：' + snippet,
          }
        }
        return { success: true, output: scenes }
      } catch (error) {
        return { success: false, error: 'ingest 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(DOCUMENTARY_STAGE_TYPES.INGEST)

  // ----------------------------------------------------------
  // EDIT - 复用 story2video_generate_assets（图片+TTS，含内容政策重试）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    DOCUMENTARY_STAGE_TYPES.EDIT,
    async ({ runId, stage, params, context }) => {
      const scenes = Array.isArray(context.ingest) ? context.ingest : []
      if (scenes.length === 0) {
        return { success: false, error: 'documentary-montage edit 需要 context.ingest' }
      }
      const optimizedPrompts = scenes.map((scene) => ({
        optimized_prompt: scene.prompt || '',
        prompt: scene.prompt || '',
      }))
      if (optimizedPrompts.some(item => !item.prompt)) {
        return { success: false, error: 'documentary-montage 场景缺少画面提示词（prompt）' }
      }
      const adaptedContext = {
        ...context,
        optimize: optimizedPrompts,
        split: scenes,
      }
      const aiGenerator = getAiGenerator(pipelineEngine)
      const defaultImage = getDefaultProviderConfig(aiGenerator, 'image')
      const defaultVoice = getDefaultProviderConfig(aiGenerator, 'tts')
      const innerOptions = { ...(stage.options || {}) }
      if (!innerOptions.imageProvider && defaultImage) innerOptions.imageProvider = defaultImage.providerId
      if (!innerOptions.imageModel && defaultImage) innerOptions.imageModel = defaultImage.model
      if (!innerOptions.voiceProvider && defaultVoice) innerOptions.voiceProvider = defaultVoice.providerId
      if (!innerOptions.voiceModel && defaultVoice) innerOptions.voiceModel = defaultVoice.model
      const inner = await pipelineEngine.stageExecutor.execute({
        runId,
        stage: { name: 'edit', type: 'story2video_generate_assets', options: innerOptions },
        params,
        context: adaptedContext,
      })
      if (!inner.success) {
        log.warn('DocumentaryStages', 'edit (generate_assets reuse) failed: ' + inner.error)
      }
      return inner
    },
  )
  registered.push(DOCUMENTARY_STAGE_TYPES.EDIT)

  // ----------------------------------------------------------
  // NARRATE - 旁白与资源清单校验/透传（真实合成由 compose 引擎执行）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    DOCUMENTARY_STAGE_TYPES.NARRATE,
    async ({ context }) => {
      const manifest = context.edit || context.assets
      const scenes = manifest && Array.isArray(manifest.scenes) ? manifest.scenes : []
      if (scenes.length === 0) {
        return { success: false, error: 'documentary-montage narrate 需要有效的资源清单（context.edit/assets）' }
      }
      const missingNarration = scenes.some(scene => !scene.audioPath && !scene.narrationPath)
      if (missingNarration) {
        return { success: false, error: 'documentary-montage narrate 检测到缺少旁白音频的场景' }
      }
      return { success: true, output: manifest }
    },
  )
  registered.push(DOCUMENTARY_STAGE_TYPES.NARRATE)

  return { success: true, registered }
}

module.exports = {
  DOCUMENTARY_STAGE_TYPES,
  buildResearchPrompt,
  buildIngestPrompt,
  parseScenesJson,
  normalizeScenes,
  fallbackScenes,
  registerDocumentaryStages,
}
