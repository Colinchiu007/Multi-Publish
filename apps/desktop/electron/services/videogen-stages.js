// @ts-check
/**
 * videogen-stages - animation / avatar-spokesperson / character-animation / hybrid 流水线的共享阶段执行器
 *
 * 四条流水线共用同一模式：LLM 规划（概念/脚本/分镜）→ 视频生成（配置的视频 provider，未配置则 fail closed
 * 并给出明确引导）→ FFmpeg 合成。
 *
 * 阶段类型：
 *   - videogen_concept:      主题 → LLM 创意概念/角色设定（animation / character-animation）
 *   - videogen_avatar:       校验数字人选择并生成口播文案（avatar-spokesperson）
 *   - videogen_script:       LLM 口播/解说文案（avatar-spokesperson / hybrid）
 *   - videogen_storyboard:   概念 → LLM 分镜场景数组（animation / character-animation / hybrid）
 *   - videogen_generate:     每场景调用视频 provider 的 generateVideo + 轮询 getVideoStatus + 下载
 *   - videogen_merge:        FFmpeg 拼接/合成场景视频
 *   - videogen_render:       输出最终视频（校验产物）
 *
 * 注册方式：container.setup.js 中调用 registerVideoGenStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg } = require('./media-tool-paths')

const VIDEOGEN_STAGE_TYPES = {
  CONCEPT: 'videogen_concept',
  AVATAR: 'videogen_avatar',
  SCRIPT: 'videogen_script',
  STORYBOARD: 'videogen_storyboard',
  GENERATE: 'videogen_generate',
  MERGE: 'videogen_merge',
  RENDER: 'videogen_render',
}

const MAX_SCENES = 12
const DEFAULT_SCENE_SECONDS = 5
const DEFAULT_NUM_FRAMES = 121

function getAiGenerator (pipelineEngine) {
  return pipelineEngine.aiGenerator ||
    (pipelineEngine.container && typeof pipelineEngine.container.get === 'function'
      ? pipelineEngine.container.get('aiGenerator')
      : null)
}

function getLlmConfig (aiGenerator) {
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

function getVideoProviderConfig (aiGenerator) {
  const manager = aiGenerator && aiGenerator._modelProviderManager
  const provider = manager && typeof manager.getDefault === 'function'
    ? manager.getDefault('video')
    : null
  if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) return null
  const model = Array.isArray(provider.models)
    ? provider.models.find(item => typeof item === 'string' && item.trim())
    : null
  return { providerId: provider.id.trim(), model: model || '' }
}

async function callDefaultLlm (aiGenerator, systemPrompt, userContent, maxTokens) {
  if (!aiGenerator || typeof aiGenerator.generateWithDefault !== 'function') {
    throw new Error('默认 LLM 不可用，请先完成模型设置')
  }
  if (!getLlmConfig(aiGenerator)) {
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

function parseJsonArray (text) {
  const source = String(text || '').trim()
  if (!source) return null
  try {
    const parsed = JSON.parse(source)
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const arr = Object.values(parsed).find(Array.isArray)
      if (arr) return arr
    }
  } catch { /* fallthrough */ }
  const start = source.indexOf('[')
  const end = source.lastIndexOf(']')
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(source.slice(start, end + 1))
      if (Array.isArray(parsed)) return parsed
    } catch { /* fallthrough */ }
  }
  return null
}


/** 场景时长（秒）→ 满足 8n+1 规则的帧数档位（24fps 近似），让 storyboard duration 真正作用于生成参数 */
function pickFrameCountForDuration (durationSeconds) {
  const d = Number(durationSeconds)
  if (!Number.isFinite(d) || d <= 0) return DEFAULT_NUM_FRAMES
  if (d <= 5) return 121
  if (d <= 8) return 201 // 8*25+1 ≈ 8.4s@24fps
  if (d <= 10) return 241 // 8*30+1 ≈ 10s@24fps
  return 441
}
function buildConceptPrompt (topic, kind) {
  const kindLabel = { animation: '动画视频', 'character-animation': '角色动画' }[kind] || kind
  return {
    system: `你是资深${kindLabel}策划。根据主题输出创意概念：角色设定（2-4 个要点）、视觉风格（一句）、故事钩子（一句）。只输出 JSON 对象 {"role_design": "...", "visual_style": "...", "hook": "..."}，不要多余文字。`,
    user: '主题：' + String(topic || '').trim(),
  }
}

