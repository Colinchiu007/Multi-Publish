// @ts-check
/**
 * story2video-stages - Story2Video-compose 流水线的自定义阶段执行器
 *
 * 注册与 story2video-compose 流水线配套的自定义 STAGE_TYPES：
 *   - story2video_optimize: 逐场景视觉提示词统一走 prompt-engine（风格检测/改写/输出校验）
 *   - story2video_generate_assets: 并行生成图片 + TTS 音频
 *
 * 设计意图：
 *   split / compose / publish 阶段使用 StageExecutor 内置类型。
 *   optimize 统一调用 prompt-engine（PromptBridge / 8013），完成风格检测、改写与输出校验；
 *   generate_assets 需要并行编排（图片+TTS 同时生成）。
 *
 * 注册方式：
 *   在 bootstrap.js 或 container.setup.js 中调用 registerStory2VideoStages(pipelineEngine)
 */

'use strict';

const { execFile } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const { enrichHistoryScenes, passthroughScenes } = require('./story2video-domain');
const { alignScenes } = require('./subtitle-align-service')
const {
  getAllowedMediaRoots,
  resolveReadableMediaFile,
  writeDataImage,
} = require('./story2video-paths');
const {
  MAX_IMAGE_GENERATION_ATTEMPTS,
  runContentPolicyImageRetry,
} = require('./story2video-image-retry');
const { ERROR_CODES } = require('./adapters/_base/provider-error');
const modelCallScheduler = require('./model-call-scheduler');
const {
  buildPromptEngineOptimizeRequest,
  extractOptimizedPrompt,
} = require('./prompt-engine-contract');
const {
  extractOptimizedVideoPrompt,
} = require('./video-prompt-engine-contract');
const {
  buildSceneContextResult,
  CONTEXT_KEY_WHITELIST,
  buildPromptEngineSceneContext,
  mergeNegativePrompt,
} = require('./story-context-engine');

/**
 * Story2Video-compose 专用的阶段类型
 */
const STORY2VIDEO_STAGE_TYPES = {
  DOMAIN_ENRICH: 'story2video_domain_enrich',
  SCENE_CONTEXT: 'story2video_scene_context',
  OPTIMIZE: 'story2video_optimize',
  SELECT_VIDEO_SCENES: 'story2video_select_video_scenes',
  GENERATE_ASSETS: 'story2video_generate_assets',
  FINALIZE_ASSETS: 'story2video_finalize_assets',
};

const MAX_ASSET_CONCURRENCY = 8;
// 视频下载大小上限（与 story2video-paths MEDIA_RULES.video 一致：512MB）
const MAX_VIDEO_FILE_BYTES = 512 * 1024 * 1024;

function normalizeAssetConcurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.min(MAX_ASSET_CONCURRENCY, Math.max(1, Math.floor(number)));
}

// ----------------------------------------------------------
// 视频+图片轮播混合模式：场景选择（select_video_scenes）辅助
// ----------------------------------------------------------

const VIDEO_MODES = new Set(['off', 'fixed', 'ai-judged'])

function getAiGenerator (pipelineEngine) {
  if (pipelineEngine && pipelineEngine.aiGenerator) return pipelineEngine.aiGenerator
  if (pipelineEngine && pipelineEngine.container && typeof pipelineEngine.container.get === 'function') {
    try {
      return pipelineEngine.container.get('aiGenerator')
    } catch (_) { /* 未注册 */ }
  }
  return null
}

/**
 * 提示词本地语言翻译（2026-08-12）：非 en 界面为历史记录「画面提示词」旁只读翻译生成。
 * fail-open：LLM 不可用/单场景失败 → 对应项 translation=null，不阻塞流水线。
 */
async function translatePromptsForLocale (aiGenerator, prompts, uiLocale, log) {
  const items = (Array.isArray(prompts) ? prompts : []).map((prompt, index) => ({
    index,
    prompt: typeof prompt === 'string' ? prompt : '',
    translation: null,
  }))
  if (!aiGenerator || typeof aiGenerator.generateWithDefault !== 'function') {
    if (log && typeof log.warn === 'function') {
      log.warn('Story2VideoStages', 'prompt translation skipped: default LLM unavailable (uiLocale=' + uiLocale + ')')
    }
    return items
  }
  const targetLanguage = String(uiLocale || '').trim() || 'zh'
  const system = '你是专业译者。把用户给出的英文图片提示词翻译成' +
    (targetLanguage === 'zh' ? '简体中文' : targetLanguage) +
    '。只输出严格 JSON 对象，键为序号字符串，值为译文，例如 {"0":"译文一","1":"译文二"}，不要输出其他任何文字。'
  const batchSize = 3
  for (let offset = 0; offset < items.length; offset += batchSize) {
    const slice = items.slice(offset, offset + batchSize)
    const joined = slice.map((item) => '"' + item.index + '": ' + JSON.stringify(item.prompt)).join(',\n')
    if (!joined.trim()) continue
    try {
      const result = await aiGenerator.generateWithDefault('llm', {
        temperature: 0.1,
        max_tokens: Math.min(4000, 400 + joined.length),
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: '{\n' + joined + '\n}' },
        ],
      })
      const raw = result && typeof result.content === 'string' ? result.content.trim() : ''
      // 优先按 index 对齐的 JSON 解析；失败时回退逐行（编号前缀）映射
      let map = null
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = parsed
      } catch (_) { /* fallthrough */ }
      if (map) {
        for (const item of slice) {
          const translated = map[String(item.index)]
          if (typeof translated === 'string' && translated.trim() && translated.trim() !== item.prompt) {
            item.translation = translated.trim().slice(0, 2000)
          }
        }
      } else {
        const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        for (let i = 0; i < slice.length && i < lines.length; i++) {
          const line = lines[i].replace(/^\d+\s*[.)、]\s*/, '').trim()
          if (line && line !== slice[i].prompt) slice[i].translation = line.slice(0, 2000)
        }
      }
    } catch (error) {
      if (log && typeof log.warn === 'function') {
        log.warn('Story2VideoStages', 'prompt translation batch failed: ' + (error && error.message ? error.message : String(error)))
      }
    }
  }
  return items
}

/**
 * 解析视频生成器：显式 provider/model 优先，否则取模型管理器默认 video 能力。
 * 返回 null 表示未配置（调用方 fail closed 引导设置）。
 */
function resolveVideoGeneratorConfig (pipelineEngine, explicit) {
  if (explicit && typeof explicit === 'object') {
    const providerId = typeof explicit.provider === 'string' ? explicit.provider.trim() : ''
    if (providerId) {
      return {
        providerId,
        model: typeof explicit.model === 'string' ? explicit.model.trim() : '',
      }
    }
  }
  const aiGenerator = getAiGenerator(pipelineEngine)
  const manager = aiGenerator && aiGenerator._modelProviderManager
  const provider = manager && typeof manager.getDefault === 'function' ? manager.getDefault('video') : null
  if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) return null
  const models = Array.isArray(provider.models)
    ? provider.models.filter(item => typeof item === 'string' && item.trim())
    : []
  // 多模态 provider：优先取 capability_models.video（能力默认模型），models 首项可能是 image/llm 模型
  // （与前端 getS2VDefaultVideoModel 同源，2026-08-11 W1）。
  let model
  if (provider.category === 'multimodal' && provider.capability_models && typeof provider.capability_models.video === 'string') {
    const videoModel = provider.capability_models.video
    model = models.includes(videoModel) ? videoModel : (videoModel || models[0] || '')
  } else {
    model = models[0] || ''
  }
  return { providerId: provider.id.trim(), model: model ? model.trim() : '' }
}

/** 场景估算时长：sentence.duration 优先，其次 split.targetSeconds，兜底默认 6s。 */
function estimateSceneSeconds (scene, defaultSeconds) {
  if (scene && typeof scene === 'object') {
    const candidate = scene.duration ?? scene.targetSeconds ?? scene.estimatedSeconds
    const value = Number(candidate)
    if (Number.isFinite(value) && value > 0) return value
  }
  const fallback = Number(defaultSeconds)
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 6
}

/**
 * fixed 模式：按场景顺序累计估算时长，标记累计占比首次达到 fixedRatio% 的场景。
 * 至少标记 1 个场景（fixedRatio > 0 且场景数 > 0）。
 */
function pickFixedVideoScenes (scenes, fixedRatio) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return { selected: [], ratio: 0 }
  }
  const total = scenes.reduce((sum, scene) => sum + scene.seconds, 0)
  if (total <= 0) return { selected: [], ratio: 0 }
  const target = total * (Number(fixedRatio) / 100)
  const selected = []
  let acc = 0
  for (const scene of scenes) {
    if (selected.length === 0 || acc < target) {
      selected.push(scene.index)
      acc += scene.seconds
    } else {
      break
    }
  }
  if (selected.length === 0) selected.push(scenes[0].index)
  const selectedSeconds = scenes
    .filter(scene => selected.includes(scene.index))
    .reduce((sum, scene) => sum + scene.seconds, 0)
  return { selected, ratio: Math.round((selectedSeconds / total) * 1000) / 10 }
}

function buildVideoSelectionPrompt (scenes, config) {
  const items = scenes.map(scene => ({
    index: scene.index,
    text: String(scene.text || '').slice(0, 200),
    prompt: String(scene.prompt || '').slice(0, 200),
    seconds: Math.round(scene.seconds * 10) / 10,
  }))
  const ratioHint = config.mode === 'ai-judged'
    ? '所选场景估算总时长占比必须控制在 ' + config.minRatio + '%-' + config.maxRatio + '% 之间，场景数不超过 ' + config.maxScenes + ' 个。'
    : ''
  return {
    system: '你是短视频导演。根据每个场景的文案与画面提示词，判断哪些场景「动态化」价值最高（动作/转场/情绪高潮/视觉冲击力强），适合用 AI 生成视频片段（成本高），其余场景用静态图片轮播（成本低）。' +
      '只输出严格 JSON 数组，每个元素 {"index": 场景序号, "video": true或false, "excitement": 1-10整数, "reason": "一句话理由"}。' +
      ratioHint + '只输出 JSON，不要其他文字。',
    user: JSON.stringify(items),
  }
}

/** 严格解析 LLM 返回：必须是数组，逐条校验 index 合法；非法即返回 null（fail closed）。 */
function parseVideoSelection (raw, sceneCount) {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const source = raw.trim()
  let parsed = null
  try {
    parsed = JSON.parse(source)
  } catch (_) { /* fallthrough */ }
  if (!parsed && source.includes('[')) {
    const start = source.indexOf('[')
    const end = source.lastIndexOf(']')
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(source.slice(start, end + 1))
      } catch (_) { /* fallthrough */ }
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null
  const seen = new Set()
  const result = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const index = Number(item.index)
    if (!Number.isInteger(index) || index < 0 || index >= sceneCount || seen.has(index)) return null
    seen.add(index)
    const excitement = Number(item.excitement)
    result.push({
      index,
      video: item.video === true || item.video === 'true' || item.video === 1,
      excitement: Number.isFinite(excitement) ? Math.min(10, Math.max(1, Math.round(excitement))) : 1,
      reason: typeof item.reason === 'string' ? item.reason.slice(0, 120) : '',
    })
  }
  return result
}

/**
 * ai-judged 钳制：把选择结果按 excitement 排序后收敛到 [minRatio, maxRatio] 且 ≤ maxScenes。
 * - 超 maxRatio：从低 excitement 剔除；
 * - 不足 minRatio：按高 excitement 补入未选场景（受 maxScenes 与 maxRatio 约束）；
 * - 全部剔除后仍不足 minRatio 时，保留最高 excitement 的单场景（至少 1 个）。
 */
function clampVideoSelection (scenes, entries, config) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    return { selected: [], ratio: 0 }
  }
  const total = scenes.reduce((sum, scene) => sum + scene.seconds, 0)
  if (total <= 0) return { selected: [], ratio: 0 }
  const byIndex = new Map(scenes.map(scene => [scene.index, scene]))
  const desired = new Set(entries.filter(entry => entry.video).map(entry => entry.index))
  const excitementOf = (index) => {
    const entry = entries.find(e => e.index === index)
    return entry ? entry.excitement : 0
  }
  const ratioOf = (indexes) => {
    const seconds = indexes.reduce((sum, index) => sum + (byIndex.get(index)?.seconds || 0), 0)
    return { seconds, ratio: Math.round((seconds / total) * 1000) / 10 }
  }
  let selected = [...desired].sort((a, b) => excitementOf(b) - excitementOf(a))
  let { ratio } = ratioOf(selected)
  const minRatio = Number(config.minRatio)
  const maxRatio = Number(config.maxRatio)
  const maxScenes = Number(config.maxScenes)
  // 超上限：从低 excitement 剔除
  while (selected.length > 0 && (ratio > maxRatio || selected.length > maxScenes)) {
    selected.pop() // 已按 excitement 降序，末尾最低
    ratio = ratioOf(selected).ratio
  }
  // 不足下限：按高 excitement 补入未选场景
  if (ratio < minRatio && selected.length < maxScenes) {
    const candidates = scenes
      .map(scene => scene.index)
      .filter(index => !selected.includes(index))
      .sort((a, b) => excitementOf(b) - excitementOf(a))
    for (const index of candidates) {
      if (selected.length >= maxScenes) break
      const next = ratioOf([...selected, index])
      if (next.ratio > maxRatio) continue
      selected.push(index)
      ratio = next.ratio
    }
  }
  // 至少保留最高 excitement 的一个场景（若用户显式开启混合模式且存在场景）
  if (selected.length === 0 && scenes.length > 0) {
    const top = [...scenes].sort((a, b) => excitementOf(b.index) - excitementOf(a.index))[0]
    selected = [top.index]
    ratio = ratioOf(selected).ratio
  }
  return { selected: selected.slice(0, maxScenes), ratio }
}

/** 场景估算时长 → 视频生成帧数档位（24fps 近似，满足 8n+1 规则的保守取值）。 */
function pickFrameCountForSceneDuration (durationSeconds) {
  const d = Number(durationSeconds)
  if (!Number.isFinite(d) || d <= 0) return 121
  if (d <= 5) return 121
  if (d <= 8) return 201
  if (d <= 10) return 241
  return 441
}

