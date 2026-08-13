// @ts-check
/**
 * fingerprint.js — 主题指纹与同类模板检索（P1b 规格 v3）
 *
 * 规格：01-docs/ARCH-PROMPT-ENGINE-EVOLUTION-FINGERPRINT-2026-08-13.md
 * - buildFingerprint(text) -> {schemaVersion, dictVersion, domains, compositionIntents, topics, tone}
 * - score(inputFp, templateFp) -> {score, tier(NONE|MID|HIGH)}
 * - findSimilarTemplates(concept, activeTemplates, {rand}) -> [{templateId, refType, score, tier, provenance}]
 *
 * 契约铁律：零外部依赖；英文词边界 + 词长>=4（缩写白名单 AI）；中文子串；
 * 输入 <=2000 截断；不把用户输入拼进正则（防注入）；词表 JS 副本与 TS 权威版 parity 锁死；
 * extractTopics 确定性；探索 rand 注入。
 */

'use strict'

const DICT_VERSION = '2026-08-13'
const SCHEMA_VERSION = 1
const MAX_INPUT_LEN = 2000
const MAX_TOPICS = 8
const MAX_TOPIC_LEN = 6 // 规格 §6：中文片段 2-6 字（M3 修复）
const MIN_TOPIC_LEN = 2
const EXPLORE_MIN_ACTIVE = 10

// 领域词典（6 领域，强/弱词；C3 英文词边界规则见 matcher）
const DOMAIN_DICTIONARY = {
  education: { strong: ['教育','学校','课程','考试','education','study'],
               weak: ['老师','学生','学习','培训','课堂','teacher','student','learning'] },
  health: { strong: ['医疗','医院','疾病','health','medical'],
            weak: ['健康','医生','患者','治疗','药物','clinic','doctor','patient'] },
  finance: { strong: ['金融','投资','股票','finance','invest'],
             weak: ['理财','银行','保险','财富','基金','money','bank','stock'] },
  tech: { strong: ['AI','人工智能','软件','算法','tech','software'],
          weak: ['科技','互联网','数据','编程','app','digital','code'] },
  business: { strong: ['创业','融资','公司','business','startup'],
              weak: ['商业','市场','营销','品牌','管理','销售','market','brand'] },
  society: { strong: ['政策','法律','社会','policy','law'],
             weak: ['公益','民生','城市','治理','乡村','society','public'] },
}

// 构图意图别名表（8 组，强/弱档；挂靠 applyWhen 不改内置池，M1）
const INTENT_ALIASES = {
  '前后对比': { strong: ['改变','变化','转变','演变','迭代','取代','新老','transition'],
                weak: ['提升','优化','新旧','before','after','upgrade'] },
  '流程展示': { strong: ['步骤','阶段','链路','流水线','工作流','roadmap','process'],
                weak: ['流程','管道','规划'] },
  '概念隐喻': { strong: ['本质','原理','抽象','类比','象征','意味着','metaphor','symbol'],
                weak: ['解释','定义','概念'] },
  '角色状态': { strong: ['情绪','心态','感受','emotion','mood'],
                weak: ['体验','用户','人物'] },
  '系统局部': { strong: ['截面','细节','内核','机制','cutaway','detail'],
                weak: ['系统','架构','结构','局部'] },
  '方法分层': { strong: ['分层','层级','堆栈','依赖','layer','stack'],
                weak: ['底层','上层','架构'] },
  '地图路径': { strong: ['路线','旅程','里程碑','roadmap','journey'],
                weak: ['路径','规划','路线图'] },
  '迷你漫画': { strong: ['叙事','故事线','分格','连环画','story','narrative'],
                weak: ['场景','案例','故事'] },
}

