// @ts-check
'use strict'

/**
 * story2video-segmentation-engine — v0.15.2 分句算法 JS 镜像
 *
 * Electron 主进程为纯 JS 运行时，无法直接 require TS 引擎包；本文件为 self-contained JS 端口，
 * 逐行对齐 packages/story2video-engine/src/text-segmentation.ts（TS 权威版），
 * 规则从 subtitle-rules.json（单源，与 smart-sentence-splitter Python 共享）读取。
 * 行为由 parity 测试（story2video-segmentation-parity）与 TS 版逐字锁死。
 *
 * 覆盖：句子边界消歧（SentenceTokenizer）→ 场景级分组（SceneSegmenter）→ 字幕 7 步管道
 * （SubtitleSegmenter：split_sentences → split_quote_boundaries → length_split →
 *  merge_short → clean → enforce_max → assign_timestamps，含顿号枚举保护/引号配对/尾块平衡）。
 */

const subtitleRules = require('@multi-publish/story2video-engine/subtitle-rules')

// ==================== 规范常量（subtitle-rules.json 单源） ====================

const SENTENCE_BOUNDARY = new Set(subtitleRules.sentence_boundary)
const PRIORITY_PUNCT = new Set(subtitleRules.priority_punct)
const ENUM_HIGHER_PUNCT = new Set(subtitleRules.enum.higher_punct)
const ENUM_PREDICATE_STARTERS = new Set(subtitleRules.enum.predicate_starters)
const LEFT_QUOTES = new Set(subtitleRules.quote_pairs.map((q) => q[0]))
const RIGHT_QUOTES = new Set(subtitleRules.quote_pairs.map((q) => q[1]))
const QUOTE_MAP = new Map(subtitleRules.quote_pairs)
function isSymmetricQuote (char) {
  return LEFT_QUOTES.has(char) && RIGHT_QUOTES.has(char) && QUOTE_MAP.get(char) === char
}
// Step 3/6 词边界感知切分（v1.2）：无标点硬切/平衡切分时优先在不劈词的位置切分。
const WORD_GOOD_LEAD = new Set(subtitleRules.word_split.good_lead)
const WORD_SEMANTIC_LEAD = new Set(subtitleRules.word_split.semantic_lead || '')
const WORD_SEMANTIC_LEAD_FOLLOWERS = subtitleRules.word_split.semantic_lead_followers || {}
const WORD_GOOD_TAIL = new Set(subtitleRules.word_split.good_tail)
const WORD_BAD_FOLLOWERS = new Set(subtitleRules.word_split.bad_followers)
// v1.2.2：good_tail 路径的块首排除集（仅纯黏着后缀，如 "个|性" 的 性）。
const WORD_GOOD_TAIL_BLOCKERS = new Set(subtitleRules.word_split.good_tail_blockers || '')
// v1.2.3：成词保护（兼容字段名 no_cut_bigrams）——项目可以是任意长度短语，
// 切点不得落在任一短语内部（如 "蒙古"、"江南"、"包税人"）。
const WORD_NO_CUT_PHRASES = new Set(subtitleRules.word_split.no_cut_bigrams || [])

// ==================== 默认配置（与 text-segmentation.ts DEFAULT_CONFIG 一致） ====================

const DEFAULT_CONFIG = {
  sentenceTokenizer: {
    language: 'zh',
    handleAbbreviations: true,
    customAbbreviations: ['Dr.', 'Mr.', 'Ms.', '等', 'etc.', 'i.e.', 'e.g.'],
    maxSentenceLength: 200,
  },
  scene: {
    targetSeconds: 6,
    baseWordsPerSecond: 3.3,
    speechRate: 1,
    minWordsPerSegment: 10,
    maxWordsPerSegment: 50,
    enforceSentenceBoundary: true,
    allowSingleSentenceOverflow: true,
  },
  subtitle: {
    minCharsPerBlock: subtitleRules.defaults.min_chars_per_block,
    maxCharsPerBlock: subtitleRules.defaults.max_chars_per_block,
    punctuationPriority: subtitleRules.priority_punct,
    timeCalculationMethod: 'proportional',
  },
}

// ==================== 工具 ====================

/** 数字字符判定（v1.2.3 小数点豁免）：对齐 Python str.isdigit 的常用子集（Unicode 十进制数字）。 */
function isDigitChar (c) {
  return c.length === 1 && /[\p{Nd}]/u.test(c)
}

/** v1.2.3：当前累积文本以 数字+半角点 结尾（如 "713."）→ 该 "." 是小数点/数字一部分，不是句界。 */
function isNumberDot (text) {
  return text.length >= 2 && text[text.length - 1] === '.' && isDigitChar(text[text.length - 2])
}

