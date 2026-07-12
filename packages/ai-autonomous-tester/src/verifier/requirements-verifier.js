/**
 * RequirementsVerifier - 需求验证器（事实采集器）
 *
 * 重要：此模块不进行 PRD-vs-代码匹配判断
 * 那是语义推理任务，应该由 Agent 用 LLM 完成。
 *
 * 本模块只做事实采集：
 * 1. 从 PRD 提取需求条目（fact extraction）
 * 2. 从代码提取功能点（fact extraction）
 * 3. 把两边的"事实"交给 Agent，由 Agent 决定：
 *    - 哪些需求已实现？
 *    - 哪些需求缺失？
 *    - 缺失的工作量如何？
 *
 * 使用方式:
 *   const verifier = new RequirementsVerifier();
 *   const facts = await verifier.collectFacts({
 *     prdPath: "./PRD.md",
 *     srcDir: "./src"
 *   });
 *   // facts 包含 prdItems + implItems + evidence
 *   // 把 facts 交给 Agent，由 Agent 判断 coverage
 *
 *   // 或者使用辅助方法让 Agent 自己调用 LLM:
 *   const coverage = await verifier.assessCoverage(facts, llmFn);
 *   // llmFn 签名: async (prompt) => string (LLM 输出 JSON)
 */

const { PRDParser } = require("../parsers/prd-parser");
const { FeatureDetector } = require("../detectors/feature-detector");

class RequirementsVerifier {
  constructor(options = {}) {
    this.prdParser = options.prdParser || new PRDParser();
    this.featureDetector = options.featureDetector || new FeatureDetector(options);
  }

  /**
   * 采集双方事实，不做匹配判断
   */
  async collectFacts(context = {}) {
    const prdItems = context.prdPath
      ? await this.prdParser.parse(context.prdPath)
      : [];

    const implItems = await this.featureDetector.detect();

    // 提取证据：每条实现功能的相关文件路径，便于 Agent 进一步阅读
    const evidence = implItems.map(f => ({
      feature: f.name,
      type: f.type,
      file: f.file,
      routeName: f.routeName,
      path: f.path,
      testid: f.testid,
    }));

    return {
      prdItems,
      implItems,
      evidence,
      summary: {
        prdCount: prdItems.length,
        implCount: implItems.length,
      },
    };
  }

  /**
   * 让 Agent 主导判断（接收 LLM 函数）
   *
   * @param {Object} facts - collectFacts 的输出
   * @param {Function} llmFn - async (prompt) => string
   * @returns {Object} coverage result
   */
  async assessCoverage(facts, llmFn) {
    const prompt = buildCoveragePrompt(facts);
    const llmOutput = await llmFn(prompt);
    return parseLlmCoverage(llmOutput, facts);
  }

  /**
   * 向后兼容：保留旧 API，但明确标记为 deprecated
   * @deprecated Use collectFacts() + assessCoverage() instead
   */
  async verify(prdPath, appContext = {}) {
    const facts = await this.collectFacts({ ...appContext, prdPath });
    const covered = [];
    const uncovered = [];

    for (const prd of facts.prdItems) {
      const match = this._keywordFallback(prd.name, facts.implItems);
      if (match) {
        covered.push({ prdFeature: prd, implemented: match, status: "COVERED" });
      } else {
        uncovered.push({
          prdFeature: prd,
          status: "NOT_IMPLEMENTED",
          effort: this._estimateEffort(prd.name),
        });
      }
    }

    const coverageRate = facts.prdItems.length > 0
      ? covered.length / facts.prdItems.length
      : 1;

    return {
      covered,
      uncovered,
      coverageRate,
      totalPrdFeatures: facts.prdItems.length,
      totalImplementedFeatures: facts.implItems.length,
      _deprecated: "Use collectFacts() + assessCoverage() for accurate LLM-driven coverage.",
      _facts: facts,
    };
  }

  /**
   * 简单的关键字兜底匹配（仅作为占位符，真实匹配由 Agent 完成）
   */
  _keywordFallback(prdName, implItems) {
    const tokens = this._keywords(prdName);
    if (tokens.length === 0) return null;

    let best = null;
    let bestScore = 0;

    for (const impl of implItems) {
      const implTokens = this._keywords(impl.name);
      const overlap = tokens.filter(t => implTokens.includes(t)).length;
      const score = overlap / Math.max(tokens.length, implTokens.length, 1);
      if (score > bestScore) {
        bestScore = score;
        best = impl;
      }
    }

    return bestScore >= 0.6 ? best : null;
  }

  _keywords(s) {
    if (!s) return [];
    return [...new Set([
      ...(s.match(/[\u4e00-\u9fa5]/g) || []),
      ...(s.toLowerCase().match(/[a-z]+/g) || []),
    ])];
  }

  _estimateEffort(featureName) {
    const s = (featureName || "").toLowerCase();
    if (/(import|export|批量|batch|自动化|automate)/.test(s)) return "HIGH";
    if (/(显示|展示|提示|按钮|show|display)/.test(s)) return "LOW";
    return "MEDIUM";
  }
}

/**
 * 为 Agent 构建结构化 prompt
 */
function buildCoveragePrompt(facts) {
  return `You are a requirements coverage auditor. Given a PRD list of features and a list of detected code features, decide which PRD features are covered by the code.

PRD Features (${facts.prdItems.length}):
${facts.prdItems.map((p, i) => `${i+1}. ${p.name}`).join("\n")}

Implemented Features (${facts.implItems.length}):
${facts.implItems.map((f, i) => `${i+1}. [${f.type}] ${f.name}${f.path ? ` (route: ${f.path})` : ""}${f.file ? ` (file: ${shortPath(f.file)})` : ""}`).join("\n")}

Evidence (file paths):
${facts.evidence.map(e => `- ${e.feature} → ${shortPath(e.file)}`).join("\n")}

For each PRD feature, decide:
- COVERED: implemented in code (provide matched impl feature)
- PARTIAL: partially implemented (describe what's missing)
- NOT_IMPLEMENTED: not detected in code

Output JSON only:
{
  "coverage": [
    { "prdFeature": "...", "status": "COVERED|PARTIAL|NOT_IMPLEMENTED", "matchedImpl": "...", "evidence": "file:line or route path", "reasoning": "..." }
  ],
  "summary": { "covered": N, "partial": N, "missing": N, "coverageRate": 0.0-1.0 },
  "recommendations": ["high-priority missing items to implement"]
}`;
}

function parseLlmCoverage(output, facts) {
  try {
    const cleaned = output.trim()
      .replace(/^```(?:json)?/m, "")
      .replace(/^```$/m, "")
      .trim();
    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
    }
    return JSON.parse(cleaned);
  } catch (e) {
    return {
      error: `Failed to parse LLM output: ${e.message}`,
      rawOutput: output,
      facts,
    };
  }
}

function shortPath(p) {
  if (!p) return "";
  return p.split(/[\\\/]/).slice(-3).join("/");
}

module.exports = { RequirementsVerifier, buildCoveragePrompt };
