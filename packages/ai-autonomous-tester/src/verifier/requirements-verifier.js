/**
 * RequirementsVerifier - ������֤������ʵ�ɼ�����
 *
 * ��Ҫ����ģ�鲻���� PRD-vs-����ƥ���ж�
 * ����������������Ӧ���� Agent �� LLM ��ɡ�
 *
 * ��ģ��ֻ����ʵ�ɼ���
 * 1. �� PRD ��ȡ������Ŀ��fact extraction��
 * 2. �Ӵ�����ȡ���ܵ㣨fact extraction��
 * 3. �����ߵ�"��ʵ"���� Agent���� Agent ������
 *    - ��Щ������ʵ�֣�
 *    - ��Щ����ȱʧ��
 *    - ȱʧ�Ĺ�������Σ�
 *
 * ʹ�÷�ʽ:
 *   const verifier = new RequirementsVerifier();
 *   const facts = await verifier.collectFacts({
 *     prdPath: "./PRD.md",
 *     srcDir: "./src"
 *   });
 *   // facts ���� prdItems + implItems + evidence
 *   // �� facts ���� Agent���� Agent �ж� coverage
 *
 *   // ����ʹ�ø��������� Agent �Լ����� LLM:
 *   const coverage = await verifier.assessCoverage(facts, llmFn);
 *   // llmFn ǩ��: async (prompt) => string (LLM ��� JSON)
 */

const { PRDParser } = require("../parsers/prd-parser");
const { FeatureDetector } = require("../detectors/feature-detector");

class RequirementsVerifier {
  constructor(options = {}) {
    this.options = options;
    this.prdParser = options.prdParser || new PRDParser(options.prdParserOptions || {});
    this.featureDetector = options.featureDetector || new FeatureDetector({
      srcDir: options.srcDir || "src",
    });
  }

  /**
   * �ɼ�˫����ʵ������ƥ���ж�
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

    // ��ȡ֤�ݣ�ÿ��ʵ�ֹ��ܵ�����ļ�·�������� Agent ��һ���Ķ�
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
   * �� Agent �����жϣ����� LLM ������
   *
   * @param {Object} facts - collectFacts �����
   * @param {Function} llmFn - async (prompt) => string
   * @returns {Object} coverage result
   */
  async assessCoverage(facts, llmFn) {
    const prompt = buildCoveragePrompt(facts);
    const llmOutput = await llmFn(prompt);
    return parseLlmCoverage(llmOutput, facts);
  }

  /**
   * �����ݣ������ API������ȷ���Ϊ deprecated
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
   * �򵥵Ĺؼ��ֶ���ƥ�䣨����Ϊռλ������ʵƥ���� Agent ��ɣ�
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
    if (/(import|export|����|batch|�Զ���|automate)/.test(s)) return "HIGH";
    if (/(��ʾ|չʾ|��ʾ|��ť|show|display)/.test(s)) return "LOW";
    return "MEDIUM";
  }
}

/**
 * Ϊ Agent �����ṹ�� prompt
 */
function buildCoveragePrompt(facts) {
  return `You are a requirements coverage auditor. Given a PRD list of features and a list of detected code features, decide which PRD features are covered by the code.

PRD Features (${facts.prdItems.length}):
${facts.prdItems.map((p, i) => `${i+1}. ${p.name}`).join("\n")}

Implemented Features (${facts.implItems.length}):
${facts.implItems.map((f, i) => `${i+1}. [${f.type}] ${f.name}${f.path ? ` (route: ${f.path})` : ""}${f.file ? ` (file: ${shortPath(f.file)})` : ""}`).join("\n")}

Evidence (file paths):
${facts.evidence.map(e => `- ${e.feature} �� ${shortPath(e.file)}`).join("\n")}

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
