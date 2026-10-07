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
const { inferEffortFromText } = require("../utils/infer-effort");

class RequirementsVerifier {
  constructor(options = {}) {
    this.options = options;
    this.prdParser = options.prdParser || new PRDParser(options.prdParserOptions || {});
    this.featureDetector = options.featureDetector || new FeatureDetector({
      srcDir: options.srcDir || "src",
    });
  }

  /**
   * 采集两侧事实，不做匹配判断
   */
  async collectFacts(context = {}) {
    const prdItems = context.prdPath
      ? await this.prdParser.parse(context.prdPath)
      : [];

    // 若传入了 srcDir 且当前 featureDetector 用的是默认配置，重新构造一个带正确路径的
    let detector = this.featureDetector;
    if (context.srcDir && !this.options.featureDetector && (!this.options.srcDir || this.options.srcDir !== context.srcDir)) {
      detector = new FeatureDetector({ srcDir: context.srcDir });
    }
    const implItems = await detector.detect();

    // 采集证据：每条事实带源码路径，便于 Agent 引用判断
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
   * 让 Agent 基于事实自由判断，LLM 负责裁决
   *
   * @param {Object} facts - collectFacts 采集到的事实
   * @param {Function} llmFn - async (prompt) => string
   * @returns {Object} coverage result
   */
  async assessCoverage(facts, llmFn) {
    const prompt = buildCoveragePrompt(facts);
    const llmOutput = await llmFn(prompt);
    return parseLlmCoverage(llmOutput, facts);
  }

  /**
   * 硬编码关键词匹配的旧 API，内部实现有缺陷，标记为 deprecated
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
   * 简化的关键词字段匹配（仅为占位；真实判断交给 Agent 完成）
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
    // 2026-10-07 修复：此处原本是**独立的第二份**关键词实现，其中文词在
    // d52dcc0（v0.8.0）提交时已被写成 U+FFFD，导致中文需求恒被判 MEDIUM
    // ——英文分支仍正常，故缺陷静默（实测 9 例 5 例不一致，全为中文）。
    // 收敛到 `../utils/infer-effort` 的共享实现：该处中文完好，且词表更全
    // （另含 integrate/api/oauth/sso/jwt、button/label/style）。
    // 关键词原文取自本文件 v0.5.0（9b29306，U+FFFD=0）：`批量|batch|自动化|automate`
    // 与 `显示|展示|提示|按钮|show|display`。
    return inferEffortFromText(featureName);
  }
}

/**
 * 为 Agent 生成结构化 prompt
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
