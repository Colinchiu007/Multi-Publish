/**
 * KnowledgeContextBuilder — 三层知识库 Prompt 构建器
 *
 * 组合用户偏好知识库（v2 Ebbinghaus + RRF）+ 爆款库 + 个人知识库，
 * 生成结构化的 {knowledgeContext} 注入改写 Prompt。
 */
class KnowledgeContextBuilder {
  /**
   * @param {object} opts
   * @param {object} opts.knowledgeBase - 原有用户偏好知识库（提供 getContextSummary()）
   * @param {object} [opts.viralLibrary] - 爆款库（提供 search(query, limit): Array）
   * @param {object} [opts.personalKnowledgeBase] - 个人知识库（提供 search(query, limit): Array）
   */
  constructor(opts = {}) {
    this._kb = opts.knowledgeBase || null
    this._viral = opts.viralLibrary || null
    this._personal = opts.personalKnowledgeBase || null
  }

  /**
   * 构建三层融合上下文
   * @param {string} userContent - 用户输入的原文
   * @param {object} [options]
   * @param {boolean} [options.useViralLibrary] - 是否结合爆款库
   * @param {boolean} [options.usePersonalKnowledge] - 是否结合个人经历
   * @returns {string} 合并后的 knowledgeContext
   */
  buildFullContext(userContent, options = {}) {
    const parts = []

    // 第1层：原有用户偏好（始终注入）
    if (this._kb) parts.push(this._kb.getContextSummary())

    // 第2层：爆款风格参考
    if (options.useViralLibrary && this._viral) {
      const vc = this.buildViralContext(userContent)
      if (vc) parts.push(vc)
    }

    // 第3层：个人素材参考
    if (options.usePersonalKnowledge && this._personal) {
      const pc = this.buildPersonalContext(userContent)
      if (pc) parts.push(pc)
    }

    return parts.filter(Boolean).join('\n\n')
  }

  /**
   * 构建爆款风格分析 Prompt Block
   * 从 Top 3 爆款内容中提取：标题模式、开头钩子、高频标签
   */
  buildViralContext(userContent) {
    if (!this._viral) return ''
    const items = this._viral.search(userContent, 3)
    if (!items || !Array.isArray(items) || items.length === 0) return ''

    const titlePatterns = []
    const hookPatterns = []
    const allTags = {}

    for (const item of items) {
      // 标题模式
      const title = (item && item.title) || ''
      if (title) {
        const len = title.length
        const hasQuestion = /[？?]/.test(title)
        const hasExclamation = /[！!]/.test(title)
        const hasDigit = /\d/.test(title)
        let pattern = '标题：' + title.slice(0, 80)
        if (title.length > 80) pattern += '...'
        const features = []
        if (len >= 15 && len <= 35) features.push('15-35字（最佳长度）')
        if (hasQuestion) features.push('含问句')
        if (hasExclamation) features.push('含感叹')
        if (hasDigit) features.push('含数字')
        if (features.length) pattern += ' [' + features.join('、') + ']'
        titlePatterns.push(pattern)
      }

      // 开头钩子（前100字）
      const content = (item && item.content) || ''
      if (content) {
        const first100 = content.slice(0, 100).replace(/[\n\r]+/g, ' ').trim()
        if (first100.length > 20) hookPatterns.push(first100 + (content.length > 100 ? '...' : ''))
      }

      // 收集标签
      let tags = (item && item.tags) || []
      if (typeof tags === 'string') {
        try { tags = JSON.parse(tags) } catch { tags = [tags] }
      }
      if (Array.isArray(tags)) {
        for (const t of tags) {
          if (typeof t === 'string' && t.trim()) {
            const key = t.trim().toLowerCase()
            allTags[key] = (allTags[key] || 0) + 1
          }
        }
      }
    }

    const sortedTags = Object.entries(allTags)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => '#' + k)

    let block = '## 爆款风格参考\n'
    block += '请参考以下爆款内容的风格特征进行改写（参考风格模式，不是复制具体内容）：\n\n'

    if (titlePatterns.length) {
      block += '### 标题模式\n'
      block += titlePatterns.map((p, i) => (i + 1) + '. ' + p).join('\n') + '\n\n'
    }

    if (hookPatterns.length) {
      block += '### 开头钩子参考\n'
      block += hookPatterns.map((p, i) => (i + 1) + '. ' + p).join('\n') + '\n\n'
    }

    if (sortedTags.length) {
      block += '### 热门话题\n' + sortedTags.join(' ') + '\n'
    }

    return block
  }

  /**
   * 构建个人素材 Prompt Block
   * 按类别作用类型分4组：约束型 / 素材型 / 立场型 / 权威型
   */
  buildPersonalContext(userContent) {
    if (!this._personal) return ''
    const items = this._personal.search(userContent, 5)
    if (!items || !Array.isArray(items) || items.length === 0) return ''

    const groups = {
      constraint: [],
      material: [],
      stance: [],
      authority: [],
    }

    const CATEGORY_MAP = {
      personal_ip_persona: 'constraint',
      personal_background: 'material',
      personal_stories: 'material',
      growth_experience: 'material',
      emotional_experience: 'material',
      work_experience: 'authority',
      project_experience: 'authority',
      personal_opinions: 'stance',
      family_stories: 'material',
    }

    for (const item of items) {
      const cat = (item && item.category) || ''
      const group = CATEGORY_MAP[cat] || 'material'
      if (item && item.content) {
        groups[group].push(item.content)
      }
    }

    let block = '## 个人素材参考\n'
    let hasContent = false
    let hasHardConstraint = false

    if (groups.constraint.length) {
      block += '### 人设一致性约束\n改写结果必须符合以下人设特征：\n'
      block += groups.constraint.map(c => '- ' + c).join('\n') + '\n\n'
      hasContent = true
      hasHardConstraint = true
    }

    if (groups.stance.length) {
      block += '### 观点立场\n改写不能违背以下已有观点：\n'
      block += groups.stance.map(s => '- ' + s).join('\n') + '\n\n'
      hasContent = true
      hasHardConstraint = true
    }

    if (groups.authority.length) {
      block += '### 专业背景\n你可以用以下专业背景来提升文章可信度：\n'
      block += groups.authority.map(a => '- ' + a).join('\n') + '\n\n'
      hasContent = true
    }

    if (groups.material.length) {
      block += '### 可引用素材\n以下真实经历可作为改写中的素材引用：\n'
      block += groups.material.map(m => '- ' + m).join('\n') + '\n\n'
      hasContent = true
    }

    if (!hasContent) return ''

    if (hasHardConstraint) {
      block += '⚠️ 重要：以上“人设一致性约束”和“观点立场”必须遵守，不能违背。“专业背景”和“可引用素材”可以灵活运用。\n'
    }

    return block
  }
}

module.exports = { KnowledgeContextBuilder }

