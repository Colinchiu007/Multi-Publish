/**
 * 文本句子分割模块 v1.0（TypeScript 移植版）
 *
 * 基于 text_segmentation_module.py 独立移植
 * 功能：将文章按照语义和时长要求进行智能分割
 * 三级分割流程：句子边界消歧 → 场景级分割 → 字幕级分割
 *
 * 设计原则：
 * - 完全独立的模块化设计，不依赖业务逻辑
 * - 配置驱动，所有参数可配置
 * - 纯客户端执行，无需网络请求
 * - 支持 API 增强（smart-sentence-splitter 服务）
 */

// 原依赖 @/services/external-config 和 @/services/sentence-splitter-api 已移除
// API 增强包装函数 (splitTextToScenesSmart, splitTextToSubtitlesSmart) 已移除

// ==================== 配置类型定义 ====================

/** 句子边界消歧配置 */
export interface SentenceTokenizerConfig {
  language: string;
  handleAbbreviations: boolean;
  customAbbreviations: string[];
  maxSentenceLength: number;
}

/** 场景级分割配置 */
export interface SceneSegmentationConfig {
  targetSeconds: number;
  baseWordsPerSecond: number;
  speechRate: number;
  minWordsPerSegment: number;
  maxWordsPerSegment: number;
  enforceSentenceBoundary: boolean;
  allowSingleSentenceOverflow: boolean;
}

/** 字幕级分割配置 */
export interface SubtitleSegmentationConfig {
  minCharsPerBlock: number;
  maxCharsPerBlock: number;
  punctuationPriority: string[];
  timeCalculationMethod: 'proportional' | 'equal';
}

/** 完整的文本分割配置 */
export interface TextSegmentationConfig {
  sentenceTokenizer: SentenceTokenizerConfig;
  scene: SceneSegmentationConfig;
  subtitle: SubtitleSegmentationConfig;
}

// ==================== 默认配置 ====================

export const DEFAULT_CONFIG: TextSegmentationConfig = {
  sentenceTokenizer: {
    language: 'zh',
    handleAbbreviations: true,
    customAbbreviations: ['Dr.', 'Mr.', 'Ms.', '等', 'etc.', 'i.e.', 'e.g.'],
    maxSentenceLength: 200,
  },
  scene: {
    targetSeconds: 6.0,
    baseWordsPerSecond: 3.3,
    speechRate: 1.0,
    minWordsPerSegment: 10,
    maxWordsPerSegment: 50,
    enforceSentenceBoundary: true,
    allowSingleSentenceOverflow: true,
  },
  subtitle: {
    minCharsPerBlock: 8,
    maxCharsPerBlock: 15,
    punctuationPriority: [
      '。', '！', '？', '；',
      '.', '!', '?', ';',
      '，', ',',
      '、',
      ' ', '\n',
    ],
    timeCalculationMethod: 'proportional',
  },
};

/** 合并用户提供的部分配置与默认配置 */
function mergeConfig(partial?: Partial<TextSegmentationConfig>): TextSegmentationConfig {
  if (!partial) return DEFAULT_CONFIG;
  return {
    sentenceTokenizer: { ...DEFAULT_CONFIG.sentenceTokenizer, ...partial.sentenceTokenizer },
    scene: { ...DEFAULT_CONFIG.scene, ...partial.scene },
    subtitle: { ...DEFAULT_CONFIG.subtitle, ...partial.subtitle },
  };
}

// ==================== 数据类型 ====================

/** 字幕块数据结构 */
export interface SubtitleBlock {
  text: string;
  displayOrder: number;
  startTime: number;
  duration: number;
  parentSegmentId: number;
}

/** 语音段落数据结构 */
export interface SpeechSegment {
  text: string;
  estimatedDuration: number;
  segmentId: number;
  targetWords: number;
  subtitles: SubtitleBlock[];
}

/** 完整处理结果 */
export interface SegmentationResult {
  speechSegments: SpeechSegment[];
  totalDuration: number;
  totalWords: number;
  segmentCount: number;
  config: TextSegmentationConfig;
}

// ==================== 句子边界消歧器 ====================

export class SentenceTokenizer {
  private config: SentenceTokenizerConfig;
  private sentenceDelimiters: RegExp;

