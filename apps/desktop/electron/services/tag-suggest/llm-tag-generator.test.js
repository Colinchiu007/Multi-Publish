// @ts-check
/**
 * llm-tag-generator — 单元测试
 */
const {
  PLATFORM_PERSONALITY,
  SYSTEM_PROMPT,
  buildMessages,
  parseAndValidate,
} = require('./llm-tag-generator')

describe('llm-tag-generator', () => {
  describe('constants', () => {
    it('has personalities for all default platforms', () => {
      expect(PLATFORM_PERSONALITY.zhihu).toBeDefined()
      expect(PLATFORM_PERSONALITY.weibo).toBeDefined()
      expect(PLATFORM_PERSONALITY.xiaohongshu).toBeDefined()
      expect(PLATFORM_PERSONALITY.bilibili).toBeDefined()
      expect(PLATFORM_PERSONALITY.toutiao).toBeDefined()
    })

    it('system prompt contains output rules and JSON schema', () => {
      expect(SYSTEM_PROMPT).toContain('内容标签')
      expect(SYSTEM_PROMPT).toContain('流量标签')
      expect(SYSTEM_PROMPT).toContain('platformPersonality')
      expect(SYSTEM_PROMPT).toContain('platforms')
    })
  })

  describe('buildMessages', () => {
    it('builds system and user messages', () => {
      const msgs = buildMessages({ content: '测试内容', platforms: ['zhihu', 'weibo'] })
      expect(msgs.messages.length).toBe(2)
      expect(msgs.messages[0].role).toBe('system')
      expect(msgs.messages[1].role).toBe('user')
      expect(msgs.messages[1].content).toContain('测试内容')
      expect(msgs.messages[1].content).toContain('zhihu')
      expect(msgs.messages[1].content).toContain('weibo')
      expect(msgs.temperature).toBe(0.5)
      expect(msgs.max_tokens).toBe(800)
    })

    it('injects hot topics reference when provided', () => {
      const msgs = buildMessages({
        content: '内容',
        platforms: ['zhihu'],
        hotTopicsByPlatform: { zhihu: [{ tag: '人工智能', heat: 92 }, { tag: '大模型', heat: 95 }] },
      })
      expect(msgs.messages[1].content).toContain('人工智能')
      expect(msgs.messages[1].content).toContain('大模型')
      expect(msgs.messages[1].content).toContain('当前热门话题参考')
    })

    it('replaces platformPersonality placeholder in system prompt', () => {
      const msgs = buildMessages({ content: '内容', platforms: ['zhihu'] })
      expect(msgs.messages[0].content).not.toContain('{platformPersonality}')
      expect(msgs.messages[0].content).toContain('知乎')
    })
  })

  describe('parseAndValidate', () => {
    it('parses valid JSON output', () => {
      const raw = JSON.stringify({
        platforms: { zhihu: { content: ['人工智能'], traffic: ['大模型'] } },
        reasoning: { contentFocus: 'AI', trafficAngle: '热点' },
      })
      const out = parseAndValidate(raw)
      expect(out.platforms.zhihu.content).toEqual(['人工智能'])
      expect(out.platforms.zhihu.traffic).toEqual(['大模型'])
      expect(out.reasoning.contentFocus).toBe('AI')
    })

    it('strips code fence', () => {
      const raw = '```json\n' + JSON.stringify({ platforms: { zhihu: { content: ['AI'], traffic: [] } } }) + '\n```'
      const out = parseAndValidate(raw)
      expect(out.platforms.zhihu.content).toEqual(['AI'])
    })

    it('throws on empty output', () => {
      expect(() => parseAndValidate('')).toThrow()
    })

    it('throws on invalid JSON', () => {
      expect(() => parseAndValidate('not json')).toThrow()
    })

    it('throws when platforms missing', () => {
      expect(() => parseAndValidate(JSON.stringify({ foo: 1 }))).toThrow()
    })

    it('throws when content is not array', () => {
      const raw = JSON.stringify({ platforms: { zhihu: { content: 'not-array', traffic: [] } } })
      expect(() => parseAndValidate(raw)).toThrow()
    })

    it('throws when tag is not string', () => {
      const raw = JSON.stringify({ platforms: { zhihu: { content: [123], traffic: [] } } })
      expect(() => parseAndValidate(raw)).toThrow()
    })

    it('tolerates missing reasoning (fail-open)', () => {
      const raw = JSON.stringify({ platforms: { zhihu: { content: ['AI'], traffic: [] } } })
      const out = parseAndValidate(raw)
      expect(out.reasoning).toBeNull()
    })

    it('tolerates missing platform block (fail-open)', () => {
      const raw = JSON.stringify({ platforms: { weibo: { content: ['AI'], traffic: [] } } })
      const out = parseAndValidate(raw)
      expect(out.platforms.weibo).toBeDefined()
    })

    it('throws when no valid platform tags', () => {
      expect(() => parseAndValidate(JSON.stringify({ platforms: {} }))).toThrow()
    })
  })
})