function firstDefined (...values) {
  return values.find((value) => value !== undefined && value !== null)
}

function finiteNumber (value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function integerInRange (value, min, max, fallback) {
  const number = Math.floor(finiteNumber(value, fallback))
  return Math.min(max, Math.max(min, number))
}

function boolValue (value, fallback) {
  if (value === undefined || value === null) return fallback
  return Boolean(value)
}

/**
 * 归一化调用方选项 → 引擎配置。
 * 兼容三套键：引擎 partial config（options.config）、stage.options snake_case、既有测试 camelCase。
 * @param {Record<string, any>} [options]
 */
function normalizeSegmentationOptions (options = {}) {
  const src = options && typeof options === 'object' ? options : {}
  const partial = src.config && typeof src.config === 'object' ? src.config : {}
  const st = { ...DEFAULT_CONFIG.sentenceTokenizer, ...(partial.sentenceTokenizer || {}) }
  const sc = { ...DEFAULT_CONFIG.scene, ...(partial.scene || {}) }
  const sub = { ...DEFAULT_CONFIG.subtitle, ...(partial.subtitle || {}) }

  const maxSentenceLength = integerInRange(
    firstDefined(src.maxSentenceLength, src.max_sentence_length, st.maxSentenceLength),
    20, 1000, DEFAULT_CONFIG.sentenceTokenizer.maxSentenceLength,
  )
  st.maxSentenceLength = maxSentenceLength

  sc.targetSeconds = finiteNumber(firstDefined(src.targetSeconds, src.targetDuration, src.target_duration, sc.targetSeconds), DEFAULT_CONFIG.scene.targetSeconds)
  sc.baseWordsPerSecond = finiteNumber(firstDefined(src.baseWordsPerSecond, src.base_words_per_second, sc.baseWordsPerSecond), DEFAULT_CONFIG.scene.baseWordsPerSecond)
  sc.speechRate = finiteNumber(firstDefined(src.speechRate, src.speech_rate, sc.speechRate), DEFAULT_CONFIG.scene.speechRate)
  sc.minWordsPerSegment = integerInRange(
    firstDefined(src.minWords, src.minWordsPerSegment, src.min_words, sc.minWordsPerSegment),
    1, 200, DEFAULT_CONFIG.scene.minWordsPerSegment,
  )
  sc.maxWordsPerSegment = integerInRange(
    firstDefined(src.maxWords, src.maxWordsPerSegment, src.max_words, sc.maxWordsPerSegment),
    sc.minWordsPerSegment, 500, DEFAULT_CONFIG.scene.maxWordsPerSegment,
  )
  sc.enforceSentenceBoundary = boolValue(
    firstDefined(src.enforceSentenceBoundary, src.enforce_sentence_boundary, sc.enforceSentenceBoundary),
    DEFAULT_CONFIG.scene.enforceSentenceBoundary,
  )
  sc.allowSingleSentenceOverflow = boolValue(
    firstDefined(src.allowSingleSentenceOverflow, src.overflow_to_next, sc.allowSingleSentenceOverflow),
    DEFAULT_CONFIG.scene.allowSingleSentenceOverflow,
  )
  const targetCharsPerScene = firstDefined(src.targetCharsPerScene, src.target_chars_per_scene, sc.targetCharsPerScene)
  if (targetCharsPerScene !== undefined && targetCharsPerScene !== null) {
    sc.targetCharsPerScene = finiteNumber(targetCharsPerScene, sc.targetCharsPerScene)
  }

  const minChars = integerInRange(
    firstDefined(src.minChars, src.subtitleMinChars, src.subtitle_min_chars, sub.minCharsPerBlock),
    1, 80, DEFAULT_CONFIG.subtitle.minCharsPerBlock,
  )
  sub.minCharsPerBlock = minChars
  sub.maxCharsPerBlock = integerInRange(
    firstDefined(src.maxChars, src.subtitleMaxChars, src.subtitle_max_chars, sub.maxCharsPerBlock),
    minChars, 120, DEFAULT_CONFIG.subtitle.maxCharsPerBlock,
  )
  sub.timeCalculationMethod = firstDefined(
    src.timeCalculationMethod, src.subtitleTiming, src.subtitle_timing, sub.timeCalculationMethod,
  ) === 'equal' ? 'equal' : 'proportional'

  return { sentenceTokenizer: st, scene: sc, subtitle: sub }
}

// ==================== 句子边界消歧器（SentenceTokenizer 镜像） ====================

function splitLongSentence (sentence, config) {
  const parts = sentence.split(/[，,;；]/)
  const result = []
  let currentPart = ''
  for (const part of parts) {
    if (!part) continue
    if (!currentPart) {
      currentPart = part
    } else if (currentPart.length + part.length + 1 <= config.maxSentenceLength) {
      currentPart += '，' + part
    } else {
      result.push(currentPart)
      currentPart = part
    }
  }
  if (currentPart) result.push(currentPart)
  return result
}

/** 将文本分割为句子列表（对齐 text-segmentation.ts SentenceTokenizer.split）。 */
function tokenizeSentences (text, config) {
  if (!text || !text.trim()) return []

  let processed = String(text).replace(/\s+/gu, ' ').trim()

  const placeholder = '##ABBR##'
  const abbreviationsFound = {}
  if (config.handleAbbreviations) {
    for (let i = 0; i < config.customAbbreviations.length; i++) {
      const abbr = config.customAbbreviations[i]
      if (processed.includes(abbr)) {
        const placeholderKey = placeholder + i
        abbreviationsFound[placeholderKey] = abbr
        processed = processed.split(abbr).join(placeholderKey)
      }
    }
  }

  const parts = processed.split(/([。！？])/)
  const sentences = []
  let currentSentence = ''

  for (let i = 0; i < parts.length - 1; i += 2) {
    currentSentence += parts[i]
    if (i + 1 < parts.length) {
      const delimiter = parts[i + 1]
      currentSentence += delimiter
      for (const [key, abbr] of Object.entries(abbreviationsFound)) {
        currentSentence = currentSentence.split(key).join(abbr)
      }
      sentences.push(currentSentence.trim())
      currentSentence = ''
    }
  }

  if (currentSentence || (parts.length % 2 === 1 && parts[parts.length - 1])) {
    let lastPart = currentSentence + (parts.length % 2 === 1 ? parts[parts.length - 1] : '')
    if (lastPart.trim()) {
      for (const [key, abbr] of Object.entries(abbreviationsFound)) {
        lastPart = lastPart.split(key).join(abbr)
      }
      sentences.push(lastPart.trim())
    }
  }

  const filtered = sentences.filter((s) => s.length > 0)

  if (filtered.length === 1 && filtered[0].length > config.maxSentenceLength) {
    const chunks = []
    const chars = filtered[0].split('')
    let chunk = ''
    for (const ch of chars) {
      chunk += ch
      if (chunk.length >= config.maxSentenceLength) {
        chunks.push(chunk.trim())
        chunk = ''
      }
    }
    if (chunk.trim()) {
      if (chunks.length && chunk.length < config.maxSentenceLength * 0.3) {
        chunks[chunks.length - 1] += chunk.trim()
      } else {
        chunks.push(chunk.trim())
      }
    }
    return chunks.length > 0 ? chunks : filtered
  }

  const result = []
  for (const sentence of filtered) {
    if (sentence.length <= config.maxSentenceLength) {
      result.push(sentence)
    } else {
      result.push(...splitLongSentence(sentence, config))
    }
  }
  return result
}

// ==================== 场景级分割器（SceneSegmenter 镜像） ====================

function calculateTargetWords (config) {
  const derived = Math.round(config.targetSeconds * config.baseWordsPerSecond * config.speechRate)
  const targetWords = config.targetCharsPerScene && config.targetCharsPerScene > 0
    ? Math.floor(config.targetCharsPerScene)
    : derived
  return Math.max(config.minWordsPerSegment, Math.min(targetWords, config.maxWordsPerSegment))
}

/**
 * 场景级分组（对齐 text-segmentation.ts SceneSegmenter.segment）。
 * @param {string} text
 * @param {Record<string, any>} [options]
 * @returns {{ scenes: string[], sentences: string[] }}
 */
function splitScenesLocally (text, options = {}) {
  const config = normalizeSegmentationOptions(options)
  const tokenizer = config.sentenceTokenizer
  const sceneConfig = config.scene

  const sentences = tokenizeSentences(text, tokenizer)
  if (sentences.length === 0) return { scenes: [], sentences: [] }

  const targetWords = calculateTargetWords(sceneConfig)
  const sceneTexts = []
  let currentSegment = []
  let currentWordCount = 0

  for (const sentence of sentences) {
    const sentenceWordCount = sentence.length
    const canAppend = !currentSegment.length ||
      currentWordCount + sentenceWordCount <= targetWords ||
      (sceneConfig.allowSingleSentenceOverflow && currentSegment.length === 0)
    if (canAppend) {
      currentSegment.push(sentence)
      currentWordCount += sentenceWordCount
    } else {
      if (currentSegment.length) {
        sceneTexts.push(currentSegment.join(''))
      }
      currentSegment = [sentence]
      currentWordCount = sentenceWordCount
    }
  }
  if (currentSegment.length) {
    sceneTexts.push(currentSegment.join(''))
  }

  return { scenes: sceneTexts, sentences }
}

/** 对齐 text-segmentation.ts splitTextToScenes：返回场景文本数组。
 * @param {string} text
 * @param {Record<string, any>} [options]
 */
function splitTextToScenes (text, options = {}) {
  const trimmed = String(text || '').trim()
  if (!trimmed) return []
  return splitScenesLocally(trimmed, options).scenes
}

// ==================== 字幕级分割器（SubtitleSegmenter 镜像，7 步管道） ====================

function isTrailingPunctOrQuote (char) {
  return TRAILING_PUNCT_SET.has(char) || LEFT_QUOTES.has(char) || RIGHT_QUOTES.has(char)
}

const TRAILING_PUNCT_SET = new Set(subtitleRules.trailing_punct)
const LEADING_PUNCT_SET = new Set(subtitleRules.leading_punct)

/** Step 1：分句（句界归属前块；未闭合引号内的句界不生效） */
function subtitleSplitSentences (text, _config) {
  const out = []
  let cur = ''
  const stack = []
  for (const ch of text) {
    cur += ch
    if (isSymmetricQuote(ch) && stack.length && stack[stack.length - 1] === ch) {
      stack.pop()
    } else if (LEFT_QUOTES.has(ch)) {
      stack.push(ch)
    } else if (RIGHT_QUOTES.has(ch) && stack.length && QUOTE_MAP.get(stack[stack.length - 1]) === ch) {
      stack.pop()
    }
    if (SENTENCE_BOUNDARY.has(ch) && stack.length === 0 && !isNumberDot(cur)) {
      out.push(cur)
      cur = ''
    }
  }
  if (cur.trim()) out.push(cur)
  return out.filter((s) => s.trim().length > 0)
}

/** Step 2：闭引号后切分（引号内容 >= minChars 才切）；短引号并入上下文 */
function subtitleSplitQuoteBoundaries (text, config) {
  const fragments = []
  let cur = ''
  const stack = []
  for (const ch of text) {
    if (isSymmetricQuote(ch) && stack.length && stack[stack.length - 1].q === ch) {
      const top = stack.pop()
      const contentLen = cur.length - top.start - 1
      cur += ch
      if (stack.length === 0 && contentLen >= config.minCharsPerBlock) {
        fragments.push(cur)
        cur = ''
      }
    } else if (LEFT_QUOTES.has(ch)) {
      stack.push({ q: ch, start: cur.length })
      cur += ch
    } else if (RIGHT_QUOTES.has(ch) && stack.length && QUOTE_MAP.get(stack[stack.length - 1].q) === ch) {
      const top = stack.pop()
      const contentLen = cur.length - top.start - 1
      cur += ch
      if (stack.length === 0 && contentLen >= config.minCharsPerBlock) {
        fragments.push(cur)
        cur = ''
      }
    } else {
      cur += ch
    }
  }
  if (cur.trim()) fragments.push(cur)
  return fragments.filter((f) => f.trim().length > 0)
}

/** 顿号枚举单元结束位置（v1.1）：结束于更高优先级标点/谓词引导词/片段尾 */
function enumerationEnd (text, pos) {
  for (let i = pos; i < text.length; i++) {
    const ch = text[i]
    if (ENUM_HIGHER_PUNCT.has(ch) || ENUM_PREDICATE_STARTERS.has(ch)) return i
  }
  return text.length
}

/** 若切分锚点落在顿号上，把切分点前移到枚举单元结束之后（头块 ≤ max 才生效；requireTailMin 用于完整块） */
function applyEnumerationShift (text, pos, requireTailMin, config) {
  if (pos <= 0 || pos >= text.length || text[pos - 1] !== '、') return pos
  const eend = enumerationEnd(text, pos)
  // v1.2.1 守卫：枚举单元扫到块尾仍无终止、且内部无更多顿号项时，疑似把谓语吞进
  // 枚举末项（如 "呐喊声混成一锅滚" 被整段吞并 → 15+3 劈词孤尾），不吞并回退锚点。
  if (eend === text.length && !text.slice(pos, eend).includes('、')) return pos
  if (eend > pos && eend <= config.maxCharsPerBlock) {
    if (!requireTailMin || text.length - eend >= config.minCharsPerBlock) return eend
  }
  return pos
}

/** 从后往前找切分锚点（切后索引；无则 -1）。v1.1 顿号优先级最低：更高优先级标点 → 空格 → 顿号兜底 */
function findSplitPos (text) {
  for (let i = text.length - 1; i >= 0; i--) {
    if (PRIORITY_PUNCT.has(text[i]) && text[i] !== '、') {
      if (text[i] === '.' && ((i > 0 && isDigitChar(text[i - 1])) || (i + 1 < text.length && isDigitChar(text[i + 1])))) {
        continue // v1.2.3：数字中的小数点不是切分锚点
      }
      return i + 1
    }
  }
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === ' ' || text[i] === '\n' || text[i] === '\u3000') return i + 1
  }
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '、') return i + 1
  }
  return -1
}

