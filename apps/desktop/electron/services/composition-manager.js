// @ts-check
/**
 * CompositionManager — 管理所有 Remotion Composition
 * 提供 Composition 注册、列表、参数校验和 props 生成
 */

const path = require('path');
const fs = require('fs');
const COMPOSER_DIR = path.join(__dirname, '..', '..', '..', '..', 'packages', 'remotion-composer');

// --- Composition 元数据 ---
const COMPOSITIONS = [
  {
    id: 'Explainer',
    name: '解释视频',
    description: '输入文案自动生成带字幕和图表的解释视频',
    mode: 'text',
    defaultDuration: 30,
    defaultProps: {
      title: '',
      scenes: [],
      titleFontSize: 78,
      titleWidth: 1320,
      signalLineCount: 18,
    },
    scenes: ['text_card', 'stat_card', 'callout', 'comparison', 'hero_title', 'bar_chart', 'line_chart', 'pie_chart', 'kpi_grid', 'progress_bar', 'anime_scene', 'terminal_scene', 'screenshot_scene'],
  },
  {
    id: 'TalkingHead',
    name: '说话头像',
    description: '上传视频 + 文案，生成带字幕的讲话视频',
    mode: 'video',
    requiresVideo: true,
    defaultDuration: 300,
    defaultProps: { videoSrc: '', captions: [], overlays: [], wordsPerPage: 4, fontSize: 52, highlightColor: '#22D3EE' },
    scenes: ['caption_overlay'],
  },
  {
    id: 'CinematicRenderer',
    name: '电影感短片',
    description: '素材视频 → 电影感渲染',
    mode: 'video',
    requiresVideo: true,
    defaultDuration: 30,
    defaultProps: { scenes: [], titleFontSize: 78, titleWidth: 1320, signalLineCount: 18 },
    scenes: ['cinematic_scene'],
  },
  {
    id: 'CollageBurst',
    name: '拼贴爆破',
    description: '多段视频合成拼贴效果',
    mode: 'video',
    requiresVideo: true,
    defaultDuration: 30,
    defaultProps: { backgroundSrc: '', backgroundInSeconds: 0, curtainStartSeconds: 1.5, curtainEndSeconds: 3.0, clips: [] },
    scenes: ['collage_clip'],
  },
  {
    id: 'TitledVideo',
    name: '标题叠加',
    description: '视频 + 图文标题叠加',
    mode: 'video',
    requiresVideo: true,
    defaultDuration: 60,
    defaultProps: { videoSrc: '', tagline: '', taglineInSeconds: 53.5, topPx: 150, fontSize: 148, accentColor: '#F5C470' },
    scenes: ['title_overlay'],
  },
  {
    id: 'LyricOverlay',
    name: '歌词同步',
    description: '音乐视频歌词叠加',
    mode: 'video',
    requiresVideo: true,
    defaultDuration: 28,
    defaultProps: { videoSrc: '', lyrics: [], bottomY: 0.88 },
    scenes: ['lyric_line'],
  },
  {
    id: 'HeroTitle',
    name: '大标题展示',
    description: '简洁的大标题 + 副标题动画',
    mode: 'text',
    defaultDuration: 17,
    defaultProps: { title: '', subtitle: '' },
    scenes: ['hero_title'],
  },
];

class CompositionManager {
  constructor() {
    this._compositions = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    for (const comp of COMPOSITIONS) {
      this._compositions.set(comp.id, { ...comp });
    }
  }

