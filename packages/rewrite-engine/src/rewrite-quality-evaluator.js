/**
 * @multi-publish/rewrite-engine
 *
 * 改写质量评估器 — SimHash 64 位指纹 + 海明距离判重 + 三维评分
 *
 * 提供：
 * - SimHash: 64 位指纹类（可独立使用）
 * - RewriteQualityEvaluator: 改写质量评估器（充分度 / 语义保持度 / 原创性）
 * - computeSimHash: 便捷函数（返回 hex 字符串）
 * - hammingDistance: 便捷函数（返回海明距离）
 *
 * 纯 JavaScript 实现，不依赖任何外部包。
 * 算法蓝本：yanyiwu/simhash（64 位）+ 1e0ng/simhash（加权求和），
 * 见 01-docs/DEEP-ANALYSIS-SENSITIVE-DEDUP.md §4。
 */

'use strict'

/** FNV-1a 64 位哈希的偏移基值 */
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n
/** FNV-1a 64 位哈希的质数 */
const FNV_PRIME = 0x100000001b3n
/** 64 位掩码 */
const MASK_64 = 0xffffffffffffffffn
/** SimHash 指纹位数 */
const BITS = 64

/**
 * FNV-1a 64 位哈希
 * @param {string} str 输入字符串
 * @returns {bigint} 64 位无符号哈希值
 */
function fnv1a64(str) {
  let hash = FNV_OFFSET_BASIS
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i))
    hash = (hash * FNV_PRIME) & MASK_64
  }
  return hash
}

/**
 * 字符 n-gram 分词（不依赖 jieba 等外部分词器）
 *
 * 中文按字符 n-gram 滑动窗口切分；空白字符会被过滤，避免产生无意义 token。
 *
 * @param {string} text 输入文本
 * @param {number} gramSize n-gram 大小，默认 2
 * @returns {string[]} token 数组
 */
function tokenize(text, gramSize = 2) {
  if (!text) return []
  const cleaned = text.replace(/\s+/g, '')
  if (cleaned.length === 0) return []
  if (cleaned.length <= gramSize) return [cleaned]

  const tokens = []
  for (let i = 0; i <= cleaned.length - gramSize; i++) {
    tokens.push(cleaned.slice(i, i + gramSize))
  }
  return tokens
}

/**
 * 统计 token 词频（TF 简化加权）
 * @param {string[]} tokens token 数组
 * @returns {Map<string, number>} token -> 词频
 */
function countFrequencies(tokens) {
  const freq = new Map()
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1)
  }
  return freq
}

/**
 * SimHash 64 位指纹类
 *
 * 将文本映射为 64 位指纹：每个 token 哈希后按位加权求和，
 * 权重为正的位取 1，否则取 0。相似文本的指纹海明距离较小。
 */
class SimHash {
  /**
   * @param {object} [options]
   * @param {number} [options.gramSize=4] 字符 n-gram 大小
   * @param {(text: string, gramSize: number) => string[]} [options.tokenizer] 自定义分词器
   */
  constructor(options = {}) {
    this.gramSize = options.gramSize || 4
    this.tokenizer = options.tokenizer || tokenize
  }

  /**
   * 计算文本的 64 位 SimHash 指纹
   * @param {string} text 输入文本
   * @returns {bigint} 64 位指纹（BigInt）
   */
  compute(text) {
    const tokens = this.tokenizer(text, this.gramSize)
    if (tokens.length === 0) return 0n

    const freq = countFrequencies(tokens)
    const weights = new Float64Array(BITS)

    for (const [token, weight] of freq) {
      const hash = fnv1a64(token)
      for (let b = 0; b < BITS; b++) {
        const bit = (hash >> BigInt(b)) & 1n
        weights[b] += bit ? weight : -weight
      }
    }

    let fingerprint = 0n
    for (let b = 0; b < BITS; b++) {
      if (weights[b] > 0) {
        fingerprint |= 1n << BigInt(b)
      }
    }
    return fingerprint
  }

  /**
   * 计算文本指纹并返回 hex 字符串
   * @param {string} text 输入文本
   * @returns {string} 16 位 hex 字符串
   */
  computeHex(text) {
    return toHex(this.compute(text))
  }
}

/**
 * 将 BigInt 指纹转为 16 位 hex 字符串
 * @param {bigint} fingerprint 64 位指纹
 * @returns {string} 16 位 hex 字符串
 */
function toHex(fingerprint) {
  return fingerprint.toString(16).padStart(16, '0')
}

/**
 * 将 hex 字符串或 BigInt 归一化为 BigInt
 * @param {bigint|string} value 指纹
 * @returns {bigint} BigInt 指纹
 */
