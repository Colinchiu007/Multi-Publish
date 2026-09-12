/**
 * Story2Video 配置快照 → 启动参数构建（热门选题一键生成视频，2026-09-12）。
 *
 * 从 owner-scoped SQLite 的 story2video.lastOptions.v1 快照构建 story2videoTextConfig，
 * 与 CreateView.buildStory2VideoTextConfig / _applyS2VSnapshot 保持同一契约：
 * - 默认值必须与 CreateView data() 的 s2vConfig/s2vOutputConfig 逐字一致（单一来源锚定）。
 * - 快照应用只做类型守卫（undefined/null 跳过、类型不匹配跳过、数组/对象深拷贝），
 *   与 CreateView._applyS2VSnapshot 相同，不在此处做枚举白名单归一化——
 *   枚举归一由主进程 normalizer 兜底（normalizeStory2VideoTextParams）。
 */
import { getLanguageBaseWordsPerSecond } from './voice-estimate'

export const STORY2VIDEO_OUTPUT_ASPECT_RATIOS = Object.freeze({
  '720x1280': '9:16', '1920x1080': '16:9', '3840x2160': '16:9',
  '1080x1920': '9:16', '1080x1440': '3:4',
})

export function getStory2VideoOutputAspectRatio(resolution) {
  return STORY2VIDEO_OUTPUT_ASPECT_RATIOS[resolution] || '9:16'
}

/** 默认 s2vConfig —— 与 CreateView data().s2vConfig 逐字一致（修改任一侧必须同步另一侧）。 */
export const S2V_CONFIG_DEFAULTS = Object.freeze({
  contentType: 'general', imageStyle: 'cinematic',
  imageProvider: '', imageModel: '',
  voiceId: '', voiceProvider: '', voiceModel: '',
  voiceSpeed: 1, voiceVolume: 1,
  templateId: '', imageEffect: 'zoom-in',
  videoMode: 'off', shortVideoHandling: 'loop', videoProvider: '', videoModel: '',
  videoFixedRatio: 25, videoMinRatio: 20, videoMaxRatio: 40, videoMaxScenes: 3,
  creationMode: 'auto', manualMaterialMode: 'all-images',
  splitLanguage: 'auto', splitMode: 'balanced', splitMaxSentenceLength: 200, splitTargetSeconds: 6,
  splitTargetCharsPerScene: 20, splitViewMode: 'seconds',
  splitMinWords: 10, splitMaxWords: 50,
  splitEnforceSentenceBoundary: true, splitOverflowToNext: true,
  sceneDurationMode: 'follow-audio', minSceneDuration: 6,
  splitSubtitleMinChars: 8, splitSubtitleMaxChars: 15, splitSubtitleTiming: 'proportional',
  promptStyle: 'realistic', negativePrompt: '',
  maxPromptLength: 2000,
  transition: 'fade', subtitleEnabled: true,
  subtitleSize: 'size3', subtitleStyleName: 'style1',
  subtitleStyle: { size: 'md', style: 'style1', color: 'white' },
  bgmPath: '', bgmVolume: 5, watermark: false, watermarkText: '',
  watermarkConfig: { enabled: false, position: 'bottom-right', fontSize: 24, opacity: 0.6, color: 'white' },
  platforms: [], publishEnabled: false, title: '', tagsText: '', publishContent: '', coverUrl: '',
})

/** 默认 s2vOutputConfig —— 与 CreateView data().s2vOutputConfig 一致。 */
export const S2V_OUTPUT_CONFIG_DEFAULTS = Object.freeze({ resolution: '720x1280', fps: 30, format: 'mp4' })

/**
 * 快照应用（与 CreateView._applyS2VSnapshot 同源的类型守卫）：
 * 只接受与目标默认值类型相同的字段；数组/对象深拷贝，避免共享引用。
 */
export function applyS2VSnapshotToDefaults(source, target) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return target
  for (const key of Object.keys(target)) {
    const value = source[key]
    if (value === undefined || value === null) continue
    if (Array.isArray(target[key])) {
      if (Array.isArray(value)) target[key] = JSON.parse(JSON.stringify(value))
      continue
    }
    const defaultType = typeof target[key]
    if (defaultType === 'object') {
      if (value && typeof value === 'object' && !Array.isArray(value)) target[key] = JSON.parse(JSON.stringify(value))
      continue
    }
    if (typeof value === defaultType) target[key] = value
  }
  return target
}

/**
 * 从 lastOptions 快照（或 null）解析出可用的 { s2vConfig, s2vOutputConfig }。
 * 快照缺失/结构非法时回退默认值（与 /create 页首次使用一致）。
 */
export function resolveS2VConfigsFromSnapshot(snapshot) {
  const config = JSON.parse(JSON.stringify(S2V_CONFIG_DEFAULTS))
  const output = JSON.parse(JSON.stringify(S2V_OUTPUT_CONFIG_DEFAULTS))
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { s2vConfig: config, s2vOutputConfig: output }
  if (snapshot.s2vConfig && typeof snapshot.s2vConfig === 'object' && !Array.isArray(snapshot.s2vConfig)) {
    applyS2VSnapshotToDefaults(snapshot.s2vConfig, config)
  }
  if (snapshot.s2vOutputConfig && typeof snapshot.s2vOutputConfig === 'object' && !Array.isArray(snapshot.s2vOutputConfig)) {
    applyS2VSnapshotToDefaults(snapshot.s2vOutputConfig, output)
  }
  return { s2vConfig: config, s2vOutputConfig: output }
}

/**
 * 构建 story2videoTextConfig —— 字段映射与 CreateView.buildStory2VideoTextConfig 逐字一致。
 * text 为改写后的完整文案；snapshot 可为 null（回退默认）。
 */
export function buildStory2VideoTextConfigFromSnapshot(text, snapshot) {
  const { s2vConfig: config, s2vOutputConfig: output } = resolveS2VConfigsFromSnapshot(snapshot)
  const tags = String(config.tagsText || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
  return {
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
      targetCharsPerScene: config.splitTargetCharsPerScene,
      baseWordsPerSecond: getLanguageBaseWordsPerSecond(config.splitLanguage),
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
      maxLength: config.maxPromptLength,
      negativePrompt: config.negativePrompt,
    },
    image: {
      provider: config.imageProvider || '',
      model: config.imageModel || '',
      style: config.imageStyle,
      effect: config.imageEffect,
      aspectRatio: getStory2VideoOutputAspectRatio(output.resolution),
    },
    video: {
      mode: config.videoMode || 'off',
      shortVideoHandling: config.shortVideoHandling || 'loop',
      provider: config.videoProvider || '',
      model: config.videoModel || '',
      fixedRatio: config.videoFixedRatio,
      minRatio: config.videoMinRatio,
      maxRatio: config.videoMaxRatio,
      maxScenes: config.videoMaxScenes,
    },
    creation: {
      mode: config.creationMode || 'auto',
      materialMode: config.manualMaterialMode || 'all-images',
    },
    voice: {
      provider: config.voiceProvider || '',
      model: config.voiceModel || '',
      id: config.voiceId,
      speed: config.voiceSpeed,
      volume: config.voiceVolume,
    },
    subtitle: {
      enabled: config.subtitleEnabled,
      size: config.subtitleSize,
      style: config.subtitleStyleName,
      color: config.subtitleStyle?.color || 'white',
    },
    bgm: { enabled: Boolean(config.bgmPath), path: config.bgmPath || '', volume: config.bgmVolume },
    transition: config.transition,
    sceneDurationMode: config.sceneDurationMode,
    minSceneDuration: config.minSceneDuration,
    templateId: config.templateId || '',
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
}