  /** 返回 Composition 列表（不含场景详情） */
  listCompositions() {
    return Array.from(this._compositions.values()).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      mode: c.mode,
      requiresVideo: c.requiresVideo || false,
      scenes: c.scenes,
      sceneCount: c.scenes.length,
    }));
  }

  /** 获取单个 Composition 详情 */
  getComposition(id) {
    return this._compositions.get(id) || null;
  }

  /** 根据用户参数生成 render-engine 所需的 props */
  buildRenderProps(compositionId, userParams) {
    const comp = this._compositions.get(compositionId);
    if (!comp) return null;

    // Explainer: text mode → scene-builder 风格
    if (comp.mode === 'text' && userParams.text) {
      return this._buildTextProps(comp, userParams);
    }

    // Explainer: gallery mode
    if (comp.id === 'Explainer' && userParams.images) {
      return this._buildGalleryProps(comp, userParams);
    }

    // 视频模式: 直接传递 userParams 作为 props
    if (comp.mode === 'video') {
      return this._buildVideoProps(comp, userParams);
    }

    // HeroTitle: 简单标题
    if (comp.id === 'HeroTitle') {
      return {
        title: userParams.title || '',
        subtitle: userParams.subtitle || '',
      };
    }

    // 兜底: 使用 defaultProps + userParams 覆盖
    return { ...comp.defaultProps, ...userParams };
  }

  /** 校验 props 完整性 */
  validateProps(compositionId, props) {
    const comp = this._compositions.get(compositionId);
    if (!comp) return { valid: false, errors: ['Unknown composition: ' + compositionId] };

    const errors = [];
    if (!props || typeof props !== 'object') {
      errors.push('props must be an object');
      return { valid: false, errors };
    }

    // Explainer 需要 cuts 数组
    if (comp.id === 'Explainer' && comp.mode === 'text') {
      if (!Array.isArray(props.cuts) || props.cuts.length === 0) {
        errors.push('props.cuts must be a non-empty array');
      }
    }

    // 视频模式需要 videoSrc
    if (comp.requiresVideo) {
      if (!props.videoSrc && !props.backgroundSrc) {
        errors.push(comp.id + ' requires videoSrc or backgroundSrc');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** 检查 Remotion 环境是否就绪 */
  getStatus() {
    const composerExists = fs.existsSync(path.join(COMPOSER_DIR, 'package.json'));
    const nodeModulesExist = fs.existsSync(path.join(COMPOSER_DIR, 'node_modules'));
    return {
      ready: composerExists && nodeModulesExist,
      composerExists,
      nodeModulesExist,
      compositionCount: this._compositions.size,
      compositions: this.listCompositions().map((c) => c.id),
    };
  }

  // --- internal ---

  _buildTextProps(comp, params) {
    const lines = params.text.split('\n').filter((l) => l.trim());
    const theme = params.theme || 'clean-professional';
    const secondsPerScene = params.secondsPerScene || 5;
    const overlap = params.transitionOverlap || 0.5;

    const cuts = lines.map((line, i) => ({
      id: 'cut-' + (i + 1),
      type: this._inferSceneType(line, i),
      text: line.trim(),
      in_seconds: i * (secondsPerScene - overlap),
      out_seconds: (i + 1) * secondsPerScene,
    }));

    return { cuts, theme, durationInFrames: Math.ceil(lines.length * secondsPerScene * 30) };
  }

  _buildGalleryProps(comp, params) {
    const images = params.images;
    const theme = params.theme || 'flat-motion-graphics';
    const durationPerImage = params.durationPerImage || 5;

    const cuts = images.map((src, i) => ({
      id: 'img-' + (i + 1),
      type: 'screenshot_scene',
      source: src,
      in_seconds: i * durationPerImage,
      out_seconds: (i + 1) * durationPerImage,
      animation: params.animation || 'ken-burns',
    }));

    return { cuts, theme, durationInFrames: Math.ceil(images.length * durationPerImage * 30) };
  }

  _buildVideoProps(comp, params) {
    return { ...comp.defaultProps, ...params };
  }

  _inferSceneType(text, index) {
    // 简单推断场景类型
    if (index === 0) return 'hero_title';
    if (text.length > 80) return 'text_card';
    if (/^\d/.test(text.trim())) return 'stat_card';
    return 'callout';
  }
}

module.exports = { CompositionManager };
