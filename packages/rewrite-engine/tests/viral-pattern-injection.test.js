/**
 * 模式卡片聚合风格指导注入测试
 *
 * Coverage:
 * - 有 done 卡片时注入聚合风格指导（钩子/情绪/叙事/CTA/金句/标题公式）
 * - 部分卡片缺失时混合（有卡用卡，无卡回退浅层特征）
 * - 全部缺失时回退浅层（P0 行为兜底）
 */
var { KnowledgeContextBuilder } = require('../src/knowledge-context-builder')

function makeItem(id, title, content, tags) {
  return { id: id, title: title, content: content, tags: tags || '[]' }
}

function makeCard(overrides) {
  return Object.assign({
    viral_item_id: 'v1', status: 'done',
    hook_type: 'suspense', hook_analysis: '制造信息差引发好奇',
    emotion_curve: 'rise_fall', narrative_structure: 'problem_solution',
    cta_style: 'question', golden_quotes: ['真正的竞争力不是能力，是信任。'],
    title_formula: '{年龄}{事件}后我才明白{道理}',
  }, overrides || {})
}

describe('viral pattern injection', function () {
  test('有 done 卡片时注入聚合风格指导', async function () {
    var items = [makeItem('v1', '30岁裸辞后我才明白', '正文'.repeat(30))]
    var cards = { v1: makeCard() }
    var builder = new KnowledgeContextBuilder({
      viralLibrary: { search: function () { return items } },
      patternCards: { get: function (id) { return cards[id] || null } },
    })
    var ctx = await builder.buildFullContext('裸辞后我才明白职场真相', { useViralLibrary: true })
    expect(ctx).toContain('爆款风格指导')
    expect(ctx).toContain('悬念')
    expect(ctx).toContain('{年龄}{事件}后我才明白{道理}')
    expect(ctx).toContain('真正的竞争力不是能力，是信任。')
    expect(ctx).toContain('先扬后抑')
  })

  test('部分卡片缺失时混合注入', async function () {
    var items = [
      makeItem('v1', '30岁裸辞后我才明白', '正文内容'.repeat(20)),
      makeItem('v2', '职场晋升的真相', '其他正文内容'.repeat(20)),
    ]
    var cards = { v1: makeCard() } // v2 无卡片
    var builder = new KnowledgeContextBuilder({
      viralLibrary: { search: function () { return items } },
      patternCards: { get: function (id) { return cards[id] || null } },
    })
    var ctx = await builder.buildFullContext('裸辞 职场晋升', { useViralLibrary: true })
    // 有卡的注入风格指导，无卡的回退浅层（标题模式）
    expect(ctx).toContain('爆款风格指导')
    expect(ctx).toContain('标题模式')
  })

  test('全部卡片缺失时回退浅层特征', async function () {
    var items = [makeItem('v1', '30岁裸辞后我才明白', '正文内容'.repeat(20))]
    var builder = new KnowledgeContextBuilder({
      viralLibrary: { search: function () { return items } },
      patternCards: { get: function () { return null } },
    })
    var ctx = await builder.buildFullContext('裸辞后我才明白', { useViralLibrary: true })
    expect(ctx).toContain('标题模式')
    expect(ctx).not.toContain('爆款风格指导')
  })

  test('failed 卡片视为缺失（回退浅层）', async function () {
    var items = [makeItem('v1', '30岁裸辞后我才明白', '正文内容'.repeat(20))]
    var builder = new KnowledgeContextBuilder({
      viralLibrary: { search: function () { return items } },
      patternCards: { get: function () { return makeCard({ status: 'failed' }) } },
    })
    var ctx = await builder.buildFullContext('裸辞后我才明白', { useViralLibrary: true })
    expect(ctx).toContain('标题模式')
    expect(ctx).not.toContain('爆款风格指导')
  })
})