function parseOutputSize (value) {
  const size = String(value || '').trim()
  const match = /^(\d{2,4})x(\d{2,4})$/.exec(size)
  if (match) return { width: Number(match[1]), height: Number(match[2]) }
  return null
}

/** 视频生成分辨率：优先输出 size（如 720x1280），否则按宽高比映射默认档位。 */
function resolveVideoSize (params, stage) {
  const fromSize = parseOutputSize(params.resolution || params.size || (stage && stage.options && stage.options.resolution))
  if (fromSize) return fromSize
  const ratio = params.aspectRatio || (stage && stage.options && stage.options.aspectRatio) || '9:16'
  const map = {
    '16:9': [1280, 720],
    '9:16': [720, 1280],
    '1:1': [1024, 1024],
    '4:3': [1280, 960],
    '3:4': [960, 1280],
  }
  const pair = map[ratio] || map['9:16']
  // 视频生成尺寸长边封顶 1280（2026-08-11 I7）：4K 输出也按 1280 请求视频，避免昂贵/易失败的超大生成
  let width = pair[0]
  let height = pair[1]
  const longEdge = Math.max(width, height)
  if (longEdge > 1280) {
    const scale = 1280 / longEdge
    width = Math.max(160, Math.round(width * scale))
    height = Math.max(160, Math.round(height * scale))
  }
  return { width, height }
}

/**
 * 下载视频到本地。守卫（2026-08-11 W5）：仅 http/https、重定向 ≤5 跳、流式写入按字节上限截断。
 * @param {string} url
 * @param {string} dest
 * @param {object} [options] - { maxBytes?, maxRedirects? }
 */
function downloadVideoToFile (url, dest, options = {}) {
  const maxBytes = Number.isFinite(Number(options.maxBytes)) && Number(options.maxBytes) > 0 ? Number(options.maxBytes) : Infinity
  const maxRedirects = Number.isFinite(Number(options.maxRedirects)) ? Number(options.maxRedirects) : 5
  const follow = (currentUrl, redirectsLeft) => new Promise((resolve, reject) => {
    if (!/^https?:/i.test(currentUrl)) {
      reject(new Error('视频下载仅允许 http/https 协议'))
      return
    }
    const protocol = /^https:/i.test(currentUrl) ? https : http
    const request = protocol.get(currentUrl, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume()
        if (redirectsLeft <= 0) {
          reject(new Error('视频下载重定向次数超过上限'))
          return
        }
        follow(String(response.headers.location), redirectsLeft - 1).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error('视频下载失败，HTTP ' + response.statusCode))
        return
      }
      let written = 0
      let aborted = false
      const stream = fs.createWriteStream(dest)
      response.on('data', (chunk) => {
        written += chunk.length
        if (written > maxBytes) {
          aborted = true
          response.destroy()
          stream.destroy()
          fs.unlink(dest, () => {})
          reject(new Error('视频下载超过大小上限'))
          return
        }
        stream.write(chunk)
      })
      response.on('end', () => {
        if (aborted) return
        stream.end(() => stream.close(() => resolve(dest)))
      })
      stream.on('error', (error) => {
        fs.unlink(dest, () => {})
        reject(error)
      })
    })
    request.on('error', reject)
  })
  return follow(url, maxRedirects)
}

/**
 * 单场景 AI 视频生成：generateVideo 提交 → getVideoStatus 轮询（≤10 分钟）→ 下载落盘。
 * 与 videogen-stages GENERATE 阶段同一契约（复用 provider 适配器能力）。
 */
async function generateSceneVideo ({ manager, providerId, model, prompt, index, seconds, size, fps, runDir, pollIntervalMs }) {
  const frameRate = Number(fps) > 0 ? Number(fps) : 24
  const pollInterval = Number.isFinite(Number(pollIntervalMs)) && Number(pollIntervalMs) > 0 ? Number(pollIntervalMs) : 10000
  const numFrames = pickFrameCountForSceneDuration(seconds)
  const submit = await manager.callAdapter(providerId, 'generateVideo', {
    prompt,
    model: model || undefined,
    width: size.width,
    height: size.height,
    numFrames,
    frameRate,
    num_frames: numFrames,
    frame_rate: frameRate,
  })
  if (submit && submit.code !== 0) {
    return { success: false, error: (submit && submit.message) || ('视频生成调用失败（provider: ' + providerId + '）') }
  }
  const data = submit && submit.data
  const taskId = data && (data.taskId || data.videoId)
  if (!taskId) {
    return { success: false, error: '视频生成未返回任务 ID' + (submit && submit.message ? '：' + submit.message : '') }
  }
  const pollDeadline = Date.now() + 10 * 60 * 1000
  let videoUrl = null
  let pollError = ''
  while (Date.now() < pollDeadline) {
    await sleep(pollInterval)
    const status = await manager.callAdapter(providerId, 'getVideoStatus', { videoId: taskId, taskId })
    // provider 显式报错（code<0 / success=false，无 URL）视为终止态，避免空转整轮 10 分钟（2026-08-11 W3）
    if (status && (Number(status.code) < 0 || status.success === false)) {
      pollError = (status && status.message) || '视频生成任务失败（provider: ' + providerId + '）'
      break
    }
    const url = status && (status.videoUrl || status.url || (status.data && (status.data.videoUrl || status.data.url)))
    if (url) { videoUrl = url; break }
    const state = status && (status.status || (status.data && status.data.status)) || ''
    if (['failed', 'error', 'cancelled'].includes(String(state).toLowerCase())) {
      pollError = '视频生成任务状态为 ' + String(state) + '（provider: ' + providerId + '）'
      break
    }
  }
  if (!videoUrl) {
    return { success: false, error: pollError || '视频生成超时或失败（provider: ' + providerId + '）' }
  }
  fs.mkdirSync(runDir, { recursive: true })
  const dest = path.join(runDir, 'scene_video_' + String(index).padStart(3, '0') + '.mp4')
  await downloadVideoToFile(videoUrl, dest, { maxBytes: MAX_VIDEO_FILE_BYTES })
  // 下载后校验：非空文件 + ffprobe 可解码，避免 HTML 错误页/截断文件伪装 mp4 拖到 compose 才暴露（2026-08-11 W4）
  if (!(fs.existsSync(dest) && fs.statSync(dest).size > 0)) {
    fs.unlink(dest, () => {})
    return { success: false, error: '视频下载结果为空或不可用' }
  }
  try {
    await probeVideoFile(dest)
  } catch (probeError) {
    fs.unlink(dest, () => {})
    return {
      success: false,
      error: '视频文件无法解码（' + (probeError && probeError.message ? probeError.message : String(probeError)).slice(0, 120) + '）',
    }
  }
  return { success: true, path: dest }
}

/** 用捆绑 ffprobe 校验视频可解码（存在视频流即可；损坏文件快速失败）。 */
async function probeVideoFile (videoPath) {
  const { findFfprobe } = require('./media-tool-paths')
  const ffprobe = findFfprobe()
  if (!ffprobe) return
  await runTool(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', videoPath])
}

function runTool (binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(String(stderr || error.message).slice(0, 1200)))
        return
      }
      const output = String(stdout || '').trim()
      if (!output.includes('video')) {
        reject(new Error('视频文件缺少视频流'))
        return
      }
      resolve(output)
    })
  })
}

/**
 * 分镜素材自选（manual）：把已生成素材复制到独立候选路径，避免同 index 二次生成覆盖同名文件。
 * 目标目录 = 源文件同目录/candidates/，与源文件同卷（复制即可，无需跨卷 rename）。
 */
function persistCandidateCopy (sourcePath, runId, sceneIndex, seq, kind, log) {
  if (typeof sourcePath !== 'string' || !sourcePath) return null
  const dir = path.dirname(sourcePath)
  const ext = path.extname(sourcePath) || (kind === 'video' ? '.mp4' : '.png')
  const candidateDir = path.join(dir, 'candidates')
  try { fs.mkdirSync(candidateDir, { recursive: true }) } catch (_) { /* mkdir 失败由后续复制抛出 */ }
  const target = path.join(candidateDir, 'scene_' + String(sceneIndex) + '_' + String(seq) + ext)
  try {
    const sourceReal = fs.realpathSync(sourcePath)
    let targetReal = null
    try { targetReal = fs.realpathSync(target) } catch (_) { /* 目标不存在 */ }
    if (targetReal && sourceReal === targetReal) return target
    fs.copyFileSync(sourcePath, target)
    return target
  } catch (error) {
    if (log && typeof log.warn === 'function') {
      log.warn('Story2VideoStages', 'candidate copy failed scene=' + sceneIndex + ' seq=' + seq + ': ' + (error && error.message ? error.message : String(error)))
    }
    return null
  }
}

/**
 * 分镜素材自选（manual）：候选生成阶段。
 * - all-images：每场景 2 张图片（同一优化提示词两次独立调用）；
 * - video-image：AI 视频场景 2 张图片 + 1 个视频（同一提示词），其余场景 2 张图片；
 * - 不生成 TTS；产出 candidates 清单并以 scene_asset_selection 检查点暂停。
 */
