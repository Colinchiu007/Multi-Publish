// @ts-check
/**
 * explainer-stages - animated-explainer（AI 讲解视频）流水线的自定义阶段执行器
 *
 * 注册与 animated-explainer 流水线配套的自定义 STAGE_TYPES：
 *   - explainer_research:          主题 → 默认 LLM 生成结构化解说大纲
 *   - explainer_proposal:          大纲 → 默认 LLM 生成分镜方案（段落/主题划分）
 *   - explainer_script:            方案 → 默认 LLM 生成逐段旁白文案
 *   - explainer_scenes:            文案 → 默认 LLM 生成场景数组 [{ prompt, text, duration }]
 *   - explainer_generate_assets:   复用 story2video_generate_assets（图片+TTS，含内容政策重试）
 *   - explainer_editing:           资源清单校验/透传（真实动效/转场由 compose 引擎执行）
 *
 * 注册方式：在 container.setup.js 中调用 registerExplainerStages(pipelineEngine)
 */

'use strict'

const EXPLAINER_STAGE_TYPES = {
  RESEARCH: 'explainer_research',
  PROPOSAL: 'explainer_proposal',
  SCRIPT: 'explainer_script',
  SCENES: 'explainer_scenes',
  GENERATE_ASSETS: 'explainer_generate_assets',
  EDITING: 'explainer_editing',
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
    system: '你是资深视频策划。根据用户给的主题，输出一份结构化的讲解视频大纲：3-6 个要点，每点一行，格式「序号. 要点标题：一句话说明」。只输出大纲本身，不要任何其他文字或 markdown。',
    user: '主题：' + String(topic || '').trim() + scope,
  }
}

function buildProposalPrompt (outline, options = {}) {
  return {
    system: '你根据大纲为讲解视频设计分镜方案。输出分镜列表，每行一个分镜，格式「分镜N：画面内容提示 | 对应讲解要点」。只输出方案本身，不要多余文字。',
    user: '大纲：\n' + String(outline || '').trim(),
  }
}

function buildScriptPrompt (plan, options = {}) {
  return {
    system: '你根据分镜方案撰写逐段旁白文案，每段对应一个分镜，段落之间用空行分隔。语言口语化、逻辑连贯、适合配音。不要输出序号以外的多余标记。',
    user: '分镜方案：\n' + String(plan || '').trim(),
  }
}

function buildScenesPrompt (script, options = {}) {
  return {
    system: '把旁白文案拆分为若干视频场景。输出严格的 JSON 数组，不要包含任何其他文字或 markdown 代码块标记。每个元素格式：{"prompt": "该场景的画面提示词（描述主体、动作、构图、光线、视觉风格，供 AI 生图直接使用）", "text": "该场景对应的旁白文本", "duration": 秒数（4 到 10 的整数）}。场景数量不超过 ' + MAX_SCENES + ' 个。',
    user: '旁白文案：\n' + String(script || '').trim(),
  }
}

