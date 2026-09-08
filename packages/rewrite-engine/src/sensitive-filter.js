/**
 * SensitiveFilter — DFA 敏感词过滤器 v2
 *
 * 基于 DFA（确定性有限自动机）的敏感词检测与过滤引擎。
 *
 * 相比 v1（线性 indexOf）与 shared-utils 的 DFA 基础版（最短匹配 + break）：
 * - 单遍扫描 O(n)，与词库规模无关，非逐词 indexOf
 * - 最长匹配原则：长词不被短词截断
 * - 词库按类别分层，每层可独立启用/禁用、独立处理策略
 * - 变体归一化：全角/半角、繁/简、忽略字符、重复字符
 * - 白名单：词级白名单 + 上下文白名单
 * - 增量热更新：addWord / removeWord 无需重建整棵树
 * - 运营中心同步：updateWordList / syncCategories / getStats
 */

// ===== 归一化映射表 =====

/** 特殊字符 → 标准字符映射 */
const SPECIAL_CHAR_MAP = {
  '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
  '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
  'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
}

/** 繁体 → 简体 常用映射（敏感词相关高频字） */
const TRAD_TO_SIMP = {
  '輪': '轮', '發': '发', '國': '国', '黨': '党', '獨': '独',
  '臺': '台', '灣': '湾', '賭': '赌', '場': '场', '殺': '杀',
  '槍': '枪', '彈': '弹', '藥': '药', '賣': '卖', '買': '买',
  '網': '网', '頁': '页', '號': '号', '聯': '联', '繫': '系',
  '體': '体', '學': '学', '習': '习', '門': '门', '問': '问',
  '題': '题', '錢': '钱', '銀': '银', '證': '证', '據': '据',
  '報': '报', '導': '导', '視': '视', '頻': '频', '廣': '广',
  '馬': '马', '賽': '赛', '龍': '龙', '鳳': '凤', '華': '华',
  '漢': '汉', '語': '语', '簡': '简', '會': '会', '員': '员',
  '長': '长', '東': '东', '無': '无', '與': '与', '為': '为',
  '於': '于', '從': '从', '來': '来', '個': '个', '們': '们',
  '時': '时', '間': '间', '後': '后', '裡': '里', '內': '内',
  '這': '这', '那': '那', '麼': '么', '樣': '样', '點': '点',
  '線': '线', '對': '对', '錯': '错', '開': '开', '關': '关',
  '說': '说', '話': '话', '讀': '读', '寫': '写', '聽': '听',
  '見': '见', '書': '书', '電': '电', '機': '机', '車': '车',
  '飛': '飞', '風': '风', '雲': '云', '氣': '气', '熱': '热',
  '溫': '温', '濕': '湿', '幹': '干', '淨': '净', '髒': '脏',
  '亂': '乱', '齊': '齐', '備': '备', '準': '准', '確': '确',
  '實': '实', '虛': '虚', '愛': '爱', '慾': '欲', '權': '权',
  '勢': '势', '強': '强', '優': '优', '勝': '胜', '敗': '败',
  '贏': '赢', '輸': '输', '戰': '战', '爭': '争', '鬥': '斗',
}

/** 匹配时忽略的字符（空格、标点、特殊符号），实现插字对抗 */
const IGNORE_CHARS = new Set([
  ' ', '\t', '\n', '\r',
  '，', '。', '！', '？', '、', '；', '：', '“', '”', '‘', '’',
  '（', '）', '【', '】', '《', '》', '〈', '〉', '…', '—', '·', '～',
  ',', '.', '!', '?', ';', ':', '"', "'", '(', ')', '[', ']', '{', '}', '<', '>',
  '^', '-', '_', '*', '#', '@', '&', '%', '$', '+', '=', '/', '\\', '|', '~', '`',
])

// ===== 内置词库（示例，生产环境从运营中心同步）=====

