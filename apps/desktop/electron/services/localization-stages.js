// @ts-check
/**
 * localization-stages - localization-dub（本地化配音）流水线的自定义阶段执行器
 *
 * 用户提供源视频 + 文案（可选）+ 目标语言：
 *   - localization_transcribe: 文案按行分句 + ffprobe 探测视频时长 → 时间段
 *   - localization_translate:  默认 LLM 把每段翻译为目标语言
 *   - localization_tts:        复用 AssetGenerator/Story2Video TTS 生成每段配音
 *   - localization_sync:       FFmpeg 按时间段拼接配音并替换原音轨 → 输出视频
 *
 * 注册方式：container.setup.js 中调用 registerLocalizationStages(pipelineEngine)
 */

'use strict'

const { execFile } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { findFfmpeg, findFfprobe } = require('./media-tool-paths')
const { getAllowedMediaRoots, resolveReadableMediaFile } = require('./story2video-paths')

const LOCALIZATION_STAGE_TYPES = {
  TRANSCRIBE: 'localization_transcribe',
  TRANSLATE: 'localization_translate',
  TTS: 'localization_tts',
  SYNC: 'localization_sync',
}

const MAX_SEGMENTS = 30
const DEFAULT_TARGET_LANGUAGE = 'en'

function runTool (binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 64 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) reject(new Error(String(stderr || error.message).slice(0, 1200)))
      else resolve(String(stdout) + '\n' + String(stderr))
    })
  })
}

function getRunDir (runId) {
  return path.join(os.tmpdir(), 'story2video', 'localization', String(runId || 'run'))
}

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

function getDefaultTtsConfig (aiGenerator) {
  const manager = aiGenerator && aiGenerator._modelProviderManager
  const provider = manager && typeof manager.getDefault === 'function'
    ? manager.getDefault('tts')
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
    temperature: 0.3,
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

function buildTranslatePrompt (segments, targetLanguage) {
  const lines = segments.map((segment, index) => `${index + 1}. ${segment.text}`).join('\n')
  return {
    system: `你是专业影视字幕翻译。把用户提供的台词逐条翻译成${targetLanguage}，保持口语化与时间语义。只输出翻译结果，每行一条，格式「序号. 译文」，不要多余文字。`,
    user: lines,
  }
}

function parseTranslations (raw, count) {
  const out = []
  const source = String(raw || '')
  // 每行「序号. 译文」或「序号）译文」
  const lines = source.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (let i = 0; i < Math.min(count, lines.length); i++) {
    const text = lines[i].replace(/^\d+\s*[.)、]\s*/, '').trim()
    if (text) out.push(text)
  }
  return out
}