/** 从 LLM 输出中提取 JSON 数组（容忍 markdown 围栏、说明文字与对象包装）。 */
function parseScenesJson (text) {
  const source = String(text || '').trim()
  if (!source) return null

  // 1) 直接解析整段（可能是裸数组或含数组字段的对象）
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

  // 2) 提取第一个 [...] 数组块
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

  // 3) 提取数组属性值（例如 {"scenes": [...]} 带前后说明文字）
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

/** 行级兜底：把旁白文案按段落/行拆成场景（JSON 解析失败时保证流水线可继续）。 */
function fallbackScenes (script, options = {}) {
  const duration = Number(options.duration)
  const sceneDuration = Number.isFinite(duration) && duration >= 1 ? duration : DEFAULT_SCENE_DURATION
  const blocks = String(script || '')
    .split(/\n\s*\n|\r?\n/)
    .map(block => block.trim())
    .filter(block => block.length >= MIN_SCENE_TEXT_LENGTH)
  if (blocks.length === 0) return null
  return blocks.slice(0, MAX_SCENES).map(text => ({
    text,
    prompt: '以纪实风格呈现「' + text.slice(0, 40) + '」的解说画面，构图清晰，光线自然。',
    duration: sceneDuration,
  }))
}

function normalizeScenes (raw, fallbackScript) {
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
 * 注册 animated-explainer 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例（需已注入 serviceBus）
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerExplainerStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return {
      success: false,
      error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)',
    }
  }

  const registered = []
  const log = pipelineEngine.log

  // ----------------------------------------------------------
  // RESEARCH - 主题 → 结构化解说大纲
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    EXPLAINER_STAGE_TYPES.RESEARCH,
    async ({ stage, params }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const topic = typeof params.text === 'string' ? params.text.trim() : ''
      if (!topic) {
        return { success: false, error: 'animated-explainer research 需要非空主题（params.text）' }
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
  registered.push(EXPLAINER_STAGE_TYPES.RESEARCH)

  // ----------------------------------------------------------
  // PROPOSAL - 大纲 → 分镜方案
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    EXPLAINER_STAGE_TYPES.PROPOSAL,
    async ({ stage, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const outline = typeof context.research === 'string' ? context.research.trim() : ''
      if (!outline) {
        return { success: false, error: 'animated-explainer proposal 需要 context.research' }
      }
      const { system, user } = buildProposalPrompt(outline, stage.options || {})
      try {
        const plan = await callDefaultLlm(aiGenerator, system, user)
        return { success: true, output: plan }
      } catch (error) {
        return { success: false, error: 'proposal 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(EXPLAINER_STAGE_TYPES.PROPOSAL)

  // ----------------------------------------------------------
  // SCRIPT - 分镜方案 → 逐段旁白文案
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    EXPLAINER_STAGE_TYPES.SCRIPT,
    async ({ stage, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const plan = typeof context.proposal === 'string' ? context.proposal.trim() : ''
      if (!plan) {
        return { success: false, error: 'animated-explainer script 需要 context.proposal' }
      }
      const { system, user } = buildScriptPrompt(plan, stage.options || {})
      try {
        const script = await callDefaultLlm(aiGenerator, system, user)
        return { success: true, output: script }
      } catch (error) {
        return { success: false, error: 'script 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(EXPLAINER_STAGE_TYPES.SCRIPT)

  // ----------------------------------------------------------
  // SCENES - 旁白文案 → 场景数组 [{ prompt, text, duration }]
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    EXPLAINER_STAGE_TYPES.SCENES,
    async ({ stage, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const script = typeof context.script === 'string' ? context.script.trim() : ''
      if (!script) {
        return { success: false, error: 'animated-explainer scenes 需要 context.script' }
      }
      const { system, user } = buildScenesPrompt(script, stage.options || {})
      try {
        const raw = await callDefaultLlm(aiGenerator, system, user)
        let scenes = normalizeScenes(parseScenesJson(raw), script)
        if (!scenes) {
          scenes = fallbackScenes(script, stage.options || {})
        }
        if (!scenes) {
          const snippet = raw.length > 120 ? raw.slice(0, 120) + '…' : raw
          return {
            success: false,
            error: 'scenes 阶段无法解析场景：' + snippet,
          }
        }
        return { success: true, output: scenes }
      } catch (error) {
        return { success: false, error: 'scenes 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(EXPLAINER_STAGE_TYPES.SCENES)

  // ----------------------------------------------------------
  // GENERATE_ASSETS - 复用 story2video_generate_assets（图片+TTS，含内容政策重试）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    EXPLAINER_STAGE_TYPES.GENERATE_ASSETS,
    async ({ runId, stage, params, context }) => {
      const scenes = Array.isArray(context.scenes) ? context.scenes : []
      if (scenes.length === 0) {
        return { success: false, error: 'animated-explainer generate_assets 需要 context.scenes' }
      }
      const optimizedPrompts = scenes.map((scene) => ({
        optimized_prompt: scene.prompt || '',
        prompt: scene.prompt || '',
      }))
      if (optimizedPrompts.some(item => !item.prompt)) {
        return { success: false, error: 'animated-explainer 场景缺少画面提示词（prompt）' }
      }
      const adaptedContext = {
        ...context,
        optimize: optimizedPrompts,
        split: scenes,
      }
      // 未显式指定图片/TTS provider 时，自动解析模型设置中的默认 provider，
      // 避免资源生成落到本地占位/降级路径。
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
        stage: { name: 'assets', type: 'story2video_generate_assets', options: innerOptions },
        params,
        context: adaptedContext,
      })
      if (!inner.success) {
        log.warn('ExplainerStages', 'generate_assets reuse failed: ' + inner.error)
      }
      return inner
    },
  )
  registered.push(EXPLAINER_STAGE_TYPES.GENERATE_ASSETS)

  // ----------------------------------------------------------
  // EDITING - 资源清单校验/透传（真实动效/转场由 compose 引擎执行）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    EXPLAINER_STAGE_TYPES.EDITING,
    async ({ context }) => {
      const manifest = context.assets
      const scenes = manifest && Array.isArray(manifest.scenes) ? manifest.scenes : []
      if (scenes.length === 0) {
        return { success: false, error: 'animated-explainer editing 需要有效的资源清单（context.assets）' }
      }
      return { success: true, output: manifest }
    },
  )
  registered.push(EXPLAINER_STAGE_TYPES.EDITING)

  return { success: true, registered }
}

module.exports = {
  EXPLAINER_STAGE_TYPES,
  buildResearchPrompt,
  buildProposalPrompt,
  buildScriptPrompt,
  buildScenesPrompt,
  parseScenesJson,
  normalizeScenes,
  fallbackScenes,
  registerExplainerStages,
}