/** 在 [lo, hi] 范围内从后往前找最近优先级标点/空格（返回切后索引；无则 -1） */
function findSplitPosInRange (text, lo, hi) {
  for (let i = hi; i >= lo; i--) {
    if (PRIORITY_PUNCT.has(text[i])) {
      if (text[i] === '.' && ((i > 0 && isDigitChar(text[i - 1])) || (i + 1 < text.length && isDigitChar(text[i + 1])))) {
        continue // v1.2.3：数字中的小数点不是切分锚点
      }
      return i + 1
    }
  }
  for (let i = hi; i >= lo; i--) {
    if (text[i] === ' ' || text[i] === '\n' || text[i] === '\u3000') return i + 1
  }
  return -1
}

/** 剥离尾部标点后的长度（Step 4 短块判定用，v1.2）。 */
function cleanLen (text) {
  let s = text.trim()
  while (s.length > 0 && TRAILING_PUNCT_SET.has(s[s.length - 1])) {
    s = s.slice(0, -1)
  }
  return s.length
}

/** 返回切点所在的受保护短语跨度；切点恰在短语两端时安全。 */
function protectedPhraseSpanAtBoundary (text, i) {
  if (i <= 0 || i >= text.length) return null
  for (const phrase of WORD_NO_CUT_PHRASES) {
    if (!phrase || phrase.length < 2) continue
    let start = text.indexOf(phrase)
    while (start >= 0) {
      const end = start + phrase.length
      if (start < i && i < end) return { phrase, start, end }
      if (start >= i) break
      start = text.indexOf(phrase, start + 1)
    }
  }
  return null
}

