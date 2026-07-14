import { Segment, useDefault } from 'segmentit';

/** 全局 segmentit 分词实例（懒加载） */
let _segmentit: InstanceType<typeof Segment> | null = null;
function getSegmenter(): InstanceType<typeof Segment> {
  if (!_segmentit) {
    _segmentit = new Segment();
    useDefault(_segmentit);
  }
  return _segmentit;
}

/**
 * 计算文本显示宽度（中文字符=1，英文/数字按2:1折算=0.5）
 */
export function getTextWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(ch)) {
      width += 1; // 中文及中文标点
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      width += 0.5; // 英文/数字
    } else {
      width += 1; // 其他字符按1计
    }
  }
  return width;
}

/**
 * 中文文案语义断句策略
 *
 * 核心原则：
 * 1. 强语义标点优先（句号、问号、感叹号）—— 一个完整的语义单元不应被截断
 * 2. 次语义标点辅助（分号）—— 适合作为次级断句点
 * 3. 弱标点（逗号、顿号）—— 仅作为最后回退的断句点，避免在逗号处生硬截断
 * 4. 字数控制：每段理想长度 40~120 字，最短不低于 15 字，最长不超过 150 字
 *    - 太短（<15字）会导致图片缺乏足够上下文来生成高质量画面
 *    - 太长（>150字）会导致单张图片承载过多语义，生图效果模糊
 * 5. 合并过短片段：断句后若末尾片段过短，优先向前合并而非单独成段
 */

/** 强语义结束标点（句子级） */
const STRONG_ENDERS = /[。！？]/;
/** 次语义结束标点（分句级） */
const MEDIUM_ENDERS = /[；]/;
/** 弱语义分隔标点（词组/短语级，仅作回退；包含破折号单字符 U+2014） */
const WEAK_ENDERS = /[，、\u2014]/;

/**
 * 按语义断句将文案分段
 * @param text 原始文案
 * @param maxLength 每段最大字符数（默认120）
 * @param minLength 每段最小字符数（默认40），用于合并时参考
 */
export function segmentTextBySemantics(text: string, maxLength = 120, minLength = 40): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Guard: ensure minLength does not exceed maxLength
  const effectiveMin = Math.min(minLength, maxLength);
  if (trimmed.length <= maxLength) return [trimmed];

  const segments: string[] = [];
  let current = '';
  const chars = trimmed.split('');

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    current += ch;

    // 1. 强语义标点断句：只要当前长度 >= effectiveMin*0.5（>=20字），即可断句
    if (STRONG_ENDERS.test(ch) && current.length >= effectiveMin * 0.5) {
      segments.push(current.trim());
      current = '';
      continue;
    }

    // 2. 次语义标点断句：当前长度 >= effectiveMin 时，在分号处断句
    if (MEDIUM_ENDERS.test(ch) && current.length >= effectiveMin) {
      segments.push(current.trim());
      current = '';
      continue;
    }

    // 3. 强制断句：超过最大长度时，优先保证语义完整
    if (current.length >= maxLength) {
      let splitIndex = current.length;
      // 优先回退到强语义标点
      for (let j = current.length - 1; j >= Math.max(0, current.length - 30); j--) {
        if (STRONG_ENDERS.test(current[j]) || MEDIUM_ENDERS.test(current[j])) {
          splitIndex = j + 1;
          break;
        }
      }
      if (splitIndex !== current.length) {
        // 在强/次标点处截断，语义完整
        segments.push(current.slice(0, splitIndex).trim());
        current = current.slice(splitIndex).trim();
      } else {
        // 当前段内无强/次标点，宁可超限也要把完整句子保留在同一段
        // 继续向后读取到下一个强语义标点（或文本末尾）
        let found = false;
        for (let k = i + 1; k < chars.length; k++) {
          if (STRONG_ENDERS.test(chars[k])) {
            current += chars.slice(i + 1, k + 1).join('');
            i = k;
            segments.push(current.trim());
            current = '';
            found = true;
            break;
          }
        }
        if (!found) {
          // 读到末尾也没有强标点，剩余全部合并为一段
          current += chars.slice(i + 1).join('');
          i = chars.length; // 结束循环
          segments.push(current.trim());
          current = '';
        }
      }
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  // 4. 合并末尾过短片段（< effectiveMin * 0.75，即默认 <30字）
  while (segments.length >= 2 && segments[segments.length - 1].length < effectiveMin * 0.75) {
    const last = segments.pop()!;
    segments[segments.length - 1] = segments[segments.length - 1] + last;
  }

  return segments;
}

