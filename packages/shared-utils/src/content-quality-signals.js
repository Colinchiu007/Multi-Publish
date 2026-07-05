/**
 * ContentQualityGate — 11 条失败信号 (Failure Signals)
 *
 * 快速拒绝机制：检测到 high 级别信号立即终止发布。
 */
const FAILURE_SIGNALS = [
  {
    id: 'FS-1',
    name: '标题结构失衡 (Title Imbalance)',
    description: '标题头重脚轻或无效结构',
    severity: 'medium',
    detect: function (ctx) {
      const t = (ctx.title || '').trim()
      if (!t) return null
      // 纯数字/字母标题
      if (/^[\da-zA-Z\s]+$/.test(t)) return { triggered: true, detail: '标题为纯数字/字母，缺乏可读性' }
      // 以标点开头
      if (/^[，。、；：！？）】》」』…\-\*\+]/.test(t)) return { triggered: true, detail: '标题以标点开头' }
      // 括号不配对
      const pairs = [['（', '）'], ['【', '】'], ['「', '」'], ['"', '"'], ["'", "'"]]
      for (const [open, close] of pairs) {
        const oCount = (t.match(new RegExp('\\' + open, 'g')) || []).length
        const cCount = (t.match(new RegExp('\\' + close, 'g')) || []).length
        if (oCount !== cCount) return { triggered: true, detail: '标题括号不配对' }
      }
      return null
    }
  },
  {
    id: 'FS-2',
    name: 'AI 感过强 (AI-Generated Tone)',
    description: '语句生硬，存在 AI 写作惯用套路',
    severity: 'medium',
    detect: function (ctx) {
      const c = (ctx.content || '')
      if (!c) return null
      // AI 惯用表达
      const aiPatterns = [
        '在这个', '在当今', '随着', '值得注意的是', '毋庸置疑',
        '总的来说', '综上所述', '不可否认', '从某种角度', '某种意义上',
        '事实上', '实际上', '可以说', '需要指出的是', '毫无疑问',
        '众所周知', '这是一个', '让我们', '如何', '第一步',
        '首先', '其次', '再次', '最后', '总而言之',
        '不过', '然而', '但是', '却', '因此', '因而',
      ]
      // 统计 AI 模式出现频率
      let aiCount = 0
      for (const p of aiPatterns) {
        const regex = new RegExp(p, 'g')
        const matches = c.match(regex)
        if (matches) aiCount += matches.length
      }
      // 每 100 字超过 3 个 AI 模式判定为 AI 感强
      const density = aiCount / (c.length / 100)
      if (density > 5) return { triggered: true, detail: 'AI 写作模式密度过高（' + density.toFixed(1) + '/100字）' }
      return null
    }
  },
  {
    id: 'FS-3',
    name: '主题模糊 (Vague Topic)',
    description: '内容核心指向不明，难以概括',
    severity: 'high',
    detect: function (ctx) {
      const t = (ctx.title || '').trim()
      const c = (ctx.content || '').trim()
      if (!t && !c) return null
      // 标题含模糊词
      const vagueTitleWords = ['一些', '某个', '各种', '有关', '关于', '某些', '若干', '些许']
      if (t) {
        for (const w of vagueTitleWords) {
          if (t.includes(w) && t.length < 10) return { triggered: true, detail: '标题含模糊词" ' + w + '"且过短' }
        }
      }
      // 正文无明显主题实体
      if (c && c.length > 50) {
        const hasEntity = /[\u4e00-\u9fff]{2,}/.test(c) // 至少有两个连续汉字
        if (!hasEntity) return { triggered: true, detail: '正文无连续中文字符，无法确认主题' }
      }
      return null
    }
  },
  {
    id: 'FS-4',
    name: '标签合规风险 (Tag Compliance)',
    description: '标签包含违禁或不当内容',
    severity: 'high',
    detect: function (ctx) {
      const tags = ctx.tags || []
      if (tags.length === 0) return null
      const bannedTags = ['刷粉', '刷赞', '刷量', '代刷', '外挂', '作弊', '诈骗', '赌博']
      for (const tag of tags) {
        for (const banned of bannedTags) {
          if (tag.includes(banned)) return { triggered: true, detail: '标签含违禁词: ' + tag }
        }
      }
      return null
    }
  },
  {
    id: 'FS-5',
    name: '标题-内容脱节 (Title-Content Mismatch)',
    description: '标题与正文关联度低',
    severity: 'high',
    detect: function (ctx) {
      const t = (ctx.title || '').trim()
      const c = (ctx.content || '').trim()
      if (!t || !c || c.length < 30) return null
      // 标题中的关键词在正文中出现的比例
      const titleChars = t.split('').filter(ch => /[\u4e00-\u9fff]/.test(ch))
      if (titleChars.length === 0) return null
      const matchCount = titleChars.filter(ch => c.includes(ch)).length
      const ratio = matchCount / titleChars.length
      if (ratio < 0.2) return { triggered: true, detail: '标题汉字在正文覆盖率仅 ' + (ratio * 100).toFixed(0) + '%' }
      return null
    }
  },
  {
    id: 'FS-6',
    name: '内容空泛 (Shallow Content)',
    description: '有字数但无实质信息',
    severity: 'medium',
    detect: function (ctx) {
      const c = (ctx.content || '').trim()
      if (!c || c.length < 50) return null
      // 信息熵估算：字数多但无标点、无分段、无实体
      const noPunctuation = !/[。！？，；：]/.test(c)
      const noLineBreaks = !/\n/.test(c)
      if (c.length > 200 && noPunctuation && noLineBreaks) {
        return { triggered: true, detail: '长内容无标点/分段，疑似堆砌' }
      }
      // 重复短语检测
      const segments = c.split(/[。！？\n]+/).filter(s => s.trim().length > 5)
      if (segments.length > 3) {
        const uniqueSegments = new Set(segments.map(s => s.trim()))
        if (uniqueSegments.size < segments.length * 0.3) {
          return { triggered: true, detail: '内容段落大量重复' }
        }
      }
      return null
    }
  },
  {
    id: 'FS-7',
    name: '关键词堆砌 (Keyword Stuffing)',
    description: '过度 SEO 优化，可读性受损',
    severity: 'medium',
    detect: function (ctx) {
      const c = (ctx.content || '').trim()
      if (!c || c.length < 100) return null
      // 检测同一关键词反复出现
      const wordFreq = {}
      const words = c.match(/[\u4e00-\u9fff]{2,4}/g) || []
      for (const w of words) {
        wordFreq[w] = (wordFreq[w] || 0) + 1
      }
      // 按频率排序，取最高频
      const sorted = Object.entries(wordFreq).sort((a, b) => b[1] - a[1])
      if (sorted.length > 0) {
        const [topWord, topCount] = sorted[0]
        const expectedMax = Math.ceil(c.length / 50)
        if (topCount > expectedMax * 3 && topCount > 5) {
          return { triggered: true, detail: '关键词"' + topWord + '"重复 ' + topCount + ' 次，疑似堆砌' }
        }
      }
      return null
    }
  },
  {
    id: 'FS-8',
    name: '格式错误/乱码 (Format Error)',
    description: '存在乱码、未转义字符或格式异常',
    severity: 'high',
    detect: function (ctx) {
      const fullText = (ctx.title || '') + ' ' + (ctx.content || '')
      if (!fullText) return null
      // 乱码模式
      const garbledPatterns = [
        /ï¿½/,
        /\\u[0-9a-f]{4}/gi,
        /&[a-z]+;/gi,
        /[\x00-\x08\x0b\x0c\x0e-\x1f]/,
        /\?\?\?/,
        /锟斤拷/,
        /烫烫烫/,
        /屯屯屯/,
      ]
      for (const p of garbledPatterns) {
        if (p.test(fullText)) return { triggered: true, detail: '检测到乱码/未转义字符' }
      }
      return null
    }
  },
  {
    id: 'FS-9',
    name: '信息过载 (Information Overload)',
    description: '单篇内容承载过多主题',
    severity: 'low',
    detect: function (ctx) {
      const c = (ctx.content || '').trim()
      if (!c || c.length < 500) return null
      // 长文中主题实体数量过多
      const stopwords = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一'])
      const chars = c.split('').filter(ch => /[\u4e00-\u9fff]/.test(ch))
      const uniqueChars = new Set(chars)
      // 过长且主题分散
      const hasManyTopics = (c.match(/第一|第二|第三|第四|第五|首先|其次|另外|此外|同时|还有/gi) || []).length > 5
      if (hasManyTopics && c.length > 800) {
        return { triggered: true, detail: '内容涉及过多子主题，建议拆分为多篇' }
      }
      return null
    }
  },
  {
    id: 'FS-10',
    name: '多段风格突变 (Style Inconsistency)',
    description: '段落间语气/风格不一致',
    severity: 'low',
    detect: function (ctx) {
      const c = (ctx.content || '')
      if (!c) return null
      // 检测是否混合中英文/繁简
      const hasTraditional = /[\u4e00-\u9fff]/.test(c)
      // 简单检测：前半段和后半段的标点使用风格差异
      const half = Math.floor(c.length / 2)
      const firstHalf = c.slice(0, half)
      const secondHalf = c.slice(half)
      // 中文占比差异
      const cnRatio1 = (firstHalf.match(/[\u4e00-\u9fff]/g) || []).length / Math.max(firstHalf.length, 1)
      const cnRatio2 = (secondHalf.match(/[\u4e00-\u9fff]/g) || []).length / Math.max(secondHalf.length, 1)
      if (Math.abs(cnRatio1 - cnRatio2) > 0.5 && c.length > 100) {
        return { triggered: true, detail: '前后段中文密度差异过大，风格不统一' }
      }
      return null
    }
  },
  {
    id: 'FS-11',
    name: '传播力不足 (Low Shareability)',
    description: '内容平淡无互动引导',
    severity: 'low',
    detect: function (ctx) {
      const t = (ctx.title || '').trim()
      const c = (ctx.content || '').trim()
      if (!t && !c) return null
      const hasQuestion = /[？?]/.test(t + c)
      const hasEmotion = /[！!哇啊哈呢吧呀哦嗯唉]/.test(t + c)
      if (!hasQuestion && !hasEmotion && (t + c).length > 100) {
        return { triggered: true, detail: '内容无问句/情感词，互动性可能偏低' }
      }
      return null
    }
  }
]

// ==================== 质量门禁引擎 ====================


module.exports = FAILURE_SIGNALS