/** 返回文本末尾尚未完整出现的受保护短语前缀，避免流式累积在前缀中间切断。 */
function protectedPhrasePrefixAtEnd (text) {
  let best = null
  for (const phrase of WORD_NO_CUT_PHRASES) {
    if (!phrase || phrase.length < 2) continue
    for (let prefixLength = 1; prefixLength < phrase.length; prefixLength++) {
      if (text.endsWith(phrase.slice(0, prefixLength))
        && (!best || prefixLength > best.length)) {
        best = { phrase, start: text.length - prefixLength, length: prefixLength }
      }
    }
  }
  return best
}

function findProtectedPhraseAtBoundary (text, i) {
  return protectedPhraseSpanAtBoundary(text, i)?.phrase || ''
}

/** 将候选切点移到受保护短语外，保证字幕块边界不落在短语内部。 */
function safeCutPosition (text, i) {
  const span = protectedPhraseSpanAtBoundary(text, i)
  if (span) return span.start > 0 ? span.start : span.end
  const prefix = protectedPhrasePrefixAtEnd(text)
  if (prefix && i >= prefix.start) return prefix.start > 0 ? prefix.start : 0
  return i
}

/** 词边界好切点：切点后为连词/介词（块首引导），或切点前为助词/副词/句内标点（块尾收束）。 */
function isGoodCut (text, i) {
  if (i >= text.length) return false
  // v1.2.3：切点落在任意长度成词短语内部一律不是好切点。
  if (protectedPhraseSpanAtBoundary(text, i)) return false
  if (isSemanticLeadAt(text, i)) return true
  if (WORD_GOOD_LEAD.has(text[i])) return true
  // v1.2.2：块尾收束路径额外要求切点后首字符非强黏着后缀（good_tail_blockers），
  // 避免 "…保持个|性独立" 类劈词（"个" 入 good_tail 后 "个性" 被拆）。
  return i > 0 && WORD_GOOD_TAIL.has(text[i - 1]) && !WORD_GOOD_TAIL_BLOCKERS.has(text[i])
}