async function buildManualSceneCandidates (ctx) {
  const {
    pipelineEngine, serviceBus, runId, stage, params, context, log,
    optimizedPrompts, sentences, videoSceneSet, videoConfig, videoPlan, videoGenerator,
    imageStyle, imageProvider, imageModel, aspectRatio,
    imageConcurrency, inputMode, inputImages, resolveModelProviderManager, manualMaterialMode,
  } = ctx
  const promptTranslationItems = (context && context.prompt_translations && Array.isArray(context.prompt_translations.items))
    ? context.prompt_translations.items
    : []
  const promptTranslationOf = (index) => {
    const item = promptTranslationItems.find(i => i && i.index === index)
    return item && typeof item.translation === 'string' && item.translation ? item.translation : null
  }
  const assetGenerator = pipelineEngine._assetGenerator || serviceBus._assetGenerator
  const sceneCount = optimizedPrompts.length
  // manual 模式：all-images 忽略 video_plan（videoMode 不生效）；video-image 沿用 select_video_scenes 判定
  const effectiveVideoSceneSet = manualMaterialMode === 'video-image' ? videoSceneSet : new Set()
  const videoSceneIndexes = [...effectiveVideoSceneSet].sort((a, b) => a - b)
  const imagesTotal = sceneCount * 2
  const videosTotal = effectiveVideoSceneSet.size
  let imagesDone = 0
  let videosDone = 0
  const writeAssetsProgress = () => {
    if (context && typeof context === 'object') {
      context.assets_progress = {
        imagesDone, imagesTotal, videosDone, videosTotal, ttsDone: 0, ttsTotal: sentences.length,
      }
    }
  }
  writeAssetsProgress()

  // 视频候选生成（并发 1，复用 generateSceneVideo 契约；失败场景回退为仅 2 图）
  const videoResults = new Map()
  if (videoGenerator && videosTotal > 0) {
    const manager = resolveModelProviderManager()
    if (!manager || typeof manager.callAdapter !== 'function') {
      return { success: false, error: '视频生成器可用性异常：模型管理器不可用' }
    }
    const videoSize = resolveVideoSize(params, stage)
    const videoFps = Number(params.fps || (params.output && params.output.fps) || (stage && stage.options && stage.options.fps)) || 30
    const videoRunDir = path.join(os.tmpdir(), 'story2video', 'videoscenes', String(runId || 'run'))
    const planScenes = Array.isArray(videoPlan && videoPlan.scenes) ? videoPlan.scenes : []
    for (const index of videoSceneIndexes) {
      const promptItem = optimizedPrompts[index]
      const promptText = typeof promptItem === 'string'
        ? promptItem
        : ((promptItem && (promptItem.prompt || promptItem.optimized_prompt || promptItem.optimized)) || '')
      if (!promptText) {
        videoResults.set(index, { success: false, error: '视频场景缺少提示词' })
        videosDone += 1
        writeAssetsProgress()
        continue
      }
      let videoPromptText = promptText
      const bus = serviceBus || pipelineEngine.serviceBus
      if (bus && typeof bus.optimizeVideoPrompt === 'function') {
        try {
          const optResult = await bus.optimizeVideoPrompt(promptText, {
            platform: videoGenerator.providerId || undefined,
            ...(videoConfig.optimize && typeof videoConfig.optimize === 'object' ? videoConfig.optimize : {}),
          })
          const validated = extractOptimizedVideoPrompt(optResult, { index })
          if (!validated.ok) throw new Error(validated.error)
          videoPromptText = validated.prompt
        } catch (error) {
          log.warn('Story2VideoStages', 'scene ' + index + ' manual video prompt optimize failed: ' +
            (error && error.message ? error.message : String(error)) + ' → fallback to images only')
          videoResults.set(index, { success: false, error: '视频提示词优化失败：' + (error && error.message ? error.message : String(error)) })
          videosDone += 1
          writeAssetsProgress()
          continue
        }
      } else {
        log.warn('Story2VideoStages', 'scene ' + index + ' PromptBridge 未注入 → manual video fallback to images only')
        videoResults.set(index, { success: false, error: '视频提示词优化需要 prompt-engine 服务（PromptBridge 未注入）' })
        videosDone += 1
        writeAssetsProgress()
        continue
      }
      const planScene = planScenes.find(scene => scene.index === index)
      try {
        const outcome = await modelCallScheduler.withModelBudget(
          { governor: pipelineEngine.governor, type: 'video', providerId: videoGenerator.providerId, model: videoGenerator.model },
          () => withAssetTransientRetry(() => generateSceneVideo({
            manager,
            providerId: videoGenerator.providerId,
            model: videoGenerator.model,
            prompt: videoPromptText,
            index,
            seconds: (planScene && planScene.seconds) || 6,
            size: videoSize,
            fps: videoFps,
            runDir: videoRunDir,
            pollIntervalMs: videoConfig.pollIntervalMs,
          })),
        )
        videoResults.set(index, outcome)
      } catch (error) {
        log.warn('Story2VideoStages', 'scene ' + index + ' manual video generation threw: ' + (error && error.message ? error.message : String(error)) + ' → fallback to images only')
        videoResults.set(index, { success: false, error: error && error.message ? error.message : String(error) })
      }
      videosDone += 1
      writeAssetsProgress()
    }
  }

  // 每场景 2 张图片（同一优化提示词两次独立调用；index 语义保持场景号，落盘后复制到独立候选路径）
  const generateOneImage = async (promptItem, index, seq) => {
    const promptText = typeof promptItem === 'string'
      ? promptItem
      : ((promptItem && (promptItem.prompt || promptItem.optimized_prompt || promptItem.optimized)) || '')
    if (!promptText) return { success: false, index, error: '场景缺少提示词' }
    let result
    if (assetGenerator) {
      result = await withAssetTransientRetry(() => assetGenerator.generateImage(promptText, {
        style: imageStyle,
        image_provider: imageProvider,
        image_model: imageModel,
        index,
        aspect_ratio: aspectRatio,
        runId,
      }))
    } else {
      const retryResult = await runContentPolicyImageRetry({
        prompt: promptText,
        sceneIndex: index,
        maxAttempts: MAX_IMAGE_GENERATION_ATTEMPTS,
        generate: async ({ prompt: attemptPrompt }) => {
          const attemptResult = await withAssetTransientRetry(() => serviceBus.callPythonSkill('generate_image', {
            prompt: attemptPrompt,
            style: imageStyle,
            image_provider: imageProvider,
            image_model: imageModel,
            index,
            aspect_ratio: aspectRatio,
            runId,
          }))
          const providerError = attemptResult?.error || attemptResult?.data?.error
          if (providerError && typeof providerError === 'object') throw providerError
          if (attemptResult?.success === false || Number(attemptResult?.code) < 0) {
            const error = new Error(
              attemptResult?.message ||
              (typeof providerError === 'string' ? providerError : 'Image generation failed')
            )
            if (attemptResult && typeof attemptResult === 'object') Object.assign(error, attemptResult)
            throw error
          }
          return attemptResult
        },
      })
      if (retryResult.status === 'success') {
        result = retryResult.result
      } else if (retryResult.status === 'needs_user_input') {
        result = {
          code: -1,
          message: 'Image generation requires user input after content-policy review',
          needsUserInput: true,
          checkpoint: retryResult.checkpoint,
          data: { needsUserInput: true, checkpoint: retryResult.checkpoint, generationAttempts: retryResult.attempts },
        }
      } else {
        result = { code: -1, message: retryResult.error?.message || 'Image generation failed', data: { generationAttempts: retryResult.attempts } }
      }
    }
    const normalized = normalizeAssetResult(result, ['path', 'url', 'image_path'])
    if (normalized) {
      const candidatePath = persistCandidateCopy(normalized.path, runId, index, seq, 'image', log)
      if (!candidatePath) return { success: false, index, error: '候选图片落盘失败' }
      imagesDone += 1
      writeAssetsProgress()
      return { success: true, index, path: candidatePath, seq, meta: normalized.meta }
    }
    const contentPolicyCheckpoint = getContentPolicyCheckpoint(result, index)
    imagesDone += 1
    writeAssetsProgress()
    return {
      success: false,
      index,
      error: (result && result.message) || 'Image generation failed',
      needsUserInput: Boolean(contentPolicyCheckpoint),
      checkpoint: contentPolicyCheckpoint,
      generationAttempts: Array.isArray(result?.data?.generationAttempts) ? result.data.generationAttempts : [],
    }
  }

  // 每场景 2 图：同场景内顺序生成（避免 asset-generator 同 index 输出路径并发写覆盖 → 两张候选相同），
  // 不同场景并行（有界并发 imageConcurrency）。
  const imageTargets = optimizedPrompts.map((prompt, index) => ({ prompt, index }))
  const imageResults = (await _mapWithConcurrency(
    imageTargets,
    Math.max(1, imageConcurrency),
    async (item) => {
      const results = []
      for (let seq = 0; seq < 2; seq++) results.push(await generateOneImage(item.prompt, item.index, seq))
      return results
    },
  )).flat()

  // 内容政策 needs_user_input 优先整体失败（与全自动路径一致，需修改文案后重启）
  const contentPolicyFailure = imageResults.find(r => r && r.needsUserInput) || [...videoResults.values()].find(v => v && v.needsUserInput)
  if (contentPolicyFailure) {
    return {
      success: false,
      error: contentPolicyFailure.error || 'Image generation requires user input after content-policy review',
      needsUserInput: true,
      checkpoint: contentPolicyFailure.checkpoint || null,
      generationAttempts: contentPolicyFailure.generationAttempts || [],
    }
  }

  // 组装候选清单；任一场景 0 候选 → fail closed（选择检查点无法满足）
  const candidates = []
  const failedScenes = []
  for (let index = 0; index < sceneCount; index++) {
    const sceneEntries = imageResults
      .filter(r => r && r.success && r.path && r.index === index)
      .map(r => ({ id: 'image-' + r.seq, kind: 'image', path: r.path, seq: r.seq, meta: r.meta }))
    const video = videoResults.get(index)
    if (video && video.success && video.path) {
      const videoCandidatePath = persistCandidateCopy(video.path, runId, index, 2, 'video', log)
      if (videoCandidatePath) sceneEntries.push({ id: 'video-2', kind: 'video', path: videoCandidatePath, seq: 2, meta: video.meta })
    }
    if (sceneEntries.length === 0) failedScenes.push(index)
    const promptItem = optimizedPrompts[index]
    const promptText = typeof promptItem === 'string' ? promptItem : ((promptItem && (promptItem.prompt || promptItem.optimized_prompt || promptItem.optimized)) || '')
    const sentence = sentences[index]
    candidates.push({
      index,
      text: typeof sentence === 'string' ? sentence : ((sentence && (sentence.text || sentence.content)) || ''),
      prompt: String(promptText || ''),
      promptTranslation: promptTranslationOf(index),
      candidates: sceneEntries,
      subtitleBlocks: Array.isArray(sentence?.subtitleBlocks) ? [...sentence.subtitleBlocks] : [],
      sceneSource: sentence?.sceneSource || null,
      subtitleSource: sentence?.subtitleSource || null,
      degraded: sentence?.degraded === true,
      fallbackReason: sentence?.fallbackReason || null,
    })
  }
  if (failedScenes.length > 0) {
    return {
      success: false,
      error: '分镜素材自选：场景 ' + failedScenes.join(', ') + ' 未生成任何候选素材，请检查模型配置或额度后重试',
    }
  }

  const assetManifest = {
    materialMode: manualMaterialMode,
    creationMode: 'manual',
    candidates,
    images: imageResults.filter(r => r && r.success && r.path).map(r => ({ index: r.index, success: true, path: r.path, meta: r.meta })),
    videos: [...videoResults.entries()].filter(([, v]) => v && v.success && v.path).map(([index, v]) => ({ index, success: true, path: v.path, meta: v.meta })),
    failures: {
      images: imageResults.filter(r => !r || !r.success).map(r => ({
        index: r && r.index,
        error: (r && r.error) || 'Image generation failed',
        needsUserInput: Boolean(r && r.needsUserInput),
        checkpoint: (r && r.checkpoint) || null,
        generationAttempts: Array.isArray(r && r.generationAttempts) ? r.generationAttempts : [],
      })),
      videos: [...videoResults.entries()].filter(([, v]) => !v || !v.success).map(([index, v]) => ({
        index,
        error: (v && v.error) || 'Video generation failed',
      })),
      audio: [],
    },
    stats: {
      totalImages: imagesTotal,
      successImages: imageResults.filter(r => r && r.success).length,
      totalVideos: videosTotal,
      successVideos: [...videoResults.values()].filter(v => v && v.success).length,
      totalTts: 0,
      successTts: 0,
      totalScenes: sceneCount,
      successScenes: candidates.length,
      failedScenes: failedScenes.length,
    },
    segmentation: {
      sceneSource: sentences.find(s => s && s.sceneSource)?.sceneSource || null,
      subtitleSource: sentences.find(s => s && s.subtitleSource)?.subtitleSource || null,
      degraded: false,
      fallbackReason: null,
    },
  }
  if (context && typeof context === 'object') context.generate_assets = assetManifest

  log.info('Story2VideoStages',
    'manual candidates: ' + sceneCount + ' scenes (' + imagesTotal + ' images, ' + videosTotal + ' videos) materialMode=' + manualMaterialMode +
    ' successImages=' + assetManifest.stats.successImages + ' successVideos=' + assetManifest.stats.successVideos)

  return {
    success: true,
    output: assetManifest,
    checkpoint: 'scene_asset_selection',
    checkpointMeta: {
      stageName: 'generate_assets',
      stageIndex: null,
      required: true,
      type: 'scene_asset_selection',
    },
  }
}

/** 从上下文候选结构中解包场景数组（兼容 { scenes } / { sentences } / { results } 包装）。 */
function unwrapScenesArray (source) {
  if (Array.isArray(source)) return source
  if (source && typeof source === 'object') {
    if (Array.isArray(source.scenes)) return source.scenes
    if (Array.isArray(source.sentences)) return source.sentences
    if (Array.isArray(source.results)) return source.results
  }
  return []
}

const RATE_LIMIT_PATTERN = /rate\s*limit|rate_limit|限流|频率.*(?:受限|限制)|额度|quota/i;
const TRANSIENT_PATTERN = /timed?\s*out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|network\s*error|超时|网络/i;

function messageOf(value) {
  if (value && typeof value === 'object') return String(value.message || value.error || value.msg || '');
  return String(value || '');
}

function isRateLimitErrorLike(value) {
  if (value && typeof value === 'object') {
    if (value.code === ERROR_CODES.RATE_LIMITED) return true;
    if (Number(value.statusCode) === 429 || Number(value.status) === 429 || Number(value.code) === 429) return true;
  }
  return RATE_LIMIT_PATTERN.test(messageOf(value));
}

function isTransientErrorLike(value) {
  if (isRateLimitErrorLike(value)) return true;
  if (value && typeof value === 'object' && [ERROR_CODES.TIMEOUT, ERROR_CODES.NETWORK_ERROR].includes(value.code)) return true;
  return TRANSIENT_PATTERN.test(messageOf(value));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 对抛错型 provider 调用做有界重试：
 * - 限流（429 / RATE_LIMITED）：更长退避（2500ms×attempt），最多 rateLimitMaxAttempts 次；
 * - 其他瞬时错误（超时/网络）：800ms×attempt，最多 maxAttempts 次；
 * - 非瞬时错误：立即抛出，不消耗重试次数。
 */
async function withTransientRetry(fn, { maxAttempts = 3, rateLimitMaxAttempts = 4 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(maxAttempts, rateLimitMaxAttempts); attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientErrorLike(error)) throw error;
      const limit = isRateLimitErrorLike(error) ? rateLimitMaxAttempts : maxAttempts;
      if (attempt >= limit) break;
      await sleep((isRateLimitErrorLike(error) ? 2500 : 800) * attempt);
    }
  }
  throw lastError;
}

/**
 * 对返回结果对象（如 { code: -1, message }）或抛错的资源生成调用做有界重试。
 * 仅在可判定为瞬时（限流/超时/网络）时重试；内容政策检查点、模型配置等失败原样返回。
 */
async function withAssetTransientRetry(fn, { maxAttempts = 3, rateLimitMaxAttempts = 4 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= Math.max(maxAttempts, rateLimitMaxAttempts); attempt++) {
    let outcome;
    try {
      outcome = await fn(attempt);
    } catch (error) {
      if (!isTransientErrorLike(error)) throw error;
      last = error;
      const limit = isRateLimitErrorLike(error) ? rateLimitMaxAttempts : maxAttempts;
      if (attempt >= limit) return { code: -1, message: error.message || String(error) };
      await sleep((isRateLimitErrorLike(error) ? 2500 : 800) * attempt);
      continue;
    }
    const ok = outcome && (Number(outcome.code) === 0 || outcome.success === true);
    const transient = !ok && outcome && isTransientErrorLike(outcome);
    if (ok) return outcome;
    if (!transient) return outcome;
    last = outcome;
    const limit = isRateLimitErrorLike(outcome) ? rateLimitMaxAttempts : maxAttempts;
    if (attempt >= limit) return outcome;
    await sleep((isRateLimitErrorLike(outcome) ? 2500 : 800) * attempt);
  }
  return last;
}

/** 将 renderer 传入的图片路径或 data URL 解析为主进程可读的本地文件。 */
function resolveInputImage(source, runId, index, options = {}) {
  const candidate = typeof source === 'object' && source !== null
    ? (source.path || source.filePath || source.preview || source.url)
    : source;
  if (typeof candidate !== 'string' || !candidate) return null;

  if (/^data:/i.test(candidate)) {
    try {
      return writeDataImage(candidate, runId, index, options);
    } catch {
      return null;
    }
  }

  return resolveReadableMediaFile(candidate, {
    kind: 'image',
    allowedRoots: options.allowedRoots || getAllowedMediaRoots(),
    maxBytes: options.maxBytes,
  });
}

/** 将 renderer 传入的音频路径解析为主进程可读的本地文件。 */
function resolveInputAudio(source, options = {}) {
  const candidate = typeof source === 'object' && source !== null
    ? (source.path || source.filePath || source.audioPath || source.url)
    : source;
  if (typeof candidate !== 'string' || !candidate) return null;
  return resolveReadableMediaFile(candidate, {
    kind: 'audio',
    allowedRoots: options.allowedRoots || getAllowedMediaRoots(),
    maxBytes: options.maxBytes,
  });
}

function normalizeAssetResult(result, pathKeys) {
  if (!result || result.code < 0 || result.success === false) return null;
  const data = result.code === 0
    ? (result.data || result)
    : (result.data && typeof result.data === 'object' ? result.data : result);
  const assetPath = pathKeys.map(key => data && data[key]).find(Boolean);
  if (typeof assetPath !== 'string' || !assetPath) return null;
  return { path: assetPath, duration: data.duration, meta: data };
}

