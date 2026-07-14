/**
 * story2video-engine 核心模块单元测试
 *
 * 覆盖：
 *   - text-segmentation: 中文分句、空输入、超长句子、缩写处理、目标段数适配
 *   - effects-library: 效果查询、标签获取、推荐转场
 *   - utils: cn() 类名合并、createQueryString、formatDate
 *   - types: 类型导出完整性
 */
import { describe, it, expect } from 'vitest';
import {
  SentenceTokenizer,
  SceneSegmenter,
  SubtitleSegmenter,
  TextSegmentationModule,
  splitTextToScenes,
  splitTextToSubtitles,
  buildSubtitleTimelineV2,
  DEFAULT_CONFIG,
  TEXT_SEGMENTATION_VERSION,
  getSegmentationVersion,
} from '../src/text-segmentation';
import {
  IMAGE_EFFECTS,
  TRANSITION_EFFECTS,
  getImageEffectById,
  getTransitionEffectById,
  getImageEffectLabel,
  getTransitionEffectLabel,
  getRecommendedTransitions,
} from '../src/effects-library';
import { cn, createQueryString, formatDate } from '../src/utils';
import type {
  ImageEffect,
  TransitionEffect,
  WatermarkConfig,
  WatermarkPosition,
  EffectMeta,
} from '../src/types';

// ============================================================
// text-segmentation 模块测试
// ============================================================

describe('SentenceTokenizer', () => {
  it('正确分割中文句子（句号、感叹号、问号）', () => {
    const tokenizer = new SentenceTokenizer();
    const result = tokenizer.split('今天天气真好。我们去公园玩吧！孩子们很开心？');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('今天天气真好。');
    expect(result[1]).toBe('我们去公园玩吧！');
    expect(result[2]).toBe('孩子们很开心？');
  });

  it('空字符串返回空数组', () => {
    const tokenizer = new SentenceTokenizer();
    expect(tokenizer.split('')).toEqual([]);
    expect(tokenizer.split('   ')).toEqual([]);
    expect(tokenizer.split(null as unknown as string)).toEqual([]);
  });

  it('无句末标点的文本作为单个句子返回', () => {
    const tokenizer = new SentenceTokenizer();
    const result = tokenizer.split('这是一段没有句末标点的文本');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('这是一段没有句末标点的文本');
  });

  it('处理缩写不被误分句', () => {
    const tokenizer = new SentenceTokenizer({
      customAbbreviations: ['Dr.', 'Mr.'],
    });
    const result = tokenizer.split('Dr. Smith 来了。Mr. Jones 也来了。');
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Dr. Smith');
    expect(result[1]).toContain('Mr. Jones');
  });

  it('超长句子按 maxSentenceLength 强制分段', () => {
    const tokenizer = new SentenceTokenizer({ maxSentenceLength: 10 });
    const longText = '这是一段超长的中文文本它超过了最大句子长度限制应该被强制分段';
    const result = tokenizer.split(longText);
    expect(result.length).toBeGreaterThan(1);
    // 每段不应超过 maxSentenceLength（允许合并末尾短段）
    for (const sentence of result) {
      expect(sentence.length).toBeLessThanOrEqual(15);
    }
  });
});

describe('SceneSegmenter', () => {
  it('将文本分割为语音段落', () => {
    const segmenter = new SceneSegmenter();
    const result = segmenter.segment('第一句话。第二句话。第三句话。第四句话。');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('text');
    expect(result[0]).toHaveProperty('estimatedDuration');
    expect(result[0]).toHaveProperty('segmentId', 0);
    expect(result[0]).toHaveProperty('subtitles');
  });

  it('空文本返回空数组', () => {
    const segmenter = new SceneSegmenter();
    expect(segmenter.segment('')).toEqual([]);
  });

  it('calculateTargetWords 在 min/max 范围内', () => {
    const segmenter = new SceneSegmenter({
      minWordsPerSegment: 5,
      maxWordsPerSegment: 30,
      targetSeconds: 6.0,
      baseWordsPerSecond: 3.3,
      speechRate: 1.0,
      enforceSentenceBoundary: true,
      allowSingleSentenceOverflow: true,
    });
    const target = segmenter.calculateTargetWords();
    expect(target).toBeGreaterThanOrEqual(5);
    expect(target).toBeLessThanOrEqual(30);
  });
});