/** 语义引导字必须满足自身的词组后续约束（如“提”只在“提前”中生效）。 */
function isSemanticLeadAt (text, i) {
  if (i < 0 || i >= text.length || !WORD_SEMANTIC_LEAD.has(text[i])) return false
  const allowedFollowers = WORD_SEMANTIC_LEAD_FOLLOWERS[text[i]]
  return allowedFollowers === undefined || Array.from(allowedFollowers).includes(text[i + 1] || '')
}

/**
 * 在 [lo, hi] 内找不劈词的切点索引；-1 表示无（v1.2）。
 * 策略（优先级）：好切点从后往前找（头块尽量长），要求头块 >= minHead 且排除孤悬 ≤3 字短尾；
 * v1.2.2 软约束：头块欠长但 >= minHead-2 且尾块 >= tailMin 时仍接受；
 * 非黏着后缀切点从前往后找，要求头块 >= minHead；无则 -1，回退算术/标点切分。
 */
function wordSafeSplit (text, lo, hi, minHead, tailMin) {
  if (minHead === undefined || minHead === null) minHead = 1
  if (tailMin === undefined || tailMin === null) tailMin = 0
  let fallback = -1
  let tailFallback = -1
  for (let i = hi; i >= lo; i--) {
    const tail = text.length - i
    if (!(i >= minHead || (tailMin > 0 && i >= minHead - 2 && tail >= tailMin))) continue
    if (!isGoodCut(text, i)) continue
    const isSemanticLead = isSemanticLeadAt(text, i)
    // 语义引导允许短一字（如“他们甚至嚣张到｜把…”），但不再放宽到 min-2，
    // 避免在“成了”前形成 6 字头块。
    if (isSemanticLead && i < Math.max(1, minHead - 1)) continue
    // “成了”是谓语起点，但不接受欠长头块；否则“硬生生让蒙元｜成了…”会只剩 6 字。
    if (text[i] === '成' && i < minHead) continue
    if (tail > 3 && (tailMin === 0 || tail >= tailMin || tail >= 5 || WORD_GOOD_LEAD.has(text[i]) || isSemanticLead)) {
      if (isSemanticLead) return i
      if (WORD_GOOD_LEAD.has(text[i])) return i
      if (tailFallback < 0) tailFallback = i
      continue
    }
    // v1.2.3 孤悬尾防护（仅 tail==4 且块首非连词/介词）："着|脖" 劈 "脖子" → 前移找 tail 达标点
    if (fallback < 0 && tail === 4 && !WORD_GOOD_LEAD.has(text[i])
      && (i === 0 || !isDigitChar(text[i - 1]))) {
      fallback = i
    }
  }
  if (tailFallback >= 0) return tailFallback
  if (fallback >= 0) return fallback
  for (let i = Math.max(lo, minHead); i <= hi; i++) {
    if (i < text.length
      && !WORD_BAD_FOLLOWERS.has(text[i])
      && (i === 0 || !isDigitChar(text[i - 1]))
      && !protectedPhraseSpanAtBoundary(text, i)) {
      return i
    }
  }
  return -1
}

