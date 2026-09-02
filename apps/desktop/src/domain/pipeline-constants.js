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
  { value: 'clean-professional', label: 'create.story2video.style.cleanProfessional', desc: 'create.story2video.style.cleanProfessionalDesc' },
  { value: 'flat-motion-graphics', label: 'create.story2video.style.flatMotionGraphics', desc: 'create.story2video.style.flatMotionGraphicsDesc' },
  { value: 'anime-ghibli', label: 'create.story2video.style.animeGhibli', desc: 'create.story2video.style.animeGhibliDesc' },
  { value: 'minimalist-diagram', label: 'create.story2video.style.minimalistDiagram', desc: 'create.story2video.style.minimalistDiagramDesc' },
  { value: 'cinematic-dark', label: 'create.story2video.style.cinematicDark', desc: 'create.story2video.style.cinematicDarkDesc' },
]

export const STORY2VIDEO_STAGE_NAMES = Object.freeze([
  'split', 'scene_context', 'optimize', 'select_video_scenes',
  'generate_assets', 'compose', 'publish',
])

export const CATEGORY_LABELS = {
  generated: 'pipelineSelector.catGenerated', talking_head: 'pipelineSelector.catTalkingHead', cinematic: 'pipelineSelector.catCinematic',
  animation: 'pipelineSelector.catAnimation', screen_recording: 'pipelineSelector.catScreenRecording', hybrid: 'pipelineSelector.catHybrid', custom: 'pipelineSelector.catCustom',
}
export const COST_LABELS = { low: 'pipelineSelector.costLow', medium: 'pipelineSelector.costMedium', high: 'pipelineSelector.costHigh' }
export const STABILITY_MAP = {
  'cinematic': 'production', 'animated-explainer': 'production', 'talking-head': 'beta',
  'documentary-montage': 'beta', 'clip-factory': 'beta', 'screen-demo': 'beta',
  'podcast-repurpose': 'experimental', 'localization-dub': 'experimental',
  'avatar-spokesperson': 'experimental', 'character-animation': 'experimental',
  'animation': 'experimental', 'hybrid': 'experimental', 'framework-smoke': 'experimental',
}
