/**
 * AI Taste Remover v2 — 去 AI 味引擎
 *
 * 3-pass 处理系统（参考 lguz + sepia）：
 *   Pass 1: 杀 AI 词汇 — 替换 AI 惯用词为人类表达
 *   Pass 2: 破 AI 结构 — 检测并修复结构模式（并列否定、三连排比、设问滥用等）
 *   Pass 3: 加人类质感 — 句长变化、留白、作者观点可见
 *
 * 严重度分级（参考 im-not-ai）：
 *   S1 (严重): AI 标志性结构，必须修复
 *   S2 (中等): AI 词汇模式，建议修复
 *   S3 (轻微): 风格偏好，可选修复
 *
 * 设计要点：
 *   - 检测器优先于改写器（先诊断后改写）
 *   - 反注入护栏：改写后 AI 模式计数不得大于原文
 *   - 人类基线保护：密度驱动，不无条件替换「此外」「然而」等人类常用词
 *   - 句长检测使用方差（SD）而非均值
 */

'use strict'

/**
 * AI 惯用词 → 人类表达映射。
 * 键为 AI 高频词/短语，值为更自然的替代表达。
 */
const AI_PHRASE_MAP = {
  // ---- S1: AI 标志性结构词（单次命中即改）----
  '综上所述': '说到底',
  '总而言之': '一句话',
  '毋庸置疑': '毫无疑问',
  '不言而喻': '不用多说',
  '显而易见': '很明显',
  '众所周知': '大家都知道',
  '不可否认': '说实话',
  '值得注意的是': '有个细节很有意思',
  '在当今社会': '现在',
  '随着社会的发展': '这些年',
  '随着科技的发展': '这些年',
  '随着时代的进步': '这些年',
  '随着经济的快速发展': '这些年',
  '随着互联网的普及': '现在上网的人多了',
  '近年来': '这几年',
  '当今时代': '现在',
  '当今世界': '现在',
  '在当下': '现在',
  '在如今': '现在',
  '在当下这个时代': '现在',
  '在当今这个时代': '现在',

  // ---- S2: 常见 AI 词汇（密度驱动）----
  '首先': '第一',
  '其次': '第二',
  '最后': '再来说',
  '此外': '还有',
  '与此同时': '同时',
  '除此之外': '另外',
  '另一方面': '换个角度',
  '需要指出的是': '要说的是',
  '需要强调的是': '要强调的是',
  '需要说明的是': '要说的是',
  '深入探讨': '细聊',
  '深入分析': '细看',
  '深入剖析': '拆开看',
  '至关重要': '很关键',
  '至关重要的一点': '很关键的一点',
  '不断演变': '一直在变',
  '不断演进': '一直在变',
  '充满活力': '很有劲头',
  '开创性': '头一回',
  '必游之地': '值得去的地方',
  '核心在于': '关键是',
  '本质是': '其实是',
  '本质在于': '其实在',
  '关键在于': '关键是',
  '真正的意义在于': '意义其实在',
  '真正的价值在于': '价值其实在',
  '从本质上讲': '说到底',
  '从根本上说': '说到底',
  '从某种意义上说': '某种程度上',
  '在一定程度上': '某种程度上',
  '在很大程度上': '很大程度上',
  '在某种程度上': '某种程度上',
  '扮演着重要角色': '作用不小',
  '发挥着重要作用': '作用不小',
  '起着关键作用': '作用很关键',
  '起到了重要作用': '作用不小',
  '具有重要意义': '意义不小',
  '具有深远影响': '影响不小',
  '产生深远影响': '影响不小',
  '带来深远影响': '影响不小',
  '做出了巨大贡献': '帮了大忙',
  '做出了重要贡献': '帮了大忙',
  '提供了有力支撑': '撑住了',
  '提供了坚实保障': '兜住了底',
  '提供了重要保障': '兜住了底',
  '提供了有力保障': '兜住了底',
  '提供了强大动力': '推了一把',
  '注入了新的活力': '添了新劲',
  '注入了新的动力': '添了新劲',
  '焕发出新的生机': '有了新气象',
  '展现出勃勃生机': '看着很有劲',
  '展现出巨大潜力': '潜力很大',
  '展现出广阔前景': '前景不错',
  '展现出美好前景': '前景不错',
  '展现出光明前景': '前景不错',
  '展现出无限可能': '可能性很大',
  '展现出强大生命力': '生命力很强',
  '展现出独特魅力': '挺有味道',
  '展现出独特价值': '挺有价值',
  '展现出独特优势': '挺有优势',
  '展现出显著成效': '效果挺明显',
  '取得显著成效': '效果挺明显',
  '取得显著成果': '成果挺明显',
  '取得丰硕成果': '成果不少',
  '取得重大突破': '有了大突破',
  '实现重大突破': '有了大突破',
  '实现跨越式发展': '发展很快',
  '实现高质量发展': '发展得不错',
  '实现转型升级': '转了型',
  '实现可持续发展': '能长久走下去',
  '实现互利共赢': '两边都赚',
  '实现合作共赢': '一起赚',
  '实现共同发展': '一起发展',
  '实现共同繁荣': '一起好起来',
  '实现共同富裕': '一起富起来',
  '推动高质量发展': '把质量提上去',
  '推动经济高质量发展': '把经济质量提上去',

  // ---- S3: 英文风格偏好（可选修复）----
  'In conclusion': 'Bottom line',
  "It is worth noting that": "Here's the thing:",
  'Furthermore': 'Plus',
  'Moreover': 'Also',
  'Nevertheless': 'But',
  'Consequently': 'So',
  'Therefore': 'So',
  'In addition': 'Also',
  'Additionally': 'Also',
  'It is important to note that': 'Keep in mind',
  'As a result': 'So',
  'Due to the fact that': 'Because',
  'In order to': 'To',
  'It should be noted that': 'Note that',
  'There is a growing concern': 'More people are worried',
  "In today's society": 'These days',
  'With the development of': 'As things change',
  'First and foremost': 'First off',
  'Last but not least': 'Finally',
}