describe('SubtitleSegmenter', () => {
  it('将文本分割为字幕块', () => {
    const segmenter = new SubtitleSegmenter();
    const result = segmenter.segment('今天天气真好。我们去公园玩吧！', 10.0, 0);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('text');
    expect(result[0]).toHaveProperty('displayOrder', 0);
    expect(result[0]).toHaveProperty('startTime');
    expect(result[0]).toHaveProperty('duration');
    expect(result[0]).toHaveProperty('parentSegmentId', 0);
  });

  it('proportional 时间分配按字数比例', () => {
    const segmenter = new SubtitleSegmenter({
      minCharsPerBlock: 2,
      maxCharsPerBlock: 5,
      punctuationPriority: ['。', '！', '，'],
      timeCalculationMethod: 'proportional',
    });
    const result = segmenter.segment('今天天气真好。', 10.0, 0);
    expect(result.length).toBeGreaterThan(0);
    // 第一个字幕块的 startTime 应为 0
    expect(result[0].startTime).toBe(0);
    // 总时长应接近 10.0
    const totalDuration = result.reduce((sum, b) => sum + b.duration, 0);
    expect(totalDuration).toBeCloseTo(10.0, 1);
  });
});

describe('TextSegmentationModule', () => {
  it('完整处理文本分割流程', () => {
    const module = new TextSegmentationModule();
    const result = module.process('今天天气真好。我们去公园玩吧！孩子们很开心。');
    expect(result.speechSegments.length).toBeGreaterThan(0);
    expect(result.totalWords).toBeGreaterThan(0);
    expect(result.segmentCount).toBe(result.speechSegments.length);
    expect(result.config).toBeDefined();
  });

  it('空文本抛出错误', () => {
    const module = new TextSegmentationModule();
    expect(() => module.process('')).toThrow('输入文本不能为空');
    expect(() => module.process('   ')).toThrow('输入文本不能为空');
  });

  it('getConfigSummary 返回配置摘要', () => {
    const module = new TextSegmentationModule();
    const summary = module.getConfigSummary();
    expect(summary).toHaveProperty('sentenceTokenizerConfig');
    expect(summary).toHaveProperty('sceneConfig');
    expect(summary).toHaveProperty('subtitleConfig');
  });
});

describe('便捷函数', () => {
  it('splitTextToScenes 返回场景文本数组', () => {
    const scenes = splitTextToScenes('第一句。第二句。第三句。第四句。第五句。');
    expect(Array.isArray(scenes)).toBe(true);
    expect(scenes.length).toBeGreaterThan(0);
  });

  it('splitTextToScenes 适配目标段数', () => {
    const scenes = splitTextToScenes('第一句。第二句。第三句。第四句。第五句。', {
      targetCount: 3,
    });
    expect(scenes.length).toBe(3);
  });

  it('splitTextToScenes 空文本返回空数组', () => {
    expect(splitTextToScenes('')).toEqual([]);
    expect(splitTextToScenes('   ')).toEqual([]);
  });

  it('splitTextToSubtitles 返回字幕文本数组', () => {
    const subtitles = splitTextToSubtitles('今天天气真好。我们去公园玩吧！');
    expect(Array.isArray(subtitles)).toBe(true);
    expect(subtitles.length).toBeGreaterThan(0);
  });

  it('buildSubtitleTimelineV2 返回带时间戳的字幕时间线', () => {
    const timeline = buildSubtitleTimelineV2('今天天气真好。我们去公园玩吧！', 10.0);
    expect(Array.isArray(timeline)).toBe(true);
    expect(timeline.length).toBeGreaterThan(0);
    expect(timeline[0]).toHaveProperty('text');
    expect(timeline[0]).toHaveProperty('startTime', 0);
    expect(timeline[0]).toHaveProperty('endTime');
    expect(timeline[0]).toHaveProperty('charTimings');
    expect(Array.isArray(timeline[0].charTimings)).toBe(true);
  });

  it('版本标识正确', () => {
    expect(TEXT_SEGMENTATION_VERSION).toBe('v1.0');
    expect(getSegmentationVersion()).toBe('v1.0');
  });

  it('DEFAULT_CONFIG 包含所有必要字段', () => {
    expect(DEFAULT_CONFIG).toHaveProperty('sentenceTokenizer');
    expect(DEFAULT_CONFIG).toHaveProperty('scene');
    expect(DEFAULT_CONFIG).toHaveProperty('subtitle');
    expect(DEFAULT_CONFIG.sentenceTokenizer).toHaveProperty('language', 'zh');
    expect(DEFAULT_CONFIG.scene).toHaveProperty('targetSeconds');
    expect(DEFAULT_CONFIG.subtitle).toHaveProperty('punctuationPriority');
  });
});