/** 按类别分层的内置示例词库 */
const BUILTIN_WORDS_BY_CATEGORY = {
  政治: ['法轮功', '法轮', '六四', '天安门事件', '台独', '藏独'],
  色情: ['色情', '裸聊', 'A片', '成人片'],
  暴力: ['杀人', '爆炸', '恐怖袭击', '枪支'],
  赌博: ['赌博', '赌场', '六合彩', '洗钱'],
  广告: ['微信号', '加微信', 'QQ号', '联系电话'],
  其他: ['敏感词示例1', '敏感词示例2'],
}

/** 扁平内置词库（向后兼容导出） */
const BUILTIN_SENSITIVE_WORDS = Object.values(BUILTIN_WORDS_BY_CATEGORY).flat()

/** 各分类默认处理策略：拦截 / 替换 / 警告 */
const DEFAULT_STRATEGY = {
  政治: 'block', 色情: 'block', 暴力: 'block', 赌博: 'block',
  广告: 'warn', 其他: 'block',
}

// ===== 辅助函数 =====

/**
 * 全角字符 → 半角字符
 * @param {string} ch 单个字符
 * @returns {string} 半角字符
 */
function toHalfWidth(ch) {
  const code = ch.charCodeAt(0)
  if (code === 0x3000) return ' ' // 全角空格
  if (code >= 0xFF01 && code <= 0xFF5E) return String.fromCharCode(code - 0xFEE0)
  return ch
}

/**
 * 字符归一化：全角→半角、繁→简、特殊字符→标准、英文小写
 * @param {string} ch 单个字符
 * @returns {string} 归一化后的字符
 */
function normalizeChar(ch) {
  let c = toHalfWidth(ch)
  const simp = TRAD_TO_SIMP[c]
  if (simp) c = simp
  const std = SPECIAL_CHAR_MAP[c]
  if (std) c = std
  if (c >= 'A' && c <= 'Z') c = c.toLowerCase()
  return c
}

/**
 * 判断归一化后的字符是否为忽略字符
 * @param {string} ch 归一化后的字符
 * @returns {boolean}
 */
function isIgnoreChar(ch) {
  return IGNORE_CHARS.has(ch)
}

/**
 * 归一化整段文本（跳过忽略字符）
 * @param {string} str
 * @returns {string}
 */
function normalizeText(str) {
  let out = ''
  for (const ch of str) {
    const m = normalizeChar(ch)
    if (!isIgnoreChar(m)) out += m
  }
  return out
}

class SensitiveFilter {
  /**
   * @param {object} options
   * @param {Array} options.wordList - 外部敏感词列表（字符串或 {word, category}）
   * @param {string} options.replacement - 替换字符，默认 '***'
   * @param {boolean} options.ignoreRepeat - 是否启用重复字符归一化，默认 true
   * @param {string} options.defaultCategory - 未指定分类时的默认层，默认 '其他'
   */
  constructor(options = {}) {
    this._replacement = options.replacement || '***'
    this._ignoreRepeat = options.ignoreRepeat !== false
    this._defaultCategory = options.defaultCategory || '其他'
    this._layers = new Map() // category -> { enabled, strategy, root, count }
    this._whitelistRoot = {}
    this._hasWhitelist = false
    this._whitelistCount = 0
    this._contextWhitelist = [] // [{ word, context }]

    this._initLayers(BUILTIN_WORDS_BY_CATEGORY)
    if (options.wordList) this.updateWordList(options.wordList)
  }