function summarizeAssetFailures(label, results) {
  return results.map((item) => {
    const index = Number.isInteger(item?.index) ? item.index + 1 : '?';
    const message = typeof item?.error === 'string' && item.error.trim()
      ? item.error.trim().replace(/\s+/g, ' ').slice(0, 500)
      : label + ' generation failed';
    return label + ' #' + index + ': ' + message;
  });
}

function getContentPolicyCheckpoint(result, fallbackSceneIndex) {
  const checkpoint = result?.checkpoint || result?.data?.checkpoint;
  if (!checkpoint || checkpoint.reason !== 'content_policy' || checkpoint.type !== 'needs_user_input') return null;

  const sceneIndex = fallbackSceneIndex;
  const sceneNumber = sceneIndex + 1;
  const attempts = Number.isInteger(checkpoint.attempts) && checkpoint.attempts > 0
    ? checkpoint.attempts
    : null;
  const recommendation = typeof checkpoint.recommendation === 'string' && checkpoint.recommendation.trim()
    ? checkpoint.recommendation.trim().replace(/\s+/g, ' ').slice(0, 500)
    : '请改写该场景为更抽象、非露骨的视觉描述后重试。';

  return {
    type: 'needs_user_input',
    status: 'needs_user_input',
    reason: 'content_policy',
    needsUserInput: true,
    sceneIndex,
    sceneNumber,
    attempts,
    recommendation,
  };
}

function buildContentPolicyCheckpointMeta(failedImages) {
  const scenes = failedImages
    .filter(item => item?.needsUserInput === true && item?.checkpoint?.reason === 'content_policy')
    .map(item => ({
      sceneIndex: item.checkpoint.sceneIndex,
      sceneNumber: item.checkpoint.sceneNumber,
      attempts: item.checkpoint.attempts,
      recommendation: item.checkpoint.recommendation,
    }));
  if (scenes.length === 0) return null;

  const first = scenes[0];
  return {
    type: 'needs_user_input',
    status: 'needs_user_input',
    reason: 'content_policy',
    needsUserInput: true,
    sceneIndex: first.sceneIndex,
    sceneNumber: first.sceneNumber,
    attempts: first.attempts,
    recommendation: first.recommendation,
    scenes,
  };
}

function getOptimizationScenes(context) {
  // scene_context 中间层（全局故事背景 + 逐场景上下文块）优先，回退 domain_enrich → split → sentences
  const source = context.scene_context || context.domain_enrich || context.split || context.sentences;
  if (Array.isArray(source)) return source;
  if (source && Array.isArray(source.scenes)) return source.scenes;
  if (source && Array.isArray(source.sentences)) return source.sentences;
  return null;
}

function getScenePromptSeed(scene) {
  if (typeof scene === 'string') return scene.trim();
  if (!scene || typeof scene !== 'object') return '';
  const candidate = scene.imagePromptSeed || scene.prompt || scene.text || scene.content;
  return typeof candidate === 'string' ? candidate.trim() : '';
}

/**
 * 构建 prompt-engine 优化请求的上下文对象
 * 包含文案意图、场景类型、完整文案摘要，帮助 LLM 生成更贴合原文的图片提示词
 * @param {Array} scenes - 场景数组
 * @param {object} options - stage.options
 * @returns {object} context 对象
 */
function buildOptimizeContext(scenes, options = {}) {
  const context = {};
  
  // 1. 收集所有场景文本作为完整文案上下文
  const allTexts = scenes
    .map(s => getScenePromptSeed(s))
    .filter(t => t && t.length > 0);
  if (allTexts.length > 0) {
    context.full_text = allTexts.join('；');
  }
  
  // 2. 从 options.context 继承已有上下文（如 synopsis）
  if (options.context && typeof options.context === 'object') {
    Object.assign(context, options.context);
  } else if (typeof options.context === 'string') {
    context.synopsis = options.context;
  }
  
  // 3. 自动推断场景类型（如果未指定）
  if (!context.scene_type) {
    const combinedText = allTexts.join(' ').toLowerCase();
    if (combinedText.includes('对比') || combinedText.includes('vs') || 
        combinedText.includes('而不是') || combinedText.includes('相反')) {
      context.scene_type = '对比场景';
    } else if (combinedText.includes('特写') || combinedText.includes('细节') ||
               combinedText.includes('精致') || combinedText.includes('纹理')) {
      context.scene_type = '细节场景';
    } else if (combinedText.includes('全景') || combinedText.includes('街道') ||
               combinedText.includes('市场') || combinedText.includes('宫殿')) {
      context.scene_type = '全景场景';
    } else if (allTexts.length > 3) {
      context.scene_type = '全景场景';
    }
  }
  
  return context;
}

/**
 * 判断文案是否有实质内容。去掉空白/标点/符号后为空、或全部是数字（如「12」）
 * 的文案没有可描绘的语义，交给 LLM 优化只会被编造出与原文无关的场景。
 * 单字中文（如「一」「猫」）仍视为有内容。
 * @param {string} text
 * @returns {boolean}
 */
function hasMeaningfulText(text) {
  const cleaned = String(text || '')
    .replace(/[\s\p{P}\p{S}]/gu, '');
  if (!cleaned) return false;
  // 方案B（2026-08-09）：仅「单个纯数字」视为无实质内容并跳过 LLM 优化；
  // 2 位及以上纯数字（如 81、1949）视为有意义，正常走 prompt-engine 优化，
  // 避免数字类文案得不到增强（同时保留对「1」这类极短数字的防编造守卫）。
  if (/^\d$/.test(cleaned)) return false;
  return true;
}

/**
 * prompt-engine 校验拒绝（输入过短无法优化）判定。
 * 方案B 配套（2026-08-09）：app 侧已放行 2 位+数字，但 prompt-engine 的
 * 最小长度校验仍会拒绝单词输入（如「81」→ 422 Too short），此时应回退原文
 * 并继续运行，而不是让整条流水线失败。
 *
 * 2026-08-09 Bug 反哺：真实链路文案为「描述太简短了（2 字），建议更详细描述画面」，
 * 原词表只覆盖「太短」未覆盖「太简短/过短」，导致回退未命中、整条流水线失败；
 * 词表按真实返回文案扩展（中文「太短/太简短/过短」+ 英文 Too short/min length 等）。
 * @param {string} message
 * @returns {boolean}
 */
function isPromptEngineTooShortRejection (message) {
  return /too short|太短|太简短|过短|must be at least|min[_ -]?length|shorter than/i.test(String(message || ''))
}

/**
 * 净化 LLM 返回的优化提示词：剥离 <think>...</think> 思考块（带推理能力的模型
 * 可能把思考过程直接放进 content），避免思考内容被当作图片提示词。
 * @param {string|null} content
 * @returns {string}
 */
function sanitizeOptimizedPrompt(content) {
  if (typeof content !== 'string') return '';
  let out = content.trim();
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/<think>[\s\S]*$/gi, '');
  return out.trim();
}

/**
 * 识别 LLM 的「拒绝/无法生成」回复。场景描述缺失时模型可能返回
 * "I cannot generate the image prompt because the visual description is missing..."，
 * 这类内容不能作为图片提示词，应回退原文或按失败处理。
 * @param {string} text
 * @returns {boolean}
 */
function looksLikeRejection(text) {
  if (typeof text !== 'string' || !text) return false;
  return /cannot generate|can'?t generate|unable to (generate|create)|missing from your request|please provide|please describe|i cannot|i can'?t|无法生成|缺少.*(描述|内容)|请提供.*(描述|内容)/i
    .test(text);
}

