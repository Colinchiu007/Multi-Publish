/**
 * RequirementsVerifier - 需求验证器
 *
 * Multi-strategy matching:
 * 1. Direct substring (normalized)
 * 2. Keyword overlap
 * 3. Chinese-English synonym groups
 *
 * Match scores 0-1. Threshold 0.5 means at least half-relevant match.
 *
 * Usage:
 *   const { RequirementsVerifier } = require("@multi-publish/ai-autonomous-tester");
 *   const verifier = new RequirementsVerifier();
 *   const result = await verifier.verify("./PRD.md", { srcDir: "./src" });
 */

const { PRDParser } = require("../parsers/prd-parser");
const { FeatureDetector } = require("../detectors/feature-detector");

const SYNONYM_GROUPS = [
  ["账号", "账户", "account"],
  ["发布", "publish"],
  ["创建", "创作", "create"],
  ["视频", "video", "remotion"],
  ["采集", "收集", "collection"],
  ["评论", "comment"],
  ["数据", "data", "analytics"],
  ["智能", "ai", "intelligence"],
  ["云端", "cloud"],
  ["批量", "batch"],
  ["定时", "schedule"],
  ["监控", "monitor"],
  ["首页", "home", "dashboard"],
  ["登录", "login", "auth"],
  ["设置", "settings"],
  ["搜索", "search"],
  ["导出", "export"],
  ["导入", "import"],
  ["删除", "delete"],
  ["编辑", "edit"],
  ["添加", "add"],
  ["列表", "list"],
  ["详情", "detail"],
  ["分析", "analysis"],
  ["热门", "热搜", "viral", "hot", "trending"],
  ["关键词", "关键字", "keyword"],
  ["日历", "calendar"],
  ["流水线", "流水线", "pipeline"],
  ["管道", "pipeline", "channel"],
  ["配置", "config", "configure", "settings"],
  ["压缩", "compress", "compression"],
];

class RequirementsVerifier {
  constructor(options = {}) {
    this.prdParser = options.prdParser || new PRDParser();
    this.featureDetector = options.featureDetector || new FeatureDetector(options);
    this.threshold = options.threshold || 0.5;
  }

  async verify(prdPath, appContext = {}) {
    const prdFeatures = await this.prdParser.parse(prdPath);
    const implementedFeatures = await this.featureDetector.detect();

    const covered = [];
    const uncovered = [];

    for (const prdFeature of prdFeatures) {
      const match = this._findBestMatch(prdFeature.name, implementedFeatures);

      if (match) {
        covered.push({ prdFeature, implemented: match, status: "COVERED" });
      } else {
        uncovered.push({
          prdFeature,
          status: "NOT_IMPLEMENTED",
          effort: this.estimateEffort(prdFeature),
        });
      }
    }

    const coverageRate = prdFeatures.length > 0
      ? covered.length / prdFeatures.length
      : 1;

    return {
      covered,
      uncovered,
      conflicts: [],
      coverageRate,
      totalPrdFeatures: prdFeatures.length,
      totalImplementedFeatures: implementedFeatures.length,
    };
  }

  _findBestMatch(prdName, implementedFeatures) {
    let best = null;
    let bestScore = 0;

    for (const impl of implementedFeatures) {
      const score = this.matchScore(prdName, impl.name);
      if (score > bestScore) {
        bestScore = score;
        best = impl;
      }
    }

    return bestScore >= this.threshold ? { match: best, score: bestScore } : null;
  }

  /**
   * Match score 0-1 between PRD feature name and impl feature name
   */
  matchScore(prdName, implName) {
    if (!prdName || !implName) return 0;

    const a = this._normalize(prdName);
    const b = this._normalize(implName);

    // Strategy 1: exact / substring
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;

    // Strategy 2: token overlap
    const kwA = this._keywords(a);
    const kwB = this._keywords(b);
    if (kwA.length > 0 && kwB.length > 0) {
      const overlap = kwA.filter(k => kwB.includes(k)).length;
      const total = Math.max(kwA.length, kwB.length);
      const tokenScore = overlap / total;
      if (tokenScore >= 0.5) return 0.5 + tokenScore * 0.35;
    }

    // Strategy 3: synonym group overlap
    const synScore = this._synonymScore(a, b);
    if (synScore > 0) {
      // synonym score is 0-1; convert to 0.4-0.7 range
      return 0.4 + synScore * 0.3;
    }

    return 0;
  }

  isMatch(prdName, implName) {
    return this.matchScore(prdName, implName) >= this.threshold;
  }

  _normalize(s) {
    return (s || "")
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  _keywords(s) {
    const normalized = this._normalize(s);
    if (!normalized) return [];

    const tokens = [];
    const chineseMatches = normalized.match(/[\u4e00-\u9fa5]/g);
    if (chineseMatches) tokens.push(...chineseMatches);

    const englishMatches = normalized.match(/[a-z]+/g);
    if (englishMatches) tokens.push(...englishMatches);

    return [...new Set(tokens)];
  }

  _synonymScore(a, b) {
    const tokensA = new Set(this._keywords(a));
    const tokensB = new Set(this._keywords(b));

    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    const groupsA = new Set();
    for (const t of tokensA) {
      for (const group of SYNONYM_GROUPS) {
        if (group.some(w => w.toLowerCase() === t)) {
          group.forEach(w => groupsA.add(w.toLowerCase()));
        }
      }
    }

    const groupsB = new Set();
    for (const t of tokensB) {
      for (const group of SYNONYM_GROUPS) {
        if (group.some(w => w.toLowerCase() === t)) {
          group.forEach(w => groupsB.add(w.toLowerCase()));
        }
      }
    }

    const intersection = [...groupsA].filter(x => groupsB.has(x)).length;
    const union = new Set([...groupsA, ...groupsB]).size;

    if (union === 0) return 0;
    return intersection / union;
  }

  estimateEffort(feature) {
    const simpleKeywords = ["显示", "展示", "提示", "按钮", "show", "display"];
    const complexKeywords = ["导入", "导出", "批量", "自动化", "import", "export", "batch"];

    const name = (feature.name || "").toLowerCase();
    if (complexKeywords.some(k => name.includes(k.toLowerCase()))) return "HIGH";
    if (simpleKeywords.some(k => name.includes(k.toLowerCase()))) return "LOW";
    return "MEDIUM";
  }
}

module.exports = { RequirementsVerifier };
