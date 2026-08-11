// create-view-utils.js — 视频创作模块纯工具函数
// 从 CreateView.vue 提取，代码-设计分离

/**
 * 格式化持续时间（毫秒 → "X 分 Y 秒" 或 "Y 秒"）
 */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes} 分 ${seconds} 秒` : `${seconds} 秒`
}

/**
 * 格式化 ISO 时间为本地字符串
 */
export function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN')
}

/**
 * 人类可读名称（kebab-case → Title Case）
 */
export function humanName(name) {
  if (!name) return ''
  return name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * 历史记录状态标签
 */
export function historyStatusLabel(status) {
  const map = { completed: '已完成', failed: '已暂停', cancelled: '已取消', running: '进行中', paused: '已暂停', pending: '等待中' }
  return map[status] || status || '未知'
}

/**
 * IPC 安全克隆（JSON 序列化脱壳）
 */
export function cloneForIpc(value) {
  try { return JSON.parse(JSON.stringify(value)) } catch { return {} }
}

/**
 * 分类标签
 */
const CATEGORY_LABELS = {
  generated: 'AI 生成', talking_head: '说话头像', cinematic: '电影感',
  animation: '动画', screen_recording: '屏幕录制', hybrid: '混合', custom: '自定义'
}
export function categoryLabel(cat) { return CATEGORY_LABELS[cat] || cat }

/**
 * 消耗标签
 */
const COST_LABELS = { low: '低消耗', medium: '中等', high: '高消耗' }
export function costLabel(cost) { return COST_LABELS[cost] || cost }

/**
 * 稳定性等级
 */
const STABILITY_MAP = {
  'cinematic': 'production', 'animated-explainer': 'production', 'talking-head': 'beta',
  'documentary-montage': 'beta', 'clip-factory': 'beta', 'screen-demo': 'beta',
  'podcast-repurpose': 'experimental', 'localization-dub': 'experimental',
  'avatar-spokesperson': 'experimental', 'character-animation': 'experimental',
  'animation': 'experimental', 'hybrid': 'experimental', 'framework-smoke': 'experimental'
}
export function getStability(name) { return STABILITY_MAP[name] || 'experimental' }

/**
 * 已实现的流水线列表
 */
export const IMPLEMENTED_PIPELINES = ['story2video-compose', 'animated-explainer', 'talking-head', 'cinematic', 'clip-factory', 'framework-smoke', 'documentary-montage', 'localization-dub', 'animation', 'avatar-spokesperson', 'character-animation', 'hybrid']

/**
 * 自动流水线阶段名映射
 */
export const AUTO_PIPELINE_STAGES = Object.freeze({
  'story2video-compose': ['split', 'domain_enrich', 'optimize', 'select_video_scenes', 'generate_assets', 'compose', 'publish'],
  'animated-explainer': ['research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish'],
  'framework-smoke': ['verify', 'report'],
  'documentary-montage': ['research', 'ingest', 'edit', 'narrate', 'render'],
  'localization-dub': ['transcribe', 'translate', 'tts', 'sync'],
  'animation': ['concept', 'storyboard', 'animate', 'render'],
  'avatar-spokesperson': ['avatar_select', 'script', 'generate', 'render'],
  'character-animation': ['character_design', 'rigging', 'animate', 'render'],
  'hybrid': ['plan', 'generate', 'merge', 'render'],
})

/**
 * Story2Video 阶段名
 */
export const STORY2VIDEO_STAGE_NAMES = Object.freeze([
  'split', 'domain_enrich', 'optimize', 'select_video_scenes', 'generate_assets', 'compose', 'publish',
])

/**
 * 输出宽高比映射
 */
const STORY2VIDEO_OUTPUT_ASPECT_RATIOS = Object.freeze({
  '720x1280': '9:16', '1920x1080': '16:9', '3840x2160': '16:9',
  '1080x1920': '9:16', '1080x1440': '3:4',
})
export function getStory2VideoOutputAspectRatio(resolution) {
  return STORY2VIDEO_OUTPUT_ASPECT_RATIOS[resolution] || '9:16'
}

/**
 * 流水线列表排序（story2video-compose 优先）
 */
export function prioritizeStory2VideoPipeline(pipelines) {
  const values = Array.isArray(pipelines) ? pipelines : []
  return [
    ...values.filter(pipeline => pipeline?.name === 'story2video-compose'),
    ...values.filter(pipeline => pipeline?.name !== 'story2video-compose'),
  ]
}

/**
 * 阶段状态 CSS 类
 */
export function stageStateClass(pipelineRunStatus, stage, i) {
  if (!pipelineRunStatus) return ''
  const idx = pipelineRunStatus.currentStage || 0
  if (stage.status === 'failed') return 'failed'
  if (stage.status === 'needs_user_input') return 'needs-user-input'
  if (stage.status === 'cancelled') return 'cancelled'
  if (i < idx || stage.status === 'completed') return 'done'
  if (i === idx && stage.status === 'running') return 'active'
  if (stage.status === 'waiting_approval') return 'waiting'
  return 'pending'
}

/**
 * 阶段状态图标
 */
export function stageStateIcon(pipelineRunStatus, stage, i) {
  if (!pipelineRunStatus) return ''
  const idx = pipelineRunStatus.currentStage || 0
  if (stage.status === 'failed') return '❌'
  if (stage.status === 'needs_user_input') return '⚠️'
  if (stage.status === 'cancelled') return '⏹️'
  if (i < idx || stage.status === 'completed') return '✅'
  if (i === idx && stage.status === 'running') return ''
  if (stage.status === 'waiting_approval') return '⚠️'
  return '⭕'
}

/**
 * S2V 枚举白名单（恢复时校验）
 */
export const S2V_RESTORE_ENUM_OPTIONS = Object.freeze({
  contentType: ['general', 'history'],
  videoMode: ['off', 'fixed', 'ai-judged'],
  imageStyle: ['cinematic', 'realistic', 'anime', 'watercolor', 'minimalist'],
  promptStyle: ['realistic', 'cinematic', 'anime', 'watercolor', 'minimalist'],
  imageEffect: ['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'zoom-pan', 'rotate', 'blur-in'],
  transition: ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down'],
  subtitleSize: ['size1', 'size2', 'size3', 'size4', 'size5', 'size6'],
  subtitleStyleName: ['style1', 'style2', 'style3'],
  splitLanguage: ['auto', 'zh', 'en'],
  splitMode: ['fast', 'balanced', 'precise'],
  splitViewMode: ['seconds', 'chars'],
})

export const S2V_RESTORE_OUTPUT_ENUM_OPTIONS = Object.freeze({
  fps: [24, 30, 60],
  format: ['mp4', 'webm'],
})

/**
 * 平台选项
 */
export const S2V_PLATFORMS = [
  { value: 'douyin', label: '抖音' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'bilibili', label: 'B站' },
  { value: 'wechat', label: '微信视频号' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
]

/**
 * 风格选项
 */
export const STYLES = [
  { value: 'clean-professional', label: '简洁专业', desc: '干净排版，适合商业内容' },
  { value: 'flat-motion-graphics', label: '扁平动效', desc: '现代扁平化动画风格' },
  { value: 'anime-ghibli', label: '吉卜力动漫', desc: '温暖的手绘动漫质感' },
  { value: 'minimalist-diagram', label: '极简图表', desc: '数据可视化优先' },
  { value: 'cinematic-dark', label: '电影暗调', desc: '深色电影感渲染' },
]
