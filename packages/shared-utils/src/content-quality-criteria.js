/**
 * ContentQualityGate — 13 条通过标准 (Pass Criteria)
 *
 * 改编自小黑插画 AI Agent 的 QA 体系，映射到发布内容质量维度。
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

module.exports = PASS_CRITERIA