/** Step 3：长度切分（标点优先 + 配对引号保护，min/max） */
function subtitleLengthSplit (text, config) {
  const blocks = []
  let cur = ''
  const stack = []
  let lastHardCut = false
  for (const ch of text) {
    cur += ch
    if (isSymmetricQuote(ch) && stack.length && stack[stack.length - 1] === ch) {
      stack.pop()
    } else if (LEFT_QUOTES.has(ch)) {
      stack.push(ch)
    } else if (RIGHT_QUOTES.has(ch) && stack.length && QUOTE_MAP.get(stack[stack.length - 1]) === ch) {
      stack.pop()
    }
    const isPunct = PRIORITY_PUNCT.has(ch) || ch === ' ' || ch === '\n' || ch === '\u3000'
    // v1.2.3：数字中的小数点（如 713.3）不是切分标点
    if (isPunct && cur.length >= config.minCharsPerBlock
      && !(ch === '.' && cur.length >= 2 && isDigitChar(cur[cur.length - 2]))) {
      blocks.push(cur)
      cur = ''
      lastHardCut = false
    } else if (cur.length >= config.maxCharsPerBlock && stack.length === 0) {
      let pos = applyEnumerationShift(cur, findSplitPos(cur), false, config)
      pos = safeCutPosition(cur, pos)
      if (pos > 0) {
        blocks.push(cur.slice(0, pos))
        cur = cur.slice(pos)
        lastHardCut = false
      } else {
        // v1.2 词边界感知：无标点硬切时优先不劈词（区间内找好切点/非黏着切点）
        const ws = wordSafeSplit(
          cur,
          Math.max(1, cur.length - config.maxCharsPerBlock - 1),
          cur.length - 1,
          config.minCharsPerBlock,
          config.minCharsPerBlock,
        )
        const hardPos = safeCutPosition(cur, ws > 0 ? ws : cur.length)
        if (hardPos <= 0) continue
        blocks.push(cur.slice(0, hardPos))
        cur = cur.slice(hardPos)
        lastHardCut = true
      }
    } else if (cur.length >= config.maxCharsPerBlock * 2 && stack.length > 0) {
      blocks.push(cur)
      cur = ''
      stack.length = 0
      lastHardCut = true
    }
  }
  if (cur) {
    const tailClean = cur.trim().replace(/[。！？；，、.!?;…]+$/, '')
    const startsSemanticLead = isSemanticLeadAt(cur.trim(), 0)
    if (lastHardCut && !startsSemanticLead && blocks.length > 0 && tailClean.length > 3
      && tailClean.length < config.minCharsPerBlock
      && blocks[blocks.length - 1].length >= config.minCharsPerBlock) {
      const prev = blocks[blocks.length - 1]
      const need = config.minCharsPerBlock - tailClean.length
      const lo = Math.max(1, prev.length - need)
      const hi = prev.length - 1
      let pos = findSplitPosInRange(prev, lo, hi)
      if (pos <= 0) {
        // v1.2.2 词边界感知让字：区间内无标点时，向 lo 左侧找不劈词的好切点
        // （避免把 "…从文化认|同滑向…" 的 "同" 硬让出劈开 "文化认同"）。
        const ws = wordSafeSplit(prev, 1, lo, 1)
        pos = ws > 0 ? ws : lo
      }
      blocks[blocks.length - 1] = prev.slice(0, pos)
      cur = prev.slice(pos) + cur
    }
    blocks.push(cur)
  }
  return blocks.filter((b) => b.trim().length > 0)
}