// ============================================================
// effects-library 模块测试
// ============================================================

describe('effects-library', () => {
  it('IMAGE_EFFECTS 包含所有预期的图片动效', () => {
    const ids = IMAGE_EFFECTS.map((e) => e.id);
    expect(ids).toContain('zoom-in');
    expect(ids).toContain('zoom-out');
    expect(ids).toContain('pan-left');
    expect(ids).toContain('pan-right');
    expect(ids).toContain('pan-up');
    expect(ids).toContain('pan-down');
    expect(ids).toContain('zoom-pan');
    expect(ids).toContain('rotate');
    expect(ids).toContain('blur-in');
    expect(ids).toContain('none');
    expect(IMAGE_EFFECTS.length).toBe(10);
  });

  it('TRANSITION_EFFECTS 包含所有预期的转场效果', () => {
    const ids = TRANSITION_EFFECTS.map((e) => e.id);
    expect(ids).toContain('fade');
    expect(ids).toContain('slide-left');
    expect(ids).toContain('slide-right');
    expect(ids).toContain('slide-up');
    expect(ids).toContain('slide-down');
    expect(ids).toContain('none');
    expect(TRANSITION_EFFECTS.length).toBe(6);
  });

  it('getImageEffectById 返回正确的效果元数据', () => {
    const effect = getImageEffectById('zoom-in');
    expect(effect).toBeDefined();
    expect(effect?.id).toBe('zoom-in');
    expect(effect?.label).toBe('放大');
    expect(effect?.description).toBeTruthy();
    expect(Array.isArray(effect?.suitable)).toBe(true);
  });

  it('getTransitionEffectById 返回正确的转场元数据', () => {
    const effect = getTransitionEffectById('fade');
    expect(effect).toBeDefined();
    expect(effect?.id).toBe('fade');
    expect(effect?.label).toBe('渐隐');
  });

  it('getImageEffectById 不存在的 ID 返回 undefined', () => {
    expect(getImageEffectById('nonexistent')).toBeUndefined();
  });

  it('getImageEffectLabel 返回标签，未知 ID 返回原 ID', () => {
    expect(getImageEffectLabel('zoom-in')).toBe('放大');
    expect(getImageEffectLabel('unknown-id')).toBe('unknown-id');
  });

  it('getTransitionEffectLabel 返回标签，未知 ID 返回原 ID', () => {
    expect(getTransitionEffectLabel('fade')).toBe('渐隐');
    expect(getTransitionEffectLabel('unknown-id')).toBe('unknown-id');
  });

  it('getRecommendedTransitions 静态效果推荐多种转场', () => {
    const transitions = getRecommendedTransitions('none');
    expect(transitions).toContain('fade');
    expect(transitions).toContain('slide-left');
    expect(transitions.length).toBeGreaterThan(2);
  });

  it('getRecommendedTransitions 动态效果推荐安全转场', () => {
    const transitions = getRecommendedTransitions('zoom-in');
    expect(transitions).toContain('fade');
    expect(transitions).toContain('none');
  });

  it('getRecommendedTransitions 未知效果返回默认推荐', () => {
    const transitions = getRecommendedTransitions('nonexistent');
    expect(transitions).toContain('fade');
    expect(transitions).toContain('none');
  });
});