  /**
   * 初始化/重建分层词库
   * @param {object} categoryConfig - { category: { enabled, strategy, words } | string[] }
   */
  _initLayers(categoryConfig) {
    this._layers = new Map()
    for (const [category, conf] of Object.entries(categoryConfig || {})) {
      const enabled = typeof conf === 'object' && conf !== null ? conf.enabled !== false : true
      const strategy = typeof conf === 'object' && conf !== null
        ? (conf.strategy || DEFAULT_STRATEGY[category] || 'block')
        : (DEFAULT_STRATEGY[category] || 'block')
      const words = Array.isArray(conf) ? conf : (conf && conf.words ? conf.words : [])
      const layer = { enabled, strategy, root: {}, count: 0 }
      for (const w of words) {
        if (typeof w !== 'string' || !w) continue
        this._insertWord(layer.root, w, category)
        layer.count++
      }
      this._layers.set(category, layer)
    }
  }

  /**
   * 获取指定分类的层，不存在则创建
   * @param {string} category
   * @returns {{enabled: boolean, strategy: string, root: object, count: number}}
   */
  _getLayer(category) {
    let layer = this._layers.get(category)
    if (!layer) {
      layer = { enabled: true, strategy: DEFAULT_STRATEGY[category] || 'block', root: {}, count: 0 }
      this._layers.set(category, layer)
    }
    return layer
  }

  /**
   * 向树中增量插入一个词
   * @param {object} root 树根
   * @param {string} word 敏感词
   * @param {*} endValue 词尾标记值（分类标签或 true）
   */
  _insertWord(root, word, endValue) {
    let node = root
    for (const ch of word) {
      const mapped = normalizeChar(ch)
      if (isIgnoreChar(mapped)) continue
      if (!node[mapped]) node[mapped] = {}
      node = node[mapped]
    }
    node._end = endValue
  }

  /**
   * 判断树中是否已存在某词
   * @param {object} root
   * @param {string} word
   * @returns {boolean}
   */
  _containsWord(root, word) {
    let node = root
    for (const ch of word) {
      const mapped = normalizeChar(ch)
      if (isIgnoreChar(mapped)) continue
      node = node[mapped]
      if (!node) return false
    }
    return node._end != null
  }

  /**
   * 从树中增量删除一个词（无需重建整棵树）
   * @param {object} root
   * @param {string} word
   * @returns {boolean} 是否删除成功
   */
  _removeWordFromTree(root, word) {
    const path = []
    let node = root
    for (const ch of word) {
      const mapped = normalizeChar(ch)
      if (isIgnoreChar(mapped)) continue
      if (!node[mapped]) return false
      path.push([node, mapped])
      node = node[mapped]
    }
    if (node._end == null) return false
    delete node._end
    // 自底向上清理无子节点且非词尾的空节点
    for (let k = path.length - 1; k >= 0; k--) {
      const [parent, key] = path[k]
      const child = parent[key]
      const hasChild = Object.keys(child).some(kk => kk !== '_end')
      if (!hasChild && child._end == null) {
        delete parent[key]
      } else {
        break
      }
    }
    return true
  }

  /**
   * 单层 DFA 扫描：从每个位置沿树走，记录最长命中
   * @param {string} text
   * @param {object} root
   * @returns {Array<{word: string, index: number, length: number, category: string}>}
   */
  _scanLayer(text, root) {
    const hits = []
    for (let i = 0; i < text.length; i++) {
      let node = root
      let tempLen = 0
      let maxLen = 0
      let maxCategory = null
      let prevMapped = null
      let j = i
      while (j < text.length) {
        const mapped = normalizeChar(text[j])
        // 忽略字符仅在已匹配到字符后跳过，避免开头跳过导致误判
        if (isIgnoreChar(mapped) && tempLen > 0) {
          tempLen++
          j++
          continue
        }
        // 重复字符归一化：沿用当前节点（叠字对抗），重复词尾字符同样构成命中
        if (this._ignoreRepeat && tempLen > 0 && mapped === prevMapped) {
          tempLen++
          j++
          if (node._end != null && tempLen > maxLen) {
            maxLen = tempLen
            maxCategory = node._end
          }
          continue
        }
        const next = node[mapped]
        if (!next) break // 前缀不匹配，剪枝
        node = next
        prevMapped = mapped
        tempLen++
        j++
        if (node._end != null && tempLen > maxLen) {
          maxLen = tempLen
          maxCategory = node._end
        }
      }
      if (maxLen > 0) {
        hits.push({ word: text.slice(i, i + maxLen), index: i, length: maxLen, category: maxCategory })
      }
    }
    return hits
  }