/**
 * 将文案按指定数量均匀分段，尽量在语义标点处切分
 * @param text 原始文案
 * @param count 目标段数
 * @returns 分段后的文案数组
 */
export function segmentTextByCount(text: string, count: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (count <= 1) return [trimmed];
  if (trimmed.length <= count * 15) return [trimmed];

  const chars = trimmed.split('');
  const targetLen = Math.ceil(chars.length / count);
  const segments: string[] = [];
  let current = '';

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    current += ch;

    const isNearTarget = current.length >= targetLen * 0.7;
    const isOverTarget = current.length >= targetLen;

    // 优先在强语义标点处断句
    if (isNearTarget && STRONG_ENDERS.test(ch)) {
      segments.push(current.trim());
      current = '';
      continue;
    }

    // 次优先在分号处断句
    if (isNearTarget && MEDIUM_ENDERS.test(ch)) {
      segments.push(current.trim());
      current = '';
      continue;
    }

    // 超过目标长度时，优先保证语义完整
    if (isOverTarget) {
      let splitIndex = current.length;
      for (let j = current.length - 1; j >= Math.max(0, current.length - 30); j--) {
        if (STRONG_ENDERS.test(current[j]) || MEDIUM_ENDERS.test(current[j])) {
          splitIndex = j + 1;
          break;
        }
      }
      if (splitIndex !== current.length) {
        segments.push(current.slice(0, splitIndex).trim());
        current = current.slice(splitIndex).trim();
      } else {
        // 当前段内无强/次标点，宁可超限也要保留完整句子
        let found = false;
        for (let k = i + 1; k < chars.length; k++) {
          if (STRONG_ENDERS.test(chars[k])) {
            current += chars.slice(i + 1, k + 1).join('');
            i = k;
            segments.push(current.trim());
            current = '';
            found = true;
            break;
          }
        }
        if (!found) {
          current += chars.slice(i + 1).join('');
          i = chars.length;
          segments.push(current.trim());
          current = '';
        }
      }
    }
  }

  if (current.trim()) {
    segments.push(current.trim());
  }

  // 合并末尾过短片段（< targetLen * 0.5）
  while (segments.length > count && segments.length >= 2) {
    const last = segments.pop()!;
    segments[segments.length - 1] = segments[segments.length - 1] + last;
  }

  return segments;
}

const MAX_SUBTITLE_WIDTH = 12;
/** 需要清洗掉的所有中文逻辑标点 */
const ALL_PUNCTUATION = /[，。！？；、,.!?;:\s]/g;

/** 移除所有逻辑性标点符号 */
function cleanPunctuation(text: string): string {
  return text.replace(ALL_PUNCTUATION, '');
}

/**
 * 强制截断超长 token（按最大行宽切割，并清洗标点）
 */
function forceSplitToken(token: string): string[] {
  const parts: string[] = [];
  let current = '';
  let currentWidth = 0;

  for (const ch of token) {
    const w = /[a-zA-Z0-9]/.test(ch) ? 0.5 : 1;
    if (currentWidth + w > MAX_SUBTITLE_WIDTH && current) {
      parts.push(cleanPunctuation(current));
      current = ch;
      currentWidth = w;
    } else {
      current += ch;
      currentWidth += w;
    }
  }
  if (current) parts.push(cleanPunctuation(current));
  return parts.filter((p) => p.length > 0);
}

/**
 * 字幕文字分断逻辑（基于分词的贪心算法 v2）
 *
 * 核心原则：
 * 1. 按所有中文标点（，。！？；、）粗分句，保留标点用于逻辑判断
 * 2. 对每句进行中文分词（segmentit），词语为最小单位
 * 3. 贪心填充时跳过纯标点 token，按显示宽度判断是否加入当前行
 * 4. 英文/数字按 2:1 折算（即 1 个英文字母/数字 = 0.5 个中文字符宽度）
 * 5. 若单个词汇超过 12 字宽，强制截断并清洗标点
 * 6. 每行最终输出前彻底清除所有逻辑性标点，输出纯文本
 * 7. 末尾过短片段（< 2 字宽）向前合并
 */
