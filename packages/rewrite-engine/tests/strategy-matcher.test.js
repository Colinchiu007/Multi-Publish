var { StrategyMatcher } = require("../src/strategy-matcher")
var { BUILTIN_STRATEGIES } = require("../src/strategy-manager")

describe("StrategyMatcher", function() {
  test("should rank strategies by industry match", function() {
    var matcher = new StrategyMatcher({
      userSettings: { industry: "ecommerce" },
      topN: 5
    })
    var ranked = matcher.rank(BUILTIN_STRATEGIES.slice())
    expect(ranked.length).toBe(BUILTIN_STRATEGIES.length)
    expect(ranked[0].id).toBe("strategy-ecommerce-convert")
  })

  test("should rank knowledge strategy top for education+bilibili", function() {
    var matcher = new StrategyMatcher({
      userSettings: { platform: "bilibili", industry: "education" },
      topN: 5
    })
    var ranked = matcher.rank(BUILTIN_STRATEGIES.slice())
    expect(ranked[0].id).toBe("strategy-knowledge-dry")
  })

  test("should return top N recommendations", function() {
    var matcher = new StrategyMatcher({
      userSettings: { industry: "general" },
      topN: 2
    })
    var rec = matcher.recommend(BUILTIN_STRATEGIES.slice())
    expect(rec.length).toBe(2)
  })

  test("should handle empty strategy list", function() {
    var matcher = new StrategyMatcher({ topN: 3 })
    var ranked = matcher.rank([])
    expect(ranked).toEqual([])
  })

  test("should give base score when no settings match", function() {
    var matcher = new StrategyMatcher({
      userSettings: { industry: "no-match", purpose: "no-match", platform: "no-match", tone: "no-match" },
      topN: 5
    })
    var ranked = matcher.rank(BUILTIN_STRATEGIES.slice())
    for (var i = 0; i < ranked.length; i++) {
      expect(ranked[i].score).toBeGreaterThan(0)
    }
  })

  test("should factor in history ratings", function() {
    var matcher = new StrategyMatcher({
      userSettings: { industry: "general" },
      userHistory: { strategyRatings: { "strategy-viral-storytelling": 5 } },
      topN: 5
    })
    var ranked = matcher.rank(BUILTIN_STRATEGIES.slice())
    var rated = ranked.find(function(s) { return s.id === "strategy-viral-storytelling" })
    var unrated = ranked.find(function(s) { return s.id === "strategy-knowledge-dry" })
    expect(rated.score).toBeGreaterThan(unrated.score)
  })
})