  constructor(config?: Partial<SentenceTokenizerConfig>) {
    this.config = { ...DEFAULT_CONFIG.sentenceTokenizer, ...config };
    this.sentenceDelimiters = /([。！？])/;
  }

  /** 将文本分割为句子列表 */
  split(text: string): string[] {
    if (!text || !text.trim()) return [];

    // 1. 预处理：合并空白字符
    let processed = text.replace(/\s+/g, ' ').trim();

    // 2. 处理缩写：将缩写替换为占位符，避免误分句
    const placeholder = '##ABBR##';
    const abbreviationsFound: Record<string, string> = {};

    if (this.config.handleAbbreviations) {
      for (let i = 0; i < this.config.customAbbreviations.length; i++) {
        const abbr = this.config.customAbbreviations[i];
        if (processed.includes(abbr)) {
          const placeholderKey = `${placeholder}${i}`;
          abbreviationsFound[placeholderKey] = abbr;
          processed = processed.split(abbr).join(placeholderKey);
        }
      }
    }

    // 3. 按句子分隔符分割
    const parts = processed.split(this.sentenceDelimiters);
    const sentences: string[] = [];
    let currentSentence = '';

    for (let i = 0; i < parts.length - 1; i += 2) {
      currentSentence += parts[i];
      if (i + 1 < parts.length) {
        const delimiter = parts[i + 1];
        currentSentence += delimiter;

        // 恢复缩写
        for (const [key, abbr] of Object.entries(abbreviationsFound)) {
          currentSentence = currentSentence.split(key).join(abbr);
        }

        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
    }

    // 处理最后一部分（可能没有句末标点）
    if (currentSentence || (parts.length % 2 === 1 && parts[parts.length - 1])) {
      const lastPart = currentSentence + (parts.length % 2 === 1 ? parts[parts.length - 1] : '');
      if (lastPart.trim()) {
        let restored = lastPart;
        for (const [key, abbr] of Object.entries(abbreviationsFound)) {
          restored = restored.split(key).join(abbr);
        }
        sentences.push(restored.trim());
      }
    }

    // 4. 过滤空句子
    const filtered = sentences.filter((s) => s.length > 0);

    // 5. 若整段无有效句末标点且长度超过 maxSentenceLength，按字数强制分段
    if (filtered.length === 1 && filtered[0].length > this.config.maxSentenceLength) {
      const chunks: string[] = [];
      const chars = filtered[0].split('');
      let chunk = '';
      for (const ch of chars) {
        chunk += ch;
        if (chunk.length >= this.config.maxSentenceLength) {
          chunks.push(chunk.trim());
          chunk = '';
        }
      }
      if (chunk.trim()) {
        // 末尾短段合并到前一段
        if (chunks.length && chunk.length < this.config.maxSentenceLength * 0.3) {
          chunks[chunks.length - 1] += chunk.trim();
        } else {
          chunks.push(chunk.trim());
        }
      }
      return chunks.length > 0 ? chunks : filtered;
    }

    // 6. 处理过长的句子
    const result: string[] = [];
    for (const sentence of filtered) {
      if (sentence.length <= this.config.maxSentenceLength) {
        result.push(sentence);
      } else {
        result.push(...this.splitLongSentence(sentence));
      }
    }

    return result;
  }

  /** 分割过长的句子（在逗号/分号处分割） */
  private splitLongSentence(sentence: string): string[] {
    const parts = sentence.split(/[，,;；]/);
    const result: string[] = [];
    let currentPart = '';

    for (const part of parts) {
      if (!part) continue;
      if (!currentPart) {
        currentPart = part;
      } else if (currentPart.length + part.length + 1 <= this.config.maxSentenceLength) {
        currentPart += '，' + part;
      } else {
        result.push(currentPart);
        currentPart = part;
      }
    }

    if (currentPart) {
      result.push(currentPart);
    }

    return result;
  }
}

// ==================== 场景级分割器 ====================

export class SceneSegmenter {
  private config: SceneSegmentationConfig;
  private sentenceTokenizer: SentenceTokenizer;

  constructor(
    config?: Partial<SceneSegmentationConfig>,
    sentenceTokenizer?: SentenceTokenizer,
  ) {
    this.config = { ...DEFAULT_CONFIG.scene, ...config };
    this.sentenceTokenizer = sentenceTokenizer || new SentenceTokenizer();
  }

