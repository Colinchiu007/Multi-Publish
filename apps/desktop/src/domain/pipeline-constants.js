/**
 * pipeline-constants.js — 流水线领域常量（Stage 1.3 从 CreateView.vue 提取）
 */

export const HISTORY_LOAD_TIMEOUT_MS = 5000

export const STORY2VIDEO_OUTPUT_ASPECT_RATIOS = Object.freeze({
  '720x1280': '9:16', '1920x1080': '16:9', '3840x2160': '16:9',
  '1080x1920': '9:16', '1080x1440': '3:4',
})

export const IMPLEMENTED_PIPELINES = [
  'story2video-compose', 'animated-explainer', 'talking-head', 'cinematic',
  'clip-factory', 'framework-smoke', 'documentary-montage', 'localization-dub',
  'animation', 'avatar-spokesperson', 'character-animation', 'hybrid',
]

export const PIPELINE_TERMINAL_STATUSES = Object.freeze(['idle', 'completed', 'failed', 'cancelled'])
export const PIPELINE_END_STATUSES = Object.freeze(['completed', 'failed', 'cancelled'])
export const PIPELINE_RUN_STATUSES = Object.freeze([
  'idle', 'pending', 'running', 'paused', 'waiting_approval',
  'needs_user_input', 'completed', 'failed', 'cancelled',
])
export const PIPELINE_STAGE_STATUSES = Object.freeze([
  'pending', 'running', 'completed', 'skipped', 'failed', 'cancelled',
  'paused', 'waiting_approval', 'needs_user_input',
])

export const VIDEO_CLONE_PIPELINE_ENTRY = {
  name: 'video-clone', category: 'generated', stageCount: 6, available: true, estimatedCost: 'medium',
}
export const FILM_ENGINEERING_PIPELINE_ENTRY = {
  name: 'film-engineering', category: 'generated', stageCount: 4, available: true, estimatedCost: 'low',
}

export const STYLES = [
  { value: 'clean-professional', label: '简洁专业', desc: '干净排版，适合商业内容' },
  { value: 'flat-motion-graphics', label: '扁平动效', desc: '现代扁平化动画风格' },
  { value: 'anime-ghibli', label: '吉卜力动漫', desc: '温暖的手绘动漫质感' },
  { value: 'minimalist-diagram', label: '极简图表', desc: '数据可视化优先' },
  { value: 'cinematic-dark', label: '电影暗调', desc: '深色电影感渲染' },
]

export const STORY2VIDEO_STAGE_NAMES = Object.freeze([
  'split', 'scene_context', 'optimize', 'select_video_scenes',
  'generate_assets', 'compose', 'publish',
])

export const CATEGORY_LABELS = {
  generated: 'AI 生成', talking_head: '说话头像', cinematic: '电影感',
  animation: '动画', screen_recording: '屏幕录制', hybrid: '混合', custom: '自定义',
}
export const COST_LABELS = { low: '低消耗', medium: '中等', high: '高消耗' }
export const STABILITY_MAP = {
  'cinematic': 'production', 'animated-explainer': 'production', 'talking-head': 'beta',
  'documentary-montage': 'beta', 'clip-factory': 'beta', 'screen-demo': 'beta',
  'podcast-repurpose': 'experimental', 'localization-dub': 'experimental',
  'avatar-spokesperson': 'experimental', 'character-animation': 'experimental',
  'animation': 'experimental', 'hybrid': 'experimental', 'framework-smoke': 'experimental',
}