/**
 * 禁止的开头模式（AI 开场铺垫）。
 */
const FORBIDDEN_OPENING_PATTERNS = [
  /^在当今社会[，,]/,
  /^随着[^，,]+的发展[，,]/,
  /^随着[^，,]+的进步[，,]/,
  /^随着[^，,]+的普及[，,]/,
  /^众所周知[，,]/,
  /^近年来[，,]/,
  /^当今时代[，,]/,
  /^当今世界[，,]/,
  /^在当下[，,]/,
  /^在如今[，,]/,
  /^In today's digital age[，,]/i,
  /^With the rapid development of/i,
  /^It is a well-known fact that/i,
]

/**
 * 口语化映射（tone=casual 时启用）。
 */
const COLLOQUIAL_MAP = {
  '我们': '咱',
  '什么': '啥',
  '怎么': '咋',
  '没有': '没',
  '是不是': '是不',
  '这样': '这么',
  '那样': '那么',
}

/**
 * 中文 AI 结构模式（Pass 2）。
 */
const STRUCTURE_PATTERNS = [
  {
    id: 'not-x-but-y',
    severity: 'S1',
    density: 1,
    regex: /(?:不仅仅?|不只是|不仅是|不单是)\s*[^。！？，,]{2,20}\s*(?:而是|而是说|而是因为|而)/g,
    suggestion: '直接陈述，避免否定式排比',
  },
  {
    id: 'triad',
    severity: 'S2',
    density: 1,
    regex: /(?:首先|第一|其一)[^。！？]{2,20}(?:其次|第二|其二)[^。！？]{2,20}(?:最后|第三|其三)[^。！？]{2,20}/g,
    suggestion: '三连排比，每项需承载独立想法',
  },
  {
    id: 'rhetorical-question',
    severity: 'S2',
    density: 1,
    regex: /(?:难道|难道说|岂不|何尝|怎能|怎么不|为何不)[^。！？]{2,20}[？?]/g,
    suggestion: '设问自答，改为直接陈述',
  },
  {
    id: 'staged-opener',
    severity: 'S1',
    density: 1,
    regex: /^(?:让我们|让我们来|让我们一起来|让我们先|这里你需要知道|你需要知道的是|首先让我们|接下来让我们|下面让我们)[^。！？]{2,30}[，,]/g,
    suggestion: '移除开场铺垫本身',
  },
  {
    id: 'empty-debate',
    severity: 'S2',
    density: 1,
    regex: /(?:我不是说|我不是在说|我不是想|需要澄清的是|需要说明的是|我要澄清的是|请不要误会|别误会|我不是那个意思)[^。！？]{2,30}/g,
    suggestion: '删防御，有真实主张则直接陈述',
  },
  {
    id: 'deep-saying',
    severity: 'S2',
    density: 1,
    regex: /(?:真正的|核心在于|本质是|本质在于|关键在于|从本质上讲|从根本上说)[^。！？]{2,30}/g,
    suggestion: '换成具体主张，避免假装深刻',
  },
  {
    id: 'connective-comma',
    severity: 'S3',
    density: 3,
    regex: /(?:但是|而且|然而|因此|所以|同时|此外)[，,](?=[^，,]{2,})/g,
    suggestion: '连接词后不加逗号',
  },
  {
    id: 'parallel-antithesis',
    severity: 'S2',
    density: 1,
    regex: /(?:不仅|不但|不只|不光)[^。！？]{2,20}(?:而且|并且|还|也)[^。！？]{2,20}/g,
    suggestion: '对称对仗，避免机械并列',
  },
  {
    id: 'single-line-golden-ending',
    severity: 'S1',
    density: 1,
    regex: /(?:这才是真正的|这才是关键|这就是答案|这就是全部|仅此而已|没有别的了)[。！]/g,
    suggestion: '删除重复收尾，合并成带具体主张的句子',
  },
  {
    id: 'dramatic-fragment',
    severity: 'S2',
    density: 1,
    regex: /(?:没有[^。！？]{1,12}。没有[^。！？]{1,12}。没有[^。！？]{1,12}。)/g,
    suggestion: '片段行合并成带具体主张的句子',
  },
  {
    id: 'repeated-sentence-start',
    severity: 'S2',
    density: 3,
    regex: /(?:她|他|它|这|那|我们|你们|他们)[^。！？]{2,20}[。！？](?:她|他|它|这|那|我们|你们|他们)[^。！？]{2,20}[。！？](?:她|他|它|这|那|我们|你们|他们)[^。！？]{2,20}/g,
    suggestion: '连续句以同一主语开头，合并或换主语',
  },
  {
    id: 'em-dash-overuse',
    severity: 'S3',
    density: 2,
    regex: /(?:——|—|--)/g,
    suggestion: '减少破折号，换句号/逗号/冒号',
  },
  {
    id: 'hedge-stacking',
    severity: 'S3',
    density: 3,
    regex: /(?:可能|或许|也许|大概|似乎|好像|应该|可以)[^。！？]{0,8}(?:可能|或许|也许|大概|似乎|好像|应该|可以)/g,
    suggestion: '减少堆叠限定词，保留来源支持的限定',
  },
  {
    id: 'abstract-noun-stack',
    severity: 'S2',
    density: 1,
    regex: /(?:进行|加以|予以|做出)[^。！？]{0,10}(?:讨论|说明|处理|决定|分析|研究|解决)/g,
    suggestion: '双音节填充，动词单独即可',
  },
  {
    id: 'fake-scope',
    severity: 'S2',
    density: 1,
    regex: /(?:从)[^。！？]{1,15}(?:到)[^。！？]{1,15}(?:的转变|的跨越|的演进|的历程)/g,
    suggestion: '虚假范围，X/Y 不在有意义尺度上',
  },
  {
    id: 'summary-first-sentence',
    severity: 'S2',
    density: 1,
    regex: /^(?:本文将|这篇文章将|本文旨在|本报告将|本指南将|接下来我们将|下面我们将)[^。！？]{2,30}/g,
    suggestion: '段落首句摘要，避免机器形状',
  },
  {
    id: 'enumeration-import',
    severity: 'S2',
    density: 1,
    regex: /(?:有以下几点|有以下几个方面|主要体现在以下几个方面|具体包括以下几个方面|可以从以下几个方面)[：:]/g,
    suggestion: '枚举导入，改为自然陈述',
  },
  {
    id: 'causal-conclusion',
    severity: 'S2',
    density: 1,
    regex: /(?:因此|所以|由此可见|由此可知|综上|总的来说)[^。！？]{2,30}[。！]/g,
    suggestion: '因果结论，避免机械收尾',
  },
  {
    id: 'split-sentence',
    severity: 'S2',
    density: 1,
    regex: /(?:这并不意味着|这并不代表|这不等于)[^。！？]{2,20}[。！](?:这|它|其)[^。！？]{2,20}/g,
    suggestion: '分裂句，直接陈述',
  },
  {
    id: 'empty-rebuttal-slot',
    severity: 'S2',
    density: 1,
    regex: /(?:有人可能会说|有人会说|有些人认为|一些人认为|反对者认为|批评者认为)[^。！？]{2,30}/g,
    suggestion: '空反驳槽，有真实主张则陈述',
  },
  {
    id: 'generative-metaphor',
    severity: 'S3',
    density: 1,
    regex: /(?:是一把钥匙|是一扇窗|是一座桥梁|是一盏明灯|是一剂良药|是一张蓝图)/g,
    suggestion: '生成性隐喻，换成具体表达',
  },
  {
    id: 'vague-time-horizon',
    severity: 'S3',
    density: 1,
    regex: /(?:在不久的将来|在可预见的未来|在未来的日子里|在接下来的日子里|在未来的某一天)/g,
    suggestion: '模糊时间地平，换成具体时间或删除',
  },
]