/**
 * 注册 Story2Video-compose 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例（需已注入 serviceBus）
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerStory2VideoStages(pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return {
      success: false,
      error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)',
    };
  }

  const registered = [];

  // ----------------------------------------------------------
  // DOMAIN_ENRICH - 历史内容领域增强（可选）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH,
    async ({ stage, params, context }) => {
      params = params || {};
      const source = context.split || context.sentences || [];
      const scenes = Array.isArray(source)
        ? source
        : (source.scenes || source.sentences || []);
      const contentType = params.contentType || stage.options?.contentType || 'general';
      if (contentType !== 'history') {
        return { success: true, output: passthroughScenes(scenes) };
      }
      return { success: true, output: enrichHistoryScenes(scenes) };
    },
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.DOMAIN_ENRICH);

  // ----------------------------------------------------------
  // SCENE_CONTEXT - 场景上下文增强中间层（分句 → 提示词优化之间的故事背景上下文）
  // 读完整文案提取全局故事上下文（时代/朝代/文化地域/题材/设定/角色/道具/视觉风格/语气），
  // 再把全局锚点融合进每个场景，形成逐场景上下文块与负面锚点，注入提示词优化，
  // 保证图片/视频生成的故事背景准确性、一致性与连贯性（如唐代全文 + 「一个老妇人在做饭」）。
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.SCENE_CONTEXT,
    async ({ stage, params, context }) => {
      params = params || {};
      const source = context.scene_context || context.domain_enrich || context.split || context.sentences || [];
      const scenes = Array.isArray(source)
        ? source
        : (source.scenes || source.sentences || []);
      // fail closed：无场景数组（视频生成必须基于场景）不允许静默透传
      if (!Array.isArray(scenes) || scenes.length === 0) {
        return { success: false, error: '场景上下文增强需要非空场景数组' };
      }
      const options = stage.options || {};
      // 全文优先 params.text；图片/音频模式无文案时降级为逐场景文本拼接，仍可提取局部上下文
      const hasFullText = typeof params.text === 'string' && params.text.trim().length > 0;
      const fullText = hasFullText
        ? params.text.trim()
        : scenes.map(s => (s && (s.text || s.content)) || '').filter(Boolean).join('。');
      try {
        const result = buildSceneContextResult(scenes, fullText, options);
        // 无完整文案（图片/音频模式）：场景文本拼接推导的全局上下文较弱，显式标记 degraded 供下游/展示识别
        if (!hasFullText && result.metadata && result.metadata.enriched) {
          result.metadata.degraded = true;
          result.metadata.fallbackReason = 'no_full_text_scene_derived';
        }
        if (context && typeof context === 'object') context.scene_context = result;
        return { success: true, output: result };
      } catch (error) {
        // 规则引擎异常：降级透传（增强失败不阻断流水线），记录 degraded 与原因
        const degraded = {
          story: null,
          scenes,
          metadata: {
            enriched: false,
            degraded: true,
            extractor: 'rule-based',
            fallbackReason: error && error.message ? String(error.message).slice(0, 300) : 'scene_context_engine_error',
            sceneCount: scenes.length,
          },
        };
        if (context && typeof context === 'object') context.scene_context = degraded;
        pipelineEngine.log.warn('Story2VideoStages', 'scene_context 降级透传: ' + degraded.metadata.fallbackReason);
        return { success: true, output: degraded };
      }
    },
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.SCENE_CONTEXT);

  // ----------------------------------------------------------
  // SELECT_VIDEO_SCENES - 视频+图片轮播混合模式的 AI 视频场景选择（2026-08-11）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.SELECT_VIDEO_SCENES,
    async ({ stage, params, context }) => {
      const log = pipelineEngine.log
      params = params || {}
      const videoConfig = (stage && stage.options && stage.options.video) || params.videoConfig || {}
      const mode = VIDEO_MODES.has(videoConfig.mode) ? videoConfig.mode : 'off'
      const rawOptimize = context.optimize || context.optimized_prompts
      const optimizePrompts = unwrapScenesArray(rawOptimize)
      const rawSentences = context.domain_enrich || context.split || context.sentences
      const sentences = unwrapScenesArray(rawSentences)
      const sceneCount = Math.max(optimizePrompts.length, sentences.length)
      if (mode === 'off' || sceneCount === 0) {
        const emptyPlan = { mode: 'off', scenes: [], ratio: 0, selectedCount: 0 }
        if (context && typeof context === 'object') context.video_plan = emptyPlan
        return { success: true, output: emptyPlan }
      }
      const generator = resolveVideoGeneratorConfig(pipelineEngine, {
        provider: videoConfig.provider,
        model: videoConfig.model,
      })
      if (!generator) {
        return {
          success: false,
          error: '视频生成器未配置，请在设置中添加支持视频生成的模型（视频增强模式需要视频生成能力）',
        }
      }
      // 估算基准时长：优先 split.targetSeconds（renderer 提交），其次 stageOptions.split.target_duration（归一化后）
      const normalizedTargetSeconds = Number(params.stageOptions && params.stageOptions.split && params.stageOptions.split.target_duration)
      const suppliedTargetSeconds = Number(params.split && params.split.targetSeconds)
      const defaultSeconds = normalizedTargetSeconds > 0
        ? normalizedTargetSeconds
        : (suppliedTargetSeconds > 0 ? suppliedTargetSeconds : 6)
      const scenes = []
      for (let i = 0; i < sceneCount; i++) {
        const promptItem = optimizePrompts[i]
        const sentence = sentences[i]
        const prompt = typeof promptItem === 'string'
          ? promptItem
          : ((promptItem && (promptItem.prompt || promptItem.optimized_prompt || promptItem.optimized)) || '')
        const text = typeof sentence === 'string'
          ? sentence
          : ((sentence && (sentence.text || sentence.content)) || '')
        scenes.push({
          index: i,
          prompt: String(prompt || ''),
          text: String(text || ''),
          seconds: estimateSceneSeconds(sentence, defaultSeconds),
        })
      }
      let selected = []
      let ratio = 0
      let entries = null
      if (mode === 'fixed') {
        const plan = pickFixedVideoScenes(scenes, videoConfig.fixedRatio)
        selected = plan.selected
        ratio = plan.ratio
      } else if (mode === 'ai-judged') {
        const aiGenerator = getAiGenerator(pipelineEngine)
        if (!aiGenerator || typeof aiGenerator.generateWithDefault !== 'function') {
          return { success: false, error: '默认 LLM 不可用，AI 智能选择需要先完成模型设置' }
        }
        const { system, user } = buildVideoSelectionPrompt(scenes, {
          mode,
          minRatio: videoConfig.minRatio,
          maxRatio: videoConfig.maxRatio,
          maxScenes: videoConfig.maxScenes,
        })
        entries = null
        let raw = ''
        let lastError = ''
        // 真实运行暴露（2026-08-11 W6）：deepseek-v4-flash 等推理型模型对 27 场景长任务偶发
        // 返回空 content（仅 reasoning_content）或非法 JSON，单次失败即整阶段失败。改为有界重试：
        // 空内容/解析失败均重试，最多 3 次，逐次记录 raw 便于诊断。
        const maxAttempts = 3
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          raw = ''
          try {
            // max_tokens 随场景数放大，避免长 reason JSON 被截断导致解析失败（2026-08-11 I4）
            const maxTokens = Math.min(5000, 800 + scenes.length * 140)
            const result = await aiGenerator.generateWithDefault('llm', {
              temperature: 0.2,
              max_tokens: maxTokens,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
              ],
            })
            raw = result && typeof result.content === 'string' ? result.content.trim() : ''
          } catch (error) {
            lastError = 'AI 智能选择失败：' + (error && error.message ? error.message : String(error))
            log.warn('Story2VideoStages', 'select_video_scenes attempt ' + attempt + ' llm error: ' + lastError)
            continue
          }
          entries = parseVideoSelection(raw, scenes.length)
          if (entries) break
          lastError = 'AI 智能选择结果无法解析，请重试或改用固定比例模式'
          log.warn('Story2VideoStages', 'select_video_scenes attempt ' + attempt + ' unparseable sceneCount=' + scenes.length + ' raw=' + String(raw).slice(0, 1500))
        }
        if (!entries) {
          return { success: false, error: lastError }
        }
        const plan = clampVideoSelection(scenes, entries, {
          minRatio: videoConfig.minRatio,
          maxRatio: videoConfig.maxRatio,
          maxScenes: videoConfig.maxScenes,
        })
        selected = plan.selected
        ratio = plan.ratio
      }
      const plan = {
        mode,
        provider: generator.providerId,
        model: generator.model || '',
        scenes: scenes.map(scene => {
          const entry = entries && entries.find(e => e.index === scene.index)
          return {
            index: scene.index,
            useVideo: selected.includes(scene.index),
            excitement: entry ? entry.excitement : null,
            reason: entry ? entry.reason : '',
            seconds: scene.seconds,
          }
        }),
        ratio,
        selectedCount: selected.length,
        totalSeconds: scenes.reduce((sum, scene) => sum + scene.seconds, 0),
      }
      if (context && typeof context === 'object') context.video_plan = plan
      log.info('Story2VideoStages',
        'select_video_scenes mode=' + mode + ' selected=' + selected.length + '/' + scenes.length +
        ' ratio=' + ratio + '% provider=' + generator.providerId)
      return { success: true, output: plan }
    },
  )
  registered.push(STORY2VIDEO_STAGE_TYPES.SELECT_VIDEO_SCENES);

  // ----------------------------------------------------------
  // OPTIMIZE - 统一走 prompt-engine（风格检测/改写/输出校验）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.OPTIMIZE,
    async ({ stage, context, serviceBus, params }) => {
      if (!serviceBus || typeof serviceBus.optimizePrompt !== 'function') {
        return { success: false, error: 'Story2Video optimize 需要 prompt-engine 服务（PromptBridge 未注入）' };
      }

      const scenes = getOptimizationScenes(context || {});
      if (!Array.isArray(scenes) || scenes.length === 0) {
        return { success: false, error: 'Story2Video optimize 需要非空场景数组' };
      }

      // 性能修复：逐场景 LLM 优化改为有界并发（默认 3），避免长文案 20+ 场景串行
      // 调用导致「提示词优化」阶段耗时数分钟。
      const concurrency = normalizeAssetConcurrency(stage.options?.concurrency ?? 3)
      const maxAttempts = Math.max(1, Math.min(3, Number(stage.options?.maxRetries ?? 2) + 1))
      // 断点续传：上次失败时已完成的场景结果直接复用，避免重复消耗 LLM 额度。
      const partialResume = (context && Array.isArray(context.optimize_resume)) ? context.optimize_resume : []
      // 进度前置写入：一开始就显示「共 N 个场景，已完成 0 个」，避免整个阶段期间无数量信息
      if (context && typeof context === 'object') {
        context.optimize_progress = {
          done: partialResume.filter(Boolean).length,
          total: scenes.length,
        }
      }
      let output
      try {
        output = await _mapWithConcurrency(scenes, concurrency, async (scene, index) => {
          if (partialResume[index]) return partialResume[index]
          const promptSeed = getScenePromptSeed(scene)
          if (!promptSeed) {
            throw new Error('Story2Video optimize scene ' + index + ' is missing a prompt seed')
          }
          // 无实质内容的文案（单个纯数字/纯符号/过短）：跳过 LLM 优化，直接用原文，
          // 避免模型凭空编造与原文无关的场景（如输入「1」被编造成人物画面）。
          // 2 位及以上纯数字（如 81、1949）视为有意义，正常优化（方案B，2026-08-09）。
          if (!hasMeaningfulText(promptSeed)) {
            const skippedEntry = {
              optimized_prompt: promptSeed,
              providerId: null,
              model: null,
              skipped_optimize: true,
            };
            partialResume[index] = skippedEntry;
            if (context && typeof context === 'object') {
              context.optimize_resume = partialResume;
              context.optimize_progress = {
                done: partialResume.filter(Boolean).length,
                total: scenes.length,
              };
            }
            return skippedEntry;
          }
          // 图片提示词统一走 prompt-engine：构造请求（平台/风格别名归一、自动风格检测、
          // 创意度/长度/候选数边界）→ 瞬态错误有界重试（限流更长退避）→ 输出校验 fail closed。
          // 校验顺序：error 优先（/v1/optimize 失败兜底返回原文+error，忽略即静默降级）→ 结构 → 内容。
          // 请求构造一次（含别名归一与边界收敛），重试/校验共用同一份归一化参数
          // 构建上下文：优先使用 scene_context 中间层产出的逐场景上下文块
          // （全局故事背景 synopsis + 场景上下文块 setting + 角色/题材/场景类型），
          // 未产出时回退 buildOptimizeContext（文案意图/场景类型/完整文案摘要），
          // 用户显式配置的 optimize.context 只补齐空白键，不被覆盖。
          const sceneStoryContext = scene && typeof scene === 'object' && scene.context && typeof scene.context === 'object'
            ? scene.context
            : null;
          const optimizeContext = sceneStoryContext
            ? { ...sceneStoryContext }
            : { ...buildOptimizeContext(scenes, stage.options || {}) };
          const userContext = stage.options && stage.options.context;
          if (userContext && typeof userContext === 'object') {
            for (const [key, value] of Object.entries(userContext)) {
              if (value !== undefined && value !== null && value !== '' &&
                  (optimizeContext[key] === undefined || optimizeContext[key] === '')) {
                optimizeContext[key] = value;
              }
            }
          } else if (typeof userContext === 'string' && userContext && !optimizeContext.synopsis) {
            optimizeContext.synopsis = userContext;
          }
          // 审查 W1：发送边界对 context 做白名单过滤（scene_context 七键），
          // 防止用户显式配置携带未知键/未来服务端新增解释型键造成契约漂移。
          for (const key of Object.keys(optimizeContext)) {
            if (!CONTEXT_KEY_WHITELIST.includes(key)) delete optimizeContext[key];
          }
          const requestOptionsForScene = { ...stage.options, context: optimizeContext };
          // 场景负面锚点（时代/文化排除项）合并进 negative_prompt（≤500 契约截断）
          const sceneNegativeAnchors = scene && typeof scene === 'object' && Array.isArray(scene.negativeAnchors)
            ? scene.negativeAnchors
            : [];
          if (sceneNegativeAnchors.length > 0) {
            requestOptionsForScene.negative_prompt = mergeNegativePrompt(
              typeof stage.options?.negative_prompt === 'string' ? stage.options.negative_prompt : '',
              sceneNegativeAnchors,
              500,
            );
          }
          const request = buildPromptEngineOptimizeRequest(promptSeed, requestOptionsForScene)
          const { prompt: enginePrompt, ...requestOptions } = request
          let result
          try {
            result = await withTransientRetry(
              () => serviceBus.optimizePrompt(enginePrompt, requestOptions),
              { maxAttempts, rateLimitMaxAttempts: Math.max(maxAttempts + 1, 4) },
            )
          } catch (lastError) {
            const message = lastError && lastError.message ? lastError.message : String(lastError)
            // I6：服务不可用/连接失败时给出可操作排查指引（PROMPT_DIR / 8013）
            const hint = /not running|ECONNREFUSED|timed\s*out|ETIMEDOUT|network\s*error|超时|网络/i.test(message)
              ? '（prompt-engine 未运行或不可达，请检查 PROMPT_DIR 与端口 8013）'
              : ''
            throw new Error('Story2Video optimize scene ' + index + ' failed: ' + message + hint, { cause: lastError })
          }
          // 截断上限用契约收敛后的 max_length（W-2/I-4：兼容 camelCase 配置且不因原始越界值误截断）
          const validated = extractOptimizedPrompt(result, {
            index,
            maxLength: request.max_length,
            warn: (msg) => pipelineEngine.log.warn('Story2VideoStages', msg),
          })
          if (!validated.ok) {
            // prompt-engine 校验拒绝（如 Too short）：输入过短无法优化 → 回退原文并继续，
            // 不因「81」这类单词数字输入让整条流水线失败（方案B 2026-08-09 配套）。
            if (isPromptEngineTooShortRejection(validated.error)) {
              const tooShortEntry = {
                optimized_prompt: promptSeed,
                providerId: null,
                model: null,
                skipped_optimize: true,
                optimize_note: 'prompt_engine_too_short_use_original',
              };
              partialResume[index] = tooShortEntry;
              if (context && typeof context === 'object') {
                context.optimize_resume = partialResume;
                context.optimize_progress = {
                  done: partialResume.filter(Boolean).length,
                  total: scenes.length,
                };
              }
              return tooShortEntry;
            }
            throw new Error('Story2Video ' + validated.error)
          }
          // 剥离思考块后才是最终提示词：带推理能力的模型可能把 <think> 思考过程放进内容，
          // prompt-engine 返回后仍做防御性净化，不能把思考内容当作图片提示词。
          const optimizedPrompt = sanitizeOptimizedPrompt(validated.prompt)
          if (!optimizedPrompt) {
            throw new Error('Story2Video optimize scene ' + index + ' returned an empty prompt')
          }
          // LLM 拒绝/无法生成：场景描述缺失时模型可能返回 "I cannot generate..."，
          // 这类内容不能作为提示词——有实质内容时回退原文，否则按失败处理。
          if (looksLikeRejection(optimizedPrompt)) {
            if (!hasMeaningfulText(promptSeed)) {
              throw new Error('Story2Video optimize scene ' + index + ' returned a rejection instead of a prompt')
            }
            const rejectionEntry = {
              optimized_prompt: promptSeed,
              providerId: null,
              model: null,
              skipped_optimize: true,
              optimize_note: 'llm_rejected_use_original',
            };
            partialResume[index] = rejectionEntry;
            if (context && typeof context === 'object') {
              context.optimize_resume = partialResume;
              context.optimize_progress = {
                done: partialResume.filter(Boolean).length,
                total: scenes.length,
              };
            }
            return rejectionEntry;
          }
          const entry = {
            optimized_prompt: optimizedPrompt,
            providerId: 'prompt-engine',
            model: typeof validated.meta.model_used === 'string' && validated.meta.model_used.trim()
              ? validated.meta.model_used.trim()
              : null,
            ...validated.meta,
            truncated: validated.truncated || undefined,
          }
          // 逐场景写入部分结果，失败时可断点续传（context 与 run.context 同引用）
          partialResume[index] = entry
          if (context && typeof context === 'object') {
            context.optimize_resume = partialResume
            context.optimize_progress = {
              done: partialResume.filter(Boolean).length,
              total: scenes.length,
            }
          }
          return entry
        })
      } catch (error) {
        return {
          success: false,
          error: 'Story2Video optimize failed: ' + (error && error.message ? error.message : String(error)),
        }
      }
      if (context && typeof context === 'object' && Array.isArray(output)) {
        delete context.optimize_resume
      }

      // 提示词本地语言翻译（2026-08-12）：非 en 界面为历史记录「画面提示词」旁只读翻译生成。
      // fail-open：LLM 不可用/单场景失败 → translation=null，不阻塞流水线；上下文独立键存储，防数组往返丢失。
      const uiLocale = (params && params.uiLocale) || (stage && stage.options && stage.options.uiLocale) || ''
      if (uiLocale && uiLocale !== 'en' && Array.isArray(output) && output.length > 0) {
        const prompts = output.map((item) => {
          if (typeof item === 'string') return item
          return (item && (item.optimized_prompt || item.prompt)) || ''
        })
        const translations = await translatePromptsForLocale(getAiGenerator(pipelineEngine), prompts, uiLocale, pipelineEngine.log)
        if (context && typeof context === 'object') {
          context.prompt_translations = { uiLocale, items: translations }
        }
      }

      return { success: true, output };
    },
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.OPTIMIZE);

  // ----------------------------------------------------------
  // GENERATE_ASSETS - 并行图片 + TTS 生成
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS,
    async ({ runId, stage, params, context, serviceBus }) => {
      const log = pipelineEngine.log;
      params = params || {};

      // 从 context 获取前序阶段的输出
      let optimizedPrompts = context.optimize || context.optimized_prompts;
      let sentences = context.domain_enrich || context.split || context.sentences;

      // 兼容 prompt-engine 的包装响应 { results } / { data: { results } }
      if (!Array.isArray(optimizedPrompts)) {
        const wrapped = optimizedPrompts && optimizedPrompts.data
          ? optimizedPrompts.data
          : optimizedPrompts;
        if (Array.isArray(wrapped?.results)) optimizedPrompts = wrapped.results;
        else if (Array.isArray(wrapped?.optimized_prompts)) optimizedPrompts = wrapped.optimized_prompts;
      }

      // 适配 split 阶段输出：{ scenes: [...], sentences: [...], ... }（对象，非数组）
      // 与 stage-executor.js 中 OPTIMIZE_BATCH 的适配逻辑一致
      if (sentences && !Array.isArray(sentences)) {
        if (Array.isArray(sentences.scenes)) {
          sentences = sentences.scenes;
        } else if (Array.isArray(sentences.sentences)) {
          sentences = sentences.sentences;
        }
      }

      if (!Array.isArray(optimizedPrompts) || optimizedPrompts.length === 0) {
        return {
          success: false,
          error: 'generate_assets 需要 context.optimize (优化后的提示词数组)',
        };
      }
      if (!Array.isArray(sentences) || sentences.length === 0) {
        return {
          success: false,
          error: 'generate_assets 需要 context.split (分句结果数组)',
        };
      }

      const firstDefined = (...values) => values.find(v => v !== undefined && v !== null);
      const concurrency = normalizeAssetConcurrency(firstDefined(params.concurrency, stage.options?.concurrency, 3));
      const imageStyle = firstDefined(params.imageStyle, stage.options?.imageStyle, 'cinematic');
      const imageProvider = firstDefined(params.imageProvider, stage.options?.imageProvider);
      const imageModel = firstDefined(params.imageModel, stage.options?.imageModel);
      const aspectRatio = firstDefined(params.aspectRatio, stage.options?.aspectRatio, '16:9');
      const voiceId = firstDefined(params.voiceId, stage.options?.voiceId, 'default');
      const voiceProvider = firstDefined(params.voiceProvider, stage.options?.voiceProvider);
      // 多模态优先：未显式指定 provider 时，按能力让 ModelProviderManager.getDefault 解析
      // （开启「优先多模态」且多模态模型声明支持该能力时返回多模态模型）。仅 assetGenerator
      // 路径生效，legacy python 路径保持原有空 provider 行为。
      const resolveCapabilityProvider = (type) => {
        const manager = resolveModelProviderManager()
        if (!manager || typeof manager.getDefault !== 'function') return ''
        const provider = manager.getDefault(type)
        return provider && typeof provider.id === 'string' ? provider.id.trim() : ''
      }
      // 解析 ModelProviderManager：优先 aiGenerator（生产环境已注入 manager），
      // 其次 pipelineEngine.container（测试/分组 context）；container.get 未注册会抛错，必须兜底。
      const resolveModelProviderManager = () => {
        try {
          if (pipelineEngine && pipelineEngine.aiGenerator &&
            typeof pipelineEngine.aiGenerator._modelProviderManager === 'object' &&
            pipelineEngine.aiGenerator._modelProviderManager !== null) {
            return pipelineEngine.aiGenerator._modelProviderManager
          }
        } catch (_) { /* ignore */ }
        const container = pipelineEngine && pipelineEngine.container
        if (container && typeof container.get === 'function') {
          try {
            const manager = container.get('modelProviderManager')
            if (manager) return manager
          } catch (_) { /* 未注册/抛错 → 回退 null */ }
        }
        return null
      }
      const hasAssetGenerator = Boolean((pipelineEngine && pipelineEngine._assetGenerator) || (serviceBus && serviceBus._assetGenerator))
      const resolvedImageProvider = imageProvider || (hasAssetGenerator ? resolveCapabilityProvider('image') : '')
      const resolvedVoiceProvider = voiceProvider || (hasAssetGenerator ? resolveCapabilityProvider('tts') : '')
      // 统一调度预算：按「前端设置的默认模型」+ provider 配置的每分钟连接次数（运营后台）解析并发上限。
      // 预算来源优先级：provider config.rate_per_minute > 静态表 > 类别默认；未配置时回退请求并发。
      const resolveBudgetConcurrency = (type, providerId, requested) => {
        if (!providerId) return Math.max(1, Math.min(requested, MAX_ASSET_CONCURRENCY))
        const manager = resolveModelProviderManager()
        const provider = manager && typeof manager.getProvider === 'function' ? manager.getProvider(providerId) : null
        const budget = modelCallScheduler.resolveProviderBudget({ provider, type, manager, governor: pipelineEngine.governor })
        return Math.max(1, Math.min(requested, budget.maxConcurrent))
      }
      const imageConcurrency = resolveBudgetConcurrency('image', resolvedImageProvider, concurrency)
      const ttsConcurrency = resolveBudgetConcurrency('tts', resolvedVoiceProvider, concurrency)
      const inputMode = firstDefined(params.inputMode, stage.options?.inputMode, 'text');
      const inputImages = Array.isArray(params.images)
        ? params.images
        : (Array.isArray(stage.options?.images) ? stage.options.images : []);
      const inputAudio = Array.isArray(params.audio)
        ? params.audio
        : (Array.isArray(stage.options?.audio) ? stage.options.audio : []);
      const allowPartialAssets = params.allowPartialAssets === true || stage.options?.allowPartialAssets === true;
      // 历史提示词翻译（2026-08-12）：optimize 阶段产出，按场景 index 对齐
      const promptTranslationItems = (context && context.prompt_translations && Array.isArray(context.prompt_translations.items))
        ? context.prompt_translations.items
        : [];
      const promptTranslationOf = (index) => {
        const item = promptTranslationItems.find(i => i && i.index === index)
        return item && typeof item.translation === 'string' && item.translation ? item.translation : null
      };

      // 视频+图片轮播混合模式：读取 video_plan（select_video_scenes 阶段输出）与视频生成配置
      const videoMode = firstDefined(params.videoMode, stage.options?.videoMode, 'off');
      const videoConfig = stage.options?.video || params.videoConfig || {};
      const videoPlan = context && typeof context === 'object' ? context.video_plan : null;
      const videoSceneSet = new Set(
        Array.isArray(videoPlan && videoPlan.scenes)
          ? videoPlan.scenes.filter(scene => scene.useVideo === true).map(scene => scene.index)
          : [],
      );
      // 复用 select_video_scenes 已解析的 provider/model（避免阶段间二次解析漂移，2026-08-11 I10）；
      // 显式 videoConfig 仍优先（normalizer 白名单）。
      const videoGenerator = (videoMode !== 'off' && videoSceneSet.size > 0)
        ? resolveVideoGeneratorConfig(pipelineEngine, {
            provider: videoConfig.provider || (videoPlan && videoPlan.provider),
            model: videoConfig.model || (videoPlan && videoPlan.model),
          })
        : null;

      // 分镜素材自选（creationMode='manual'，2026-08-12）：生成候选（每场景 2 图 + 可选 1 视频）、
      // 跳过 TTS，以 scene_asset_selection 检查点暂停等待用户逐场景选择。
      const creationMode = firstDefined(params.creationMode, stage.options?.creationMode, 'auto')
      const manualMaterialMode = firstDefined(params.manualMaterialMode, stage.options?.manualMaterialMode, 'all-images')
      if (creationMode === 'manual') {
        return await buildManualSceneCandidates({
          pipelineEngine, serviceBus, runId, stage, params, context, log,
          optimizedPrompts, sentences, videoSceneSet, videoConfig, videoPlan, videoGenerator,
          imageStyle, imageProvider: resolvedImageProvider, imageModel, aspectRatio,
          imageConcurrency, inputMode, inputImages, resolveModelProviderManager, manualMaterialMode,
        })
      }

      log.info('Story2VideoStages',
        'Generating assets: ' + optimizedPrompts.length + ' scenes (' +
        videoSceneSet.size + ' AI video + ' + (optimizedPrompts.length - videoSceneSet.size) + ' image) + ' +
        sentences.length + ' TTS (imageConcurrency=' + imageConcurrency +
        ', ttsConcurrency=' + ttsConcurrency + ', requested=' + concurrency + ')');

      // 断点续传：上次失败时已完成的场景直接复用本地产物，避免重复消耗图片/视频/TTS 额度
      const resumeCompleted = new Map();
      const priorResume = context && context.generate_assets && Array.isArray(context.generate_assets.resume?.completed)
        ? context.generate_assets.resume.completed
        : [];
      for (const item of priorResume) {
        if (item && Number.isInteger(item.index) &&
            (typeof item.imagePath === 'string' || typeof item.videoPath === 'string') &&
            typeof item.audioPath === 'string') {
          resumeCompleted.set(item.index, item);
        }
      }

      // 实时进度（供前端阶段清单展示「图片 x/y · 视频 a/b · 旁白 x/y」）
      let imagesDone = 0;
      let videosDone = 0;
      let ttsDone = 0;
      const videosTotal = videoSceneSet.size;
      // 图片目标数：视频生成通过后，成功视频场景不再生成图片；失败回退图片的场景计入。
      let imageTargetCount = optimizedPrompts.length - videoSceneSet.size;
      const writeAssetsProgress = () => {
        if (context && typeof context === 'object') {
          context.assets_progress = {
            imagesDone,
            imagesTotal: imageTargetCount,
            videosDone,
            videosTotal,
            ttsDone,
            ttsTotal: sentences.length,
          };
        }
      };
      const markImageDone = () => { imagesDone += 1; writeAssetsProgress(); };
      const markVideoDone = () => { videosDone += 1; writeAssetsProgress(); };
      const markTtsDone = () => { ttsDone += 1; writeAssetsProgress(); };
      // 进度前置写入：阶段一开始即显示「图片 0/N · 视频 0/A · 旁白 0/M」，
      // 避免首个图片/视频/TTS 完成前（如图片生成需 16-30s）前端长期无数量信息
      writeAssetsProgress();

      // AI 视频场景生成（并发 1，串行；复用 videogen 的 provider 契约）
      const videoResults = new Map();
      if (videoGenerator && videosTotal > 0) {
        const manager = resolveModelProviderManager();
        if (!manager || typeof manager.callAdapter !== 'function') {
          return { success: false, error: '视频生成器可用性异常：模型管理器不可用' };
        }
        const videoSize = resolveVideoSize(params, stage);
        const videoFps = Number(params.fps || (params.output && params.output.fps) || (stage && stage.options && stage.options.fps)) || 30;
        const videoRunDir = path.join(os.tmpdir(), 'story2video', 'videoscenes', String(runId || 'run'));
        const videoSceneIndexes = [...videoSceneSet].sort((a, b) => a - b);
        const planScenes = Array.isArray(videoPlan && videoPlan.scenes) ? videoPlan.scenes : [];
        for (const index of videoSceneIndexes) {
          const resumed = resumeCompleted.get(index);
          if (resumed && typeof resumed.videoPath === 'string' && fs.existsSync(resumed.videoPath)) {
            videoResults.set(index, { success: true, path: resumed.videoPath, meta: { resumed: true } });
            markVideoDone();
            continue;
          }
          const promptItem = optimizedPrompts[index];
          const promptText = typeof promptItem === 'string'
            ? promptItem
            : ((promptItem && (promptItem.prompt || promptItem.optimized_prompt || promptItem.optimized)) || '');
          if (!promptText) {
            videoResults.set(index, { success: false, error: '视频场景缺少提示词' });
            markVideoDone();
            continue;
          }

          // 视频提示词统一走 prompt-engine（domain=video）：不得把图片优化提示词直接当视频提示词用。
          // 混合模式语义：视频优化失败 → 该场景回退图片轮播，不中断整条流水线（PRD 7.1.x）。
          let videoPromptText = promptText;
          const bus = serviceBus || pipelineEngine.serviceBus;
          if (bus && typeof bus.optimizeVideoPrompt === 'function') {
            try {
              const optResult = await bus.optimizeVideoPrompt(promptText, {
                platform: videoGenerator.providerId || undefined,
                ...(videoConfig.optimize && typeof videoConfig.optimize === 'object' ? videoConfig.optimize : {}),
              });
              const validated = extractOptimizedVideoPrompt(optResult, { index });
              if (!validated.ok) throw new Error(validated.error);
              videoPromptText = validated.prompt;
            } catch (error) {
              log.warn('Story2VideoStages', 'scene ' + index + ' video prompt optimize failed: ' +
                (error && error.message ? error.message : String(error)) + ' → fallback to image carousel');
              videoResults.set(index, { success: false, error: '视频提示词优化失败：' +
                (error && error.message ? error.message : String(error)) });
              markVideoDone();
              continue;
            }
          } else {
            log.warn('Story2VideoStages', 'scene ' + index + ' PromptBridge 未注入 → fallback to image carousel');
            videoResults.set(index, { success: false, error: '视频提示词优化需要 prompt-engine 服务（PromptBridge 未注入）' });
            markVideoDone();
            continue;
          }

          const planScene = planScenes.find(scene => scene.index === index);
          const runItem = () => withAssetTransientRetry(() => generateSceneVideo({
            manager,
            providerId: videoGenerator.providerId,
            model: videoGenerator.model,
            prompt: videoPromptText,
            index,
            seconds: (planScene && planScene.seconds) || 6,
            size: videoSize,
            fps: videoFps,
            runDir: videoRunDir,
            pollIntervalMs: videoConfig.pollIntervalMs,
          }));
          try {
            // 视频 provider 调用纳入统一预算调度（RPM 排队/429 冷却，2026-08-11 W2）；
            // 本路径直接调 manager.callAdapter，无内层 governor，不存在同 key 双包自死锁。
            const outcome = await modelCallScheduler.withModelBudget(
              { governor: pipelineEngine.governor, type: 'video', providerId: videoGenerator.providerId, model: videoGenerator.model },
              runItem,
            );
            if (outcome.success) {
              videoResults.set(index, outcome);
            } else {
              log.warn('Story2VideoStages', 'scene ' + index + ' video generation failed: ' + outcome.error + ' → fallback to image carousel');
              videoResults.set(index, outcome);
            }
          } catch (error) {
            log.warn('Story2VideoStages', 'scene ' + index + ' video generation threw: ' + (error && error.message ? error.message : String(error)) + ' → fallback to image carousel');
            videoResults.set(index, { success: false, error: error && error.message ? error.message : String(error) });
          }
          markVideoDone();
        }
      }

      // 图片目标：排除视频生成成功的场景（含断点续传复用的视频）；视频失败场景回退图片轮播。
      const imageTargets = optimizedPrompts
        .map((prompt, index) => ({ prompt, index }))
        .filter(item => !(videoSceneSet.has(item.index) && videoResults.get(item.index) && videoResults.get(item.index).success));
      imageTargetCount = imageTargets.length;
      writeAssetsProgress();

      // 并行生成图片（分批控制并发）
      // 使用 AssetGenerator（ffmpeg 占位图）替代 serviceBus.callPythonSkill
      const assetGenerator = pipelineEngine._assetGenerator || serviceBus._assetGenerator;
      const imageItemTask = async (prompt, index) => {
          try {
            const resumed = resumeCompleted.get(index);
            if (resumed) {
              markImageDone();
              return {
                index,
                success: true,
                path: resumed.imagePath || null,
                videoPath: resumed.videoPath || null,
                meta: { resumed: true },
              };
            }
            // 视频场景：AI 视频已生成 → 跳过图片（省额度）；失败 → 回退图片轮播
            if (videoSceneSet.has(index)) {
              const video = videoResults.get(index);
              if (video && video.success) {
                markImageDone();
                return { index, success: true, path: null, videoPath: video.path, meta: { video: true } };
              }
            }
            const promptText = typeof prompt === 'string' ? prompt : prompt.prompt || prompt.optimized_prompt || prompt.optimized;
            if (inputMode === 'images' && inputImages[index] !== undefined) {
              const suppliedPath = resolveInputImage(inputImages[index], runId, index);
              if (!suppliedPath) {
                return { index, success: false, error: 'Supplied image is missing, unreadable, or too large' };
              }
              markImageDone();
              return { index, success: true, path: suppliedPath, meta: { supplied: true } };
            }
            let result;
            if (assetGenerator) {
              // 瞬时错误（限流/超时/网络）有界重试；内容政策检查点等失败原样返回
              result = await withAssetTransientRetry(() => assetGenerator.generateImage(promptText, {
                style: imageStyle,
                image_provider: resolvedImageProvider,
                image_model: imageModel,
                index,
                aspect_ratio: aspectRatio,
                runId,
              }));
            } else {
              const retryResult = await runContentPolicyImageRetry({
                prompt: promptText,
                sceneIndex: index,
                maxAttempts: MAX_IMAGE_GENERATION_ATTEMPTS,
                generate: async ({ prompt: attemptPrompt }) => {
                  const attemptResult = await withAssetTransientRetry(() => serviceBus.callPythonSkill('generate_image', {
                    prompt: attemptPrompt,
                    style: imageStyle,
                    image_provider: imageProvider,
                    image_model: imageModel,
                    index,
                    aspect_ratio: aspectRatio,
                    runId,
                  }));
                  const providerError = attemptResult?.error || attemptResult?.data?.error;
                  if (providerError && typeof providerError === 'object') throw providerError;
                  if (attemptResult?.success === false || Number(attemptResult?.code) < 0) {
                    const error = new Error(
                      attemptResult?.message ||
                      (typeof providerError === 'string' ? providerError : 'Image generation failed')
                    );
                    if (attemptResult && typeof attemptResult === 'object') Object.assign(error, attemptResult);
                    throw error;
                  }
                  return attemptResult;
                },
              });
              if (retryResult.status === 'success') {
                result = retryResult.result;
              } else if (retryResult.status === 'needs_user_input') {
                result = {
                  code: -1,
                  message: 'Image generation requires user input after content-policy review',
                  needsUserInput: true,
                  checkpoint: retryResult.checkpoint,
                  data: {
                    needsUserInput: true,
                    checkpoint: retryResult.checkpoint,
                    generationAttempts: retryResult.attempts,
                  },
                };
              } else {
                result = {
                  code: -1,
                  message: retryResult.error?.message || 'Image generation failed',
                  data: { generationAttempts: retryResult.attempts },
                };
              }
            }
            const normalized = normalizeAssetResult(result, ['path', 'url', 'image_path']);
            if (normalized) {
              markImageDone();
              return {
                index,
                success: true,
                path: normalized.path,
                meta: normalized.meta,
              };
            }
            const contentPolicyCheckpoint = getContentPolicyCheckpoint(result, index);
            return {
              index,
              success: false,
              error: (result && result.message) || 'Image generation failed',
              needsUserInput: Boolean(contentPolicyCheckpoint),
              checkpoint: contentPolicyCheckpoint,
              generationAttempts: Array.isArray(result?.data?.generationAttempts)
                ? result.data.generationAttempts
                : [],
            };
          } catch (e) {
            return { index, success: false, error: e.message };
          }
      };
      // 调度边界（2026-08-10 图片轮播 generate_assets 卡死复盘）：
      // assetGenerator 路径已由 AIGenerator.generate 内部 governor 统一调度（同 key 单层），
      // 阶段外层再套 withModelBudget/governor.run 会与内层同 key 双包 → 并发信号量自死锁。
      // 仅 legacy python 路径（无 assetGenerator）在此做统一调度：RPM 排队 + 429 冷却 + 5h 窗口。
      const imagePromise = _mapWithConcurrency(
        imageTargets,
        imageConcurrency,
        (item) => {
          const runItem = () => imageItemTask(item.prompt, item.index);
          return assetGenerator
            ? runItem()
            : modelCallScheduler.withModelBudget(
                { governor: pipelineEngine.governor, type: 'image', providerId: resolvedImageProvider, model: imageModel },
                runItem,
              );
        },
      );

      // 并行生成 TTS 音频（分批控制并发）
      const ttsItemTask = async (sentence, index) => {
          try {
            const resumed = resumeCompleted.get(index);
            if (resumed) {
              markTtsDone();
              return { index, success: true, path: resumed.audioPath, duration: resumed.duration || null, meta: { resumed: true } };
            }
            const suppliedAudio = inputAudio[index]
            if (suppliedAudio !== undefined) {
              const suppliedPath = resolveInputAudio(suppliedAudio)
              if (!suppliedPath) {
                return { index, success: false, error: 'Supplied audio is missing or unreadable' };
              }
              markTtsDone();
              return {
                index,
                success: true,
                path: suppliedPath,
                duration: typeof suppliedAudio === 'object' ? suppliedAudio.duration : null,
                meta: { supplied: true },
              };
            }
            const text = typeof sentence === 'string' ? sentence : sentence.text || sentence.content;
            const result = await withAssetTransientRetry(() => assetGenerator
              ? assetGenerator.generateTTS(text, {
                  voice_id: voiceId,
                  voice_provider: resolvedVoiceProvider,
                  voice_model: firstDefined(params.voiceModel, stage.options?.voiceModel),
                  rate: firstDefined(params.voiceSpeed, stage.options?.voiceSpeed),
                  pitch: firstDefined(params.voicePitch, stage.options?.voicePitch),
                  emotion: firstDefined(params.voiceEmotion, stage.options?.voiceEmotion),
                  index,
                  runId,
                })
              : serviceBus.callPythonSkill('generate_tts', {
                  text,
                  voice_id: voiceId,
                  voice_provider: firstDefined(params.voiceProvider, stage.options?.voiceProvider),
                  voice_model: firstDefined(params.voiceModel, stage.options?.voiceModel),
                  rate: firstDefined(params.voiceSpeed, stage.options?.voiceSpeed),
                  pitch: firstDefined(params.voicePitch, stage.options?.voicePitch),
                  emotion: firstDefined(params.voiceEmotion, stage.options?.voiceEmotion),
                  index,
                  runId,
                }));
            const normalized = normalizeAssetResult(result, ['path', 'audio_path']);
            if (normalized) {
              markTtsDone();
              return {
                index,
                success: true,
                path: normalized.path,
                duration: normalized.duration,
                meta: normalized.meta,
              };
            }
            return {
              index,
              success: false,
              error: (result && result.message) || 'TTS generation failed',
            };
          } catch (e) {
            return { index, success: false, error: e.message };
          }
      };
      // 同 image 的调度边界：assetGenerator 路径由 AIGenerator 内部 governor 单层调度；
      // 仅 legacy python 路径在外层套 withModelBudget（避免同 key 双包自死锁）。
      const ttsPromise = _mapWithConcurrency(
        sentences,
        ttsConcurrency,
        (sentence, index) => {
          const runItem = () => ttsItemTask(sentence, index);
          return assetGenerator
            ? runItem()
            : modelCallScheduler.withModelBudget(
                { governor: pipelineEngine.governor, type: 'tts', providerId: resolvedVoiceProvider, model: firstDefined(params.voiceModel, stage.options?.voiceModel) },
                runItem,
              );
        },
      );
      const [imageResults, ttsResults] = await Promise.all([imagePromise, ttsPromise]);

      // 检查失败
      const failedImages = imageResults.filter(r => !r.success);
      const failedTts = ttsResults.filter(r => !r.success);
      if (failedImages.length > 0 || failedTts.length > 0) {
        log.warn('Story2VideoStages',
          'Asset generation had failures: ' + failedImages.length + ' images, ' +
          failedTts.length + ' TTS');
      }

      // 以 scene index 配对图片/视频和音频，避免独立过滤后发生错位。
      // 图片结果来自过滤后的 imageTargets，必须按返回的 index 回映射到场景。
      const imageByIndex = new Map(imageResults.map(item => [item.index, item]));
      const videoByIndex = new Map([...videoResults.entries()].filter(([, item]) => item && item.success));
      const pairedScenes = [];
      const maxScenes = Math.max(ttsResults.length, sentences.length, optimizedPrompts.length);
      for (let i = 0; i < maxScenes; i++) {
        const image = imageByIndex.get(i);
        const video = videoByIndex.get(i);
        const audio = ttsResults[i];
        if (!audio?.success || !audio.path) continue;
        if (!(image && image.success && image.path) && !(video && video.path)) continue;
        const sentence = sentences[i];
        const prompt = optimizedPrompts[i];
        pairedScenes.push({
          index: i,
          text: typeof sentence === 'string' ? sentence : sentence?.text || sentence?.content || '',
          prompt: typeof prompt === 'string' ? prompt : prompt?.prompt || prompt?.optimized_prompt || prompt?.optimized || '',
          // 历史提示词翻译（2026-08-12）：非 en 界面随分段持久化，结果页只读展示
          promptTranslation: promptTranslationOf(i),
          imagePath: (image && image.success && image.path) ? image.path : null,
          videoPath: (video && video.path) ? video.path : null,
          audioPath: audio.path,
          duration: audio.duration || null,
          imageMeta: (image && image.meta) || null,
          videoMeta: (video && video.meta) || null,
          audioMeta: audio.meta || null,
          subtitleBlocks: Array.isArray(sentence?.subtitleBlocks) ? [...sentence.subtitleBlocks] : [],
          sceneSource: sentence?.sceneSource || null,
          subtitleSource: sentence?.subtitleSource || null,
          degraded: sentence?.degraded === true,
          fallbackReason: sentence?.fallbackReason || null,
        });
      }

      // 字幕时间戳真实对齐（Tier2 ASR）：TTS 音频就绪后，用真实词级时间替换比例估算（fail-open）
      if (pairedScenes.length > 0) {
        await alignScenes(pairedScenes, { log })
      }

      // 构建资源清单
      const assetManifest = {
        scenes: pairedScenes,
        images: pairedScenes.filter(scene => scene.imagePath).map(scene => ({
          index: scene.index, success: true, path: scene.imagePath, meta: scene.imageMeta,
        })),
        videos: pairedScenes.filter(scene => scene.videoPath).map(scene => ({
          index: scene.index, success: true, path: scene.videoPath, meta: scene.videoMeta,
        })),
        audio: pairedScenes.map(scene => ({
          index: scene.index, success: true, path: scene.audioPath, duration: scene.duration, meta: scene.audioMeta,
        })),
        sentences: sentences.map((s, i) => ({
          index: i,
          text: typeof s === 'string' ? s : s.text || s.content,
          audioPath: ttsResults[i]?.path || null,
          duration: ttsResults[i]?.duration || null,
          audioMeta: ttsResults[i]?.meta || null,
          subtitleBlocks: Array.isArray(s?.subtitleBlocks) ? [...s.subtitleBlocks] : [],
          sceneSource: s?.sceneSource || null,
          subtitleSource: s?.subtitleSource || null,
          degraded: s?.degraded === true,
          fallbackReason: s?.fallbackReason || null,
        })),
        optimizedPrompts: optimizedPrompts.map((p, i) => ({
          index: i,
          prompt: typeof p === 'string' ? p : p.prompt || p.optimized_prompt || p.optimized,
          imagePath: (imageByIndex.get(i) && imageByIndex.get(i).path) || null,
          imageMeta: (imageByIndex.get(i) && imageByIndex.get(i).meta) || null,
          videoPath: (videoByIndex.get(i) && videoByIndex.get(i).path) || null,
          videoMeta: (videoByIndex.get(i) && videoByIndex.get(i).meta) || null,
        })),
        failures: {
          images: failedImages.map(item => ({
            index: item.index,
            error: item.error || 'Image generation failed',
            needsUserInput: item.needsUserInput === true,
            checkpoint: item.checkpoint || null,
            generationAttempts: Array.isArray(item.generationAttempts) ? item.generationAttempts : [],
          })),
          audio: failedTts.map(item => ({ index: item.index, error: item.error || 'TTS generation failed' })),
        },
        segmentation: {
          sceneSource: pairedScenes.find(scene => scene.sceneSource)?.sceneSource || null,
          subtitleSource: pairedScenes.find(scene => scene.subtitleSource)?.subtitleSource || null,
          degraded: pairedScenes.some(scene => scene.degraded === true),
          fallbackReason: pairedScenes.find(scene => scene.fallbackReason)?.fallbackReason || null,
        },
        stats: {
          totalImages: imageTargets.length,
          successImages: imageResults.filter(r => r.success).length,
          totalVideos: videoSceneSet.size,
          successVideos: [...videoResults.values()].filter(item => item && item.success).length,
          totalTts: ttsResults.length,
          successTts: ttsResults.filter(r => r.success).length,
          totalScenes: maxScenes,
          successScenes: pairedScenes.length,
          failedScenes: maxScenes - pairedScenes.length,
          degradedImages: pairedScenes.filter(scene => scene.imageMeta?.degraded === true).length,
          degradedTts: pairedScenes.filter(scene => scene.audioMeta?.degraded === true).length,
        },
        generatedAt: new Date().toISOString(),
      };

      // 内容政策耗尽时必须停在可操作的人工处理点，不能因为允许部分资源而继续输出成片。
      const contentPolicyCheckpointMeta = buildContentPolicyCheckpointMeta(failedImages);
      if (contentPolicyCheckpointMeta) {
        return {
          success: true,
          output: assetManifest,
          checkpoint: 'needs_user_input',
          checkpointMeta: contentPolicyCheckpointMeta,
        };
      }

      // 默认要求每个 scene 都有成对资源；部分成片必须显式 opt-in。
      if (pairedScenes.length === 0 || (!allowPartialAssets && pairedScenes.length < maxScenes)) {
        // 记录已完成的场景（图片+音频都有），供「从断点继续」跳过，避免重复消耗额度
        if (context && typeof context === 'object') {
          context.generate_assets = context.generate_assets || {};
          context.generate_assets.resume = {
            completed: pairedScenes.map((scene) => ({
              index: scene.index,
              imagePath: scene.imagePath || null,
              videoPath: scene.videoPath || null,
              audioPath: scene.audioPath,
              duration: scene.duration || null,
            })),
            total: maxScenes,
            savedAt: new Date().toISOString(),
          };
        }
        const failureDetails = [
          ...summarizeAssetFailures('Image', failedImages),
          ...summarizeAssetFailures('TTS', failedTts),
        ];
        return {
          success: false,
          error: 'Asset scene generation failed: ' + pairedScenes.length + '/' + maxScenes +
                 ' scenes have both image and audio' +
                 (failureDetails.length > 0 ? '. ' + failureDetails.join('; ') : ''),
        };
      }

      if (context && typeof context === 'object' && context.generate_assets && context.generate_assets.resume) {
        delete context.generate_assets.resume;
      }
      return {
        success: true,
        output: assetManifest,
      };
    }
  );
  registered.push(STORY2VIDEO_STAGE_TYPES.GENERATE_ASSETS);

  // ----------------------------------------------------------
  // FINALIZE_ASSETS - 分镜素材自选（manual）确认后：校验选择 → 生成 TTS → 组装最终素材清单
  // （auto 模式该阶段不进入运行清单；防御性快速通过）
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    STORY2VIDEO_STAGE_TYPES.FINALIZE_ASSETS,
    async ({ stage, params, context, serviceBus, runId }) => {
      const log = pipelineEngine.log
      const creationMode = (params && params.creationMode) || (stage && stage.options && stage.options.creationMode) || 'auto'
      if (creationMode !== 'manual') {
        return { success: true, output: (context && context.generate_assets) || {} }
      }
      const manifest = (context && context.generate_assets) || {}
      const candidates = Array.isArray(manifest.candidates) ? manifest.candidates : []
      if (candidates.length === 0) {
        return { success: false, error: 'finalize_assets 缺少候选素材清单（context.generate_assets.candidates）' }
      }
      const selection = (context && context.scene_asset_selection) || null
      const selections = (selection && Array.isArray(selection.selections)) ? selection.selections : null
      if (!selections || selections.length === 0) {
        return { success: false, error: 'finalize_assets 需要先确认分镜素材选择（scene_asset_selection）' }
      }
      const byIndex = new Map(selections.map((s) => [s && s.index, s]))
      for (const scene of candidates) {
        const picked = byIndex.get(scene.index)
        if (!picked || typeof picked.candidateId !== 'string' || !picked.candidateId) {
          return { success: false, error: '分镜素材自选：场景 ' + scene.index + ' 未选择素材' }
        }
        const match = (scene.candidates || []).find((c) => c && c.id === picked.candidateId)
        if (!match || typeof match.path !== 'string' || !match.path) {
          return { success: false, error: '分镜素材自选：场景 ' + scene.index + ' 选择了无效素材 ' + picked.candidateId }
        }
      }

      // 生成所选场景的 TTS 旁白（断点续跑复用 partialTts；失败 fail closed 可重试）
      const concurrency = normalizeAssetConcurrency((params && params.concurrency) || (stage && stage.options && stage.options.concurrency) || 3)
      const ttsConcurrency = Math.max(1, Math.min(concurrency, MAX_ASSET_CONCURRENCY))
      const assetGenerator = pipelineEngine._assetGenerator || serviceBus._assetGenerator
      const voiceId = (params && params.voiceId) || (stage && stage.options && stage.options.voiceId) || 'default'
      const voiceProvider = (params && params.voiceProvider) || (stage && stage.options && stage.options.voiceProvider) || ''
      const voiceModel = (params && params.voiceModel) || (stage && stage.options && stage.options.voiceModel) || ''
      const voiceSpeed = (params && params.voiceSpeed) !== undefined ? params.voiceSpeed : (stage && stage.options && stage.options.voiceSpeed)
      const voicePitch = (params && params.voicePitch) !== undefined ? params.voicePitch : (stage && stage.options && stage.options.voicePitch)
      const voiceEmotion = (params && params.voiceEmotion) || (stage && stage.options && stage.options.voiceEmotion) || 'default'
      if (!context.finalize_assets || typeof context.finalize_assets !== 'object') context.finalize_assets = {}
      const partialTts = Array.isArray(context.finalize_assets.partialTts) ? context.finalize_assets.partialTts : []
      const partialByIndex = new Map(partialTts.filter((p) => p && Number.isInteger(p.index)).map((p) => [p.index, p]))
      const resolvedVoiceProvider = voiceProvider || (assetGenerator ? (() => {
        try {
          const manager = (pipelineEngine && pipelineEngine.aiGenerator && pipelineEngine.aiGenerator._modelProviderManager) ||
            (pipelineEngine && pipelineEngine.container && pipelineEngine.container.get && pipelineEngine.container.get('modelProviderManager'))
          const provider = manager && typeof manager.getDefault === 'function' ? manager.getDefault('tts') : null
          return provider && typeof provider.id === 'string' ? provider.id.trim() : ''
        } catch (_) { return '' }
      })() : '')

      const ttsItemTask = async (scene) => {
        const resumed = partialByIndex.get(scene.index)
        if (resumed && typeof resumed.audioPath === 'string' && fs.existsSync(resumed.audioPath)) {
          return { index: scene.index, success: true, path: resumed.audioPath, duration: resumed.duration || null, meta: { resumed: true } }
        }
        const text = String(scene.text || '')
        if (!text) return { index: scene.index, success: false, error: '场景缺少旁白文字' }
        try {
          const result = await withAssetTransientRetry(() => assetGenerator
            ? assetGenerator.generateTTS(text, {
                voice_id: voiceId,
                voice_provider: resolvedVoiceProvider,
                voice_model: voiceModel,
                rate: voiceSpeed,
                pitch: voicePitch,
                emotion: voiceEmotion,
                index: scene.index,
                runId: runId || undefined,
              })
            : serviceBus.callPythonSkill('generate_tts', {
                text,
                voice_id: voiceId,
                voice_provider: voiceProvider,
                voice_model: voiceModel,
                rate: voiceSpeed,
                pitch: voicePitch,
                emotion: voiceEmotion,
                index: scene.index,
                runId: runId || undefined,
              }))
          const normalized = normalizeAssetResult(result, ['path', 'audio_path'])
          if (normalized) {
            const partial = { index: scene.index, audioPath: normalized.path, duration: normalized.duration, meta: normalized.meta }
            context.finalize_assets.partialTts = [...(context.finalize_assets.partialTts || []).filter((p) => p.index !== scene.index), partial]
            return { index: scene.index, success: true, path: normalized.path, duration: normalized.duration, meta: normalized.meta }
          }
          return { index: scene.index, success: false, error: (result && result.message) || 'TTS generation failed' }
        } catch (error) {
          return { index: scene.index, success: false, error: error && error.message ? error.message : String(error) }
        }
      }
      const ttsResults = await _mapWithConcurrency(candidates, ttsConcurrency, ttsItemTask)
      const failedTts = ttsResults.filter((r) => !r.success)
      if (failedTts.length > 0) {
        return {
          success: false,
          error: '旁白生成失败（场景 ' + failedTts.map((r) => r.index).join(', ') + '）：' + failedTts[0].error,
        }
      }

      // 组装最终素材清单（与全自动 generate_assets 输出结构兼容，compose 无需改动）
      const pairedScenes = []
      for (const scene of candidates) {
        const tts = ttsResults.find((r) => r.index === scene.index)
        const picked = byIndex.get(scene.index)
        const pickedCandidate = (scene.candidates || []).find((c) => c && c.id === picked.candidateId)
        if (!tts || !tts.success || !tts.path || !pickedCandidate) continue
        pairedScenes.push({
          index: scene.index,
          text: scene.text || '',
          prompt: scene.prompt || '',
          promptTranslation: scene.promptTranslation || null,
          imagePath: pickedCandidate.kind === 'image' ? pickedCandidate.path : null,
          videoPath: pickedCandidate.kind === 'video' ? pickedCandidate.path : null,
          audioPath: tts.path,
          duration: tts.duration || null,
          imageMeta: pickedCandidate.kind === 'image' ? (pickedCandidate.meta || null) : null,
          videoMeta: pickedCandidate.kind === 'video' ? (pickedCandidate.meta || null) : null,
          audioMeta: tts.meta || null,
          subtitleBlocks: Array.isArray(scene.subtitleBlocks) ? [...scene.subtitleBlocks] : [],
          sceneSource: scene.sceneSource || null,
          subtitleSource: scene.subtitleSource || null,
          degraded: scene.degraded === true,
          fallbackReason: scene.fallbackReason || null,
        })
      }
      if (pairedScenes.length > 0) {
        await alignScenes(pairedScenes, { log })
      }

      const finalManifest = {
        materialMode: manifest.materialMode || 'all-images',
        creationMode: 'manual',
        candidates: manifest.candidates,
        selection,
        scenes: pairedScenes,
        images: pairedScenes.filter((scene) => scene.imagePath).map((scene) => ({
          index: scene.index, success: true, path: scene.imagePath, meta: scene.imageMeta,
        })),
        videos: pairedScenes.filter((scene) => scene.videoPath).map((scene) => ({
          index: scene.index, success: true, path: scene.videoPath, meta: scene.videoMeta,
        })),
        audio: pairedScenes.map((scene) => ({
          index: scene.index, success: true, path: scene.audioPath, duration: scene.duration, meta: scene.audioMeta,
        })),
        sentences: candidates.map((scene) => ({
          index: scene.index,
          text: scene.text || '',
          audioPath: (ttsResults.find((r) => r.index === scene.index) || {}).path || null,
          duration: (ttsResults.find((r) => r.index === scene.index) || {}).duration || null,
          audioMeta: (ttsResults.find((r) => r.index === scene.index) || {}).meta || null,
          subtitleBlocks: Array.isArray(scene.subtitleBlocks) ? [...scene.subtitleBlocks] : [],
          sceneSource: scene.sceneSource || null,
          subtitleSource: scene.subtitleSource || null,
          degraded: scene.degraded === true,
          fallbackReason: scene.fallbackReason || null,
        })),
        optimizedPrompts: candidates.map((scene) => {
          const picked = byIndex.get(scene.index)
          const pickedCandidate = (scene.candidates || []).find((c) => c && c.id === picked.candidateId)
          return {
            index: scene.index,
            prompt: scene.prompt || '',
            imagePath: pickedCandidate && pickedCandidate.kind === 'image' ? pickedCandidate.path : null,
            imageMeta: pickedCandidate && pickedCandidate.kind === 'image' ? (pickedCandidate.meta || null) : null,
            videoPath: pickedCandidate && pickedCandidate.kind === 'video' ? pickedCandidate.path : null,
            videoMeta: pickedCandidate && pickedCandidate.kind === 'video' ? (pickedCandidate.meta || null) : null,
          }
        }),
        failures: {
          images: [],
          audio: failedTts.map((item) => ({ index: item.index, error: item.error || 'TTS generation failed' })),
        },
        stats: {
          totalImages: candidates.length * 2,
          successImages: pairedScenes.filter((scene) => scene.imagePath).length,
          totalVideos: candidates.filter((scene) => (scene.candidates || []).some((c) => c.kind === 'video')).length,
          successVideos: pairedScenes.filter((scene) => scene.videoPath).length,
          totalTts: candidates.length,
          successTts: pairedScenes.length,
          totalScenes: candidates.length,
          successScenes: pairedScenes.length,
          failedScenes: candidates.length - pairedScenes.length,
        },
        segmentation: manifest.segmentation || {
          sceneSource: null, subtitleSource: null, degraded: false, fallbackReason: null,
        },
      }
      if (context && typeof context === 'object') context.generate_assets = finalManifest
      log.info('Story2VideoStages',
        'finalize_assets: ' + pairedScenes.length + '/' + candidates.length + ' scenes finalized (tts=' + pairedScenes.length + ')')
      return { success: true, output: finalManifest }
    },
  )
  registered.push(STORY2VIDEO_STAGE_TYPES.FINALIZE_ASSETS);

  return { success: true, registered };
}

/**
 * 带并发限制的 map
 * @param {Array} items
 * @param {number} concurrency
 * @param {Function} fn - async (item, index) => result
 * @returns {Promise<Array>}
 */
async function _mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current], current);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

module.exports = {
  registerStory2VideoStages,
  STORY2VIDEO_STAGE_TYPES,
  MAX_ASSET_CONCURRENCY,
  normalizeAssetConcurrency,
  normalizeAssetResult,
  resolveInputImage,
  resolveInputAudio,
  hasMeaningfulText,
  isPromptEngineTooShortRejection,
  // 视频+图片轮播混合模式辅助（供测试）
  VIDEO_MODES,
  resolveVideoGeneratorConfig,
  estimateSceneSeconds,
  pickFixedVideoScenes,
  buildVideoSelectionPrompt,
  parseVideoSelection,
  clampVideoSelection,
  unwrapScenesArray,
  generateSceneVideo,
};


