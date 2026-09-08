/**
 * Sensitive Filter — 敏感词过滤器
 *
 * 对文本进行敏感词检测和过滤，支持：
 * - 内置敏感词库
 * - 外部词库注入
 * - 前置/后置检测模式
 * - 敏感词替换
 */

// 内置敏感词库（示例，生产环境从运营中心同步）
const BUILTIN_SENSITIVE_WORDS = [
  '敏感词示例1',
  '敏感词示例2'
]

class SensitiveFilter {
  /**
   * @param {object} options
   * @param {Array} options.wordList - 外部敏感词列表
   * @param {string} options.replacement - 替换字符，默认 '***'
   */
  constructor(options = {}) {
    this._wordList = [...BUILTIN_SENSITIVE_WORDS, ...(options.wordList || [])]
    this._replacement = options.replacement || '***'
  }

  /**
   * 检测文本中的敏感词
   * @param {string} text
   * @returns {object} { hasSensitive, hits: [{word, index, length}] }
   */
  detect(text) {
    if (!text || !this._wordList.length) {
      return { hasSensitive: false, hits: [] }
    }

    const hits = []
    for (const word of this._wordList) {
      let idx = text.indexOf(word)
      while (idx !== -1) {
        hits.push({ word, index: idx, length: word.length })
        idx = text.indexOf(word, idx + 1)
      }
    }

    return { hasSensitive: hits.length > 0, hits }
  }

  /**
   * 过滤文本中的敏感词（替换为 replacement）
   * @param {string} text
   * @returns {string}
   */
  filter(text) {
    if (!text) return text
    let result = text
    for (const word of this._wordList) {
      const escaped = word.replace(/[.*+?^${}()|[\]\]/g, '\$&')
      const regex = new RegExp(escaped, 'g')
      result = result.replace(regex, this._replacement)
    }
    return result
  }

  /**
   * 更新外部词库（运营中心下发）
   * @param {Array} wordList
   */
  updateWordList(wordList) {
    this._wordList = [...BUILTIN_SENSITIVE_WORDS, ...(wordList || [])]
  }
}

module.exports = { SensitiveFilter, BUILTIN_SENSITIVE_WORDS }