/** Step 4：短块合并（v1.2 修复机制三 + 防过度并入：clean 后长度判定、并入后 <=max、完整句不并入） */
function subtitleMergeShort (blocks, config) {
  if (!blocks.length) return blocks
  const merged = [blocks[0]]
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i]
    const stripped = b.trim()
    const bCleanLen = cleanLen(b)
    const prevCleanLen = cleanLen(merged[merged.length - 1])
    const isPunctTail = stripped.length <= 2 && Array.from(stripped).every((c) => isTrailingPunctOrQuote(c))
    const isShortTail = bCleanLen <= 3 && prevCleanLen >= config.minCharsPerBlock
    const isSentenceEnd = stripped.length > 0
      && SENTENCE_BOUNDARY.has(stripped[stripped.length - 1])
      && bCleanLen > 3
    const startsSemanticLead = isSemanticLeadAt(stripped, 0)
    const mergedLen = prevCleanLen + bCleanLen
    if (isSentenceEnd) {
      merged.push(b)
    } else if (!startsSemanticLead && (prevCleanLen < config.minCharsPerBlock || isPunctTail || isShortTail
      || bCleanLen < config.minCharsPerBlock) && mergedLen <= config.maxCharsPerBlock) {
      merged[merged.length - 1] = merged[merged.length - 1] + b
    } else {
      merged.push(b)
    }
  }
  return merged.filter((b) => b.trim().length > 0)
}

/** 删除文本中未配对的引号（块内成对保留） */
function dropUnpairedQuotes (text) {
  const drop = new Array(text.length).fill(false)
  const stack = []
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (isSymmetricQuote(ch) && stack.length && text[stack[stack.length - 1]] === ch) {
      stack.pop()
    } else if (LEFT_QUOTES.has(ch)) {
      stack.push(i)
    } else if (RIGHT_QUOTES.has(ch)) {
      if (stack.length && QUOTE_MAP.get(text[stack[stack.length - 1]]) === ch) {
        stack.pop()
      } else {
        drop[i] = true
      }
    }
  }
  for (const idx of stack) drop[idx] = true
  return Array.from(text).filter((_, i) => !drop[i]).join('')
}