function buildStoryboardPrompt (concept, kind) {
  const style = typeof concept === 'string' ? concept : (concept && concept.visual_style) || '动态视觉'
  return {
    system: `你是分镜导演。把创意概念拆分为 ${MAX_SCENES} 个以内视频场景。输出严格 JSON 数组，每个元素 {"prompt": "画面提示词（主体/动作/构图/光线/风格，供视频生成模型直接使用）", "text": "解说文案", "duration": 4-8 秒整数}。只输出 JSON，不要其他文字。`,
    user: '创意概念与视觉风格：' + String(style || concept || '').slice(0, 2000),
  }
}

function buildScriptPrompt (topic, kind) {
  const kindLabel = { 'avatar-spokesperson': '数字人口播', hybrid: '混合视频' }[kind] || kind
  return {
    system: `你是${kindLabel}文案作者。根据主题撰写一段 100-200 字的口播文案，口语化、逻辑连贯、适合配音。只输出文案本身。`,
    user: '主题：' + String(topic || '').trim(),
  }
}

function runTool (binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 64 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 1200)))
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  return path.join(os.tmpdir(), 'story2video', 'videogen', String(runId || 'run'))
}

/**
 * 从 context 中按候选键取第一个非空值。
 * 不同 videogen 流水线把前序阶段输出写入各自的阶段名
 * （animation→concept/storyboard；character-animation→character_design/rigging；
 *  hybrid→plan/generate；avatar→avatar_select/script），统一解析避免读取固定键。
 */
function firstContextValue (context, keys) {
  if (!context || typeof context !== 'object') return undefined
  for (const key of keys) {
    const value = context[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function resolveVideogenConcept (context) {
  const value = firstContextValue(context, ['concept', 'character_design', 'plan', 'avatar_select', 'script'])
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    const extracted = value.concept || value.script || value.topic
    if (typeof extracted === 'string') return extracted.trim()
    // 概念可能是对象（如 { visual_style, hook }），storyboard 提示词构建兼容对象
    if (extracted && typeof extracted === 'object') return extracted
    return ''
  }
  return ''
}

function resolveVideogenScenes (context) {
  const value = firstContextValue(context, ['storyboard', 'rigging', 'generate', 'scenes', 'plan'])
  return Array.isArray(value) ? value : null
}

async function downloadToFile (url, dest) {
  const http = require('http')
  const https = require('https')
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith('https:') ? https : http
    const file = fs.createWriteStream(dest)
    const request = lib.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        downloadToFile(response.headers.location, dest).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error('视频下载失败，HTTP ' + response.statusCode))
        return
      }
      response.pipe(file)
      file.on('finish', () => file.close(() => resolve(dest)))
    })
    request.on('error', (error) => { fs.unlinkSync(dest); reject(error) })
  })
}