/**
 * 中文 AI 语气模式（Pass 3）。
 */
const TONE_PATTERNS = [
  {
    id: 'excessive-exclamation',
    severity: 'S3',
    density: 3,
    regex: /[！!]{3,}/g,
    suggestion: '减少连续感叹号',
  },
  {
    id: 'emoji-abuse',
    severity: 'S3',
    density: 3,
    regex: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu,
    suggestion: '减少 emoji 滥用',
  },
  {
    id: 'flattery',
    severity: 'S2',
    density: 1,
    regex: /(?:好问题|您说得完全正确|您说得太对了|您真聪明|您真有眼光|您真厉害|您真棒|太棒了|太厉害了|太优秀了|太完美了|非常棒|非常优秀|非常出色|非常精彩|非常完美)/g,
    suggestion: '去掉谄媚语气',
  },
  {
    id: 'chat-residue',
    severity: 'S1',
    density: 1,
    regex: /(?:希望这对您有帮助|希望这对你有帮助|希望这能帮到您|希望这能帮到你|如果您还有其他问题|如果你还有其他问题|请随时告诉我|随时问我|还有什么我可以帮您的吗|还有什么我可以帮你的吗|需要我继续吗|要我继续吗|要不要我继续|您还想了解更多吗|你想了解更多吗)/g,
    suggestion: '删除聊天残留，保留内容',
  },
  {
    id: 'knowledge-cutoff',
    severity: 'S2',
    density: 1,
    regex: /(?:截至|根据我最后的训练|根据我的训练数据|我的知识截止|我无法访问|我没有实时数据|我无法获取实时信息)/g,
    suggestion: '陈述来源未显示的内容或删句',
  },
  {
    id: 'overly-polite',
    severity: 'S3',
    density: 2,
    regex: /(?:非常抱歉|深感抱歉|万分抱歉|非常荣幸|深感荣幸|万分荣幸|非常感激|不胜感激|感激不尽)/g,
    suggestion: '减少过度礼貌用语',
  },
  {
    id: 'hedging-tone',
    severity: 'S3',
    density: 3,
    regex: /(?:我认为|我觉得|在我看来|依我看来|以我之见|就我个人而言|我个人认为)[^。！？]{0,6}(?:可能|或许|也许|大概|似乎|好像)/g,
    suggestion: '减少双重委婉，直接表达观点',
  },
  {
    id: 'reflective-adverb',
    severity: 'S3',
    density: 3,
    regex: /(?:值得注意的是|有趣的是|令人惊讶的是|令人遗憾的是|令人欣慰的是|令人鼓舞的是|令人担忧的是)[，,]/g,
    suggestion: '减少散文反思副词',
  },
  {
    id: 'buzzword',
    severity: 'S2',
    density: 1,
    regex: /(?:赋能|抓手|闭环|颗粒度|底层逻辑|方法论|生态位|护城河|第二曲线|降维打击|破圈|出圈|天花板|红利期|赛道)/g,
    suggestion: '减少商业 buzzword，换成具体表达',
  },
  {
    id: 'excessive-quotes',
    severity: 'S3',
    density: 3,
    regex: /["""'][^""']{1,15}["""']/g,
    suggestion: '减少过度引号',
  },
  {
    id: 'parenthetical-stack',
    severity: 'S3',
    density: 3,
    regex: /(?:（[^（）]{1,15}）){3,}/g,
    suggestion: '减少括号补充堆叠',
  },
]

/**
 * 人类基线保护表。
 * 这些词人类也常用，只在密度超过阈值时才触发替换。
 * 键为词，值为密度阈值（出现次数）。
 */
const HUMAN_BASELINE = {
  // 仅人类也高频使用的中性连接词需要密度驱动保护
  '此外': 3,
  '然而': 3,
  '与此同时': 3,
  '首先': 3,
  '其次': 3,
  '最后': 3,
}

/**
 * 转义正则特殊字符。
 * @param {string} str 待转义字符串
 * @returns {string} 转义后的字符串
 */
function escapeRegex(str) {
  const specials = '[]^$.|?*+(){}!'.split('')
  let result = str
  for (let j = 0; j < specials.length; j++) {
    const s = specials[j]
    result = result.split(s).join('\\' + s)
  }
  return result
}

/**
 * 按中文标点切分句子。
 * @param {string} text 输入文本
 * @returns {string[]} 句子数组
 */
function splitSentences(text) {
  return text.split(/[。！？；!?;]+/g).map((s) => s.trim()).filter(Boolean)
}

/**
 * 计算两个字符串的编辑距离（Levenshtein）。
 * @param {string} a 字符串 a
 * @param {string} b 字符串 b
 * @returns {number} 编辑距离
 */
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = []
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/**
 * 去 AI 味引擎 v2。
 * 3-pass 处理：杀 AI 词汇 → 破 AI 结构 → 加人类质感。
 */
class AITasteRemover {
  /**
   * @param {Object} [options] 配置项
   * @param {boolean} [options.enabled] 是否启用，默认 true
   * @param {number} [options.intensity] 处理强度 1-3，默认 2
   * @param {string} [options.tone] 语气 casual|formal，默认 casual
   */
  constructor(options) {
    options = options || {}
    this._enabled = options.enabled !== false
    this._intensity = Math.min(3, Math.max(1, options.intensity || 2))
    this._tone = options.tone || 'casual'
  }

  /**
   * 主入口：去 AI 味。
   * @param {string} text 输入文本
   * @returns {string} 去味后文本
   */
  process(text) {
    if (!this._enabled || !text) return text

    // 先诊断
    const before = this.detect(text)

    // Pass 1: 杀 AI 词汇
    let result = this._replaceAIPhrases(text)

    // Pass 2: 破 AI 结构
    result = this._fixStructures(result)

    // Pass 3: 加人类质感（句长变化、留白、作者观点）
    if (this._intensity >= 2) {
      result = this._addHumanTexture(result)
    }
    if (this._intensity >= 3 && this._tone === 'casual') {
      result = this._colloquialize(result)
    }

    // 反注入护栏：改写后 AI 模式计数不得大于原文
    const after = this.detect(result)
    if (after.length > before.length) {
      result = this._rollbackInjection(text, result)
    }

    return result
  }

  /**
   * 检测 AI 模式。
   * @param {string} text 输入文本
   * @returns {Array<{severity:string, span:string, pattern:string, suggestion:string}>} 检测结果数组
   */
  detect(text) {
    if (!text) return []
    const findings = []

    // AI 词汇模式
    const keys = Object.keys(AI_PHRASE_MAP)
    for (let i = 0; i < keys.length; i++) {
      const ai = keys[i]
      const regex = new RegExp(escapeRegex(ai), 'gi')
      const matches = text.match(regex)
      if (matches && matches.length >= this._densityThreshold(ai)) {
        for (let j = 0; j < matches.length; j++) {
          const m = matches[j]
          const idx = text.indexOf(m)
          findings.push({
            severity: this._severityOf(ai),
            span: m,
            pattern: ai,
            suggestion: AI_PHRASE_MAP[ai],
            start: idx,
            end: idx + m.length,
          })
        }
      }
    }

    // 结构模式
    for (let i = 0; i < STRUCTURE_PATTERNS.length; i++) {
      const p = STRUCTURE_PATTERNS[i]
      const matches = text.match(p.regex)
      if (matches && matches.length >= p.density) {
        for (let j = 0; j < matches.length; j++) {
          const m = matches[j]
          const idx = text.indexOf(m)
          findings.push({
            severity: p.severity,
            span: m,
            pattern: p.id,
            suggestion: p.suggestion,
            start: idx,
            end: idx + m.length,
          })
        }
      }
    }

    // 语气模式
    for (let i = 0; i < TONE_PATTERNS.length; i++) {
      const p = TONE_PATTERNS[i]
      const matches = text.match(p.regex)
      if (matches && matches.length >= p.density) {
        for (let j = 0; j < matches.length; j++) {
          const m = matches[j]
          const idx = text.indexOf(m)
          findings.push({
            severity: p.severity,
            span: m,
            pattern: p.id,
            suggestion: p.suggestion,
            start: idx,
            end: idx + m.length,
          })
        }
      }
    }

    // 开头模式
    for (let i = 0; i < FORBIDDEN_OPENING_PATTERNS.length; i++) {
      const m = FORBIDDEN_OPENING_PATTERNS[i].exec(text)
      if (m && m[0]) {
        findings.push({
          severity: 'S1',
          span: m[0],
          pattern: 'forbidden-opening',
          suggestion: '移除开场铺垫',
          start: m.index,
          end: m.index + m[0].length,
        })
      }
    }

    // 句长分布检测（方差）
    const rhythm = this._detectRhythm(text)
    if (rhythm.signal) {
      findings.push({
        severity: 'S2',
        span: '',
        pattern: 'sentence-rhythm',
        suggestion: '句长分布过于均匀，增加长短句变化',
        rhythm: rhythm,
      })
    }

    return findings
  }

  /**
   * 完整分析报告。
   * @param {string} text 输入文本
   * @returns {{score:number, distribution:Object, patterns:Array, suggestions:Array}} 分析报告
   */
  analyze(text) {
    if (!text) {
      return {
        score: 0,
        distribution: { s1: 0, s2: 0, s3: 0, total: 0 },
        patterns: [],
        suggestions: [],
      }
    }
    const patterns = this.detect(text)
    const distribution = { s1: 0, s2: 0, s3: 0, total: patterns.length }
    for (let i = 0; i < patterns.length; i++) {
      const sev = patterns[i].severity
      if (sev === 'S1') distribution.s1++
      else if (sev === 'S2') distribution.s2++
      else if (sev === 'S3') distribution.s3++
    }
    const score = this._scoreFromPatterns(patterns)
    const suggestions = patterns.map((p) => p.suggestion).filter(Boolean)
    return { score, distribution, patterns, suggestions }
  }

  /**
   * 检测 AI 味等级（0-1）。
   * 向后兼容：保留原方法签名。
   * @param {string} text 输入文本
   * @returns {number} AI 味等级 0-1
   */
  detectAITasteLevel(text) {
    if (!text) return 0
    const patterns = this.detect(text)
    return this._scoreFromPatterns(patterns)
  }

  /**
   * 根据模式数组计算 AI 味分数（0-1）。
   * @param {Array} patterns 模式数组
   * @returns {number} 分数 0-1
   */
  _scoreFromPatterns(patterns) {
    let score = 0
    for (let i = 0; i < patterns.length; i++) {
      const sev = patterns[i].severity
      if (sev === 'S1') score += 0.1
      else if (sev === 'S2') score += 0.05
      else if (sev === 'S3') score += 0.02
    }
    return Math.min(1, Math.max(0, score))
  }

  /**
   * 判断某个 AI 词的严重度。
   * @param {string} word AI 词
   * @returns {string} S1|S2|S3
   */
  _severityOf(word) {
    const s1Words = [
      '综上所述', '总而言之', '毋庸置疑', '不言而喻', '显而易见', '众所周知',
      '不可否认', '值得注意的是', '在当今社会', '随着社会的发展', '随着科技的发展',
      '随着时代的进步', '随着经济的快速发展', '随着互联网的普及', '近年来',
      '当今时代', '当今世界', '在当下', '在如今', '在当下这个时代', '在当今这个时代',
    ]
    if (s1Words.indexOf(word) !== -1) return 'S1'
    return 'S2'
  }

  /**
   * 判断某个 AI 词的密度阈值。
   * 人类基线保护：人类常用词需要更高密度才触发。
   * @param {string} word AI 词
   * @returns {number} 密度阈值
   */
  _densityThreshold(word) {
    if (HUMAN_BASELINE[word] !== undefined) {
      return HUMAN_BASELINE[word]
    }
    return 1
  }

  /**
   * Pass 1: 替换 AI 词汇。
   * 人类基线保护：密度超过阈值才替换。
   * @param {string} text 输入文本
   * @returns {string} 替换后文本
   */
  _replaceAIPhrases(text) {
    let result = text
    const keys = Object.keys(AI_PHRASE_MAP)
    for (let i = 0; i < keys.length; i++) {
      const ai = keys[i]
      const human = AI_PHRASE_MAP[ai]
      const regex = new RegExp(escapeRegex(ai), 'gi')
      const matches = text.match(regex)
      if (!matches) continue
      const threshold = this._densityThreshold(ai)
      if (matches.length >= threshold) {
        result = result.replace(regex, human)
      }
    }
    return result
  }

  /**
   * Pass 2: 修复结构模式。
   * @param {string} text 输入文本
   * @returns {string} 修复后文本
   */
  _fixStructures(text) {
    let result = text
    // 处理开头模式
    for (let i = 0; i < FORBIDDEN_OPENING_PATTERNS.length; i++) {
      if (FORBIDDEN_OPENING_PATTERNS[i].test(result)) {
        result = result.replace(FORBIDDEN_OPENING_PATTERNS[i], '')
        if (result.length > 0) {
          result = result.charAt(0).toUpperCase() + result.slice(1)
        }
      }
    }
    // 处理连接词后逗号
    result = result.replace(/(?:但是|而且|然而|因此|所以|同时|此外)[，,](?=[^，,]{2,})/g, (m) => {
      return m.replace(/[，,]$/, '')
    })
    return result
  }

  /**
   * Pass 3: 加人类质感（句长变化、留白、作者观点）。
   * @param {string} text 输入文本
   * @returns {string} 处理后的文本
   */
  _addHumanTexture(text) {
    let result = text
    // 句长变化：检测到句长方差过小（过于均匀）时，合并短句
    const rhythm = this._detectRhythm(result)
    if (rhythm.signal) {
      result = this._mergeUniformSentences(result)
    }
    return result
  }

  /**
   * 检测句长分布（方差）。
   * 均值不是信号，SD 才是。找 3+ 连近似等长句（±20%）。
   * @param {string} text 输入文本
   * @returns {{signal:boolean, maxRun:number, sd:number, mean:number, variance:number}} 节奏检测结果
   */
  _detectRhythm(text) {
    const sentences = splitSentences(text)
    if (sentences.length < 3) {
      return { signal: false, maxRun: 0, sd: 0, mean: 0, variance: 0 }
    }
    const lens = sentences.map((s) => s.length)
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length
    const variance = lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / lens.length
    const sd = Math.sqrt(variance)

    // 找 3+ 连近似等长句（±20%）
    let runs = 0
    let maxRun = 0
    for (let i = 1; i < lens.length; i++) {
      const prev = lens[i - 1]
      const cur = lens[i]
      const nearEqual = Math.abs(cur - prev) <= prev * 0.2
      runs = nearEqual ? runs + 1 : 0
      maxRun = Math.max(maxRun, runs + 1)
    }
    return { signal: maxRun >= 3, maxRun, sd, mean, variance }
  }

  /**
   * 合并连续等长句，增加句长变化。
   * @param {string} text 输入文本
   * @returns {string} 合并后文本
   */
  _mergeUniformSentences(text) {
    const sentences = splitSentences(text)
    if (sentences.length < 3) return text
    const lens = sentences.map((s) => s.length)
    const result = []
    let i = 0
    while (i < sentences.length) {
      if (i + 1 < sentences.length) {
        const nearEqual = Math.abs(lens[i + 1] - lens[i]) <= lens[i] * 0.2
        if (nearEqual && lens[i] + lens[i + 1] < 80) {
          result.push(sentences[i] + '，' + sentences[i + 1])
          i += 2
          continue
        }
      }
      result.push(sentences[i])
      i++
    }
    return result.join('。')
  }

  /**
   * 口语化处理（tone=casual 时启用）。
   * @param {string} text 输入文本
   * @returns {string} 口语化文本
   */
  _colloquialize(text) {
    let result = text
    if (this._tone === 'casual') {
      const keys = Object.keys(COLLOQUIAL_MAP)
      for (let i = 0; i < keys.length; i++) {
        const formal = keys[i]
        const casual = COLLOQUIAL_MAP[formal]
        const regex = new RegExp(formal, 'g')
        result = result.replace(regex, casual)
      }
    }
    return result
  }

  /**
   * 反注入回滚：若改写后 AI 模式计数大于原文，回退到改写前。
   * @param {string} original 原文
   * @param {string} rewritten 改写后文本
   * @returns {string} 回滚后文本
   */
  _rollbackInjection(original, rewritten) {
    // 改写后模式更多说明逆注入，回退到原文（保守策略，保证不引入新 AI 味）
    return original
  }
}

module.exports = {
  AITasteRemover,
  AI_PHRASE_MAP,
  FORBIDDEN_OPENING_PATTERNS,
}