/** Step 5：标点规范化（trim → 开头修正 → 跨块引号清理 → 末尾去除 → 再去除） */
function subtitleClean (blocks) {
  let bs = blocks.map((b) => b.trim()).filter(Boolean)
  if (!bs.length) return []
  const fixed = [bs[0]]
  if (fixed[0] && LEADING_PUNCT_SET.has(fixed[0][0])) {
    fixed[0] = fixed[0].slice(1)
  }
  for (let i = 1; i < bs.length; i++) {
    let b = bs[i]
    if (b && LEADING_PUNCT_SET.has(b[0]) && fixed.length) {
      fixed[fixed.length - 1] += b[0]
      b = b.slice(1)
    }
    if (b) fixed.push(b)
  }
  bs = fixed.filter(Boolean)
  bs = bs.map((b) => dropUnpairedQuotes(b)).filter(Boolean)
  bs = bs.map((b) => b.replace(/[。！？；，、.!?;…]+$/, '')).filter(Boolean)
  const out = []
  for (const b of bs) {
    let nb = b
    if (nb && LEADING_PUNCT_SET.has(nb[0]) && out.length) {
      out[out.length - 1] += nb[0]
      nb = nb.slice(1)
    }
    nb = nb.replace(/[。！？；，、.!?;…]+$/, '').trim()
    if (nb) out.push(nb)
  }
  return out
}

/** Step 6：超长强制分割（平衡切分：尾块 < minChars 时前块让字，避免孤悬尾块；v1.2 词边界感知 + 越界修复） */
function subtitleEnforceMax (blocks, config) {
  const out = []
  for (let b of blocks) {
    while (b.length > config.maxCharsPerBlock) {
      let requestedPos = applyEnumerationShift(b, findSplitPos(b), true, config)
      let pos = safeCutPosition(b, requestedPos)
      const isWholeProtectedPhrase = [...WORD_NO_CUT_PHRASES]
        .some((phrase) => phrase && phrase === b)
      if (isWholeProtectedPhrase) {
        // 保护短语本身可能比 maxChars 更长；完整短语优先于违反长度上限。
        out.push(b)
        b = ''
        break
      }
      if (pos <= 0 || pos >= b.length) pos = config.maxCharsPerBlock
      // 固定长度兜底后再次检查，避免兜底切点落回受保护短语内部。
      pos = safeCutPosition(b, pos)
      if (pos <= 0 || pos >= b.length) pos = Math.min(config.maxCharsPerBlock, b.length - 1)
      if (b.length - pos < config.minCharsPerBlock) {
        const minPos = Math.max(1, b.length - config.minCharsPerBlock)
        const hi = b.length - 1
        const ws = wordSafeSplit(b, minPos, hi, minPos, config.minCharsPerBlock)
        if (ws > 0 && ws < b.length) {
          pos = safeCutPosition(b, ws)
        } else {
          // 越界修复：balanced == len(b)（尾字符恰为标点时 i+1 越界）视为无效
          const balanced = findSplitPosInRange(b, minPos, hi)
          pos = balanced > 0 && balanced < b.length ? balanced : minPos
          pos = safeCutPosition(b, pos)
        }
      }
      out.push(b.slice(0, pos))
      b = b.slice(pos)
    }
    if (b) out.push(b)
  }
  return out
}

/** Step 1-6 主流程：分句 → 引号 → 长度 → 合并 → 标点 → 强制（强制后再清理一次） */
function subtitleSplitToBlocks (text, config) {
  const all = []
  for (const sentence of subtitleSplitSentences(text, config)) {
    for (const fragment of subtitleSplitQuoteBoundaries(sentence, config)) {
      let blocks = subtitleLengthSplit(fragment, config)
      blocks = subtitleMergeShort(blocks, config)
      blocks = subtitleClean(blocks)
      blocks = subtitleEnforceMax(blocks, config)
      blocks = subtitleClean(blocks)
      all.push(...blocks)
    }
  }
  return all.filter((b) => {
    const s = b.trim()
    if (!s) return false
    return !Array.from(s).every((c) => isTrailingPunctOrQuote(c))
  })
}

/**
 * 将文本分割为字幕块文本数组（对齐 text-segmentation.ts splitTextToSubtitles）。
 * 不含时间戳（时间轴由调用方 buildSubtitleTimeline 分配）。
 * @param {string} text
 * @param {Record<string, any>} [options]
 */
function splitTextToSubtitles (text, options = {}) {
  const config = normalizeSegmentationOptions(options)
  const trimmed = String(text || '').trim()
  if (!trimmed) return []
  const blocks = subtitleSplitToBlocks(trimmed, config.subtitle)
  return blocks
}

module.exports = {
  DEFAULT_CONFIG,
  calculateTargetWords,
  findProtectedPhraseAtBoundary,
  normalizeSegmentationOptions,
  splitScenesLocally,
  splitTextToScenes,
  splitTextToSubtitles,
  tokenizeSentences,
}