/**
 * 注册 video-gen 类流水线的共享阶段执行器
 * @param {object} pipelineEngine
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerVideoGenStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }
  const registered = []
  const log = pipelineEngine.log

  // CONCEPT - 主题 → 创意概念/角色设定
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.CONCEPT,
    async ({ stage, params }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      const topic = typeof params.text === 'string' ? params.text.trim() : ''
      if (!topic) return { success: false, error: '该流水线需要非空主题（params.text）' }
      const { system, user } = buildConceptPrompt(topic, stage.kind || 'animation')
      try {
        const raw = await callDefaultLlm(aiGenerator, system, user)
        const parsed = parseJsonArray(raw)
        const concept = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : raw
        return { success: true, output: { concept, topic } }
      } catch (error) {
        return { success: false, error: 'concept 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.CONCEPT)

  // AVATAR - 数字人选择校验 + 口播文案（avatar-spokesperson）
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.AVATAR,
    async ({ stage, params, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      const topic = typeof params.text === 'string' ? params.text.trim() : ''
      if (!topic) return { success: false, error: 'avatar-spokesperson 需要非空主题（params.text）' }
      const avatarId = params.avatarId || stage.options?.avatarId || ''
      const { system, user } = buildScriptPrompt(topic, 'avatar-spokesperson')
      try {
        const script = await callDefaultLlm(aiGenerator, system, user)
        return { success: true, output: { script, avatarId, topic } }
      } catch (error) {
        return { success: false, error: 'avatar 阶段失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.AVATAR)

  // SCRIPT - 文案（hybrid）
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.SCRIPT,
    async ({ stage, params, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      const topic = typeof params.text === 'string' ? params.text.trim() : ''
      if (!topic) return { success: false, error: '该流水线需要非空主题（params.text）' }
      const { system, user } = buildScriptPrompt(topic, 'hybrid')
      try {
        const script = await callDefaultLlm(aiGenerator, system, user)
        return { success: true, output: script }
      } catch (error) {
        return { success: false, error: 'script 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.SCRIPT)

  // STORYBOARD - 概念 → 分镜场景数组
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.STORYBOARD,
    async ({ stage, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      const concept = resolveVideogenConcept(context)
      if (!concept) return { success: false, error: '该流水线 storyboard 需要前序概念或文案（context.concept/character_design/plan/script）' }
      const { system, user } = buildStoryboardPrompt(concept, stage.kind || 'animation')
      try {
        const raw = await callDefaultLlm(aiGenerator, system, user)
        const scenes = parseJsonArray(raw)
        if (!Array.isArray(scenes) || scenes.length === 0) {
          return { success: false, error: 'storyboard 无法解析场景 JSON' }
        }
        const normalized = scenes.slice(0, MAX_SCENES).map((s, i) => ({
          index: i,
          prompt: typeof s === 'string' ? s : (s.prompt || s.text || ''),
          text: typeof s === 'string' ? '' : (s.text || ''),
          duration: Number(s.duration) >= 4 ? Number(s.duration) : DEFAULT_SCENE_SECONDS,
        }))
        return { success: true, output: normalized }
      } catch (error) {
        return { success: false, error: 'storyboard 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.STORYBOARD)

  // GENERATE - 视频生成（provider 门控）
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.GENERATE,
    async ({ runId, stage, params, context }) => {
      const scenes = resolveVideogenScenes(context) || []
      const prompts = scenes.length > 0 ? scenes.map(s => s.prompt) : [params.text || '']
      if (!prompts[0]) return { success: false, error: '该流水线 generate 需要场景提示词或主题' }
      const aiGenerator = getAiGenerator(pipelineEngine)
      const manager = aiGenerator && aiGenerator._modelProviderManager
      const videoProvider = getVideoProviderConfig(aiGenerator)
      if (!videoProvider || !manager || typeof manager.callAdapter !== 'function') {
        return {
          success: false,
          error: '该流水线需要视频生成模型（如 Agnes Video / CogVideo / Runway / Kling / Veo 等），请在设置中配置并启用视频生成模型后重试',
          errorCode: 'VIDEO_MODEL_NOT_CONFIGURED',
        }
      }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      const videos = []
      for (let i = 0; i < prompts.length; i++) {
        try {
          // 统一参数契约：adapter 层驼峰/下划线两种命名并存（agnes 读 numFrames/frameRate，
          // ltx 读 num_frames/frame_rate），双写保证所有 adapter 生效；
          // 显式 stageOptions 优先，否则按场景时长映射帧数（storyboard duration 真正生效）
          const width = Number(stage.options?.width) > 0 ? Number(stage.options.width) : 1152
          const height = Number(stage.options?.height) > 0 ? Number(stage.options.height) : 768
          const numFrames = Number(stage.options?.numFrames) > 0
            ? Number(stage.options.numFrames)
            : pickFrameCountForDuration(scenes[i] && scenes[i].duration)
          const frameRate = Number(stage.options?.frameRate) > 0 ? Number(stage.options.frameRate) : 24
          const submit = await manager.callAdapter(videoProvider.providerId, 'generateVideo', {
            prompt: prompts[i],
            model: videoProvider.model || undefined,
            width,
            height,
            numFrames,
            frameRate,
            num_frames: numFrames,
            frame_rate: frameRate,
          })
          // callAdapter 失败时返回 { code: -1, message }（不透传会掩盖真实 provider 错误，
          // 如 MiniMax 特殊套餐的 Missing task_id / 401），必须原样上报供排查。
          if (submit && submit.code !== 0) {
            videos.push({ index: i, success: false, error: submit.message || ('视频生成调用失败（provider: ' + videoProvider.providerId + '）') })
            continue
          }
          const data = submit && submit.data
          const taskId = data && (data.taskId || data.videoId)
          if (!taskId) {
            videos.push({
              index: i,
              success: false,
              error: '视频生成未返回任务 ID' + (submit && submit.message ? '：' + submit.message : ''),
            })
            continue
          }
          // 轮询任务状态（最多 10 分钟）
          const pollDeadline = Date.now() + 10 * 60 * 1000
          let videoUrl = null
          while (Date.now() < pollDeadline) {
            await new Promise(r => setTimeout(r, 10000))
            const status = await manager.callAdapter(videoProvider.providerId, 'getVideoStatus', { videoId: taskId, taskId })
            const url = status && (status.videoUrl || status.url || (status.data && (status.data.videoUrl || status.data.url)))
            if (url) { videoUrl = url; break }
            const state = status && (status.status || (status.data && status.data.status)) || ''
            if (['failed', 'error', 'cancelled'].includes(String(state).toLowerCase())) break
          }
          if (!videoUrl) {
            videos.push({ index: i, success: false, error: '视频生成超时或失败（provider: ' + videoProvider.providerId + '）' })
            continue
          }
          const dest = path.join(runDir, 'scene_' + String(i).padStart(3, '0') + '.mp4')
          await downloadToFile(videoUrl, dest)
          videos.push({ index: i, success: true, path: dest })
          log.info('VideoGenStages', 'scene ' + i + ' video generated: ' + dest)
        } catch (error) {
          videos.push({ index: i, success: false, error: (error && error.message ? error.message : String(error)) })
        }
      }
      const ok = videos.filter(v => v.success)
      if (ok.length === 0) {
        return { success: false, error: '该流水线视频生成全部失败：' + videos.map(v => v.error).join('；') }
      }
      return { success: true, output: { videos: ok, scenes } }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.GENERATE)

  // MERGE - FFmpeg 拼接场景视频
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.MERGE,
    async ({ runId, context }) => {
      // 生成阶段的输出按 stage.name 写入 context（animation/character-animation=animate，
      // avatar-spokesperson=generate，hybrid=merge），merge 必须兼容全部候选键
      const videos = (['generate', 'merge', 'animate']
        .map(key => context[key] && context[key].videos)
        .find(Array.isArray)) || []
      if (videos.length === 0) return { success: false, error: '该流水线 merge 需要 context.generate/merge.videos' }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'ffmpeg 不可用，无法拼接视频' }
      const runDir = getRunDir(runId)
      fs.mkdirSync(runDir, { recursive: true })
      try {
        const concatFile = path.join(runDir, 'concat-list.txt')
        const lines = videos.map(v => "file '" + String(v.path).replace(/'/g, "'\\''") + "'")
        fs.writeFileSync(concatFile, lines.join('\n'), 'utf8')
        const merged = path.join(runDir, 'merged.mp4')
        await runTool(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c', 'copy', merged])
        return { success: true, output: { videoPath: merged } }
      } catch (error) {
        return { success: false, error: 'merge 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.MERGE)

  // RENDER - 最终产物校验
  pipelineEngine.registerStageExecutor(
    VIDEOGEN_STAGE_TYPES.RENDER,
    async ({ context }) => {
      const merged = context.merge
      const videoPath = merged && (merged.videoPath || (merged.data && merged.data.videoPath))
      if (!videoPath || !fs.existsSync(videoPath)) {
        return { success: false, error: '该流水线 render 未找到合成产物（context.merge.videoPath）' }
      }
      return { success: true, output: { videoPath } }
    },
  )
  registered.push(VIDEOGEN_STAGE_TYPES.RENDER)

  return { success: true, registered }
}

module.exports = {
  VIDEOGEN_STAGE_TYPES,
  buildConceptPrompt,
  buildStoryboardPrompt,
  buildScriptPrompt,
  parseJsonArray,
  registerVideoGenStages,
}