// applyWhen 词表副本（parity 锁死；key 与 TS COMPOSITION_PATTERNS 对齐）
const APPLY_WHEN = {
  '流程展示': ['流程','步骤','阶段','链路','管道','cycle','pipeline'],
  '系统局部': ['系统','架构','结构','机制','内核','engine','core'],
  '前后对比': ['对比','升级','变革','进化','优化','upgrade','evolution'],
  '角色状态': ['用户','体验','情感','文化','角色','user','experience'],
  '概念隐喻': ['概念','隐喻','类比','解释','定义','concept','metaphor'],
  '方法分层': ['分层','层级','架构','依赖','堆栈','layer','stack'],
  '地图路径': ['路径','路线','规划','旅程','路线图','roadmap','journey'],
  '迷你漫画': ['叙事','故事','场景','案例','故事线','story','narrative'],
}

// 情感词表副本（parity 锁死；与 history-prompt.ts SentimentAnalyzer 对齐）
const SENTIMENT_WORDS = {
  positive: ['喜悦','欢乐','胜利','成功','和平','美好'],
  negative: ['悲伤','失败','死亡','战争','痛苦','灾难'],
}

const CJK = /[\u4e00-\u9fff]/
const CJK_STOPWORDS = new Set(['的','了','与','和','在','是','及','或','之','为','对','等'])
const EN_STOPWORDS = new Set(['the','a','an','and','of','how','why','to','in','for','with','on','is','are'])
// 英文缩写白名单（词长 <4 但合法）
const EN_ABBREV = new Set(['ai', 'app']) // 缩写白名单（规格 §4：AI 等）


// ── 匹配工具 ─────────────────────────────

function truncate (text) {
  return String(text == null ? '' : text).slice(0, MAX_INPUT_LEN)
}

/** 英文词是否命中：词边界 token 匹配，大小写不敏感；词长>=4 或缩写白名单 */
function enWordMatches (word, textLower) {
  const wLower = String(word).toLowerCase()
  if (wLower.length < 4 && !EN_ABBREV.has(wLower)) return false
  // 词边界：前后必须是非字母数字字符（用 split 而非正则转义）
  const parts = textLower.split(wLower)
  if (parts.length < 2) return false
  for (let i = 0; i < parts.length - 1; i++) {
    const before = parts[i].slice(-1)
    const after = parts[i + 1].slice(0, 1)
    const isBoundary = (c) => !c || !/[a-z0-9]/.test(c)
    if (isBoundary(before) && isBoundary(after)) return true
  }
  return false
}

/** 中文词是否命中：CJK 字符子串 */
function zhWordMatches (word, text) {
  return text.includes(word)
}

/** 词典词表 -> 命中集合 {domain: {strongHits, weakHits}} */
function matchDictionary (text) {
  const textLower = text.toLowerCase()
  const hits = {}
  for (const [domain, def] of Object.entries(DOMAIN_DICTIONARY)) {
    const strongHits = []
    const weakHits = []
    for (const w of def.strong) {
      const isEn = !CJK.test(w)
      if (isEn ? enWordMatches(w, textLower) : zhWordMatches(w, text)) strongHits.push(w)
    }
    for (const w of def.weak) {
      const isEn = !CJK.test(w)
      if (isEn ? enWordMatches(w, textLower) : zhWordMatches(w, text)) weakHits.push(w)
    }
    if (strongHits.length > 0 || weakHits.length >= 2) {
      hits[domain] = { strongHits, weakHits }
    }
  }
  return hits
}