  /**
   * 判断原文切片是否命中白名单（归一化匹配）
   * @param {string} rawSlice 命中区间的原文切片
   * @returns {boolean}
   */
  _isWhitelisted(rawSlice) {
    if (!this._hasWhitelist) return false
    let node = this._whitelistRoot
    for (const ch of rawSlice) {
      const mapped = normalizeChar(ch)
      if (isIgnoreChar(mapped)) continue
      node = node[mapped]
      if (!node) return false
    }
    return node._end === true
  }

  /**
   * 判断命中是否处于上下文白名单（敏感词紧邻上下文词时放行）
   * @param {string} text
   * @param {{word: string, index: number, length: number}} hit
   * @returns {boolean}
   */
  _isContextWhitelisted(text, hit) {
    const hitNorm = normalizeText(hit.word)
    for (const rule of this._contextWhitelist) {
      if (normalizeText(rule.word) !== hitNorm) continue
      const before = text.slice(hit.index - rule.context.length, hit.index)
      const after = text.slice(hit.index + hit.length, hit.index + hit.length + rule.context.length)
      if (before === rule.context || after === rule.context) return true
    }
    return false
  }

  /**
   * 检测文本中的敏感词
   * @param {string} text
   * @returns {{hasSensitive: boolean, hits: Array<{word: string, index: number, length: number, category: string}>}}
   */
  detect(text) {
    if (!text || typeof text !== 'string') return { hasSensitive: false, hits: [] }
    const hits = []
    for (const [category, layer] of this._layers) {
      if (!layer.enabled) continue
      for (const hit of this._scanLayer(text, layer.root)) {
        hit.category = category
        hits.push(hit)
      }
    }
    const filtered = hits.filter(hit => {
      if (this._isWhitelisted(text.slice(hit.index, hit.index + hit.length))) return false
      if (this._isContextWhitelisted(text, hit)) return false
      return true
    })
    filtered.sort((a, b) => a.index - b.index)
    return { hasSensitive: filtered.length > 0, hits: filtered }
  }

  /**
   * 过滤文本中的敏感词（替换为 replacement）
   * @param {string} text
   * @returns {string}
   */
  filter(text) {
    if (!text || typeof text !== 'string') return text
    const result = this.detect(text)
    if (!result.hasSensitive) return text
    // 区间合并，避免重叠命中重复替换
    const ranges = result.hits.map(h => [h.index, h.index + h.length])
    ranges.sort((a, b) => a[0] - b[0])
    const merged = []
    for (const r of ranges) {
      const last = merged[merged.length - 1]
      if (last && r[0] <= last[1]) {
        last[1] = Math.max(last[1], r[1])
      } else {
        merged.push([r[0], r[1]])
      }
    }
    // 从后往前替换，避免位置偏移
    let output = text
    for (let k = merged.length - 1; k >= 0; k--) {
      const [start, end] = merged[k]
      output = output.slice(0, start) + this._replacement + output.slice(end)
    }
    return output
  }

  /**
   * 增量添加单个敏感词（无需重建整棵树）
   * @param {string} word
   * @param {string} [category] 分类标签，默认使用 defaultCategory
   * @returns {boolean}
   */
  addWord(word, category = this._defaultCategory) {
    if (!word || typeof word !== 'string') return false
    const layer = this._getLayer(category)
    const existed = this._containsWord(layer.root, word)
    this._insertWord(layer.root, word, category)
    if (!existed) layer.count++
    return true
  }