function toBigInt(value) {
  if (typeof value === 'bigint') return value
  if (typeof value === 'string') return BigInt('0x' + value)
  throw new TypeError('指纹必须是 bigint 或 hex 字符串')
}

/**
 * 计算两个 64 位指纹的海明距离（二进制位不同的数量）
 * @param {bigint|string} a 指纹 A
 * @param {bigint|string} b 指纹 B
 * @returns {number} 海明距离
 */
function hammingDistance(a, b) {
  let x = toBigInt(a) ^ toBigInt(b)
  let count = 0
  while (x) {
    count++
    x &= x - 1n
  }
  return count
}

/**
 * 计算文本的 SimHash 指纹（便捷函数，返回 hex 字符串）
 * @param {string} text 输入文本
 * @param {object} [options] 透传给 SimHash 的选项
 * @returns {string} 16 位 hex 字符串
 */
function computeSimHash(text, options) {
  return new SimHash(options).computeHex(text)
}

/**
 * 字符级 Jaccard 相似度（基于字符集合）
 * @param {string} a 文本 A
 * @param {string} b 文本 B
 * @returns {number} 0-1 相似度
 */
function charJaccard(a, b) {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size === 0 && setB.size === 0) return 1
  let intersection = 0
  for (const ch of setA) {
    if (setB.has(ch)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 1 : intersection / union
}

/**
 * 提取文本关键词（高频 n-gram token）
 * @param {string} text 输入文本
 * @param {number} topN 关键词数量
 * @param {number} gramSize n-gram 大小
 * @returns {Set<string>} 关键词集合
 */
function extractKeywords(text, topN, gramSize) {
  const tokens = tokenize(text, gramSize)
  const freq = countFrequencies(tokens)
  const sorted = [...freq.entries()].sort((x, y) => y[1] - x[1])
  return new Set(sorted.slice(0, topN).map(([token]) => token))
}

/**
 * 关键词重合度（0-1）
 * @param {string} original 原文
 * @param {string} rewritten 改写文
 * @param {number} [topN=10] 关键词数量
 * @param {number} [gramSize=4] n-gram 大小
 * @returns {number} 重合度
 */
function keywordOverlap(original, rewritten, topN = 10, gramSize = 2) {
  const kwA = extractKeywords(original, topN, gramSize)
  const kwB = extractKeywords(rewritten, topN, gramSize)
  if (kwA.size === 0 && kwB.size === 0) return 1
  let intersection = 0
  for (const token of kwA) {
    if (kwB.has(token)) intersection++
  }
  const maxSize = Math.max(kwA.size, kwB.size)
  return maxSize === 0 ? 1 : intersection / maxSize
}

/**
 * 将数值限制在 [0, 100] 区间
 * @param {number} value 原始值
 * @returns {number} 限制后的值
 */
function clamp100(value) {
  return Math.max(0, Math.min(100, value))
}

/**
 * 根据海明距离计算改写充分度评分（0-100）
 *
 * 映射规则：
 * - 距离 0-3:  0-20 分（改写不充分，接近抄袭）
 * - 距离 3-6:  20-60 分（改写一般）
 * - 距离 6-10: 60-85 分（改写充分）
 * - 距离 >10:  85-100 分（高度原创）
 *
 * @param {number} distance 海明距离
 * @returns {number} 充分度评分
 */
function scoreSufficiency(distance) {
  if (distance <= 3) {
    return (distance / 3) * 20
  }
  if (distance <= 6) {
    return 20 + ((distance - 3) / 3) * 40
  }
  if (distance <= 10) {
    return 60 + ((distance - 6) / 4) * 25
  }
  return Math.min(100, 85 + ((distance - 10) / 10) * 15)
}

/**
 * 计算语义保持度（0-100）
 *
 * 基于字符级 Jaccard 相似度 + 关键词重合度。
 * 过高（>90%）= 没改够，过低（<30%）= 偏离原意。
 *
 * @param {string} original 原文
 * @param {string} rewritten 改写文
 * @returns {number} 语义保持度
 */
function scoreSemanticPreservation(original, rewritten) {
  const jaccard = charJaccard(original, rewritten)
  const overlap = keywordOverlap(original, rewritten)
  // 字符级 overlap 占 70%，关键词重合度占 30%
  return clamp100(jaccard * 100 * 0.7 + overlap * 100 * 0.3)
}

/**
 * 计算原创性评分（0-100）
 *
 * 原创性 = 改写充分度 × 0.5 + (1 - Jaccard 相似度) × 100 × 0.5
 *
 * @param {number} sufficiency 改写充分度
 * @param {string} original 原文
 * @param {string} rewritten 改写文
 * @returns {number} 原创性评分
 */
function scoreOriginality(sufficiency, original, rewritten) {
  const jaccard = charJaccard(original, rewritten)
  return clamp100(sufficiency * 0.5 + (1 - jaccard) * 100 * 0.5)
}

/**
 * 判定综合结论
 *
 * - 海明距离 < 3：近似重复 → fail
 * - 语义保持度 > 90：没改够 → fail
 * - 语义保持度 < 30：偏离原意 → fail
 * - 距离 3-6 或语义保持度 < 50：warn
 * - 其余：pass
 *
 * @param {number} distance 海明距离
 * @param {number} semantic 语义保持度
 * @returns {'pass'|'warn'|'fail'} 结论
 */
function determineVerdict(distance, semantic) {
  if (distance < 3) return 'fail'
  if (semantic > 90) return 'fail'
  if (semantic < 30) return 'fail'
  if (distance <= 6 || semantic < 50) return 'warn'
  return 'pass'
}

/**
 * 生成改进建议
 * @param {number} distance 海明距离
 * @param {number} sufficiency 充分度
 * @param {number} semantic 语义保持度
 * @returns {string[]} 建议数组
 */
function buildSuggestions(distance, sufficiency, semantic) {
  const suggestions = []
  if (distance < 3) {
    suggestions.push('改写与原文过于接近（近似重复），需要大幅调整句式与措辞')
  } else if (distance <= 6) {
    suggestions.push('改写充分度不足，建议进一步调整语序、替换同义词并重组句子结构')
  }
  if (semantic > 90) {
    suggestions.push('语义保持度过高，说明改动过少，需增加实质性内容变化')
  } else if (semantic < 30) {
    suggestions.push('语义保持度过低，改写可能偏离原意，请核对核心信息是否保留')
  }
  if (sufficiency >= 85 && semantic >= 50) {
    suggestions.push('改写质量良好，充分度与语义保持度均达标')
  }
  if (suggestions.length === 0) {
    suggestions.push('改写基本合格，可结合上下文微调以进一步提升自然度')
  }
  return suggestions
}

/**
 * 改写质量评估器
 *
 * 对原文与改写文进行三维评分（充分度 / 语义保持度 / 原创性），
 * 并基于 SimHash 海明距离给出综合结论与改进建议。
 */
class RewriteQualityEvaluator {
  /**
   * @param {object} [options]
   * @param {number} [options.gramSize=2] SimHash 字符 n-gram 大小
   * @param {number} [options.keywordTopN=10] 关键词重合度检测数量
   */
  constructor(options = {}) {
    this.gramSize = options.gramSize || 4
    this.keywordTopN = options.keywordTopN || 10
    this.simhash = new SimHash({ gramSize: this.gramSize })
  }

  /**
   * 评估单条改写结果
   * @param {string} original 原文
   * @param {string} rewritten 改写文
   * @returns {{
   *   sufficiency: number,
   *   semanticPreservation: number,
   *   originality: number,
   *   simhashDistance: number,
   *   verdict: 'pass'|'warn'|'fail',
   *   suggestions: string[]
   * }} 综合评估报告
   */
  evaluate(original, rewritten) {
    const originalFp = this.simhash.compute(original)
    const rewrittenFp = this.simhash.compute(rewritten)
    const distance = hammingDistance(originalFp, rewrittenFp)

    const sufficiency = scoreSufficiency(distance)
    const semanticPreservation = scoreSemanticPreservation(original, rewritten)
    const originality = scoreOriginality(sufficiency, original, rewritten)
    const verdict = determineVerdict(distance, semanticPreservation)
    const suggestions = buildSuggestions(distance, sufficiency, semanticPreservation)

    return {
      sufficiency: Math.round(sufficiency * 100) / 100,
      semanticPreservation: Math.round(semanticPreservation * 100) / 100,
      originality: Math.round(originality * 100) / 100,
      simhashDistance: distance,
      verdict,
      suggestions
    }
  }

  /**
   * 批量评估多条改写结果
   * @param {Array<{original: string, rewritten: string}>} items 待评估项
   * @returns {Array<{
   *   sufficiency: number,
   *   semanticPreservation: number,
   *   originality: number,
   *   simhashDistance: number,
   *   verdict: 'pass'|'warn'|'fail',
   *   suggestions: string[]
   * }>} 评估报告数组
   */
  evaluateBatch(items) {
    return items.map((item) => this.evaluate(item.original, item.rewritten))
  }
}

module.exports = {
  SimHash,
  RewriteQualityEvaluator,
  computeSimHash,
  hammingDistance,
  tokenize,
  fnv1a64,
  charJaccard,
  keywordOverlap
}
