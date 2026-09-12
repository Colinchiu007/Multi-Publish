/**
 * KnowledgeContextBuilder async 化回归测试
 *
 * Coverage:
 * - buildFullContext 返回 Promise（async 化）
 * - llmKeywords 兜底：规则关键词 < 2 个时触发
 * - 规则关键词 >= 2 时不触发 LLM
 * - 未勾选不检索
 * - 检索为空不注入
 */
var { KnowledgeContextBuilder } = require('../src/knowledge-context-builder')

describe('KnowledgeContextBuilder async', function () {
  function makeBuilder(opts) {
    return new KnowledgeContextBuilder(Object.assign({
      knowledgeBase: { getContextSummary: function () { return '## 用户偏好\n偏好内容' } },
      viralLibrary: { search: function (q, n) { return [{ id: 'v1', title: '标题', content: '内容内容内容内容内容内容内容内容内容内容内容内容内容', tags: '["tag1"]' }] } },
      personalKnowledgeBase: { search: function (q, n) { return [] } },
    }, opts || {}))
  }

  test('buildFullContext 返回 Promise', function () {
    var builder = makeBuilder()
    var p = builder.buildFullContext('测试内容', {})
    expect(p && typeof p.then === 'function').toBe(true)
    return p.then(function (ctx) {
      expect(typeof ctx).toBe('string')
    })
  })

  test('规则关键词充足时不触发 LLM 兜底', async function () {
    var llmCalled = false
    var builder = makeBuilder({
      llmKeywords: async function () { llmCalled = true; return ['llm词'] },
    })
    await builder.buildFullContext('自媒体运营的核心是内容质量，内容质量决定自媒体账号天花板。', { useViralLibrary: true })
    expect(llmCalled).toBe(false)
  })

  test('规则关键词不足时触发 LLM 兜底', async function () {
    var llmCalled = false
    var builder = makeBuilder({
      llmKeywords: async function () { llmCalled = true; return ['llm关键词'] },
      viralLibrary: {
        search: function (q, n) {
          // LLM 兜底后应使用 LLM 关键词重新检索
          expect(Array.isArray(q) ? q.join(',') : q).toContain('llm关键词')
          return [{ id: 'v1', title: '标题', content: '内容内容内容内容内容内容内容内容内容内容内容内容内容', tags: '[]' }]
        },
      },
    })
    var ctx = await builder.buildFullContext('的 了', { useViralLibrary: true })
    expect(llmCalled).toBe(true)
    expect(ctx).toContain('用户偏好')
  })

  test('未勾选 useViralLibrary 时不检索爆款库', async function () {
    var searchCalled = false
    var builder = makeBuilder({
      viralLibrary: { search: function () { searchCalled = true; return [] } },
    })
    await builder.buildFullContext('自媒体内容质量测试', {})
    expect(searchCalled).toBe(false)
  })

  test('检索为空时爆款块不注入', async function () {
    var builder = makeBuilder({
      viralLibrary: { search: function () { return [] } },
    })
    var ctx = await builder.buildFullContext('自媒体内容质量测试', { useViralLibrary: true })
    expect(ctx).not.toContain('爆款')
  })

  test('touchedItems 在 async 构建后仍可读取', async function () {
    var builder = makeBuilder()
    await builder.buildFullContext('自媒体内容质量运营策略测试', { useViralLibrary: true })
    var touched = builder.getTouchedItems()
    expect(Array.isArray(touched)).toBe(true)
    expect(touched.length).toBeGreaterThan(0)
    expect(touched[0].table).toBe('viral_library')
  })

// ===== 审查修复回归：未勾选知识库时零 LLM 调用 =====

describe('KnowledgeContextBuilder 审查修复回归', function () {
  test('两个开关都关闭时不触发 LLM 兜底（零 LLM 调用）', async function () {
    var llmCalled = false
    var builder = makeBuilder({
      llmKeywords: async function () { llmCalled = true; return ['x'] },
    })
    await builder.buildFullContext('的', {}) // 短文本本会触发兜底，但开关全关
    expect(llmCalled).toBe(false)
  })

  test('关键词数组直传 search（不再 join 成字符串）', async function () {
    var receivedQuery = null
    var builder = makeBuilder({
      viralLibrary: {
        search: function (q, n) {
          receivedQuery = q
          return [{ id: 'v1', title: '标题', content: '内容'.repeat(30), tags: '[]' }]
        },
      },
    })
    await builder.buildFullContext('自媒体运营内容质量', { useViralLibrary: true })
    expect(Array.isArray(receivedQuery)).toBe(true)
    expect(receivedQuery.length).toBeGreaterThan(0)
  })

  test('规则提取 1 个关键词即跳过 LLM（阈值 >= 1）', async function () {
    var llmCalled = false
    var builder = makeBuilder({
      llmKeywords: async function () { llmCalled = true; return ['llm词'] },
    })
    await builder.buildFullContext('自媒体', { useViralLibrary: true }) // 规则可提取「自媒体」
    expect(llmCalled).toBe(false)
  })
})

})
