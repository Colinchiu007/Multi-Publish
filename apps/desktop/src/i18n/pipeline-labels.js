const PIPELINES = {
  'animated-explainer': {
    name: 'pipelines.names.animated-explainer',
    description: 'pipelines.descriptions.animated-explainer',
    category: 'generated',
    stages: ['research', 'proposal', 'script', 'scenes', 'assets', 'editing', 'compose', 'publish'],
  },
  'talking-head': {
    name: 'pipelines.names.talking-head',
    description: 'pipelines.descriptions.talking-head',
    category: 'talking_head',
    stages: ['upload', 'transcribe', 'captions', 'render'],
  },
  cinematic: {
    name: 'pipelines.names.cinematic',
    description: 'pipelines.descriptions.cinematic',
    category: 'cinematic',
    stages: ['ingest', 'grade', 'compose', 'render'],
  },
  animation: {
    name: 'pipelines.names.animation',
    description: 'pipelines.descriptions.animation',
    category: 'animation',
    stages: ['concept', 'storyboard', 'animate', 'render'],
  },
  'avatar-spokesperson': {
    name: 'pipelines.names.avatar-spokesperson',
    description: 'pipelines.descriptions.avatar-spokesperson',
    category: 'talking_head',
    stages: ['avatar_select', 'script', 'generate', 'render'],
  },
  'character-animation': {
    name: 'pipelines.names.character-animation',
    description: 'pipelines.descriptions.character-animation',
    category: 'animation',
    stages: ['character_design', 'rigging', 'animate', 'render'],
  },
  'clip-factory': {
    name: 'pipelines.names.clip-factory',
    description: 'pipelines.descriptions.clip-factory',
    category: 'screen_recording',
    stages: ['analyze', 'extract', 'caption', 'export'],
  },
  'documentary-montage': {
    name: 'pipelines.names.documentary-montage',
    description: 'pipelines.descriptions.documentary-montage',
    category: 'cinematic',
    stages: ['research', 'ingest', 'edit', 'narrate', 'render'],
  },
  hybrid: {
    name: 'pipelines.names.hybrid',
    description: 'pipelines.descriptions.hybrid',
    category: 'hybrid',
    stages: ['plan', 'generate', 'merge', 'render'],
  },
  'localization-dub': {
    name: 'pipelines.names.localization-dub',
    description: 'pipelines.descriptions.localization-dub',
    category: 'hybrid',
    stages: ['transcribe', 'translate', 'tts', 'sync'],
  },
  'podcast-repurpose': {
    name: 'pipelines.names.podcast-repurpose',
    description: 'pipelines.descriptions.podcast-repurpose',
    category: 'hybrid',
    stages: ['analyze', 'visualize', 'assemble', 'render'],
  },
  'screen-demo': {
    name: 'pipelines.names.screen-demo',
    description: 'pipelines.descriptions.screen-demo',
    category: 'screen_recording',
    stages: ['record', 'annotate', 'render'],
  },
  'framework-smoke': {
    name: 'pipelines.names.framework-smoke',
    description: 'pipelines.descriptions.framework-smoke',
    category: 'custom',
    stages: ['verify', 'report'],
  },
  'story2video-compose': {
    name: 'pipelines.names.story2video-compose',
    description: 'pipelines.descriptions.story2video-compose',
    category: 'generated',
    stages: ['split', 'domain_enrich', 'optimize', 'select_video_scenes', 'generate_assets', 'compose', 'publish'],
  },
}

const CATEGORIES = {
  generated: 'pipelines.categories.generated',
  talking_head: 'pipelines.categories.talking_head',
  cinematic: 'pipelines.categories.cinematic',
  animation: 'pipelines.categories.animation',
  screen_recording: 'pipelines.categories.screen_recording',
  hybrid: 'pipelines.categories.hybrid',
  custom: 'pipelines.categories.custom',
}

