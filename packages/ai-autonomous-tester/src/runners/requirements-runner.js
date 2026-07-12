/**
 * RequirementsTestRunner - 需求验证运行器
 *
 * 默认路径 (v0.5.0+):
 *   collectFacts() → AgentJudge.judge() → verdict
 *   框架不匹配，由 Agent 做语义判断
 *
 * 使用方式:
 *   // 模式 A: 注入 LLM（CI / 自动化）
 *   const runner = new RequirementsTestRunner({
 *     llmFn: async (prompt) => llmClient.complete(prompt)
 *   });
 *   const result = await runner.runTests({ prdPath, srcDir });
 *
 *   // 模式 B: 无 LLM（交互式 Agent / 人工审查）
 *   const runner = new RequirementsTestRunner();
 *   const result = await runner.runTests({ prdPath, srcDir });
 *   // result._verdict._mode === "prompt" → Agent 读 prompt + 自己回答
 *
 *   // 模式 C: 外部已采集 facts（orchestrator 复用）
 *   const runner = new RequirementsTestRunner();
 *   const result = await runner.runTests({ facts: preComputedFacts });
 */

const { BaseTestRunner } = require("./base-runner");
const { RequirementsVerifier } = require("../verifier/requirements-verifier");
const { AgentJudge } = require("../agent/agent-judge");

class RequirementsTestRunner extends BaseTestRunner {
  constructor(options = {}) {
    super({ ...options, label: "requirements" });
    this.verifier = options.verifier || new RequirementsVerifier(options);
    this.judge = options.judge || new AgentJudge({
      llmFn: options.llmFn,
      logger: this.logger,
    });
    this.useAgentJudge = options.useAgentJudge !== false; // 默认 true
  }

  async runTests(context = {}) {
    // 跳过条件：既无 prdPath 也无外部 facts
    if (!context.prdPath && !context.facts) {
      return {
        type: "requirements",
        summary: { total: 0, passed: 0, failed: 0 },
        details: [],
        skipped: true,
        _reason: "no prdPath or facts provided",
      };
    }

    // 默认路径：collectFacts → AgentJudge
    if (this.useAgentJudge) {
      return this._runWithAgentJudge(context);
    }

    // 向后兼容：旧 verify() 路径（已 deprecated）
    return this._runLegacyVerify(context);
  }

  /**
   * 新主路径：facts 采集 → Agent 语义判断 → verdict → details
   */
  async _runWithAgentJudge(context) {
    let facts = context.facts;
    if (!facts) {
      facts = await this.verifier.collectFacts({
        prdPath: context.prdPath,
        srcDir: context.srcDir || "src",
      });
    }

    const judgeContext = {
      facts,
      task: context.task || "coverage",
    };
    if (context.llmFn) judgeContext.llmFn = context.llmFn;

    const verdict = await this.judge.judge(judgeContext);

    // Prompt 包模式（无 LLM）：返回 verdict 让 Agent 自己处理
    if (verdict._mode === "prompt") {
      const details = facts.prdItems.map(p => ({
        testName: p.name,
        status: "PASSED",
        type: "pending-agent-judgment",
        _agentRequired: true,
        _reason: "no LLM injected; Agent must read verdict.prompt and respond",
      }));

      return {
        type: "requirements",
        summary: this.summarize(details),
        details,
        coverageRate: 0,
        totalPrdFeatures: facts.prdItems.length,
        totalImplementedFeatures: facts.implItems.length,
        _verdict: verdict,
        _facts: facts,
        _mode: "agent-required",
      };
    }

    // 正常 verdict → 映射到 details
    const details = (verdict.items || []).map(it => mapItemToDetail(it));
    // 如果 verdict 没有 items（罕见），从 summary 反推
    if (details.length === 0 && verdict.summary) {
      details.push(...summaryToDetails(verdict, facts));
    }

    const summary = this.summarize(details);

    // FAIL/NEED_HUMAN 时附加 effort 估算（来自 deprecated 旧逻辑，仅供参考）
    if (verdict.decision !== "PASS") {
      for (const d of details) {
        if (d.status === "FAILED") {
          d.effort = estimateEffort(d.testName);
        }
      }
    }

    return {
      type: "requirements",
      summary,
      details,
      coverageRate: verdict.summary?.coverageRate ?? 0,
      totalPrdFeatures: facts.prdItems.length,
      totalImplementedFeatures: facts.implItems.length,
      _verdict: verdict,
      _facts: facts,
      _decision: verdict.decision,
    };
  }