export function segmentSubtitleText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. 按所有中文标点粗分句（包括逗号、顿号），保留标点
  const rawSegments = trimmed.split(/([，。！？；、])/);
  const segments: string[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const s = rawSegments[i];
    if (!s) continue;
    // 若当前是标点符号，合并到前一段末尾
    if (/^[，。！？；、]$/.test(s) && segments.length > 0) {
      segments[segments.length - 1] += s;
    } else {
      segments.push(s);
    }
  }

  const result: string[] = [];
  const segmenter = getSegmenter();

  for (const segment of segments) {
    if (!segment.trim()) continue;

    // 整段（含标点）去除标点后 <= 12 字宽，直接作为一行
    const cleanedSegment = cleanPunctuation(segment);
    if (cleanedSegment.length > 0 && getTextWidth(cleanedSegment) <= MAX_SUBTITLE_WIDTH) {
      result.push(cleanedSegment);
      continue;
    }

    // 2. 分词
    const rawTokens = segmenter.doSegment(segment).map((r) => r.w);

    let currentLine = '';
    let currentWidth = 0;

    for (const token of rawTokens) {
      // 跳过纯标点 token（它们只是路标，不是内容）
      if (/^[，。！？；、]$/.test(token)) continue;

      const tokenWidth = getTextWidth(token);

      // 单 token 超长：强制截断
      if (tokenWidth > MAX_SUBTITLE_WIDTH) {
        if (currentLine) {
          result.push(cleanPunctuation(currentLine));
          currentLine = '';
          currentWidth = 0;
        }
        const forcedParts = forceSplitToken(token);
        for (let i = 0; i < forcedParts.length; i++) {
          if (i === forcedParts.length - 1) {
            currentLine = forcedParts[i];
            currentWidth = getTextWidth(forcedParts[i]);
          } else {
            result.push(forcedParts[i]);
          }
        }
        continue;
      }

      // 尝试加入当前行
      if (currentWidth + tokenWidth <= MAX_SUBTITLE_WIDTH) {
        currentLine += token;
        currentWidth += tokenWidth;
      } else {
        // 当前行已满，清洗标点后保存，开始新行
        if (currentLine) result.push(cleanPunctuation(currentLine));
        currentLine = token;
        currentWidth = tokenWidth;
      }
    }

    if (currentLine) {
      const cleaned = cleanPunctuation(currentLine);
      if (cleaned) result.push(cleaned);
    }
  }

  // 合并末尾过短片段（< 3 字宽）到前一段，确保合并后不超过 14 字宽
  for (let i = result.length - 1; i > 0; i--) {
    if (getTextWidth(result[i]) < 3 && getTextWidth(result[i - 1]) + getTextWidth(result[i]) <= MAX_SUBTITLE_WIDTH + 2) {
      result[i - 1] += result[i];
      result.splice(i, 1);
    }
  }

  // 最终后处理：确保每行至少 3 个字符，过短则向前/向后合并
  for (let i = result.length - 1; i > 0; i--) {
    if (result[i].length < 3) {
      result[i - 1] += result[i];
      result.splice(i, 1);
    }
  }
  // 首行过短则向后合并
  if (result.length >= 2 && result[0].length < 3) {
    result[1] = result[0] + result[1];
    result.splice(0, 1);
  }

  return result;
}

export interface SubtitleTimelineItem {
  text: string;
  startTime: number;
  endTime: number;
  /** 每个字符的结束时间（秒，相对 startTime） */
  charTimings: number[];
}

/**
 * 构建与语音时长同步的字幕时间线
 * @param text 原始文案
 * @param totalDuration 语音总时长（秒）
 * @returns 带时间段和逐字时间戳的字幕数组
 */
export function buildSubtitleTimeline(text: string, totalDuration: number): SubtitleTimelineItem[] {
  const lines = segmentSubtitleText(text);
  if (lines.length === 0) return [];

  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  const subtitles: SubtitleTimelineItem[] = [];
  let currentTime = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const duration = totalChars > 0 ? (line.length / totalChars) * totalDuration : totalDuration / lines.length;
    // 最后一行确保覆盖到总时长末尾
    const endTime = i === lines.length - 1 ? totalDuration : currentTime + duration;

    // 逐字时间戳：为每个字符分配相对结束时间
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
