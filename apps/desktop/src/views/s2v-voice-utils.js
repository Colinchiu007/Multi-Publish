// s2v-voice-utils.js — Story2Video 语音/克隆纯工具函数
// 从 CreateView.vue 提取，代码-设计分离

/**
 * 规范化音色选项（id/name 必填，invalid 标记透传）
 */
export function toS2VVoiceOption(voice) {
  const id = typeof voice?.id === 'string' ? voice.id.trim() : ''
  const name = typeof voice?.name === 'string' ? voice.name.trim() : ''
  if (!id || !name) return null
  return { id, name, invalid: voice.invalid === true }
}

/**
 * 媒体类别标签
 */
export function story2videoKindLabel(kind) {
  const labels = {
    image: '图片',
    audio: '旁白音频',
    bgm: '背景音乐',
    video: '视频素材',
  }
  return labels[kind] || ''
}

/**
 * 规范化克隆音色要求（数值边界 + 扩展名白名单过滤）
 */
export function toS2VVoiceCloneRequirements(requirements) {
  if (!requirements || typeof requirements !== 'object' || Array.isArray(requirements)) return null
  const toFiniteNumber = (value) => Number.isFinite(value) && value >= 0 ? value : null
  return {
    allowedExtensions: Array.isArray(requirements.allowedExtensions)
      ? requirements.allowedExtensions.filter(extension => typeof extension === 'string' && extension)
      : [],
    maxSampleCount: toFiniteNumber(requirements.maxSampleCount),
    maxSampleBytes: toFiniteNumber(requirements.maxSampleBytes),
    maxTotalBytes: toFiniteNumber(requirements.maxTotalBytes),
    minSampleDurationSeconds: toFiniteNumber(requirements.minSampleDurationSeconds) || 0,
    maxSampleDurationSeconds: toFiniteNumber(requirements.maxSampleDurationSeconds),
    maxTotalDurationSeconds: toFiniteNumber(requirements.maxTotalDurationSeconds),
  }
}

/**
 * 格式化克隆音色字节数（B/KB/MB）
 */
export function formatS2VVoiceCloneBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '—'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${(value / (1024 * 1024)).toFixed(value % (1024 * 1024) === 0 ? 0 : 1)} MB`
}

/**
 * 格式化克隆音色时长（X 分 Y 秒 / Y 秒）
 */
export function formatS2VVoiceCloneDuration(value) {
  if (!Number.isFinite(value) || value < 0) return '—'
  const seconds = Math.floor(value)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  return minutes > 0 ? `${minutes} 分${remainingSeconds ? ` ${remainingSeconds} 秒` : ''}` : `${seconds} 秒`
}