// ============================================================
// utils 模块测试
// ============================================================

describe('utils', () => {
  it('cn 合并多个类名', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c');
  });

  it('cn 过滤 falsy 值', () => {
    expect(cn('a', undefined, null, false, '', 'b')).toBe('a b');
  });

  it('cn 空输入返回空字符串', () => {
    expect(cn()).toBe('');
    expect(cn('', undefined, null, false)).toBe('');
  });

  it('createQueryString 添加新参数', () => {
    const params = new URLSearchParams('a=1');
    const result = createQueryString({ b: '2' }, params);
    expect(result).toContain('a=1');
    expect(result).toContain('b=2');
  });

  it('createQueryString 删除 null/undefined 参数', () => {
    const params = new URLSearchParams('a=1&b=2');
    const result = createQueryString({ b: null }, params);
    expect(result).toContain('a=1');
    expect(result).not.toContain('b=');
  });

  it('createQueryString 数字转换为字符串', () => {
    const params = new URLSearchParams();
    const result = createQueryString({ count: 42 }, params);
    expect(result).toContain('count=42');
  });

  it('formatDate 格式化日期', () => {
    const date = new Date('2026-07-14T10:00:00Z');
    const formatted = formatDate(date);
    expect(formatted).toContain('2026');
    expect(typeof formatted).toBe('string');
  });

  it('formatDate 接受字符串和数字', () => {
    expect(typeof formatDate('2026-07-14')).toBe('string');
    expect(typeof formatDate(Date.now())).toBe('string');
  });
});

// ============================================================
// types 模块测试（类型导出完整性）
// ============================================================

describe('types', () => {
  it('ImageEffect 类型包含所有预期值', () => {
    const effects: ImageEffect[] = [
      'zoom-in',
      'zoom-out',
      'pan-left',
      'pan-right',
      'pan-up',
      'pan-down',
      'zoom-pan',
      'rotate',
      'blur-in',
      'none',
    ];
    expect(effects.length).toBe(10);
  });

  it('TransitionEffect 类型包含所有预期值', () => {
    const transitions: TransitionEffect[] = [
      'fade',
      'slide-left',
      'slide-right',
      'slide-up',
      'slide-down',
      'none',
    ];
    expect(transitions.length).toBe(6);
  });

  it('WatermarkPosition 类型包含所有预期值', () => {
    const positions: WatermarkPosition[] = [
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
      'center',
    ];
    expect(positions.length).toBe(5);
  });

  it('WatermarkConfig 接口结构正确', () => {
    const config: WatermarkConfig = {
      enabled: true,
      text: '测试水印',
      position: 'bottom-right',
      fontSize: 24,
      opacity: 0.5,
      color: '#FFFFFF',
    };
    expect(config.enabled).toBe(true);
    expect(config.text).toBe('测试水印');
    expect(config.position).toBe('bottom-right');
    expect(config.fontSize).toBe(24);
    expect(config.opacity).toBe(0.5);
    expect(config.color).toBe('#FFFFFF');
  });

  it('EffectMeta 接口结构正确', () => {
    const meta: EffectMeta = {
      id: 'test',
      label: '测试',
      description: '测试描述',
      suitable: ['场景1', '场景2'],
    };
    expect(meta.id).toBe('test');
    expect(meta.label).toBe('测试');
    expect(meta.suitable.length).toBe(2);
  });

  it('EffectMeta hint 是可选字段', () => {
    const meta: EffectMeta = {
      id: 'test',
      label: '测试',
      description: '测试描述',
      suitable: [],
      hint: '提示',
    };
    expect(meta.hint).toBe('提示');
  });
});