  /** 计算目标字数 */
  calculateTargetWords(): number {
    const targetWords = Math.round(
      this.config.targetSeconds * this.config.baseWordsPerSecond * this.config.speechRate,
    );
    return Math.max(
      this.config.minWordsPerSegment,
      Math.min(targetWords, this.config.maxWordsPerSegment),
    );
  }

  /** 将文本分割为语音段落 */
  segment(text: string): SpeechSegment[] {
    // 1. 首先分割为句子
    const sentences = this.sentenceTokenizer.split(text);
    if (!sentences.length) return [];

    // 2. 计算目标字数
    const targetWords = this.calculateTargetWords();

    // 3. 合并句子为段落
    const segments: SpeechSegment[] = [];
    let currentSegment: string[] = [];
    let currentWordCount = 0;
    let segmentId = 0;

    for (const sentence of sentences) {
      const sentenceWordCount = sentence.length;

      const canAppend =
        !currentSegment.length ||
        currentWordCount + sentenceWordCount <= targetWords ||
        (this.config.allowSingleSentenceOverflow && currentSegment.length === 0);

      if (canAppend) {
        currentSegment.push(sentence);
        currentWordCount += sentenceWordCount;
      } else {
        // 创建段落
        if (currentSegment.length) {
          const segmentText = currentSegment.join('');
          segments.push(this.createSpeechSegment(segmentText, segmentId, currentWordCount));
          segmentId++;
        }
        // 开始新段落
        currentSegment = [sentence];
        currentWordCount = sentenceWordCount;
      }
    }

    // 添加最后一个段落
    if (currentSegment.length) {
      const segmentText = currentSegment.join('');
      segments.push(this.createSpeechSegment(segmentText, segmentId, currentWordCount));
    }

    return segments;
  }

  private createSpeechSegment(text: string, segmentId: number, wordCount: number): SpeechSegment {
    const estimatedDuration =
      wordCount / (this.config.baseWordsPerSecond * this.config.speechRate);

    return {
      text,
      estimatedDuration: Math.round(estimatedDuration * 100) / 100,
      segmentId,
      targetWords: wordCount,
      subtitles: [],
    };
  }
}

// ==================== 字幕级分割器 ====================

export class SubtitleSegmenter {
  private config: SubtitleSegmentationConfig;
  private sentenceTokenizer: SentenceTokenizer;

  constructor(
    config?: Partial<SubtitleSegmentationConfig>,
    sentenceTokenizer?: SentenceTokenizer,
  ) {
    this.config = { ...DEFAULT_CONFIG.subtitle, ...config };
    this.sentenceTokenizer = sentenceTokenizer || new SentenceTokenizer();
  }

  /** 将文本分割为字幕块 */
  segment(text: string, parentDuration: number, parentId: number): SubtitleBlock[] {
    // 1. 分割为句子
    const sentences = this.sentenceTokenizer.split(text);
    if (!sentences.length) return [];

    // 2. 进一步分割每个句子为字幕块
    const allBlocks: string[] = [];
    for (const sentence of sentences) {
      const blocks = this.splitSentenceIntoBlocks(sentence);
      allBlocks.push(...blocks);
    }

    // 3. 计算时间戳
    return this.calculateTimestamps(allBlocks, parentDuration, parentId);
  }

  /** 将单个句子分割为字幕块 */
  private splitSentenceIntoBlocks(sentence: string): string[] {
    const blocks: string[] = [];
    let currentBlock = '';

    for (const char of sentence) {
      // 如果遇到分割符，并且当前块不为空
      if (this.config.punctuationPriority.includes(char) && currentBlock) {
        currentBlock += char;

        // 检查当前块长度
        if (currentBlock.length >= this.config.minCharsPerBlock) {
          blocks.push(currentBlock);
          currentBlock = '';
        }
        // 如果块太小，暂时保留（继续累积）
      } else {
        currentBlock += char;
      }

      // 如果当前块达到最大长度，强制分割
      if (currentBlock.length >= this.config.maxCharsPerBlock) {
        const splitPos = this.findSplitPosition(currentBlock);
        if (splitPos > 0) {
          blocks.push(currentBlock.slice(0, splitPos));
          currentBlock = currentBlock.slice(splitPos);
        } else {
          // 没有合适的分割点，强制在最大长度处分割
          blocks.push(currentBlock);
          currentBlock = '';
        }
      }
    }

    // 处理剩余的字符
    if (currentBlock) {
      // 如果最后一块太小，合并到前一块
      if (currentBlock.length < this.config.minCharsPerBlock && blocks.length) {
        const lastBlock = blocks.pop()!;
        blocks.push(lastBlock + currentBlock);
      } else {
        blocks.push(currentBlock);
      }
    }

    return blocks;
  }

