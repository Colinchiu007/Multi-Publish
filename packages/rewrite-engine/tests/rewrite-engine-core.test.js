/**
 * RewriteEngine.rewrite() regression test.
 */
var { RewriteEngine } = require("../src/rewrite-engine-core")
var { RewriteQualityEvaluator } = require("../src/rewrite-quality-evaluator")

var VALID_CONTENT = "原文内容：这是一段用于测试改写引擎的原始文本，长度需要超过二十个字符以保证校验通过。"

describe("RewriteEngine.rewrite() quality integration", function() {
  test("returns success and a full quality object without throwing", async function() {
    var engine = new RewriteEngine({
      llmClient: { chat: function () { return Promise.resolve("改写后的内容：这是一段足够长的、用于验证改写流程质量评估集成是否正常工作的示例文本。") } },
      sensitiveFilter: { detect: function () { return { hits: [] } } },
      qualityEvaluator: new RewriteQualityEvaluator(),
    })
    var r = await engine.rewrite({ mode: "imitate", content: VALID_CONTENT })
    expect(r.success).toBe(true)
    expect(r).toHaveProperty("quality")
    expect(r.quality).not.toBeNull()
    expect(typeof r.quality).toBe("object")
    expect(r.quality).toHaveProperty("sufficiency")
    expect(r.quality).toHaveProperty("semanticPreservation")
    expect(r.quality).toHaveProperty("originality")
    expect(r.quality).toHaveProperty("simhashDistance")
    expect(r.quality).toHaveProperty("verdict")
    expect(r.quality).toHaveProperty("suggestions")
    expect(r.quality).toHaveProperty("method")
  })

  test("quality dimensions are valid numeric ranges", async function() {
    var engine = new RewriteEngine({
      llmClient: { chat: function () { return Promise.resolve("改写后的内容：这是一段足够长的、用于验证改写流程质量评估集成是否正常工作的示例文本。") } },
      sensitiveFilter: { detect: function () { return { hits: [] } } },
      qualityEvaluator: new RewriteQualityEvaluator(),
    })
    var r = await engine.rewrite({ mode: "imitate", content: VALID_CONTENT })
    var q = r.quality
    expect(q.sufficiency).toBeGreaterThanOrEqual(0)
    expect(q.sufficiency).toBeLessThanOrEqual(100)
    expect(q.semanticPreservation).toBeGreaterThanOrEqual(0)
    expect(q.semanticPreservation).toBeLessThanOrEqual(100)
    expect(q.originality).toBeGreaterThanOrEqual(0)
    expect(q.originality).toBeLessThanOrEqual(100)
    expect(["pass", "warn", "fail"]).toContain(q.verdict)
    expect(Array.isArray(q.suggestions)).toBe(true)
  })

  test("no llm client fails closed with NO_LLM_CLIENT", async function() {
    var engine = new RewriteEngine({
      llmClient: null,
      sensitiveFilter: { detect: function () { return { hits: [] } } },
    })
    var r = await engine.rewrite({ mode: "imitate", content: VALID_CONTENT })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe("NO_LLM_CLIENT")
  })

  test("empty content fails closed with EMPTY_CONTENT", async function() {
    var engine = new RewriteEngine({
      llmClient: { chat: function () { return Promise.resolve("x") } },
      sensitiveFilter: { detect: function () { return { hits: [] } } },
    })
    var r = await engine.rewrite({ mode: "imitate", content: "" })
    expect(r.success).toBe(false)
    expect(r.errorCode).toBe("EMPTY_CONTENT")
  })
})
