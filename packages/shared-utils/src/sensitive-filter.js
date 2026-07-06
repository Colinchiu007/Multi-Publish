/**
 * SensitiveFilter — DFA 敏感词过滤器
 *
 * 使用 DFA (Deterministic Finite Automaton) 算法，
 * 一次遍历文本即可检测所有敏感词。
 *
 * 用法:
 *   const filter = new SensitiveFilter(['词1', '词2'])
 *   filter.check('文本内容')  // → { hasSensitive, words, positions }
 *   filter.replace('文本内容')  // → '替换后的文本'
 *
 *   // 使用内置词库
 *   const filter = SensitiveFilter.createWithBuiltin()
 */

// 内置敏感词（开源中文敏感词库子集）
const BUILTIN_WORDS = [
  // 政治敏感类
  '法轮功', '法轮', '轮功', '天安门', '六四', '六四事件',
  '台独', '藏独', '疆独', '港独', '分裂国家',
  '邪教', '法轮大法', '违章',
  // 色情类
  '色情', '裸聊', '裸体', '成人片', 'A片',
  // 违法类
  '赌博', '赌场', '贩毒', '毒品', '走私', '洗钱',
  '枪支', '弹药', '管制刀具', '爆炸物',
  // 诈骗类
  '传销', '庞氏骗局', '资金盘', '非法集资',
  '刷单', '兼职刷单', '刷信誉',
  // 广告类
  '微信号', 'QQ号', '手机号', '联系电话',
  '加我微信', '加QQ', '私聊',
]

class SensitiveFilter {
  /**
   * @param {string[]} wordList - 敏感词列表
   */
  constructor (wordList) {
    this._wordList = Array.isArray(wordList) ? wordList : (typeof wordList === 'string' ? [wordList] : [])
    this._buildDFA()
  }

  /**
   * 构建 DFA 树
   */
  _buildDFA () {
    this._root = {}
    for (const word of this._wordList) {
      if (!word || typeof word !== 'string') continue
      let node = this._root
      for (let i = 0; i < word.length; i++) {
        const char = word[i]
        if (!node[char]) {
          node[char] = {}
        }
        node = node[char]
      }
      node._end = true  // 标记词尾
    }
  }

  /**
   * 检查文本中是否包含敏感词
   * @param {string} text
   * @returns {{ hasSensitive: boolean, words: string[], positions: Array<{word: string, index: number, length: number}> }}
   */
  check (text) {
    if (!text || typeof text !== 'string') {
      return { hasSensitive: false, words: [], positions: [] }
    }

    const foundWords = new Set()
    const foundPositions = []

    for (let i = 0; i < text.length; i++) {
      let node = this._root
      let matchLen = 0
      let j = i

      while (j < text.length && node[text[j]]) {
        node = node[text[j]]
        matchLen++
        j++

        if (node._end) {
          const matchedWord = text.slice(i, i + matchLen)
          foundWords.add(matchedWord)
          foundPositions.push({
            word: matchedWord,
            index: i,
            length: matchLen,
          })
          break  // 最短匹配
        }
      }
    }

    return {
      hasSensitive: foundWords.size > 0,
      words: Array.from(foundWords),
      positions: foundPositions,
    }
  }

  /**
   * 替换文本中的敏感词
   * @param {string} text
   * @param {string} replacer - 替换字符
   * @returns {string}
   */
  replace (text, replacer = '***') {
    if (!text || typeof text !== 'string') return text

    const result = this.check(text)
    if (!result.hasSensitive) return text

    let output = text
    // 从后往前替换，避免位置偏移
    const sorted = result.positions.sort((a, b) => b.index - a.index)
    for (const pos of sorted) {
      const before = output.slice(0, pos.index)
      const after = output.slice(pos.index + pos.length)
      output = before + replacer + after
    }

    return output
  }

  /**
   * 添加额外的敏感词
   * @param {string|string[]} words
   */
  addWords (words) {
    if (typeof words === 'string') words = [words]
    if (!Array.isArray(words)) return
    this._wordList.push(...words)
    this._buildDFA()  // 重建树
  }

  /**
   * 使用内置词库创建过滤器
   * @returns {SensitiveFilter}
   */
  static createWithBuiltin () {
    return new SensitiveFilter(BUILTIN_WORDS)
  }

  /**
   * 获取内置词库
   * @returns {string[]}
   */
  static getBuiltinWords () {
    return [...BUILTIN_WORDS]
  }
}

module.exports = SensitiveFilter