  /** 找到合适的分割位置 */
  private findSplitPosition(text: string): number {
    // 优先在标点处分隔（从后向前找）
    for (let i = text.length - 1; i >= 0; i--) {
      if (this.config.punctuationPriority.includes(text[i])) {
        return i + 1; // 在标点后分割
      }
    }

    // 其次在空格处分隔
    for (let i = text.length - 1; i >= 0; i--) {
      if ([' ', '　', '\t'].includes(text[i])) {
        return i + 1;
      }
    }

    // 没有合适的分割点
    return -1;
  }

  /** 计算每个字幕块的时间戳 */
  private calculateTimestamps(
    blocks: string[],
    totalDuration: number,
    parentId: number,
  ): SubtitleBlock[] {
    if (!blocks.length) return [];

    if (this.config.timeCalculationMethod === 'equal') {
      // 平均分配时间
      const blockDuration = totalDuration / blocks.length;
      return blocks.map((blockText, i) => ({
        text: blockText,
        displayOrder: i,
        startTime: Math.round(i * blockDuration * 100) / 100,
        duration: Math.round(blockDuration * 100) / 100,
        parentSegmentId: parentId,
      }));
    }

    // proportional: 按字数比例分配时间
    const totalChars = blocks.reduce((sum, block) => sum + block.length, 0);
    const subtitleBlocks: SubtitleBlock[] = [];
    let currentTime = 0.0;

    for (let i = 0; i < blocks.length; i++) {
      const blockText = blocks[i];
      const blockDuration =
        totalChars > 0 ? (blockText.length / totalChars) * totalDuration : totalDuration / blocks.length;
      const roundedDuration = Math.round(blockDuration * 100) / 100;

      subtitleBlocks.push({
        text: blockText,
        displayOrder: i,
        startTime: Math.round(currentTime * 100) / 100,
        duration: roundedDuration,
        parentSegmentId: parentId,
      });

      currentTime += blockDuration;
    }

    return subtitleBlocks;
  }
}

// ==================== 主模块 ====================

export class TextSegmentationModule {
  private config: TextSegmentationConfig;
  private sentenceTokenizer: SentenceTokenizer;
  private sceneSegmenter: SceneSegmenter;
  private subtitleSegmenter: SubtitleSegmenter;

  constructor(config?: Partial<TextSegmentationConfig>) {
    this.config = mergeConfig(config);
    this.sentenceTokenizer = new SentenceTokenizer(this.config.sentenceTokenizer);
    this.sceneSegmenter = new SceneSegmenter(this.config.scene, this.sentenceTokenizer);
    this.subtitleSegmenter = new SubtitleSegmenter(this.config.subtitle, this.sentenceTokenizer);
  }

  /** 完整处理文本分割流程 */
  process(text: string): SegmentationResult {
    if (!text || !text.trim()) {
      throw new Error('输入文本不能为空');
    }

    // 1. 场景级分割
    const speechSegments = this.sceneSegmenter.segment(text);

    // 2. 为每个语音段落生成字幕
    for (const segment of speechSegments) {
      segment.subtitles = this.subtitleSegmenter.segment(
        segment.text,
        segment.estimatedDuration,
        segment.segmentId,
      );
    }

    // 3. 计算总体统计
    const totalDuration = speechSegments.reduce((sum, s) => sum + s.estimatedDuration, 0);
    const totalWords = speechSegments.reduce((sum, s) => sum + s.text.length, 0);

    return {
      speechSegments,
      totalDuration: Math.round(totalDuration * 100) / 100,
      totalWords,
      segmentCount: speechSegments.length,
      config: this.config,
    };
  }