/** 意图命中：applyWhen ∪ INTENT_ALIASES；强档 1 词即中，弱档 >=2 词（M1） */
function detectIntents (text) {
  const textLower = text.toLowerCase()
  const intents = new Set()
  // 弱档泛化词表：applyWhen 中的泛化词（在 INTENT_ALIASES.weak 出现过的）不能单独触发意图（M1）
  const weakOnlyWords = new Set()
  for (const def of Object.values(INTENT_ALIASES)) {
    for (const w of def.weak) weakOnlyWords.add(w)
  // M1 修复：applyWhen 中的英文泛化词（user/experience 等）也归弱档，防中英文不对称
  const APPLY_WHEN_WEAK_EN = ['user', 'experience', 'engine', 'core', 'layer', 'stack']
  for (const w of APPLY_WHEN_WEAK_EN) weakOnlyWords.add(w)
  }
  for (const [intent, words] of Object.entries(APPLY_WHEN)) {
    const strongHits = []
    const weakHits = []
    for (const w of words) {
      const isEn = !CJK.test(w)
      const hit = isEn ? enWordMatches(w, textLower) : zhWordMatches(w, text)
      if (!hit) continue
      if (weakOnlyWords.has(w)) weakHits.push(w)
      else strongHits.push(w)
    }
    // applyWhen 强词 1 个即中；若只有弱泛化词命中，需 ≥2 个才计
    if (strongHits.length >= 1 || weakHits.length >= 2) intents.add(intent)
  }
  for (const [intent, def] of Object.entries(INTENT_ALIASES)) {
    let strongHit = 0
    let weakHit = 0
    for (const w of def.strong) {
      const isEn = !CJK.test(w)
      if (isEn ? enWordMatches(w, textLower) : zhWordMatches(w, text)) strongHit++
    }
    for (const w of def.weak) {
      const isEn = !CJK.test(w)
      if (isEn ? enWordMatches(w, textLower) : zhWordMatches(w, text)) weakHit++
    }
    if (strongHit >= 1 || weakHit >= 2) intents.add(intent)
  }
  return [...intents]
}

/** 内容标签提取：<=2000 截断、<=8 topics、>=2 字符、词典词（强+弱）剔除、确定性 */
function extractTopics (text) {
  const input = truncate(text)
  if (!input.trim()) return []
  const dictWords = new Set()
  for (const def of Object.values(DOMAIN_DICTIONARY)) {
    for (const w of [...def.strong, ...def.weak]) dictWords.add(w)
  }
  const topics = new Set()
  const zhChunks = input.split(/[^\u4e00-\u9fff]+/).filter((c) => c.length >= MIN_TOPIC_LEN)
  for (const chunk of zhChunks) {
    let seg = ''
    for (const ch of chunk) {
      if (CJK_STOPWORDS.has(ch)) {
        if (seg.length >= MIN_TOPIC_LEN && seg.length <= MAX_TOPIC_LEN && ![...dictWords].some((w) => seg.includes(w))) topics.add(seg)
        seg = ''
      } else seg += ch
    }
    if (seg.length >= MIN_TOPIC_LEN && seg.length <= MAX_TOPIC_LEN && ![...dictWords].some((w) => seg.includes(w))) topics.add(seg)
  }
  const enTokens = input.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= MIN_TOPIC_LEN && !EN_STOPWORDS.has(t))
  for (const t of enTokens) {
    if (!dictWords.has(t) && ![...dictWords].some((w) => !CJK.test(w) && enWordMatches(w, t))) topics.add(t)
  }
  return [...topics].sort().slice(0, MAX_TOPICS)
}

// ── 指纹构建 ─────────────────────────────

function detectTone (text) {
  for (const w of SENTIMENT_WORDS.positive) if (text.includes(w)) return 'positive'
  for (const w of SENTIMENT_WORDS.negative) if (text.includes(w)) return 'negative'
  return 'peaceful'
}

function buildFingerprint (text) {
  const input = truncate(text)
  const domainHits = matchDictionary(input)
  return {
    schemaVersion: SCHEMA_VERSION,
    dictVersion: DICT_VERSION,
    domains: Object.keys(domainHits).sort(),
    compositionIntents: detectIntents(input),
    topics: extractTopics(input),
    tone: detectTone(input),
  }
}

// ── 评分与档位 ─────────────────────────────

