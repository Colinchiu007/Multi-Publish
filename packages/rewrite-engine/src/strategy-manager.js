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

  /**
   * 导出单个策略为 JSON 字符串（不含内部 source 字段，保证往返一致）
   * @param {string} id
   * @returns {string}
   */
  exportStrategy(id) {
    this.loadBuiltins()
    const s = this._strategies.get(id)
    if (!s) return null
    return JSON.stringify(this._toExportable(s), null, 2)
  }

  /**
   * 导出所有策略为 JSON 字符串
   * @returns {string} 策略数组的 JSON
   */
  exportAll() {
    this.loadBuiltins()
    const list = Array.from(this._strategies.values()).map(s => this._toExportable(s))
    return JSON.stringify(list, null, 2)
  }

  /**
   * 从 JSON 字符串导入单个策略（覆盖同 ID 的远程策略）
   * @param {string} json
   * @returns {object|null} 导入后的策略，失败返回 null
   */
  importStrategy(json) {
    let data
    try {
      data = typeof json === 'string' ? JSON.parse(json) : json
    } catch (e) {
      return null
    }
    if (!data || typeof data !== 'object' || !data.id) return null
    const merged = { ...data, source: 'remote' }
    this._strategies.set(merged.id, merged)
    return merged
  }

  /**
   * 批量导入策略
   * @param {string|Array} json
   * @returns {Array} 成功导入的策略列表
   */
  importAll(json) {
    let list
    try {
      list = typeof json === 'string' ? JSON.parse(json) : json
    } catch (e) {
      return []
    }
    if (!Array.isArray(list)) return []
    const imported = []
    for (const item of list) {
      const s = this.importStrategy(item)
      if (s) imported.push(s)
    }
    return imported
  }

  /**
   * 添加自定义策略（source='custom'）
   * @param {object} strategy
   * @returns {object|null}
   */
  addCustom(strategy) {
    if (!strategy || typeof strategy !== 'object' || !strategy.id) return null
    const merged = { ...strategy, source: 'custom' }
    this._strategies.set(merged.id, merged)
    return merged
  }

  /**
   * 部分更新策略字段（保留 source）
   * @param {string} id
   * @param {object} partial
   * @returns {object|null}
   */
  update(id, partial) {
    this.loadBuiltins()
    const existing = this._strategies.get(id)
    if (!existing || !partial || typeof partial !== 'object') return null
    const updated = { ...existing, ...partial, id: existing.id, source: existing.source }
    this._strategies.set(id, updated)
    return updated
  }

  /**
   * 删除策略（内置策略只禁用，远程/自定义可删除）
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    this.loadBuiltins()
    const s = this._strategies.get(id)
    if (!s) return false
    if (s.source === 'builtin') {
      this._strategies.set(id, { ...s, enabled: false })
    } else {
      this._strategies.delete(id)
    }
    return true
  }

  /**
   * 启用/禁用策略
   * @param {string} id
   * @param {boolean} enabled
   * @returns {object|null}
   */
  toggle(id, enabled) {
    this.loadBuiltins()
    const s = this._strategies.get(id)
    if (!s) return null
    const updated = { ...s, enabled: enabled !== false }
    this._strategies.set(id, updated)
    return updated
  }

  /**
   * 转换为可导出对象（剔除内部 source 字段）
   * @param {object} s
   * @returns {object}
   */
  _toExportable(s) {
    const { source, ...rest } = s
    return rest
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
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 2000 },
    genre: 'fiction',
    chainOfThought: '请先分析原文的核心观点与情感基调，然后列出改写要点，再生成故事化改写结果，最后自检是否保留了原意。',
    fewShot: [
      { input: '这款产品很好用，推荐大家购买。', output: '第一次用它的时候，我差点以为买错了——结果三天后，我把它安利给了全家。' },
      { input: '坚持健身三个月，身体变好了。', output: '三个月前我连爬三层楼都喘，现在能一口气跑完五公里。改变，从来不是突然发生的。' }
    ],
    metadata: { audience: '情感类内容创作者', bestFor: 'IP 打造、情感共鸣' }
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
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 1500 },
    genre: 'marketing',
    chainOfThought: '请先提炼商品核心卖点与目标人群痛点，再规划卖点呈现顺序，生成带货文案，最后自检是否突出转化意图。',
    fewShot: [
      { input: '这款耳机降噪效果好。', output: '戴上它的那一刻，世界安静了。地铁、办公室、咖啡馆——噪音统统被挡在耳外。' }
    ],
    metadata: { audience: '电商卖家、带货达人', bestFor: '转化、下单引导' }
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
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 800 },
    genre: 'general',
    chainOfThought: '请先设计黄金3秒钩子，再规划口播节奏与情绪转折，生成口播文案，最后自检是否具备完播吸引力。',
    fewShot: [
      { input: '分享一个提升效率的方法。', output: '99%的人不知道，你每天浪费的2小时，其实只要一个动作就能抢回来。' }
    ],
    metadata: { audience: '短视频创作者', bestFor: '抖音口播、高完播' }
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
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 1500 },
    genre: 'marketing',
    chainOfThought: '请先还原真实使用体验与细节，再组织种草结构与标签，生成种草文案，最后自检是否自然不做作。',
    fewShot: [
      { input: '这款面霜保湿效果不错。', output: '用了3个月，我终于找到本命面霜了。秋冬换季再也不怕起皮，妆前打底也服帖。' }
    ],
    metadata: { audience: '小红书博主', bestFor: '种草、真实体验分享' }
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
    postProcess: { removeAITaste: true, sensitiveCheck: true, maxLength: 3000 },
    genre: 'professional',
    chainOfThought: '请先梳理原文知识结构与核心论点，再规划要点与案例支撑，生成干货文案，最后自检是否逻辑清晰、信息准确。',
    fewShot: [
      { input: '介绍什么是复利。', output: '复利，简单说就是利滚利。但真正理解它的人，都明白一个道理：时间才是最大的杠杆。' }
    ],
    metadata: { audience: '知识类创作者、领域专家', bestFor: '知识分享、权威塑造' }
  }
]

module.exports = { StrategyManager, BUILTIN_STRATEGIES }