  /** 获取配置摘要 */
  getConfigSummary(): Record<string, unknown> {
    return {
      sentenceTokenizerConfig: this.config.sentenceTokenizer,
      sceneConfig: {
        ...this.config.scene,
        targetWords: this.sceneSegmenter.calculateTargetWords(),
      },
      subtitleConfig: this.config.subtitle,
    };
  }
}

// ==================== 便捷函数 ====================

/**
 * 将文本按目标数量分割为场景（语音段落）
 * @param text 原始文案
 * @param options targetCount: 目标段数；config: 自定义配置
 * @returns 场景文本数组
 */
export function splitTextToScenes(
  text: string,
  options?: { targetCount?: number; config?: Partial<TextSegmentationConfig> },
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const module = new TextSegmentationModule(options?.config);
  const result = module.process(trimmed);
  let segments = result.speechSegments.map((s) => s.text);

  // 适配目标数量
  if (options?.targetCount && options.targetCount > 0) {
    segments = adaptSegmentsToCount(segments, options.targetCount);
  }

  return segments;
}

/**
 * 将文本分割为字幕块
 * @param text 原始文案
 * @param options config: 自定义配置
 * @returns 字幕文本数组
 */
export function splitTextToSubtitles(
  text: string,
  options?: { config?: Partial<TextSegmentationConfig> },
): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const config = mergeConfig(options?.config);
  const tokenizer = new SentenceTokenizer(config.sentenceTokenizer);
  const segmenter = new SubtitleSegmenter(config.subtitle, tokenizer);
  const blocks = segmenter.segment(trimmed, 0, 0);
  return blocks.map((b) => b.text);
}

/**
 * 构建与语音时长同步的字幕时间线
 * @param text 原始文案
 * @param totalDuration 语音总时长（秒）
 * @param options config: 自定义配置
 */
export function buildSubtitleTimelineV2(
  text: string,
  totalDuration: number,
  options?: { config?: Partial<TextSegmentationConfig> },
): Array<{ text: string; startTime: number; endTime: number; charTimings: number[] }> {
  const lines = splitTextToSubtitles(text, options);
  if (!lines.length) return [];

  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  const subtitles: Array<{ text: string; startTime: number; endTime: number; charTimings: number[] }> = [];
  let currentTime = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const duration =
      totalChars > 0 ? (line.length / totalChars) * totalDuration : totalDuration / lines.length;
    const endTime = i === lines.length - 1 ? totalDuration : currentTime + duration;

    // 逐字时间戳
    const charCount = line.length;
    const charDuration = charCount > 0 ? duration / charCount : duration;
    const charTimings: number[] = [];
    for (let c = 0; c < charCount; c++) {
      charTimings.push(currentTime + (c + 1) * charDuration);
    }

    subtitles.push({
      text: line,
      startTime: currentTime,
      endTime,
      charTimings,
    });
    currentTime = endTime;
  }

  return subtitles;
}

// ==================== 内部工具函数 ====================

/**
 * 将分断结果适配为目标数量
 * - 若分断数 > targetCount：等比合并相邻段
 * - 若分断数 < targetCount：用末尾段填充
 */
function adaptSegmentsToCount(segments: string[], targetCount: number): string[] {
  if (!segments.length) return [];
  if (targetCount <= 0) return segments;

  const merged = [...segments];

  // 合并：将最短相邻对合并直到数量满足
  while (merged.length > targetCount) {
    let minLen = Infinity;
    let minIdx = merged.length - 2;
    for (let i = 0; i < merged.length - 1; i++) {
      const combined = merged[i].length + merged[i + 1].length;
      if (combined < minLen) {
        minLen = combined;
        minIdx = i;
      }
    }
    merged.splice(minIdx, 2, merged[minIdx] + merged[minIdx + 1]);
  }

  // 填充：末尾段重复
  while (merged.length < targetCount) {
    merged.push(merged[merged.length - 1]);
  }

  return merged;
}

// ==================== 版本标识 ====================

export const TEXT_SEGMENTATION_VERSION = 'v1.0';

export function getSegmentationVersion(): string {
  return TEXT_SEGMENTATION_VERSION;
}
