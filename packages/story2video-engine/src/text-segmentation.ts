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

// 字幕分割规则单源（subtitle-rules.json，与 smart-sentence-splitter Python 共享同一份规则）
import subtitleRules from './subtitle-rules.json';

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
  /** 分镜字数主控（三层模型①）：提供时直接作为目标字数，缺省回退 targetSeconds×bps×speechRate */
  targetCharsPerScene?: number;
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
    minCharsPerBlock: subtitleRules.defaults.min_chars_per_block,
    maxCharsPerBlock: subtitleRules.defaults.max_chars_per_block,
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

  /** 计算目标字数（分镜字数主控优先，缺省回退 时长×字速×语速 换算） */
  calculateTargetWords(): number {
    const derived = Math.round(
      this.config.targetSeconds * this.config.baseWordsPerSecond * this.config.speechRate,
    );
    const targetWords = this.config.targetCharsPerScene && this.config.targetCharsPerScene > 0
      ? Math.floor(this.config.targetCharsPerScene)
      : derived;
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

  // 规范常量（规则单源：subtitle-rules.json，与 Python 共享同一份规则；禁止再手写硬编码字符集）
  private static SENTENCE_BOUNDARY = new Set(subtitleRules.sentence_boundary);
  private static PRIORITY_PUNCT = new Set(subtitleRules.priority_punct);
  // v1.1 顿号枚举单元保护：枚举结束判定用（顿号之上）更高优先级标点
  private static ENUM_HIGHER_PUNCT = new Set(subtitleRules.enum.higher_punct);
  // 枚举结束判定的谓词/主语引导词（常见分句起始字，启发式）
  private static ENUM_PREDICATE_STARTERS = new Set(subtitleRules.enum.predicate_starters);
  private static ENUM_CONNECTORS = new Set(subtitleRules.enum.connectors);
  private static LEADING_PUNCT = new Set(subtitleRules.leading_punct);
  private static TRAILING_PUNCT = new Set(subtitleRules.trailing_punct);
  private static QUOTE_PAIRS = subtitleRules.quote_pairs as [string, string][];
  private static LEFT_QUOTES = new Set(subtitleRules.quote_pairs.map((q) => q[0]));
  private static RIGHT_QUOTES = new Set(subtitleRules.quote_pairs.map((q) => q[1]));
  private static QUOTE_MAP = new Map<string, string>(subtitleRules.quote_pairs as [string, string][]);

  constructor(
    config?: Partial<SubtitleSegmentationConfig>,
    sentenceTokenizer?: SentenceTokenizer,
  ) {
    this.config = { ...DEFAULT_CONFIG.subtitle, ...config };
    this.sentenceTokenizer = sentenceTokenizer || new SentenceTokenizer();
  }

  /** 将文本分割为字幕块（规范 7 步流水线） */
  segment(text: string, parentDuration: number, parentId: number): SubtitleBlock[] {
    const trimmed = (text || '').trim();
    if (!trimmed) return [];
    const blocks = this.splitToBlocks(trimmed);
    return this.calculateTimestamps(blocks, parentDuration, parentId);
  }

  /** Step 1-6：分句 → 引号 → 长度 → 合并 → 标点 → 强制（强制后再清理一次） */
  private splitToBlocks(text: string): string[] {
    const all: string[] = [];
    for (const sentence of this.splitSentences(text)) {
      for (const fragment of this.splitQuoteBoundaries(sentence)) {
        let blocks = this.lengthSplit(fragment);
        blocks = this.mergeShort(blocks);
        blocks = this.clean(blocks);
        blocks = this.enforceMax(blocks);
        blocks = this.clean(blocks);
        all.push(...blocks);
      }
    }
    // 规范 3：过滤空块与纯标点块（含孤立引号）
    return all.filter((b) => {
      const s = b.trim();
      if (!s) return false;
      return ![...s].every((c) => this.isTrailingPunctOrQuote(c));
    });
  }

  private isTrailingPunctOrQuote(c: string): boolean {
    return SubtitleSegmenter.TRAILING_PUNCT.has(c)
      || SubtitleSegmenter.LEFT_QUOTES.has(c)
      || SubtitleSegmenter.RIGHT_QUOTES.has(c);
  }

  /** Step 1：分句（句界归属前块；未闭合引号内的句界不生效） */
  private splitSentences(text: string): string[] {
    const out: string[] = [];
    let cur = '';
    const stack: string[] = [];
    for (const ch of text) {
      cur += ch;
      if (SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push(ch);
      } else if (SubtitleSegmenter.RIGHT_QUOTES.has(ch) && stack.length
        && SubtitleSegmenter.QUOTE_MAP.get(stack[stack.length - 1]) === ch) {
        stack.pop();
      }
      if (SubtitleSegmenter.SENTENCE_BOUNDARY.has(ch) && stack.length === 0) {
        out.push(cur);
        cur = '';
      }
    }
    if (cur.trim()) out.push(cur);
    return out.filter((s) => s.trim().length > 0);
  }

  /** Step 2：闭引号后切分（引号内容 >= minChars 才切）；短引号并入上下文 */
  private splitQuoteBoundaries(text: string): string[] {
    const fragments: string[] = [];
    let cur = '';
    const stack: { q: string; start: number }[] = [];
    for (const ch of text) {
      if (SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push({ q: ch, start: cur.length });
        cur += ch;
      } else if (SubtitleSegmenter.RIGHT_QUOTES.has(ch) && stack.length
        && SubtitleSegmenter.QUOTE_MAP.get(stack[stack.length - 1].q) === ch) {
        const top = stack.pop()!;
        const contentLen = cur.length - top.start - 1;
        cur += ch;
        if (stack.length === 0 && contentLen >= this.config.minCharsPerBlock) {
          fragments.push(cur);
          cur = '';
        }
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) fragments.push(cur);
    return fragments.filter((f) => f.trim().length > 0);
  }

  /** Step 3：长度切分（标点优先 + 配对引号保护，min/max） */
  private lengthSplit(text: string): string[] {
    const blocks: string[] = [];
    let cur = '';
    const stack: string[] = [];
    let lastHardCut = false; // 最近一次切分是否为无标点硬切
    for (const ch of text) {
      cur += ch;
      if (SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push(ch);
      } else if (SubtitleSegmenter.RIGHT_QUOTES.has(ch) && stack.length
        && SubtitleSegmenter.QUOTE_MAP.get(stack[stack.length - 1]) === ch) {
        stack.pop();
      }
      const isPunct = SubtitleSegmenter.PRIORITY_PUNCT.has(ch) || ch === ' ' || ch === '\n' || ch === '\u3000';
      if (isPunct && cur.length >= this.config.minCharsPerBlock) {
        blocks.push(cur);
        cur = '';
        lastHardCut = false;
      } else if (cur.length >= this.config.maxCharsPerBlock && stack.length === 0) {
        const pos = this.applyEnumerationShift(cur, this.findSplitPos(cur), false);
        if (pos > 0) {
          blocks.push(cur.slice(0, pos));
          cur = cur.slice(pos);
          lastHardCut = false;
        } else {
          blocks.push(cur);
          cur = '';
          lastHardCut = true;
        }
      } else if (cur.length >= this.config.maxCharsPerBlock * 2 && stack.length > 0) {
        blocks.push(cur);
        cur = '';
        stack.length = 0;
        lastHardCut = true;
      }
    }
    if (cur) {
      // 平衡约束（与 Python 实现一致）：硬切后的尾块清理后为 4..min-1 字（非合法 ≤3 短尾）时，
      // 从上一块让字给尾块（区间内优先标点），避免孤悬尾块（如 15+4 → 11+8）
      const tailClean = cur.trim().replace(/[。！？；，、.!?;…]+$/, '');
      if (lastHardCut && blocks.length > 0 && tailClean.length > 3
        && tailClean.length < this.config.minCharsPerBlock
        && blocks[blocks.length - 1].length >= this.config.minCharsPerBlock) {
        const prev = blocks[blocks.length - 1];
        const need = this.config.minCharsPerBlock - tailClean.length;
        const lo = Math.max(1, prev.length - need);
        const hi = prev.length - 1;
        const balanced = this.findSplitPosInRange(prev, lo, hi);
        const pos = balanced > 0 ? balanced : lo;
        blocks[blocks.length - 1] = prev.slice(0, pos);
        cur = prev.slice(pos) + cur;
      }
      blocks.push(cur);
    }
    return blocks.filter((b) => b.trim().length > 0);
  }

  /** 从后往前找切分锚点（切后索引；无则 -1）。v1.1 顿号优先级最低：更高优先级标点 → 空格 → 顿号兜底 */
  private findSplitPos(text: string): number {
    for (let i = text.length - 1; i >= 0; i--) {
      if (SubtitleSegmenter.PRIORITY_PUNCT.has(text[i]) && text[i] !== '、') return i + 1;
    }
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === ' ' || text[i] === '\n' || text[i] === '\u3000') return i + 1;
    }
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === '、') return i + 1;
    }
    return -1;
  }

  /** 顿号枚举单元结束位置（v1.1）：结束于更高优先级标点/谓词引导词/片段尾 */
  private enumerationEnd(text: string, pos: number): number {
    for (let i = pos; i < text.length; i++) {
      const ch = text[i];
      if (SubtitleSegmenter.ENUM_HIGHER_PUNCT.has(ch) || SubtitleSegmenter.ENUM_PREDICATE_STARTERS.has(ch)) {
        return i;
      }
    }
    return text.length;
  }

  /** 若切分锚点落在顿号上，把切分点前移到枚举单元结束之后（头块 ≤ max 才生效；requireTailMin 用于完整块） */
  private applyEnumerationShift(text: string, pos: number, requireTailMin: boolean): number {
    if (pos <= 0 || pos >= text.length || text[pos - 1] !== '、') return pos;
    const eend = this.enumerationEnd(text, pos);
    if (eend > pos && eend <= this.config.maxCharsPerBlock) {
      if (!requireTailMin || text.length - eend >= this.config.minCharsPerBlock) {
        return eend;
      }
    }
    return pos;
  }

  /** Step 4：短块合并（前块 <min 合并；纯标点短块并入；短尾并入） */
  private mergeShort(blocks: string[]): string[] {
    if (!blocks.length) return blocks;
    const merged = [blocks[0]];
    for (let i = 1; i < blocks.length; i++) {
      const b = blocks[i];
      const stripped = b.trim();
      const isPunctTail = stripped.length <= 2 && [...stripped].every((c) => this.isTrailingPunctOrQuote(c));
      const isShortTail = stripped.length <= 3 && merged[merged.length - 1].length >= this.config.minCharsPerBlock;
      if (merged[merged.length - 1].length < this.config.minCharsPerBlock || isPunctTail || isShortTail) {
        merged[merged.length - 1] = merged[merged.length - 1] + b;
      } else {
        merged.push(b);
      }
    }
    return merged.filter((b) => b.trim().length > 0);
  }

  /** Step 5：标点规范化（trim → 开头修正 → 跨块引号清理 → 末尾去除 → 再去除） */
  private clean(blocks: string[]): string[] {
    let bs = blocks.map((b) => b.trim()).filter(Boolean);
    if (!bs.length) return [];
    // 子步 1：开头标点修正（首块开头标点删除，后续块开头标点前移）
    const fixed: string[] = [bs[0]];
    if (fixed[0] && SubtitleSegmenter.LEADING_PUNCT.has(fixed[0][0])) {
      fixed[0] = fixed[0].slice(1);
    }
    for (let i = 1; i < bs.length; i++) {
      let b = bs[i];
      if (b && SubtitleSegmenter.LEADING_PUNCT.has(b[0]) && fixed.length) {
        fixed[fixed.length - 1] += b[0];
        b = b.slice(1);
      }
      if (b) fixed.push(b);
    }
    bs = fixed.filter(Boolean);
    // 子步 2：跨块引号清理（先删孤立引号，暴露末尾标点）
    bs = bs.map((b) => this.dropUnpairedQuotes(b)).filter(Boolean);
    // 子步 3：末尾标点去除
    bs = bs.map((b) => b.replace(/[。！？；，、.!?;…]+$/, '')).filter(Boolean);
    // 子步 4：再次开头修正 + 末尾去除 + trim
    const out: string[] = [];
    for (const b of bs) {
      let nb = b;
      if (nb && SubtitleSegmenter.LEADING_PUNCT.has(nb[0]) && out.length) {
        out[out.length - 1] += nb[0];
        nb = nb.slice(1);
      }
      nb = nb.replace(/[。！？；，、.!?;…]+$/, '').trim();
      if (nb) out.push(nb);
    }
    return out;
  }

  /** 删除文本中未配对的引号（块内成对保留） */
  private dropUnpairedQuotes(text: string): string {
    const drop = new Array(text.length).fill(false);
    const stack: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push(i);
      } else if (SubtitleSegmenter.RIGHT_QUOTES.has(ch)) {
        if (stack.length && SubtitleSegmenter.QUOTE_MAP.get(text[stack[stack.length - 1]]) === ch) {
          stack.pop();
        } else {
          drop[i] = true;
        }
      }
    }
    for (const idx of stack) drop[idx] = true;
    return [...text].filter((_, i) => !drop[i]).join('');
  }

  /** Step 6：超长强制分割（平衡切分：尾块 < minChars 时前块让字，避免孤悬尾块） */
  private enforceMax(blocks: string[]): string[] {
    const out: string[] = [];
    for (let b of blocks) {
      while (b.length > this.config.maxCharsPerBlock) {
        let pos = this.applyEnumerationShift(b, this.findSplitPos(b), true);
        if (pos <= 0 || pos >= b.length) pos = this.config.maxCharsPerBlock;
        // 平衡约束：尾块 < minChars 时切分点前移至 len - minChars（区间内优先找标点）
        if (b.length - pos < this.config.minCharsPerBlock) {
          const minPos = Math.max(1, b.length - this.config.minCharsPerBlock);
          const balanced = this.findSplitPosInRange(b, minPos, b.length - 1);
          pos = balanced > 0 ? balanced : minPos;
        }
        out.push(b.slice(0, pos));
        b = b.slice(pos);
      }
      if (b) out.push(b);
    }
    return out;
  }

  /** 在 [lo, hi] 范围内从后往前找最近优先级标点/空格（返回切后索引；无则 -1） */
  private findSplitPosInRange(text: string, lo: number, hi: number): number {
    for (let i = hi; i >= lo; i--) {
      if (SubtitleSegmenter.PRIORITY_PUNCT.has(text[i])) return i + 1;
    }
    for (let i = hi; i >= lo; i--) {
      if (text[i] === ' ' || text[i] === '\n' || text[i] === '\u3000') return i + 1;
    }
    return -1;
  }

  /** Step 7：时间戳分配（proportional 按字数比例 / equal 等分） */
  private calculateTimestamps(
    blocks: string[],
    totalDuration: number,
    parentId: number,
  ): SubtitleBlock[] {
    if (!blocks.length) return [];

    const build = (blocks: string[], durs: number[]): SubtitleBlock[] => {
      const out: SubtitleBlock[] = [];
      let t = 0.0;
      for (let i = 0; i < blocks.length; i++) {
        const d = Math.round(durs[i] * 100) / 100;
        out.push({
          text: blocks[i],
          displayOrder: i,
          startTime: t,
          duration: d,
          parentSegmentId: parentId,
        });
        t = Math.round((t + d) * 100) / 100; // 舍入后连续累加，保证区间严格连续
      }
      return out;
    };

    if (this.config.timeCalculationMethod === 'equal') {
      const durs = blocks.map(() => totalDuration / blocks.length);
      return build(blocks, durs);
    }

    // proportional: 按字数比例分配时间
    const totalChars = blocks.reduce((sum, block) => sum + block.length, 0);
    const durs = blocks.map((b) =>
      totalChars > 0 ? (b.length / totalChars) * totalDuration : totalDuration / blocks.length,
    );
    return build(blocks, durs);
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
