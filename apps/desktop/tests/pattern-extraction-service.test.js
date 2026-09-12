/**
 * PatternExtractionService 测试 — LLM 提取 / 解析容错 / 失败降级 / 队列驱动
 */
var path = require('path')

describe('PatternExtractionService', function () {
  var svc
  var llmCalls

  function makeLlm(response) {
    llmCalls = 0
    return {
      generateWithDefault: async function () {
        llmCalls++
        if (typeof response === 'function') return response()
        return { content: response }
      },
    }
  }

  beforeEach(function () {
    var PatternExtractionService = require(path.resolve(__dirname, '../electron/services/pattern-extraction-service'))
    svc = new PatternExtractionService({
      aiGenerator: makeLlm('{"hook_type":"suspense","hook_analysis":"悬念开头引人入胜","emotion_curve":"rise_fall","narrative_structure":"problem_solution","cta_style":"question","golden_quotes":["金句一","金句二","金句三","金句四"],"title_formula":"{年龄}{事件}后我才明白{道理}"}'),
      store: {
        listPendingPatternCards: function () {
          return [{ viral_item_id: 'v1', attempts: 0, status: 'pending' }]
        },
        getViralItem: function () {
          return { id: 'v1', title: '30岁裸辞后我才明白职场真相', content: '正文内容'.repeat(50), platform: 'xiaohongshu' }
        },
        updatePatternCard: function (id, updates) {
          svc._lastUpdate = { id: id, updates: updates }
          return true
        },
        recordPatternAttempt: function (id, err) {
          svc._lastAttempt = { id: id, err: err }
          return true
        },
      },
    })
  })

  test('成功提取：解析 JSON 并写入卡片', async function () {
    await svc.processQueue()
    expect(llmCalls).toBe(1)
    expect(svc._lastUpdate.id).toBe('v1')
    expect(svc._lastUpdate.updates.status).toBe('done')
    expect(svc._lastUpdate.updates.hook_type).toBe('suspense')
    // 金句截断至 3 条
    expect(svc._lastUpdate.updates.golden_quotes.length).toBe(3)
    expect(svc._lastUpdate.updates.title_formula).toContain('{年龄}')
  })

  test('代码围栏剥离', async function () {
    svc._aiGenerator = makeLlm('```json\n{"hook_type":"conflict","golden_quotes":[],"title_formula":""}\n```')
    await svc.processQueue()
    expect(svc._lastUpdate.updates.hook_type).toBe('conflict')
  })

  test('非法枚举落 other/空', async function () {
    svc._aiGenerator = makeLlm('{"hook_type":"不存在的枚举","emotion_curve":"invalid","narrative_structure":"bad","cta_style":"wrong"}')
    await svc.processQueue()
    expect(svc._lastUpdate.updates.hook_type).toBe('other')
    expect(svc._lastUpdate.updates.emotion_curve).toBe('')
  })

  test('公式无占位符回退原标题', async function () {
    svc._aiGenerator = makeLlm('{"hook_type":"story","title_formula":"没有占位符的公式"}')
    await svc.processQueue()
    expect(svc._lastUpdate.updates.title_formula).toBe('30岁裸辞后我才明白职场真相')
  })

  test('LLM 异常：记录 attempt 不写卡片', async function () {
    svc._aiGenerator = makeLlm(function () { throw new Error('LLM down') })
    await svc.processQueue()
    expect(svc._lastAttempt.err).toContain('LLM down')
    expect(svc._lastUpdate).toBeUndefined()
  })

  test('非法 JSON：记录 attempt', async function () {
    svc._aiGenerator = makeLlm('not json')
    await svc.processQueue()
    expect(svc._lastAttempt).toBeDefined()
  })

  test('空队列：不调 LLM', async function () {
    svc._store.listPendingPatternCards = function () { return [] }
    await svc.processQueue()
    expect(llmCalls).toBe(0)
  })
})
