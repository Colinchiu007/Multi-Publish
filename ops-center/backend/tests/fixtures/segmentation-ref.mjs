// packages/story2video-engine/src/subtitle-rules.json
var subtitle_rules_default = {
  version: "1.1",
  description: "\u5B57\u5E55\u5206\u5272\u5171\u4EAB\u89C4\u5219\u8868\uFF08\u53CC\u5B9E\u73B0\u5355\u6E90\uFF1Asmart-sentence-splitter Python \u4E0E Multi-Publish story2video-engine TypeScript \u5747\u4ECE\u672C\u6587\u4EF6\u52A0\u8F7D\uFF1B\u540C\u6B65\u526F\u672C\u89C1 Multi-Publish packages/story2video-engine/src/subtitle-rules.json\uFF09",
  defaults: {
    min_chars_per_block: 8,
    max_chars_per_block: 15,
    max_chars_cap: 64
  },
  rounding: {
    mode: "half_up",
    decimal_places: 2
  },
  pipeline: [
    "split_sentences",
    "split_quote_boundaries",
    "length_split",
    "merge_short",
    "clean",
    "enforce_max",
    "assign_timestamps"
  ],
  sentence_boundary: [
    "\u3002",
    "\uFF01",
    "\uFF1F",
    "\u2026",
    ".",
    "!",
    "?"
  ],
  priority_punct: [
    "\u3002",
    "\uFF01",
    "\uFF1F",
    "\uFF1B",
    ".",
    "!",
    "?",
    ";",
    "\uFF0C",
    ",",
    "\u3001"
  ],
  leading_punct: [
    "\uFF0C",
    "\u3001",
    "\u3002",
    "\uFF01",
    "\uFF1F",
    "\uFF1B",
    ",",
    "!",
    "?",
    ";",
    "."
  ],
  trailing_punct: [
    "\u3002",
    "\uFF01",
    "\uFF1F",
    "\uFF1B",
    "\uFF0C",
    "\u3001",
    ".",
    "!",
    "?",
    ";",
    "\u2026"
  ],
  quote_pairs: [
    [
      "\u201C",
      "\u201D"
    ],
    [
      "\u2018",
      "\u2019"
    ],
    [
      "\u300C",
      "\u300D"
    ],
    [
      "\u300E",
      "\u300F"
    ],
    [
      "\u300A",
      "\u300B"
    ],
    [
      "\uFF08",
      "\uFF09"
    ],
    [
      "\u3010",
      "\u3011"
    ],
    [
      "[",
      "]"
    ],
    [
      '"',
      '"'
    ],
    [
      "'",
      "'"
    ]
  ],
  enum: {
    higher_punct: [
      "\u3002",
      "\uFF01",
      "\uFF1F",
      "\uFF1B",
      "\u2026",
      ",",
      "!",
      "?",
      ";",
      ".",
      "\uFF0C"
    ],
    predicate_starters: [
      "\u90A3",
      "\u8FD9",
      "\u6211",
      "\u5C31",
      "\u4FBF",
      "\u90FD",
      "\u4E5F",
      "\u5F88",
      "\u66F4",
      "\u5C06",
      "\u4F1A",
      "\u8981",
      "\u80FD",
      "\u53EF",
      "\u662F",
      "\u6709",
      "\u4E3A"
    ],
    connectors: [
      "\u548C",
      "\u53CA",
      "\u4E0E"
    ]
  }
};

