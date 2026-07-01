/**
 * ContentQualityGate — 发布内容质量门禁
 *
 * 改编自小黑插画 AI Agent 的 QA 体系：
 *   13 条通过标准（pass criteria）+ 11 条失败信号（failure signals）
 *
 * 用法:
 *   const gate = new ContentQualityGate()
 *
 *   // 全量检测
 *   const result = gate.evaluate({ title, content, platform, images })
 *   // → { passed: true/false, score: 0-100, passRate, failures, signals }
 *
 *   // 只检查失败信号（快速拒绝）
 *   const signals = gate.detectFailureSignals({ title, content })
 *   // → { hasSignal: true/false, triggered: [], details }
 *
 *   // 获取通过标准达标率
 *   const passRate = gate.computePassRate({ title, content, platform })
 *   // → { count, passed, rate, details }
 *
 * 集成到发布流程：
 *   在 task-queue 的 beforePublish hook 中调用，不达标则排队/告警。
 */

// ==================== 13 条通过标准 ====================

/**
 * 13 条通过标准（Pass Criteria）
 * 改编自小黑 QA 的 13 条插图通过标准，映射到发布内容质量维度：
 *
 * 小黑标准：     →  发布映射：
 * 构图合理       →  标题结构完整
 * 主体清晰       →  核心内容明确
 * 颜色协调       →  格式合规（各平台适配）
 * 细节丰富       →  内容充实度
 * 主题匹配       →  标题与内容一致性
 * 风格统一       →  多平台发布一致性
 * 情感传达       →  可读性与传播力
 * 创新性         →  原创性/去重
 * 技术执行       →  链接有效/图片可访问
 * 完成度         →  发布信息完整度
 * 版式适配       →  平台格式要求
 * 时间节奏       →  发布频率合规
 * 受众匹配       →  目标平台适配
 */
