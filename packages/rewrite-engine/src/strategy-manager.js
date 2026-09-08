/**
 * Strategy Manager — 策略加载、缓存、运行时下发
 * 
 * 管理所有改写策略的生命周期：加载内置策略、缓存运营中心下发策略、
 * 提供策略列表查询、单个策略获取。
 */

class StrategyManager {
  constructor() {
    this._strategies = new Map()
    this._builtinLoaded = false
  }

  /**
   * 加载内置策略（硬编码在代码中的基础策略模板）
   */
  loadBuiltins() {
    if (this._builtinLoaded) return
    for (const s of BUILTIN_STRATEGIES) {
      this._strategies.set(s.id, { ...s, source: 'builtin' })
    }
    this._builtinLoaded = true
  }

  /**
   * 合并运营中心下发的策略（运行时缓存）
   * @param {Array} remoteStrategies
   */
  mergeRemote(remoteStrategies) {
    if (!Array.isArray(remoteStrategies)) return
    for (const s of remoteStrategies) {
      if (!s || !s.id) continue
      this._strategies.set(s.id, { ...s, source: 'remote' })
    }
  }

  /**
   * 获取所有启用的策略列表
   * @returns {Array}
   */
  listEnabled() {
    this.loadBuiltins()
    return Array.from(this._strategies.values()).filter(s => s.enabled !== false)
  }

  /**
   * 获取单个策略
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    this.loadBuiltins()
    return this._strategies.get(id) || null
  }

  /**
   * 按分类筛选策略
   * @param {string} category
   * @returns {Array}
   */
  listByCategory(category) {
    return this.listEnabled().filter(s => s.category === category)
  }

  /**
   * 清空远程策略缓存（重新同步前调用）
   */
  clearRemote() {
    for (const [id, s] of this._strategies) {
      if (s.source === 'remote') this._strategies.delete(id)
    }
  }
}

// ===== 内置策略模板（5 套基础策略）=====

const BUILTIN_STRATEGIES = [
  {
    id: 'strategy-viral-storytelling',
    name: '故事化爆款策略',
    description: '以故事化叙事方式改写文案，制造情感共鸣和悬念，适合 IP 打造和情感类内容',
    version: '1.0.0',
    category: 'viral',
    industry: ['general', 'ip-building', 'lifestyle'],
    purpose: ['engagement', 'follower-growth'],
    tone: ['storytelling', 'emotional'],
    platforms: ['douyin', 'xiaohongshu', 'wechat_mp'],
    enabled: true,
    systemPrompt: '你是一位顶级短视频编剧，擅长用故事化手法抓住观众注意力。你的写作风格：真实、有温度、有态度。禁止使用"首先...其次...最后"、"综上所述"、"值得注意的是"等 AI 套路用语。',
    userPromptTemplate: '请将以下内容改写为故事化文案：\n\n{content}\n\n要求：\n1. 以悬念或冲突开头，3秒内抓住注意力\n2. 中间制造情感转折或认知冲突\n3. 结尾引发共鸣或行动号召\n4. 语气：{tone}\n5. 行业背景：{industry}\n\n{knowledgeContext}',
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 2000 }
  },
  {
    id: 'strategy-ecommerce-convert',
    name: '电商转化策略',
    description: '针对电商场景优化文案，突出卖点、制造紧迫感、引导下单',
    version: '1.0.0',
    category: 'marketing',
    industry: ['ecommerce', 'retail'],
    purpose: ['conversion', 'sales'],
    tone: ['casual', 'persuasive'],
    platforms: ['douyin', 'xiaohongshu', 'wechat_mp'],
    enabled: true,
    systemPrompt: '你是一位顶级电商文案策划，擅长用精准的卖点描述和情感驱动让用户下单。写作风格：口语化、有感染力、不说废话。',
    userPromptTemplate: '请将以下商品/内容改写为电商带货文案：\n\n{content}\n\n要求：\n1. 开头用痛点或场景引发共鸣\n2. 突出3个核心卖点，每个卖点配合使用场景\n3. 制造限时/限量紧迫感\n4. 结尾明确行动号召\n5. 语气：{tone}\n\n{knowledgeContext}',
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 1500 }
  },
  {
    id: 'strategy-douyin-viral',
    name: '抖音爆款口播策略',
    description: '针对抖音短视频口播文案优化，强调黄金3秒、情绪节奏、互动引导',
    version: '1.0.0',
    category: 'platform',
    industry: ['general', 'entertainment'],
    purpose: ['engagement', 'follower-growth'],
    tone: ['casual', 'humorous'],
    platforms: ['douyin'],
    enabled: true,
    systemPrompt: '你是一位抖音千万粉丝博主的文案策划，擅长写高互动、高完播的口播文案。写作风格：口语化、有节奏感、金句频出。',
    userPromptTemplate: '请将以下内容改写为抖音口播文案：\n\n{content}\n\n要求：\n1. 黄金3秒：开头必须有钩子（反常识/悬念/情绪冲突）\n2. 正文每15-20秒一个信息增量或情绪转折\n3. 多用短句，口语化表达\n4. 结尾引导点赞、评论、关注\n5. 添加适当的情绪词和感叹\n\n{knowledgeContext}',
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 800 }
  },
  {
    id: 'strategy-xiaohongshu-种草',
    name: '小红书种草策略',
    description: '针对小红书图文种草文案优化，强调真实体验、视觉化描述、标签策略',
    version: '1.0.0',
    category: 'platform',
    industry: ['ecommerce', 'lifestyle', 'beauty'],
    purpose: ['conversion', 'engagement'],
    tone: ['casual', 'emotional'],
    platforms: ['xiaohongshu'],
    enabled: true,
    systemPrompt: '你是一位小红书万粉博主，擅长写真实、有温度的种草文案。写作风格：像闺蜜安利一样自然，有细节有态度。',
    userPromptTemplate: '请将以下内容改写为小红书种草文案：\n\n{content}\n\n要求：\n1. 以个人真实体验开头（"终于找到了""用了3个月"）\n2. 至少3个使用场景+感受描述\n3. 有对比（之前 vs 现在）\n4. 结尾加3-5个相关标签\n5. 语气自然、不做作，避免过度营销感\n\n{knowledgeContext}',
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 1500 }
  },
  {
    id: 'strategy-knowledge-dry',
    name: '干货知识策略',
    description: '针对知识分享类内容优化，强调逻辑清晰、信息密度高、可操作性',
    version: '1.0.0',
    category: 'viral',
    industry: ['education', 'technology', 'finance'],
    purpose: ['engagement', 'authority-building'],
    tone: ['formal', 'storytelling'],
    platforms: ['wechat_mp', 'bilibili', 'zhihu'],
    enabled: true,
    systemPrompt: '你是一位领域专家和知识博主，擅长将复杂知识讲得通俗易懂。写作风格：逻辑清晰、深入浅出、有洞察力。',
    userPromptTemplate: '请将以下内容改写为干货知识文案：\n\n{content}\n\n要求：\n1. 开头用一个问题或现象引出话题\n2. 正文分2-3个要点，每个要点有理论+案例\n3. 数据或研究支撑每个观点\n4. 结尾给出可操作的建议或思考题\n5. 语气：{tone}\n\n{knowledgeContext}',
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 3000 }
  }
]

module.exports = { StrategyManager, BUILTIN_STRATEGIES }