  /**
   * 增量删除单个敏感词（无需重建整棵树）
   * @param {string} word
   * @param {string} [category] 分类标签，默认使用 defaultCategory
   * @returns {boolean}
   */
  removeWord(word, category = this._defaultCategory) {
    if (!word || typeof word !== 'string') return false
    const layer = this._getLayer(category)
    if (this._removeWordFromTree(layer.root, word)) {
      layer.count = Math.max(0, layer.count - 1)
      return true
    }
    return false
  }

  /**
   * 批量添加敏感词
   * @param {string|string[]} words
   * @param {string} [category]
   */
  addWords(words, category = this._defaultCategory) {
    if (typeof words === 'string') words = [words]
    if (!Array.isArray(words)) return
    for (const w of words) this.addWord(w, category)
  }

  /**
   * 添加白名单词（命中该词不触发）
   * @param {string} word
   */
  addWhitelistWord(word) {
    if (!word || typeof word !== 'string') return
    this._insertWord(this._whitelistRoot, word, true)
    this._hasWhitelist = true
    this._whitelistCount++
  }

  /**
   * 添加上下文白名单（敏感词紧邻特定上下文词时放行）
   * @param {string} word 敏感词
   * @param {string} context 上下文词
   */
  addContextWhitelist(word, context) {
    if (!word || !context) return
    this._contextWhitelist.push({ word, context })
  }

  /**
   * 更新外部词库（运营中心下发），全量重建词，保留层配置
   * @param {Array} wordList - 字符串或 {word, category} 数组
   */
  updateWordList(wordList) {
    for (const layer of this._layers.values()) {
      layer.root = {}
      layer.count = 0
    }
    for (const item of (wordList || [])) {
      if (typeof item === 'string') {
        this.addWord(item, this._defaultCategory)
      } else if (item && typeof item === 'object' && item.word) {
        this.addWord(item.word, item.category || this._defaultCategory)
      }
    }
  }

  /**
   * 同步分类词库配置（运营中心下发）
   * @param {Array|object} categories
   *   - 数组：[{ category, enabled, strategy, words }]
   *   - 对象：{ 政治: { enabled, strategy, words } }
   *   传入空值时回退到内置词库
   */
  syncCategories(categories) {
    if (!categories || (Array.isArray(categories) && categories.length === 0) || Object.keys(categories).length === 0) {
      this._initLayers(BUILTIN_WORDS_BY_CATEGORY)
      return
    }
    const list = Array.isArray(categories)
      ? categories
      : Object.entries(categories).map(([category, conf]) => ({
          category,
          ...(typeof conf === 'object' && conf !== null ? conf : { words: conf }),
        }))
    const config = {}
    for (const item of list) {
      if (!item || !item.category) continue
      config[item.category] = {
        enabled: item.enabled !== false,
        strategy: item.strategy || DEFAULT_STRATEGY[item.category] || 'block',
        words: item.words || [],
      }
    }
    this._initLayers(config)
  }

  /**
   * 获取词库统计信息
   * @returns {{totalWords: number, categories: object, whitelistCount: number, contextWhitelistCount: number}}
   */
  getStats() {
    const categories = {}
    let total = 0
    for (const [category, layer] of this._layers) {
      categories[category] = { count: layer.count, enabled: layer.enabled, strategy: layer.strategy }
      total += layer.count
    }
    return {
      totalWords: total,
      categories,
      whitelistCount: this._whitelistCount,
      contextWhitelistCount: this._contextWhitelist.length,
    }
  }

  /**
   * 获取指定分类的处理策略
   * @param {string} category
   * @returns {{category: string, enabled: boolean, strategy: string, count: number}|null}
   */
  getCategoryPolicy(category) {
    const layer = this._layers.get(category)
    if (!layer) return null
    return { category, enabled: layer.enabled, strategy: layer.strategy, count: layer.count }
  }
}

module.exports = { SensitiveFilter, BUILTIN_SENSITIVE_WORDS }