/** 从文案拆分时间段：按行分句，均分视频时长。 */
function buildSegments (script, duration) {
  const lines = String(script || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
  if (lines.length === 0) return []
  const total = Number(duration) > 0 ? Number(duration) : 6
  const per = total / lines.length
  return lines.slice(0, MAX_SEGMENTS).map((text, index) => ({
    index,
    text,
    start: Number((index * per).toFixed(3)),
    end: Number(((index + 1) * per).toFixed(3)),
  }))
}

/**
 * 注册 localization-dub 流水线的自定义阶段执行器
 * @param {object} pipelineEngine - PipelineEngine 实例
 * @returns {{success: boolean, error?: string, registered?: string[]}}
 */
function registerLocalizationStages (pipelineEngine) {
  if (!pipelineEngine || !pipelineEngine.stageExecutor) {
    return { success: false, error: 'PipelineEngine.stageExecutor not configured (ServiceBus missing)' }
  }

  const registered = []
  const log = pipelineEngine.log

  // ----------------------------------------------------------
  // TRANSCRIBE - 源视频 + 文案 → 带时间段的台词
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    LOCALIZATION_STAGE_TYPES.TRANSCRIBE,
    async ({ params }) => {
      const rawVideo = params && (params.video || params.videoPath)
      const videoPath = resolveReadableMediaFile(rawVideo, {
        kind: 'video',
        allowedRoots: getAllowedMediaRoots(),
      })
      if (!videoPath) {
        return { success: false, error: 'localization-dub transcribe 需要可读的本地视频（params.video）' }
      }
      const script = typeof params.text === 'string' ? params.text.trim() : ''
      if (!script) {
        return { success: false, error: 'localization-dub 需要源视频文案（params.text）；本地语音识别未接入，请先提供文案' }
      }
      const ffprobe = findFfprobe()
      if (!ffprobe) return { success: false, error: 'ffprobe 不可用，无法探测视频' }
      try {
        const probe = await runTool(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', videoPath])
        const duration = Number(probe.trim())
        const segments = buildSegments(script, duration)
        if (segments.length === 0) {
          return { success: false, error: 'localization-dub transcribe 未能从文案拆分出任何时间段' }
        }
        return { success: true, output: { videoPath, duration, targetLanguage: params.targetLanguage || params.language || DEFAULT_TARGET_LANGUAGE, segments } }
      } catch (error) {
        return { success: false, error: 'transcribe 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(LOCALIZATION_STAGE_TYPES.TRANSCRIBE)

  // ----------------------------------------------------------
  // TRANSLATE - 台词 → 目标语言
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    LOCALIZATION_STAGE_TYPES.TRANSLATE,
    async ({ stage, context }) => {
      const aiGenerator = getAiGenerator(pipelineEngine)
      if (!aiGenerator) {
        return { success: false, error: '默认 LLM 不可用，请先完成模型设置' }
      }
      const segments = Array.isArray(context.transcribe?.segments) ? context.transcribe.segments : []
      if (segments.length === 0) {
        return { success: false, error: 'localization-dub translate 需要 context.transcribe.segments' }
      }
      const targetLanguage = context.transcribe.targetLanguage || DEFAULT_TARGET_LANGUAGE
      const { system, user } = buildTranslatePrompt(segments, targetLanguage)
      try {
        const raw = await callDefaultLlm(aiGenerator, system, user)
        const translations = parseTranslations(raw, segments.length)
        const translated = segments.map((segment, index) => ({
          ...segment,
          translatedText: translations[index] || segment.text,
        }))
        return { success: true, output: { ...context.transcribe, segments: translated } }
      } catch (error) {
        return { success: false, error: 'translate 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(LOCALIZATION_STAGE_TYPES.TRANSLATE)

  // ----------------------------------------------------------
  // TTS - 每段译文生成配音
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    LOCALIZATION_STAGE_TYPES.TTS,
    async ({ runId, stage, params, context }) => {
      const segments = Array.isArray(context.translate?.segments) ? context.translate.segments : []
      if (segments.length === 0) {
        return { success: false, error: 'localization-dub tts 需要 context.translate.segments' }
      }
      const aiGenerator = getAiGenerator(pipelineEngine)
      const defaultTts = getDefaultTtsConfig(aiGenerator)
      const voiceProvider = params.voiceProvider || stage.options?.voiceProvider || (defaultTts && defaultTts.providerId) || ''
      const voiceModel = params.voiceModel || stage.options?.voiceModel || (defaultTts && defaultTts.model) || ''
      const serviceBus = pipelineEngine.stageExecutor && pipelineEngine.stageExecutor.serviceBus
      const assetGenerator = pipelineEngine._assetGenerator || (serviceBus && serviceBus._assetGenerator)
      const results = []
      for (let i = 0; i < segments.length; i++) {
        const text = segments[i].translatedText || segments[i].text
        try {
          let result
          if (assetGenerator && typeof assetGenerator.generateTTS === 'function') {
            result = await assetGenerator.generateTTS(text, {
              voice_id: params.voiceId || 'default',
              voice_provider: voiceProvider,
              voice_model: voiceModel,
              index: i,
              runId,
            })
          } else if (serviceBus && typeof serviceBus.callPythonSkill === 'function') {
            result = await serviceBus.callPythonSkill('generate_tts', {
              text,
              voice_id: params.voiceId || 'default',
              voice_provider: voiceProvider,
              voice_model: voiceModel,
              index: i,
              runId,
            })
          } else {
            return { success: false, error: 'localization-dub tts 缺少可用的 TTS 生成器（assetGenerator/serviceBus）' }
          }
          const out = result && (result.path || result.audio_path || (result.data && (result.data.path || result.data.audio_path)))
          if (!out) {
            results.push({ index: i, success: false, error: 'TTS 未返回音频路径' })
            continue
          }
          results.push({ index: i, success: true, path: out, duration: result.duration || (result.data && result.data.duration) || null })
        } catch (error) {
          results.push({ index: i, success: false, error: (error && error.message ? error.message : String(error)) })
        }
      }
      const failed = results.filter(r => !r.success)
      if (failed.length > 0) {
        log.warn('LocalizationStages', 'tts 部分失败: ' + failed.map(f => f.error).join('; '))
      }
      const audioFiles = results.filter(r => r.success)
      if (audioFiles.length === 0) {
        return { success: false, error: 'localization-dub tts 全部配音生成失败' }
      }
      const output = { ...context.translate, segments: context.translate.segments.map((s, i) => ({ ...s, audioPath: results[i]?.success ? results[i].path : null })), audioFiles }
      return { success: true, output }
    },
  )
  registered.push(LOCALIZATION_STAGE_TYPES.TTS)

  // ----------------------------------------------------------
  // SYNC - FFmpeg 拼接配音并按时间轴替换原音轨
  // ----------------------------------------------------------
  pipelineEngine.registerStageExecutor(
    LOCALIZATION_STAGE_TYPES.SYNC,
    async ({ stage, params, context }) => {
      const data = context.tts
      const segments = Array.isArray(data?.segments) ? data.segments : []
      const videoPath = data?.videoPath
      if (segments.length === 0 || !videoPath) {
        return { success: false, error: 'localization-dub sync 需要 context.tts（含 videoPath 与 segments）' }
      }
      const ffmpeg = findFfmpeg()
      if (!ffmpeg) return { success: false, error: 'ffmpeg 不可用，无法合成配音' }
      const runDir = getRunDir(stage.runId || params.runId || ('run_' + Date.now()))
      fs.mkdirSync(runDir, { recursive: true })
      try {
        const audioSegments = segments.filter(s => s.audioPath && fs.existsSync(s.audioPath))
        if (audioSegments.length === 0) {
          return { success: false, error: 'localization-dub sync 没有可用配音文件' }
        }
        // 用 concat demuxer 按顺序拼接配音（保持原片时间顺序）
        const concatFile = path.join(runDir, 'dub-list.txt')
        const concatLines = audioSegments.map(s => "file '" + String(s.audioPath).replace(/'/g, "'\\''") + "'")
        fs.writeFileSync(concatFile, concatLines.join('\n'), 'utf8')
        const dubbedAudio = path.join(runDir, 'dubbed.m4a')
        await runTool(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatFile, '-c:a', 'aac', '-b:a', '128k', dubbedAudio])
        // 把新音轨封装回原视频
        const output = path.join(runDir, 'video.mp4')
        await runTool(ffmpeg, ['-y', '-i', videoPath, '-i', dubbedAudio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-shortest', output])
        return { success: true, output: { videoPath: output, segments, duration: data.duration } }
      } catch (error) {
        return { success: false, error: 'sync 失败：' + (error && error.message ? error.message : String(error)) }
      }
    },
  )
  registered.push(LOCALIZATION_STAGE_TYPES.SYNC)

  return { success: true, registered }
}

module.exports = {
  LOCALIZATION_STAGE_TYPES,
  buildTranslatePrompt,
  parseTranslations,
  buildSegments,
  registerLocalizationStages,
}