// packages/story2video-engine/src/text-segmentation.ts
var DEFAULT_CONFIG = {
  sentenceTokenizer: {
    language: "zh",
    handleAbbreviations: true,
    customAbbreviations: ["Dr.", "Mr.", "Ms.", "\u7B49", "etc.", "i.e.", "e.g."],
    maxSentenceLength: 200
  },
  scene: {
    targetSeconds: 6,
    baseWordsPerSecond: 3.3,
    speechRate: 1,
    minWordsPerSegment: 10,
    maxWordsPerSegment: 50,
    enforceSentenceBoundary: true,
    allowSingleSentenceOverflow: true
  },
  subtitle: {
    minCharsPerBlock: subtitle_rules_default.defaults.min_chars_per_block,
    maxCharsPerBlock: subtitle_rules_default.defaults.max_chars_per_block,
    punctuationPriority: [
      "\u3002",
      "\uFF01",
      "\uFF1F",
      "\uFF1B",
      ".",
      "!",
      "?",
      ";",
      "\uFF0C",
      ",",
      "\u3001",
      " ",
      "\n"
    ],
    timeCalculationMethod: "proportional"
  }
};
function mergeConfig(partial) {
  if (!partial) return DEFAULT_CONFIG;
  return {
    sentenceTokenizer: { ...DEFAULT_CONFIG.sentenceTokenizer, ...partial.sentenceTokenizer },
    scene: { ...DEFAULT_CONFIG.scene, ...partial.scene },
    subtitle: { ...DEFAULT_CONFIG.subtitle, ...partial.subtitle }
  };
}
var SentenceTokenizer = class {
  constructor(config) {
    this.config = { ...DEFAULT_CONFIG.sentenceTokenizer, ...config };
    this.sentenceDelimiters = /([。！？])/;
  }
  /** 将文本分割为句子列表 */
  split(text) {
    if (!text || !text.trim()) return [];
    let processed = text.replace(/\s+/g, " ").trim();
    const placeholder = "##ABBR##";
    const abbreviationsFound = {};
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
    const parts = processed.split(this.sentenceDelimiters);
    const sentences = [];
    let currentSentence = "";
    for (let i = 0; i < parts.length - 1; i += 2) {
      currentSentence += parts[i];
      if (i + 1 < parts.length) {
        const delimiter = parts[i + 1];
        currentSentence += delimiter;
        for (const [key, abbr] of Object.entries(abbreviationsFound)) {
          currentSentence = currentSentence.split(key).join(abbr);
        }
        sentences.push(currentSentence.trim());
        currentSentence = "";
      }
    }
    if (currentSentence || parts.length % 2 === 1 && parts[parts.length - 1]) {
      const lastPart = currentSentence + (parts.length % 2 === 1 ? parts[parts.length - 1] : "");
      if (lastPart.trim()) {
        let restored = lastPart;
        for (const [key, abbr] of Object.entries(abbreviationsFound)) {
          restored = restored.split(key).join(abbr);
        }
        sentences.push(restored.trim());
      }
    }
    const filtered = sentences.filter((s) => s.length > 0);
    if (filtered.length === 1 && filtered[0].length > this.config.maxSentenceLength) {
      const chunks = [];
      const chars = filtered[0].split("");
      let chunk = "";
      for (const ch of chars) {
        chunk += ch;
        if (chunk.length >= this.config.maxSentenceLength) {
          chunks.push(chunk.trim());
          chunk = "";
        }
      }
      if (chunk.trim()) {
        if (chunks.length && chunk.length < this.config.maxSentenceLength * 0.3) {
          chunks[chunks.length - 1] += chunk.trim();
        } else {
          chunks.push(chunk.trim());
        }
      }
      return chunks.length > 0 ? chunks : filtered;
    }
    const result = [];
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
  splitLongSentence(sentence) {
    const parts = sentence.split(/[，,;；]/);
    const result = [];
    let currentPart = "";
    for (const part of parts) {
      if (!part) continue;
      if (!currentPart) {
        currentPart = part;
      } else if (currentPart.length + part.length + 1 <= this.config.maxSentenceLength) {
        currentPart += "\uFF0C" + part;
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
};
var SceneSegmenter = class {
  constructor(config, sentenceTokenizer) {
    this.config = { ...DEFAULT_CONFIG.scene, ...config };
    this.sentenceTokenizer = sentenceTokenizer || new SentenceTokenizer();
  }
  /** 计算目标字数（分镜字数主控优先，缺省回退 时长×字速×语速 换算） */
  calculateTargetWords() {
    const derived = Math.round(
      this.config.targetSeconds * this.config.baseWordsPerSecond * this.config.speechRate
    );
    const targetWords = this.config.targetCharsPerScene && this.config.targetCharsPerScene > 0 ? Math.floor(this.config.targetCharsPerScene) : derived;
    return Math.max(
      this.config.minWordsPerSegment,
      Math.min(targetWords, this.config.maxWordsPerSegment)
    );
  }
  /** 将文本分割为语音段落 */
  segment(text) {
    const sentences = this.sentenceTokenizer.split(text);
    if (!sentences.length) return [];
    const targetWords = this.calculateTargetWords();
    const segments = [];
    let currentSegment = [];
    let currentWordCount = 0;
    let segmentId = 0;
    for (const sentence of sentences) {
      const sentenceWordCount = sentence.length;
      const canAppend = !currentSegment.length || currentWordCount + sentenceWordCount <= targetWords || this.config.allowSingleSentenceOverflow && currentSegment.length === 0;
      if (canAppend) {
        currentSegment.push(sentence);
        currentWordCount += sentenceWordCount;
      } else {
        if (currentSegment.length) {
          const segmentText = currentSegment.join("");
          segments.push(this.createSpeechSegment(segmentText, segmentId, currentWordCount));
          segmentId++;
        }
        currentSegment = [sentence];
        currentWordCount = sentenceWordCount;
      }
    }
    if (currentSegment.length) {
      const segmentText = currentSegment.join("");
      segments.push(this.createSpeechSegment(segmentText, segmentId, currentWordCount));
    }
    return segments;
  }
  createSpeechSegment(text, segmentId, wordCount) {
    const estimatedDuration = wordCount / (this.config.baseWordsPerSecond * this.config.speechRate);
    return {
      text,
      estimatedDuration: Math.round(estimatedDuration * 100) / 100,
      segmentId,
      targetWords: wordCount,
      subtitles: []
    };
  }
};
var SubtitleSegmenter = class _SubtitleSegmenter {
  static {
    // 规范常量（规则单源：subtitle-rules.json，与 Python 共享同一份规则；禁止再手写硬编码字符集）
    this.SENTENCE_BOUNDARY = new Set(subtitle_rules_default.sentence_boundary);
  }
  static {
    this.PRIORITY_PUNCT = new Set(subtitle_rules_default.priority_punct);
  }
  static {
    // v1.1 顿号枚举单元保护：枚举结束判定用（顿号之上）更高优先级标点
    this.ENUM_HIGHER_PUNCT = new Set(subtitle_rules_default.enum.higher_punct);
  }
  static {
    // 枚举结束判定的谓词/主语引导词（常见分句起始字，启发式）
    this.ENUM_PREDICATE_STARTERS = new Set(subtitle_rules_default.enum.predicate_starters);
  }
  static {
    this.ENUM_CONNECTORS = new Set(subtitle_rules_default.enum.connectors);
  }
  static {
    this.LEADING_PUNCT = new Set(subtitle_rules_default.leading_punct);
  }
  static {
    this.TRAILING_PUNCT = new Set(subtitle_rules_default.trailing_punct);
  }
  static {
    this.QUOTE_PAIRS = subtitle_rules_default.quote_pairs;
  }
  static {
    this.LEFT_QUOTES = new Set(subtitle_rules_default.quote_pairs.map((q) => q[0]));
  }
  static {
    this.RIGHT_QUOTES = new Set(subtitle_rules_default.quote_pairs.map((q) => q[1]));
  }
  static {
    this.QUOTE_MAP = new Map(subtitle_rules_default.quote_pairs);
  }
  constructor(config, sentenceTokenizer) {
    this.config = { ...DEFAULT_CONFIG.subtitle, ...config };
    this.sentenceTokenizer = sentenceTokenizer || new SentenceTokenizer();
  }
  /** 将文本分割为字幕块（规范 7 步流水线） */
  segment(text, parentDuration, parentId) {
    const trimmed = (text || "").trim();
    if (!trimmed) return [];
    const blocks = this.splitToBlocks(trimmed);
    return this.calculateTimestamps(blocks, parentDuration, parentId);
  }
  /** Step 1-6：分句 → 引号 → 长度 → 合并 → 标点 → 强制（强制后再清理一次） */
  splitToBlocks(text) {
    const all = [];
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
    return all.filter((b) => {
      const s = b.trim();
      if (!s) return false;
      return ![...s].every((c) => this.isTrailingPunctOrQuote(c));
    });
  }
  isTrailingPunctOrQuote(c) {
    return _SubtitleSegmenter.TRAILING_PUNCT.has(c) || _SubtitleSegmenter.LEFT_QUOTES.has(c) || _SubtitleSegmenter.RIGHT_QUOTES.has(c);
  }
  /** Step 1：分句（句界归属前块；未闭合引号内的句界不生效） */
  splitSentences(text) {
    const out = [];
    let cur = "";
    const stack = [];
    for (const ch of text) {
      cur += ch;
      if (_SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push(ch);
      } else if (_SubtitleSegmenter.RIGHT_QUOTES.has(ch) && stack.length && _SubtitleSegmenter.QUOTE_MAP.get(stack[stack.length - 1]) === ch) {
        stack.pop();
      }
      if (_SubtitleSegmenter.SENTENCE_BOUNDARY.has(ch) && stack.length === 0) {
        out.push(cur);
        cur = "";
      }
    }
    if (cur.trim()) out.push(cur);
    return out.filter((s) => s.trim().length > 0);
  }
  /** Step 2：闭引号后切分（引号内容 >= minChars 才切）；短引号并入上下文 */
  splitQuoteBoundaries(text) {
    const fragments = [];
    let cur = "";
    const stack = [];
    for (const ch of text) {
      if (_SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push({ q: ch, start: cur.length });
        cur += ch;
      } else if (_SubtitleSegmenter.RIGHT_QUOTES.has(ch) && stack.length && _SubtitleSegmenter.QUOTE_MAP.get(stack[stack.length - 1].q) === ch) {
        const top = stack.pop();
        const contentLen = cur.length - top.start - 1;
        cur += ch;
        if (stack.length === 0 && contentLen >= this.config.minCharsPerBlock) {
          fragments.push(cur);
          cur = "";
        }
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) fragments.push(cur);
    return fragments.filter((f) => f.trim().length > 0);
  }
  /** Step 3：长度切分（标点优先 + 配对引号保护，min/max） */
  lengthSplit(text) {
    const blocks = [];
    let cur = "";
    const stack = [];
    let lastHardCut = false;
    for (const ch of text) {
      cur += ch;
      if (_SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push(ch);
      } else if (_SubtitleSegmenter.RIGHT_QUOTES.has(ch) && stack.length && _SubtitleSegmenter.QUOTE_MAP.get(stack[stack.length - 1]) === ch) {
        stack.pop();
      }
      const isPunct = _SubtitleSegmenter.PRIORITY_PUNCT.has(ch) || ch === " " || ch === "\n" || ch === "\u3000";
      if (isPunct && cur.length >= this.config.minCharsPerBlock) {
        blocks.push(cur);
        cur = "";
        lastHardCut = false;
      } else if (cur.length >= this.config.maxCharsPerBlock && stack.length === 0) {
        const pos = this.applyEnumerationShift(cur, this.findSplitPos(cur), false);
        if (pos > 0) {
          blocks.push(cur.slice(0, pos));
          cur = cur.slice(pos);
          lastHardCut = false;
        } else {
          blocks.push(cur);
          cur = "";
          lastHardCut = true;
        }
      } else if (cur.length >= this.config.maxCharsPerBlock * 2 && stack.length > 0) {
        blocks.push(cur);
        cur = "";
        stack.length = 0;
        lastHardCut = true;
      }
    }
    if (cur) {
      const tailClean = cur.trim().replace(/[。！？；，、.!?;…]+$/, "");
      if (lastHardCut && blocks.length > 0 && tailClean.length > 3 && tailClean.length < this.config.minCharsPerBlock && blocks[blocks.length - 1].length >= this.config.minCharsPerBlock) {
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
  findSplitPos(text) {
    for (let i = text.length - 1; i >= 0; i--) {
      if (_SubtitleSegmenter.PRIORITY_PUNCT.has(text[i]) && text[i] !== "\u3001") return i + 1;
    }
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === " " || text[i] === "\n" || text[i] === "\u3000") return i + 1;
    }
    for (let i = text.length - 1; i >= 0; i--) {
      if (text[i] === "\u3001") return i + 1;
    }
    return -1;
  }
  /** 顿号枚举单元结束位置（v1.1）：结束于更高优先级标点/谓词引导词/片段尾 */
  enumerationEnd(text, pos) {
    for (let i = pos; i < text.length; i++) {
      const ch = text[i];
      if (_SubtitleSegmenter.ENUM_HIGHER_PUNCT.has(ch) || _SubtitleSegmenter.ENUM_PREDICATE_STARTERS.has(ch)) {
        return i;
      }
    }
    return text.length;
  }
  /** 若切分锚点落在顿号上，把切分点前移到枚举单元结束之后（头块 ≤ max 才生效；requireTailMin 用于完整块） */
  applyEnumerationShift(text, pos, requireTailMin) {
    if (pos <= 0 || pos >= text.length || text[pos - 1] !== "\u3001") return pos;
    const eend = this.enumerationEnd(text, pos);
    if (eend > pos && eend <= this.config.maxCharsPerBlock) {
      if (!requireTailMin || text.length - eend >= this.config.minCharsPerBlock) {
        return eend;
      }
    }
    return pos;
  }
  /** Step 4：短块合并（前块 <min 合并；纯标点短块并入；短尾并入） */
  mergeShort(blocks) {
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
  clean(blocks) {
    let bs = blocks.map((b) => b.trim()).filter(Boolean);
    if (!bs.length) return [];
    const fixed = [bs[0]];
    if (fixed[0] && _SubtitleSegmenter.LEADING_PUNCT.has(fixed[0][0])) {
      fixed[0] = fixed[0].slice(1);
    }
    for (let i = 1; i < bs.length; i++) {
      let b = bs[i];
      if (b && _SubtitleSegmenter.LEADING_PUNCT.has(b[0]) && fixed.length) {
        fixed[fixed.length - 1] += b[0];
        b = b.slice(1);
      }
      if (b) fixed.push(b);
    }
    bs = fixed.filter(Boolean);
    bs = bs.map((b) => this.dropUnpairedQuotes(b)).filter(Boolean);
    bs = bs.map((b) => b.replace(/[。！？；，、.!?;…]+$/, "")).filter(Boolean);
    const out = [];
    for (const b of bs) {
      let nb = b;
      if (nb && _SubtitleSegmenter.LEADING_PUNCT.has(nb[0]) && out.length) {
        out[out.length - 1] += nb[0];
        nb = nb.slice(1);
      }
      nb = nb.replace(/[。！？；，、.!?;…]+$/, "").trim();
      if (nb) out.push(nb);
    }
    return out;
  }
  /** 删除文本中未配对的引号（块内成对保留） */
  dropUnpairedQuotes(text) {
    const drop = new Array(text.length).fill(false);
    const stack = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (_SubtitleSegmenter.LEFT_QUOTES.has(ch)) {
        stack.push(i);
      } else if (_SubtitleSegmenter.RIGHT_QUOTES.has(ch)) {
        if (stack.length && _SubtitleSegmenter.QUOTE_MAP.get(text[stack[stack.length - 1]]) === ch) {
          stack.pop();
        } else {
          drop[i] = true;
        }
      }
    }
    for (const idx of stack) drop[idx] = true;
    return [...text].filter((_, i) => !drop[i]).join("");
  }
  /** Step 6：超长强制分割（平衡切分：尾块 < minChars 时前块让字，避免孤悬尾块） */
  enforceMax(blocks) {
    const out = [];
    for (let b of blocks) {
      while (b.length > this.config.maxCharsPerBlock) {
        let pos = this.applyEnumerationShift(b, this.findSplitPos(b), true);
        if (pos <= 0 || pos >= b.length) pos = this.config.maxCharsPerBlock;
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
  findSplitPosInRange(text, lo, hi) {
    for (let i = hi; i >= lo; i--) {
      if (_SubtitleSegmenter.PRIORITY_PUNCT.has(text[i])) return i + 1;
    }
    for (let i = hi; i >= lo; i--) {
      if (text[i] === " " || text[i] === "\n" || text[i] === "\u3000") return i + 1;
    }
    return -1;
  }
  /** Step 7：时间戳分配（proportional 按字数比例 / equal 等分） */
  calculateTimestamps(blocks, totalDuration, parentId) {
    if (!blocks.length) return [];
    const build = (blocks2, durs2) => {
      const out = [];
      let t = 0;
      for (let i = 0; i < blocks2.length; i++) {
        const d = Math.round(durs2[i] * 100) / 100;
        out.push({
          text: blocks2[i],
          displayOrder: i,
          startTime: t,
          duration: d,
          parentSegmentId: parentId
        });
        t = Math.round((t + d) * 100) / 100;
      }
      return out;
    };
    if (this.config.timeCalculationMethod === "equal") {
      const durs2 = blocks.map(() => totalDuration / blocks.length);
      return build(blocks, durs2);
    }
    const totalChars = blocks.reduce((sum, block) => sum + block.length, 0);
    const durs = blocks.map(
      (b) => totalChars > 0 ? b.length / totalChars * totalDuration : totalDuration / blocks.length
    );
    return build(blocks, durs);
  }
};
var TextSegmentationModule = class {
  constructor(config) {
    this.config = mergeConfig(config);
    this.sentenceTokenizer = new SentenceTokenizer(this.config.sentenceTokenizer);
    this.sceneSegmenter = new SceneSegmenter(this.config.scene, this.sentenceTokenizer);
    this.subtitleSegmenter = new SubtitleSegmenter(this.config.subtitle, this.sentenceTokenizer);
  }
  /** 完整处理文本分割流程 */
  process(text) {
    if (!text || !text.trim()) {
      throw new Error("\u8F93\u5165\u6587\u672C\u4E0D\u80FD\u4E3A\u7A7A");
    }
    const speechSegments = this.sceneSegmenter.segment(text);
    for (const segment of speechSegments) {
      segment.subtitles = this.subtitleSegmenter.segment(
        segment.text,
        segment.estimatedDuration,
        segment.segmentId
      );
    }
    const totalDuration = speechSegments.reduce((sum, s) => sum + s.estimatedDuration, 0);
    const totalWords = speechSegments.reduce((sum, s) => sum + s.text.length, 0);
    return {
      speechSegments,
      totalDuration: Math.round(totalDuration * 100) / 100,
      totalWords,
      segmentCount: speechSegments.length,
      config: this.config
    };
  }
  /** 获取配置摘要 */
  getConfigSummary() {
    return {
      sentenceTokenizerConfig: this.config.sentenceTokenizer,
      sceneConfig: {
        ...this.config.scene,
        targetWords: this.sceneSegmenter.calculateTargetWords()
      },
      subtitleConfig: this.config.subtitle
    };
  }
};
function splitTextToScenes(text, options) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const module = new TextSegmentationModule(options?.config);
  const result = module.process(trimmed);
  let segments = result.speechSegments.map((s) => s.text);
  if (options?.targetCount && options.targetCount > 0) {
    segments = adaptSegmentsToCount(segments, options.targetCount);
  }
  return segments;
}
function splitTextToSubtitles(text, options) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const config = mergeConfig(options?.config);
  const tokenizer = new SentenceTokenizer(config.sentenceTokenizer);
  const segmenter = new SubtitleSegmenter(config.subtitle, tokenizer);
  const blocks = segmenter.segment(trimmed, 0, 0);
  return blocks.map((b) => b.text);
}
function buildSubtitleTimelineV2(text, totalDuration, options) {
  const lines = splitTextToSubtitles(text, options);
  if (!lines.length) return [];
  const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
  const subtitles = [];
  let currentTime = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const duration = totalChars > 0 ? line.length / totalChars * totalDuration : totalDuration / lines.length;
    const endTime = i === lines.length - 1 ? totalDuration : currentTime + duration;
    const charCount = line.length;
    const charDuration = charCount > 0 ? duration / charCount : duration;
    const charTimings = [];
    for (let c = 0; c < charCount; c++) {
      charTimings.push(currentTime + (c + 1) * charDuration);
    }
    subtitles.push({
      text: line,
      startTime: currentTime,
      endTime,
      charTimings
    });
    currentTime = endTime;
  }
  return subtitles;
}
function adaptSegmentsToCount(segments, targetCount) {
  if (!segments.length) return [];
  if (targetCount <= 0) return segments;
  const merged = [...segments];
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
  while (merged.length < targetCount) {
    merged.push(merged[merged.length - 1]);
  }
  return merged;
}
var TEXT_SEGMENTATION_VERSION = "v1.0";
function getSegmentationVersion() {
  return TEXT_SEGMENTATION_VERSION;
}
export {
  DEFAULT_CONFIG,
  SceneSegmenter,
  SentenceTokenizer,
  SubtitleSegmenter,
  TEXT_SEGMENTATION_VERSION,
  TextSegmentationModule,
  buildSubtitleTimelineV2,
  getSegmentationVersion,
  splitTextToScenes,
  splitTextToSubtitles
};
