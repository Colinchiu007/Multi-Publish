'use strict';

/** 复刻层级（PRD §0） */
const REPLICATION_LEVELS = Object.freeze(['L0', 'L1', 'L2']);

/** 复刻模式（PRD §3 F3.1） */
const REPLICATION_MODES = Object.freeze(['structure', 'style', 'inspiration', 'full']);

/** 支持视频类型（PRD §3，优先级：剧情短剧 > B-roll > 口播） */
const VIDEO_TYPES = Object.freeze(['drama', 'broll', 'talking']);

/** 输入来源 */
const SOURCE_TYPES = Object.freeze(['local', 'url']);

/** 8 平台（PRD F1.2） */
const PLATFORMS = Object.freeze(['douyin', 'xiaohongshu', 'kuaishou', 'bilibili', 'shipinhao', 'youtube', 'tiktok', 'instagram']);

/** 画幅 */
const ASPECT_RATIOS = Object.freeze(['9:16', '16:9', '1:1', '4:5', '3:4']);

/** 叙事结构段落（PRD §3 F2 叙事层） */
const NARRATIVE_SEGMENTS = Object.freeze(['hook', 'buildup', 'development', 'climax', 'cta']);

/** 流水线阶段（PRD §2） */
const STAGES = Object.freeze(['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish']);

/** 画面风格枚举（视觉层 palette 简版） */
const VISUAL_PALETTES = Object.freeze(['warm', 'cool', 'neutral', 'vivid', 'muted', 'mono']);

/** 人声语气（文案风格层 tone 简版） */
const SCRIPT_TONES = Object.freeze(['commanding', 'narrative', 'cheerful', 'calm', 'emotional', 'professional']);

module.exports = {
  REPLICATION_LEVELS,
  REPLICATION_MODES,
  VIDEO_TYPES,
  SOURCE_TYPES,
  PLATFORMS,
  ASPECT_RATIOS,
  NARRATIVE_SEGMENTS,
  STAGES,
  VISUAL_PALETTES,
  SCRIPT_TONES,
};
