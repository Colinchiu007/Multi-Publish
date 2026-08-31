// @ts-check
/**
 * tag-suggest/index — 编排入口集成测试
 */
const { suggestTagsWithLLM, isLlmAvailable } = require('./index')

function makeAiGenerator (content) {
  return {
    generateWithDefault: async (type, params) => {
      if (type !== 'llm') throw new Error('unsupported type')
      return { content }
    },
  }
}

function llmJson (platforms) {
  return JSON.stringify({ platforms, reasoning: { contentFocus: 'AI', trafficAngle: '热点' } })
}

describe('tag-suggest/index', () => {
  describe('isLlmAvailable', () => {
    it('detects usable aiGenerator', () => {
      expect(isLlmAvailable({ generateWithDefault: () => {} })).toBe(true)
      expect(isLlmAvailable(null)).toBe(false)
      expect(isLlmAvailable({})).toBe(false)
    })
  })

  describe('suggestTagsWithLLM', () => {
    it('returns llm source with calibrated traffic tags', async () => {
      const ai = makeAiGenerator(llmJson({
        zhihu: { content: ['人工智能', '深度学习'], traffic: ['大模型'] },
        weibo: { content: ['人工智能'], traffic: ['AI新突破'] },
      }))
      const res = await suggestTagsWithLLM({ content: '人工智能 深度学习 大模型', platforms: ['zhihu', 'weibo'], aiGenerator: ai })
      expect(res.source).toBe('llm')
      expect(res.byPlatform.zhihu).toBeDefined()
      expect(res.byPlatform.weibo).toBeDefined()
      expect(res.byPlatformDetail.zhihu.content).toContain('人工智能')
      expect(res.byPlatformDetail.weibo.content[0].startsWith('#')).toBe(true)
      expect(res.byPlatformDetail.weibo.traffic[0].startsWith('#')).toBe(true)
    })

    it('falls back to extractor when LLM throws', async () => {
      const ai = { generateWithDefault: async () => { throw new Error('LLM down') } }
      const res = await suggestTagsWithLLM({ content: '人工智能 深度学习 大模型', platforms: ['zhihu'], aiGenerator: ai })
      expect(res.source).toBe('extractor')
      expect(res.calibrated).toBe(false)
      expect(res.byPlatform.zhihu).toBeDefined()
    })

    it('falls back to extractor on invalid JSON', async () => {
      const ai = makeAiGenerator('not json at all')
      const res = await suggestTagsWithLLM({ content: '人工智能 深度学习', platforms: ['zhihu'], aiGenerator: ai })
      expect(res.source).toBe('extractor')
    })

    it('falls back to extractor on empty content', async () => {
      const ai = makeAiGenerator(llmJson({ zhihu: { content: ['AI'], traffic: [] } }))
      const res = await suggestTagsWithLLM({ content: '', platforms: ['zhihu'], aiGenerator: ai })
      expect(res.source).toBe('extractor')
      expect(res.byPlatform.zhihu).toEqual([])
    })

    it('fills traffic from hot topics when LLM traffic unverified without reasoning', async () => {
      const ai = makeAiGenerator(llmJson({
        zhihu: { content: ['人工智能'], traffic: ['完全不存在的话题'] },
      }))
      const res = await suggestTagsWithLLM({ content: '人工智能 深度学习', platforms: ['zhihu'], aiGenerator: ai })
      // 无 reasoning 时未验证流量标签丢弃，从热门库补充
      expect(res.byPlatformDetail.zhihu.traffic.length).toBeGreaterThan(0)
    })

    it('produces matchedTopics for calibrated traffic', async () => {
      const ai = makeAiGenerator(llmJson({
        zhihu: { content: ['深度学习'], traffic: ['人工智能'] },
      }))
      const res = await suggestTagsWithLLM({ content: '人工智能 深度学习', platforms: ['zhihu'], aiGenerator: ai })
      expect(res.matchedTopics.zhihu.length).toBeGreaterThan(0)
      expect(res.matchedTopics.zhihu[0].heat).toBeDefined()
    })
  })
})