const PASS_CRITERIA = [
  {
    id: 'PC-1',
    name: '标题结构完整 (Title Structure)',
    description: '标题长度适中、不空、不含纯标点',
    weight: 15,
    check: function (ctx) {
      const t = (ctx.title || '').trim()
      if (!t) return { pass: false, reason: '标题为空' }
      if (t.length < 4) return { pass: false, reason: '标题过短（<4字）' }
      if (t.length > 100) return { pass: false, reason: '标题过长（>100字）' }
      // 纯标点检测
      if (/^[\u3000-\u303f\uff00-\uffef!@#$%^&*()_+={}\[\]:;"'<>,.?/|\\]+$/.test(t)) {
        return { pass: false, reason: '标题为纯标点符号' }
      }
      return { pass: true, reason: '标题合规' }
    }
  },
  {
    id: 'PC-2',
    name: '核心内容完整 (Content Completeness)',
    description: '正文字数达标，不空，不含模板残留',
    weight: 20,
    check: function (ctx) {
      const c = (ctx.content || '').trim()
      if (!c) return { pass: false, reason: '内容为空' }
      if (c.length < 20) return { pass: false, reason: '内容过短（<20字）' }
      // 模板残留检测
      const templates = ['{{', '}}', '{%', '%}', '${', '<<', '>>']
      for (const tpl of templates) {
        if (c.includes(tpl)) return { pass: false, reason: '内容包含模板残留: ' + tpl }
      }
      // 纯重复内容检测（同一句重复 3 次以上）
      const lines = c.split(/[。！？\n]/).filter(Boolean)
      const unique = new Set(lines.map(l => l.trim()))
      if (lines.length > 3 && unique.size < lines.length * 0.3) {
        return { pass: false, reason: '内容高度重复' }
      }
      return { pass: true, reason: '内容完整' }
    }
  },
  {
    id: 'PC-3',
    name: '标题-内容一致性 (Title-Content Alignment)',
    description: '标题关键词出现在正文中',
    weight: 10,
    check: function (ctx) {
      const t = (ctx.title || '').trim()
      const c = (ctx.content || '')
      if (!t || !c) return { pass: true, reason: '无需检查' }
      // 提取标题关键词（去停用词）
      const stops = new Set(['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些', '之', '与', '及', '或', '但', '而', '被'])
      const keywords = t.split('').filter(ch => ch.length === 1 && /[\u4e00-\u9fff]/.test(ch) && !stops.has(ch))
      if (keywords.length === 0) return { pass: true, reason: '无可检查关键词' }
      const matched = keywords.filter(k => c.includes(k))
      if (matched.length < Math.ceil(keywords.length * 0.3)) {
        return { pass: false, reason: '标题关键词在正文中覆盖率过低' }
      }
      return { pass: true, reason: '标题与内容一致' }
    }
  },
  {
    id: 'PC-4',
    name: '平台格式合规 (Platform Format Compliance)',
    description: '符合目标平台的格式限制',
    weight: 10,
    check: function (ctx) {
      const platform = (ctx.platform || '').toLowerCase()
      const t = (ctx.title || '').trim()
      const c = (ctx.content || '')
      const imgs = ctx.images || []

      if (platform === 'twitter' || platform === 'x') {
        if (t.length + c.length > 280) return { pass: false, reason: 'Twitter 正文超过 280 字符' }
      }
      if (platform === 'bilibili' || platform === 'b站') {
        if (t.length > 50) return { pass: false, reason: 'B站标题超过 50 字' }
      }
      if (platform === 'wechat' || platform === '微信') {
        // 微信公众号无硬限制, 但正文至少200字
        if (c.length < 200) return { pass: false, reason: '微信公众号正文建议至少 200 字' }
      }
      // Instagram 必须有图
      if (platform === 'instagram') {
        if (!imgs || imgs.length === 0) return { pass: false, reason: 'Instagram 发布必须包含图片' }
      }
      return { pass: true, reason: '平台格式合规' }
    }
  },
  {
    id: 'PC-5',
    name: '内容充实度 (Content Richness)',
    description: '有实质信息，非空洞表述',
    weight: 10,
    check: function (ctx) {
      const c = (ctx.content || '').trim()
      if (!c) return { pass: false, reason: '内容为空' }
      // 计算"信息密度"：非重复有效字符比例
      const segments = c.split(/[。！？，、；：\n\r]+/).filter(Boolean)
      if (segments.length < 2) return { pass: false, reason: '内容结构单一，缺乏分段' }
      // 检测是否全是列举无阐述
      const bulletRatio = (c.match(/[\-\*\d+。]/g) || []).length / c.length
      if (bulletRatio > 0.5 && segments.length > 5) {
        return { pass: false, reason: '内容偏向纯列举，缺少阐述' }
      }
      return { pass: true, reason: '内容充实度达标' }
    }
  },
  {
    id: 'PC-6',
    name: '可读性与传播力 (Readability & Shareability)',
    description: '语句通顺，有传播钩子',
    weight: 8,
    check: function (ctx) {
      const t = (ctx.title || '').trim()
      const c = (ctx.content || '')
      if (!t) return { pass: false, reason: '无标题，传播力不足' }
      // 标题含问号/感叹号认为有互动性
      const hasHook = /[？！?!]/.test(t)
      // 正文含互动引导
      const hasCallToAction = /(你怎么看|你怎么想|评论区|欢迎讨论|转发|收藏|点赞|关注我)/.test(c)
      if (!hasHook && !hasCallToAction) {
        return { pass: false, reason: '缺少互动钩子（问句/引导语）' }
      }
      return { pass: true, reason: '可读性与传播力达标' }
    }
  },
  {
    id: 'PC-7',
    name: '原创性/去重 (Originality & Dedup)',
    description: '不与近期发布内容高度重复',
    weight: 8,
    check: function (ctx) {
      const c = (ctx.content || '').trim()
      const t = (ctx.title || '').trim()
      const recentContents = ctx.recentContents || []
      if (!c || recentContents.length === 0) return { pass: true, reason: '无需去重检测' }
      // 简单 Jaccard 相似度
      const charSet = new Set(c)
      for (const recent of recentContents) {
        const recentSet = new Set(recent)
        const intersection = new Set([...charSet].filter(ch => recentSet.has(ch)))
        const union = new Set([...charSet, ...recentSet])
        const similarity = intersection.size / union.size
        if (similarity > 0.8) {
          return { pass: false, reason: '与近期发布内容高度相似（' + (similarity * 100).toFixed(0) + '%）' }
        }
      }
      return { pass: true, reason: '原创性达标' }
    }
  },
  {
    id: 'PC-8',
    name: '媒体资源可用 (Media Assets Availability)',
    description: '图片/视频资源可访问',
    weight: 5,
    check: function (ctx) {
      const imgs = ctx.images || []
      const videos = ctx.videos || []
      // 如果声明了媒体但只有一个空数组，不算失败
      if (imgs.length === 0 && videos.length === 0) return { pass: true, reason: '无需检查' }
      // 检查 URL 格式
      for (const img of imgs) {
        if (img && typeof img === 'string' && !img.startsWith('http://') && !img.startsWith('https://') && !img.startsWith('data:')) {
          return { pass: false, reason: '图片路径格式异常' }
        }
      }
      return { pass: true, reason: '媒体资源可用' }
    }
  },
  {
    id: 'PC-9',
    name: '敏感词检测 (Sensitivity Check)',
    description: '已配置 SensitiveFilter 时同步检测',
    weight: 5,
    check: function (ctx) {
      // 如果外部传入了敏感词检测结果，直接使用
      const filterResult = ctx.sensitivity
      if (!filterResult) return { pass: true, reason: '未配置敏感词检测' }
      if (filterResult.hasSensitive) {
        return { pass: false, reason: '内容包含敏感词: ' + (filterResult.words || []).join(', ') }
      }
      return { pass: true, reason: '敏感词检测通过' }
    }
  },
  {
    id: 'PC-10',
    name: '发布频率合规 (Publish Interval)',
    description: '距上次发布间隔充足',
    weight: 5,
    check: function (ctx) {
      const intervalResult = ctx.publishInterval
      if (!intervalResult) return { pass: true, reason: '未配置频率检测' }
      if (!intervalResult.allowed) {
        const remain = intervalResult.remainingSeconds || 0
        return { pass: false, reason: '发布过于频繁，还需等待 ' + remain + ' 秒' }
      }
      return { pass: true, reason: '发布频率合规' }
    }
  },
  {
    id: 'PC-11',
    name: '标签/关键词完整 (Tags & Keywords)',
    description: '配置了必要的标签或话题',
    weight: 4,
    check: function (ctx) {
      const tags = ctx.tags || []
      // 不强制必须有标签，但如果有，检查格式
      if (tags.length > 0) {
        for (const tag of tags) {
          if (typeof tag !== 'string' || tag.trim().length === 0) {
            return { pass: false, reason: '标签包含空值' }
          }
        }
      }
      return { pass: true, reason: '标签合规' }
    }
  },
  {
    id: 'PC-12',
    name: '多平台一致性 (Cross-Platform Consistency)',
    description: '同一内容发布多平台时关键信息一致',
    weight: 5,
    check: function (ctx) {
      const platforms = ctx.platforms || []
      if (!ctx.isCrossPlatform || platforms.length <= 1) return { pass: true, reason: '单平台发布' }
      // 各平台标题不应差异过大（同一内容场景）
      const titles = [ctx.title, ...(ctx.otherPlatformsTitles || [])].filter(Boolean)
      if (titles.length > 1) {
        const baseChars = new Set(titles[0])
        for (let i = 1; i < titles.length; i++) {
          const otherChars = new Set(titles[i])
          const intersection = new Set([...baseChars].filter(ch => otherChars.has(ch)))
          const similarity = intersection.size / Math.max(baseChars.size, otherChars.size)
          if (similarity < 0.2) {
            return { pass: false, reason: '多平台标题差异过大，建议保持核心关键词一致' }
          }
        }
      }
      return { pass: true, reason: '多平台内容一致' }
    }
  },
  {
    id: 'PC-13',
    name: '平台受众适配 (Audience Fit)',
    description: '内容风格匹配目标平台受众',
    weight: 5,
    check: function (ctx) {
      const platform = (ctx.platform || '').toLowerCase()
      const t = (ctx.title || '').trim()
      // 平台特定语气/风格建议
      if (platform && t) {
        const platformPatterns = {
          'bilibili|b站': /^(【|［|\[|「)/,
          '知乎|zhihu': /(如何|为什么|怎样|是什么|如何看待)/,
          '抖音|douyin': /[？！!?]$/,
          'linkedin|领英': /(分享|经验|总结|心得|实践)/,
        }
        for (const [pattern, regex] of Object.entries(platformPatterns)) {
          if (new RegExp(pattern).test(platform)) {
            if (!regex.test(t)) {
              // 只是软建议，不硬拦截
              return { pass: true, reason: '标题风格可进一步适配' + platform + '受众', suggest: true }
            }
          }
        }
      }
      return { pass: true, reason: '受众适配达标' }
    }
  }
]

// ==================== 11 条失败信号 ====================

/**
 * 11 条失败信号（Failure Signals）
 * 改编自小黑 QA 的 11 种失败信号，映射到发布内容拒绝条件：
 *
 * 小黑信号：       →  发布映射：
 * 构图失衡         →  标题结构失衡（头重脚轻）
 * 动作不自然       →  语句生硬/AI 感强
 * 物体辨识度低     →  主题模糊/不知所云
 * 颜色冲突         →  标签冲突/平台限制
 * 主题偏离         →  标题和正文不匹配
 * 细节不足         →  内容空泛无实质
 * 过度修饰         →  堆砌关键词/SEO 污染
 * 风格不一致       →  多段落风格突变
 * 技术瑕疵         →  格式错误/乱码
 * 过度复杂         →  信息过载
 * 情感缺失         →  内容平淡无传播力
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

class ContentQualityGate {
  /**
   * @param {object} [options]
   * @param {number} [options.passThreshold=0.6] - 通过率阈值 (0-1)
   * @param {boolean} [options.failFast=true] - 遇到 high 信号立即失败
   * @param {function} [options.logger] - 日志函数
   */
  constructor (options = {}) {
    this.passThreshold = options.passThreshold || 0.6
    this.failFast = options.failFast !== false
    this.logger = options.logger || null
  }

  _log (...args) {
    if (this.logger) this.logger('[ContentQualityGate]', ...args)
  }

  /**
   * 全量质量检测
   * @param {object} ctx - 检测上下文
   * @param {string} ctx.title - 标题
   * @param {string} ctx.content - 正文
   * @param {string} [ctx.platform] - 目标平台
   * @param {string[]} [ctx.images] - 图片 URL 列表
   * @param {string[]} [ctx.videos] - 视频 URL 列表
   * @param {string[]} [ctx.tags] - 标签列表
   * @param {string[]} [ctx.platforms] - 多平台列表
   * @param {string[]} [ctx.recentContents] - 近期发布内容列表（去重用）
   * @param {object} [ctx.sensitivity] - { hasSensitive, words[] }
   * @param {object} [ctx.publishInterval] - { allowed, remainingSeconds }
   * @returns {{ passed, score, passRate, failures, signals, details }}
   */
  evaluate (ctx) {
    this._log('Evaluating content quality', { title: (ctx.title || '').slice(0, 30) })

    // Step 1: 通过标准检测
    const passResults = PASS_CRITERIA.map(criteria => ({
      id: criteria.id,
      name: criteria.name,
      weight: criteria.weight,
      result: criteria.check(ctx),
      raw: criteria
    }))

    const passedItems = passResults.filter(r => r.result.pass)
    const passRate = passedItems.length / PASS_CRITERIA.length
    const weightedScore = passResults.reduce((sum, r) => {
      if (r.result.pass) return sum + r.weight
      return sum
    }, 0)
    const score = weightedScore // max = sum of all weights = 100

    // Step 2: 失败信号检测
    const signalResults = FAILURE_SIGNALS.map(signal => ({
      id: signal.id,
      name: signal.name,
      severity: signal.severity,
      result: signal.detect(ctx),
      raw: signal
    }))

    const triggeredSignals = signalResults.filter(r => r.result !== null)
    const highSignals = triggeredSignals.filter(r => r.severity === 'high')

    // Step 3: 决策
    const hasHighSignal = highSignals.length > 0
    const hasAnySignal = triggeredSignals.length > 0
    const passed = !hasHighSignal && passRate >= this.passThreshold

    const details = {
      passCriteria: passResults.map(r => ({
        id: r.id,
        name: r.name,
        pass: r.result.pass,
        reason: r.result.reason,
        suggest: r.result.suggest || false
      })),
      failureSignals: triggeredSignals.map(r => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        detail: r.result.detail
      }))
    }

    return {
      passed,
      score: Math.round(score * 10) / 10,
      passRate: Math.round(passRate * 100) / 100,
      failures: PASS_CRITERIA.length - passedItems.length,
      signals: triggeredSignals.length,
      highSignal: hasHighSignal,
      anySignal: hasAnySignal,
      details
    }
  }

  /**
   * 快速检测失败信号（跳过通过标准）
   */
  detectFailureSignals (ctx) {
    const results = FAILURE_SIGNALS.map(signal => ({
      id: signal.id,
      name: signal.name,
      severity: signal.severity,
      result: signal.detect(ctx)
    }))

    const triggered = results.filter(r => r.result !== null)

    // failFast: 遇到 high 立即返回
    if (this.failFast) {
      const highTriggered = triggered.filter(r => r.severity === 'high')
      if (highTriggered.length > 0) {
        return {
          hasSignal: true,
          triggered: highTriggered.map(r => ({ id: r.id, name: r.name, detail: r.result.detail })),
          details: '检测到 high 级别失败信号'
        }
      }
    }

    return {
      hasSignal: triggered.length > 0,
      triggered: triggered.map(r => ({ id: r.id, name: r.name, severity: r.severity, detail: r.result.detail })),
      details: triggered.length > 0 ? '检测到 ' + triggered.length + ' 个失败信号' : '未检测到失败信号'
    }
  }

  /**
   * 计算通过率
   */
  computePassRate (ctx) {
    const results = PASS_CRITERIA.map(criteria => ({
      id: criteria.id,
      name: criteria.name,
      result: criteria.check(ctx)
    }))

    const passed = results.filter(r => r.result.pass).length

    return {
      count: PASS_CRITERIA.length,
      passed,
      rate: Math.round((passed / PASS_CRITERIA.length) * 100) / 100,
      details: results.map(r => ({
        id: r.id,
        name: r.name,
        pass: r.result.pass,
        reason: r.result.reason
      }))
    }
  }
}

ContentQualityGate.PASS_CRITERIA = PASS_CRITERIA
ContentQualityGate.FAILURE_SIGNALS = FAILURE_SIGNALS

module.exports = ContentQualityGate