  /**
   * 旧路径（deprecated）：verify() 用关键词兜底
   */
  async _runLegacyVerify(context) {
    if (!context.prdPath) {
      return {
        type: "requirements",
        summary: { total: 0, passed: 0, failed: 0 },
        details: [],
        skipped: true,
      };
    }

    const result = await this.verifier.verify(context.prdPath, {
      srcDir: context.srcDir || "src",
    });

    const details = [];
    for (const c of result.covered) {
      details.push({
        testName: c.prdFeature.name,
        status: "PASSED",
        type: "covered",
        effort: c.prdFeature.effort || "MEDIUM",
      });
    }
    for (const u of result.uncovered) {
      details.push({
        testName: u.prdFeature.name,
        status: "FAILED",
        type: "uncovered",
        effort: u.effort,
        status_reason: "PRD feature not detected in code (keyword fallback)",
      });
    }

    return {
      type: "requirements",
      summary: this.summarize(details),
      details,
      coverageRate: result.coverageRate,
      totalPrdFeatures: result.totalPrdFeatures,
      totalImplementedFeatures: result.totalImplementedFeatures,
      _deprecated: "Use _runWithAgentJudge path; verify() is keyword-fallback only",
    };
  }
}

// ===== 辅助函数 =====

function mapItemToDetail(item) {
  switch (item.status) {
    case "COVERED":
      return {
        testName: item.prdFeature,
        status: "PASSED",
        type: "covered",
        matchedImpl: item.matchedImpl || "",
        evidence: item.evidence || "",
        reasoning: item.reasoning || "",
      };
    case "PARTIAL":
      return {
        testName: item.prdFeature,
        status: "PASSED",
        type: "partial",
        matchedImpl: item.matchedImpl || "",
        evidence: item.evidence || "",
        reasoning: item.reasoning || "",
        _warning: "partial implementation",
      };
    case "NOT_IMPLEMENTED":
      return {
        testName: item.prdFeature,
        status: "FAILED",
        type: "not-implemented",
        matchedImpl: item.matchedImpl || "",
        evidence: item.evidence || "",
        reasoning: item.reasoning || "",
      };
    default:
      return {
        testName: item.prdFeature,
        status: "PASSED",
        type: "unknown",
        _rawStatus: item.status,
      };
  }
}

function summaryToDetails(verdict, facts) {
  const s = verdict.summary || {};
  const items = [];
  let coveredLeft = s.covered || 0;
  let partialLeft = s.partial || 0;
  let missingLeft = s.missing || 0;

  for (const p of facts.prdItems || []) {
    if (missingLeft > 0) {
      items.push({ testName: p.name, status: "FAILED", type: "not-implemented" });
      missingLeft--;
    } else if (partialLeft > 0) {
      items.push({ testName: p.name, status: "PASSED", type: "partial" });
      partialLeft--;
    } else if (coveredLeft > 0) {
      items.push({ testName: p.name, status: "PASSED", type: "covered" });
      coveredLeft--;
    } else {
      items.push({ testName: p.name, status: "FAILED", type: "unknown" });
    }
  }
  return items;
}

function estimateEffort(featureName) {
  const s = (featureName || "").toLowerCase();
  if (/(import|export|批量|batch|自动化|automate|integrate|api)/.test(s)) return "HIGH";
  if (/(显示|展示|提示|按钮|show|display|button|label)/.test(s)) return "LOW";
  return "MEDIUM";
}

module.exports = { RequirementsTestRunner };