function score (inputFp, templateFp) {
  if (!inputFp || !templateFp) return { score: 0, tier: 'NONE' } // fail-close（MINOR 修复）
  const iIntents = new Set(inputFp.compositionIntents || [])
  const tIntents = new Set(templateFp.compositionIntents || [])
  const iDomains = new Set(inputFp.domains || [])
  const tDomains = new Set(templateFp.domains || [])
  const iTopics = new Set(inputFp.topics || [])
  const tTopics = new Set(templateFp.topics || [])

  const intersect = (a, b) => [...a].filter((x) => b.has(x)).length
  const intentsHit = intersect(iIntents, tIntents)
  const domainsHit = intersect(iDomains, tDomains)
  const topicsHit = intersect(iTopics, tTopics)
  const toneHit = inputFp.tone && templateFp.tone && inputFp.tone !== 'peaceful' && inputFp.tone === templateFp.tone ? 1 : 0

  const s = 4 * Math.min(2, intentsHit) + 2 * Math.min(2, domainsHit) + 2 * Math.min(2, topicsHit) + toneHit

  let tier = 'NONE'
  if (intentsHit >= 1) {
    if (s >= 8) {
      // HIGH 护栏（M2）：需 domains 或 topics 重叠
      tier = (domainsHit >= 1 || topicsHit >= 1) ? 'HIGH' : 'MID'
    } else if (s >= 4) {
      tier = 'MID'
    }
  }
  return { score: s, tier }
}

// ── 同类检索 ─────────────────────────────

/**
 * @param {string} concept 输入主题
 * @param {Array<{id:string, fingerprint:object, stats?:object}>} activeTemplates 已过滤的 active 模板
 * @param {{rand?: ()=>number}} [opts]
 * @returns {Array<{templateId:string|null, refType:string, score:number, tier:string, provenance?:object}>}
 */
function findSimilarTemplates (concept, activeTemplates, opts) {
  const rand = (opts && typeof opts.rand === 'function') ? opts.rand : Math.random
  const inputFp = buildFingerprint(concept)
  const templates = Array.isArray(activeTemplates) ? activeTemplates : []
  if (templates.length === 0) {
    return [{ templateId: null, refType: 'none', score: 0, tier: 'NONE', provenance: null }]
  }

  const scored = templates.map((t) => {
    const r = score(inputFp, t.fingerprint)
    return { templateId: t.id, refType: r.tier === 'HIGH' ? 'full' : (r.tier === 'MID' ? 'fragment' : 'none'), score: r.score, tier: r.tier, template: t }
  }).filter((x) => x.tier !== 'NONE')

  // 探索 ε（M7）：activeCount<10 -> 0；探索仅在 scored 集内重排
  const epsilon = templates.length < EXPLORE_MIN_ACTIVE ? 0 : Math.min(0.3, Math.max(0.05, 0.3 - 0.005 * templates.length))
  let results
  if (scored.length === 0) {
    results = [{ templateId: null, refType: 'none', score: 0, tier: 'NONE', provenance: null }]
  } else if (rand() < epsilon) {
    const pick = scored[Math.floor(rand() * scored.length)]
    results = [{ templateId: pick.templateId, refType: pick.refType, score: pick.score, tier: pick.tier, provenance: { learnedFrom: pick.templateId, explored: true } }]
  } else {
    const sorted = [...scored].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const ar = (a.template.stats && a.template.stats.acceptRate) || 0
      const br = (b.template.stats && b.template.stats.acceptRate) || 0
      if (br !== ar) return br - ar
      const al = (a.template.stats && a.template.stats.lastUsedAt) || ''
      const bl = (b.template.stats && b.template.stats.lastUsedAt) || ''
      const at = al ? new Date(al).getTime() : 0
      const bt = bl ? new Date(bl).getTime() : 0
      return at < bt ? 1 : (at > bt ? -1 : 0)
    })
    results = sorted.map((x) => ({ templateId: x.templateId, refType: x.refType, score: x.score, tier: x.tier, provenance: { learnedFrom: x.templateId } }))
  }
  return results
}

module.exports = {
  DICT_VERSION, SCHEMA_VERSION, DOMAIN_DICTIONARY, INTENT_ALIASES, APPLY_WHEN, SENTIMENT_WORDS,
  extractTopics, buildFingerprint, score, findSimilarTemplates, detectIntents,
}

