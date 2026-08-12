/**
 * 字幕时间戳真实对齐（Tier 2 ASR）——词级时间聚合到分句块（纯逻辑，无外部依赖）。
 *
 * 契约（对齐《字幕时间戳真实对齐》OpenSpec：openspec/changes/subtitle-audio-alignment/）：
 * - 输入：分句块（纯文本切分结果，本函数不改变文本） + ASR 词级时间（faster-whisper word_timestamps）；
 * - 输出：aligned blocks（真实时间替换估算）+ method + coverage + warnings；
 * - 文本匹配：块文本与词流按“去标点/空白 + 大小写归一”后做贪心窗口匹配（Levenshtein 容差），
 *   失败块回退估算并记 warning（fail-open 到估算，不中断流水线）；
 * - 区间约束：start 用命中词的第一个 start，end 用最后一个 end；相邻块强制连续不重叠
 *   （start[i] = max(start[i], end[i-1])，half-up 保留 2 位小数，与 Step 7 舍入语义一致）。
 */

export interface WordTiming {
  text: string;
  start: number;
  end: number;
  probability?: number;
}

export interface SubtitleBlockInput {
  displayOrder: number;
  text: string;
}

export interface AlignedSubtitleBlock {
  displayOrder: number;
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  source: 'asr' | 'estimate';
}

export interface SubtitleAlignResult {
  aligned: AlignedSubtitleBlock[];
  method: 'asr' | 'estimate';
  totalDuration: number;
  coverage: number; // 0-1：命中块字符数 / 总字符数
  warnings: string[];
}

/** 归一化：去空白与中文/英文标点、转小写（用于匹配，不改变原始文本） */
export function normalizeForAlign(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s。！？；，、：""''（）《》【】「」『』….,!?;:'"()\[\]<>\-—–_~@#$%^&*+=|/\\`]/g, '');
}

/** 四舍五入（half-up）保留 2 位小数（与分句引擎 Step 7 一致） */
export function round2HalfUp(x: number): number {
  return Math.round(x * 100) / 100;
}

/** 编辑距离（用于块文本与词窗口的模糊匹配） */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 把 ASR 词级时间聚合到分句块。
 * @param blocks 分句块（纯文本切分结果）
 * @param words ASR 词级时间（按时间升序）
 * @param fallbackDuration 兜底总时长（无任何词命中时按比例估算）
 */
export function alignSubtitleBlocks(
  blocks: SubtitleBlockInput[],
  words: WordTiming[],
  fallbackDuration = 10,
): SubtitleAlignResult {
  const warnings: string[] = [];
  const normBlocks = blocks.map((b) => ({ ...b, norm: normalizeForAlign(b.text) }));
  const normWords = words.map((w) => ({ ...w, norm: normalizeForAlign(w.text) }));

  const aligned: AlignedSubtitleBlock[] = [];
  let cursor = 0; // 词流游标
  let matchedChars = 0;
  const totalChars = normBlocks.reduce((s, b) => s + b.norm.length, 0) || 1;

  for (const block of normBlocks) {
    const target = block.norm;
    if (!target) {
      // 空块（理论不出现）：估算
      aligned.push({
        displayOrder: block.displayOrder,
        text: block.text,
        startTime: 0,
        endTime: 0,
        confidence: 0,
        source: 'estimate',
      });
      continue;
    }
    // 窗口：从游标起累积词字符，直到 >= 目标长度（含 20% 松弛）
    const windowLimit = Math.ceil(target.length * 1.25) + 4;
    let acc = '';
    let firstIdx = cursor;
    let lastIdx = cursor - 1;
    let best = { accLen: 0, dist: Infinity, first: cursor, last: cursor - 1 };
    for (let i = cursor; i < normWords.length; i++) {
      acc += normWords[i].norm;
      lastIdx = i;
      if (acc.length >= windowLimit) break;
    }
    const accFull = acc;
    // 尝试从窗口起点滑动 0..3 个词，取 Levenshtein 距离最小的对齐
    for (let slide = 0; slide <= 3 && cursor + slide <= normWords.length; slide++) {
      let a = '';
      let f = cursor + slide;
      let l = f - 1;
      for (let i = f; i < normWords.length; i++) {
        a += normWords[i].norm;
        l = i;
        if (a.length >= target.length) break;
      }
      if (!a) continue;
      const dist = levenshtein(a, target);
      if (dist < best.dist) best = { accLen: a.length, dist, first: f, last: l };
    }
    const ratio = target.length > 0 ? 1 - best.dist / Math.max(target.length, best.accLen) : 0;
    if (ratio >= 0.55 && best.last >= best.first) {
      // 命中：真实时间
      const start = round2HalfUp(normWords[best.first].start);
      const end = round2HalfUp(normWords[best.last].end);
      const conf = Math.min(1, best.accLen / Math.max(1, target.length));
      aligned.push({ displayOrder: block.displayOrder, text: block.text, startTime: start, endTime: end, confidence: conf, source: 'asr' });
      matchedChars += target.length;
      cursor = Math.min(normWords.length, best.last + 1);
    } else {
      // 未命中：估算（比例分摊剩余时间）+ warning
      warnings.push(`块 ${block.displayOrder}（${block.text.slice(0, 12)}…）未匹配到 ASR 词，回退估算`);
      aligned.push({
        displayOrder: block.displayOrder,
        text: block.text,
        startTime: 0,
        endTime: 0,
        confidence: 0,
        source: 'estimate',
      });
      if (best.last >= best.first) cursor = Math.min(normWords.length, best.last + 1);
    }
  }

  // 估算块时间：按未命中块字符占比在（已命中的末 end ~ fallbackDuration）之间分摊
  const estBlocks = aligned.filter((b) => b.source === 'estimate');
  if (estBlocks.length > 0) {
    const lastAsrEnd = aligned.filter((b) => b.source === 'asr').reduce((m, b) => Math.max(m, b.endTime), 0);
    const estTotalChars = estBlocks.reduce((s, b) => s + (normalizeForAlign(b.text).length || 1), 0);
    let t = lastAsrEnd;
    for (const b of estBlocks) {
      const dur = estTotalChars > 0 ? ((normalizeForAlign(b.text).length || 1) / estTotalChars) * Math.max(0, fallbackDuration - lastAsrEnd) : 0;
      b.startTime = round2HalfUp(t);
      b.endTime = round2HalfUp(t + dur);
      t += dur;
    }
  }

  // 区间强制连续：start[i] >= end[i-1]（half-up）
  for (let i = 1; i < aligned.length; i++) {
    const prevEnd = aligned[i - 1].endTime;
    if (aligned[i].startTime < prevEnd) {
      aligned[i].startTime = prevEnd;
    }
    if (aligned[i].endTime < aligned[i].startTime) {
      aligned[i].endTime = aligned[i].startTime;
    }
  }

  // method='asr'：至少一块命中真实 ASR 时间（部分命中时 coverage 单独度量，warnings 注明未命中块）
  const method = matchedChars > 0 ? 'asr' : 'estimate';
  const totalDuration = aligned.length > 0 ? aligned[aligned.length - 1].endTime : 0;
  return { aligned, method, totalDuration: round2HalfUp(totalDuration), coverage: matchedChars / totalChars, warnings };
}
