// @ts-check
/**
 * calibrator — 单元测试
 */
const {
  BONUS,
  UNVERIFIED_WITH_REASONING_HEAT,
  levenshtein,
  fuzzyMatch,
  calibrate,
  fillFromHotTopics,
} = require('./calibrator')

function makeTopic (tag, heat, extra) {
  extra = extra || {}
  return { tag, heat, category: extra.category || '科技', trend: extra.trend || 'stable', aliases: extra.aliases || [], subTopics: extra.subTopics || [] }
}

describe('calibrator', () => {
  describe('levenshtein', () => {
    it('computes edit distance', () => {
      expect(levenshtein('kitten', 'sitting')).toBe(3)
      expect(levenshtein('abc', 'abc')).toBe(0)
      expect(levenshtein('', 'abc')).toBe(3)
    })
  })

  describe('calibrate', () => {
    it('exact match gets +20 bonus and is matched', () => {
      const hot = [makeTopic('人工智能', 92)]
      const res = calibrate({ content: ['深度学习'], traffic: ['人工智能'], hotTopics: hot, hasReasoning: true })
      expect(res.traffic.length).toBe(1)
      expect(res.traffic[0].tag).toBe('人工智能')
      expect(res.traffic[0].heat).toBe(92 + BONUS.exact)
      expect(res.traffic[0].matched).toBe(true)
      expect(res.traffic[0].matchType).toBe('exact')
    })

    it('alias match replaces with canonical tag', () => {
      const hot = [makeTopic('人工智能', 90, { aliases: ['AI'] })]
      const res = calibrate({ content: [], traffic: ['AI'], hotTopics: hot, hasReasoning: true })
      expect(res.traffic[0].tag).toBe('人工智能')
      expect(res.traffic[0].matchType).toBe('alias')
      expect(res.traffic[0].heat).toBe(90 + BONUS.alias)
    })

    it('subtopic match replaces with parent topic', () => {
      const hot = [makeTopic('大模型', 95, { subTopics: ['GPT'] })]
      const res = calibrate({ content: [], traffic: ['GPT'], hotTopics: hot, hasReasoning: true })
      expect(res.traffic[0].tag).toBe('大模型')
      expect(res.traffic[0].matchType).toBe('subtopic')
    })

    it('fuzzy match within edit distance 2', () => {
      const hot = [makeTopic('人工智能', 80)]
      const res = calibrate({ content: [], traffic: ['人工智'], hotTopics: hot, hasReasoning: true })
      expect(res.traffic[0].matchType).toBe('fuzzy')
      expect(res.traffic[0].heat).toBe(80 + BONUS.fuzzy)
    })

    it('unverified with reasoning keeps tag at fixed heat', () => {
      const res = calibrate({ content: [], traffic: ['完全不存在的话题'], hotTopics: [], hasReasoning: true })
      expect(res.traffic.length).toBe(1)
      expect(res.traffic[0].matched).toBe(false)
      expect(res.traffic[0].heat).toBe(UNVERIFIED_WITH_REASONING_HEAT)
    })

    it('unverified without reasoning drops the tag', () => {
      const res = calibrate({ content: [], traffic: ['完全不存在的话题'], hotTopics: [], hasReasoning: false })
      expect(res.traffic.length).toBe(0)
    })

    it('sorts matched first then by heat desc', () => {
      const hot = [makeTopic('低热', 60), makeTopic('高热', 95)]
      const res = calibrate({ content: [], traffic: ['低热', '高热'], hotTopics: hot, hasReasoning: false })
      expect(res.traffic[0].tag).toBe('高热')
      expect(res.traffic[1].tag).toBe('低热')
    })

    it('skips traffic tag duplicating a content tag', () => {
      const hot = [makeTopic('人工智能', 92)]
      const res = calibrate({ content: ['人工智能'], traffic: ['人工智能'], hotTopics: hot, hasReasoning: true })
      expect(res.traffic.length).toBe(0)
    })

    it('records matchedTopics', () => {
      const hot = [makeTopic('人工智能', 92)]
      const res = calibrate({ content: [], traffic: ['人工智能'], hotTopics: hot, hasReasoning: true })
      expect(res.matchedTopics).toEqual([{ tag: '人工智能', heat: 92 }])
    })
  })

  describe('fillFromHotTopics', () => {
    it('fills by heat desc excluding given tags', () => {
      const hot = [makeTopic('A', 90), makeTopic('B', 80), makeTopic('C', 70)]
      const out = fillFromHotTopics(hot, 2, ['A'])
      expect(out.map(t => t.tag)).toEqual(['B', 'C'])
    })

    it('respects count limit', () => {
      const hot = [makeTopic('A', 90), makeTopic('B', 80)]
      const out = fillFromHotTopics(hot, 1, [])
      expect(out.length).toBe(1)
    })
  })
})