const STAGES = {
  research: 'pipelines.stages.research',
  proposal: 'pipelines.stages.proposal',
  script: 'pipelines.stages.script',
  scenes: 'pipelines.stages.scenes',
  assets: 'pipelines.stages.assets',
  editing: 'pipelines.stages.editing',
  compose: 'pipelines.stages.compose',
  publish: 'pipelines.stages.publish',
  upload: 'pipelines.stages.upload',
  transcribe: 'pipelines.stages.transcribe',
  captions: 'pipelines.stages.captions',
  render: 'pipelines.stages.render',
  ingest: 'pipelines.stages.ingest',
  grade: 'pipelines.stages.grade',
  concept: 'pipelines.stages.concept',
  storyboard: 'pipelines.stages.storyboard',
  animate: 'pipelines.stages.animate',
  avatar_select: 'pipelines.stages.avatar_select',
  generate: 'pipelines.stages.generate',
  character_design: 'pipelines.stages.character_design',
  rigging: 'pipelines.stages.rigging',
  analyze: 'pipelines.stages.analyze',
  extract: 'pipelines.stages.extract',
  caption: 'pipelines.stages.caption',
  export: 'pipelines.stages.export',
  edit: 'pipelines.stages.edit',
  narrate: 'pipelines.stages.narrate',
  plan: 'pipelines.stages.plan',
  merge: 'pipelines.stages.merge',
  translate: 'pipelines.stages.translate',
  tts: 'pipelines.stages.tts',
  sync: 'pipelines.stages.sync',
  visualize: 'pipelines.stages.visualize',
  assemble: 'pipelines.stages.assemble',
  record: 'pipelines.stages.record',
  annotate: 'pipelines.stages.annotate',
  verify: 'pipelines.stages.verify',
  report: 'pipelines.stages.report',
  split: 'pipelines.stages.split',
  domain_enrich: 'pipelines.stages.domain_enrich',
  optimize: 'pipelines.stages.optimize',
  select_video_scenes: 'pipelines.stages.select_video_scenes',
  generate_assets: 'pipelines.stages.generate_assets',
}

const STATUSES = {
  idle: 'pipelines.statuses.idle',
  pending: 'pipelines.statuses.pending',
  running: 'pipelines.statuses.running',
  completed: 'pipelines.statuses.completed',
  failed: 'pipelines.statuses.failed',
  needs_user_input: 'pipelines.statuses.needs_user_input',
  paused: 'pipelines.statuses.paused',
  waiting_approval: 'pipelines.statuses.waiting_approval',
  cancelled: 'pipelines.statuses.cancelled',
}

const fallbackLabel = (value) => (typeof value === 'string' ? value : String(value ?? ''))

const translate = (t, key, fallback) => {
  if (typeof t !== 'function' || !key) return fallback

  const value = t(key)
  return typeof value === 'string' && value !== key ? value : fallback
}

export const PIPELINE_REGISTRY = Object.freeze(PIPELINES)
export const PIPELINE_CATEGORY_KEYS = Object.freeze(CATEGORIES)
export const PIPELINE_STAGE_KEYS = Object.freeze(STAGES)
export const PIPELINE_STATUS_KEYS = Object.freeze(STATUSES)

export const getPipelineName = (t, pipelineId) => {
  const fallback = fallbackLabel(pipelineId)
  return translate(t, PIPELINES[pipelineId]?.name, fallback)
}

export const getPipelineDescription = (t, pipelineId) => {
  const fallback = fallbackLabel(pipelineId)
  return translate(t, PIPELINES[pipelineId]?.description, fallback)
}

export const getPipelineCategory = (t, categoryId) => {
  const fallback = fallbackLabel(categoryId)
  return translate(t, CATEGORIES[categoryId], fallback)
}

export const getPipelineStage = (t, stageId) => {
  const fallback = fallbackLabel(stageId)
  return translate(t, STAGES[stageId], fallback)
}

export const getPipelineStatus = (t, statusId) => {
  const fallback = fallbackLabel(statusId)
  return translate(t, STATUSES[statusId], fallback)
}
