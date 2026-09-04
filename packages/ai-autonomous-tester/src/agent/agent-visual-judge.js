/**
 * AgentVisualJudge - Agent 视觉智能判断
 *
 * 核心能力：判断像素 diff 是"预期变更"还是"回归 bug"
 *
 * 三层判断策略：
 *   1. LLM 分析（有 llmFn 时）：给 LLM 看 diff 截图路径 + 上下文 → 判断
 *   2. 规则引擎（无 LLM 时）：diff 比例 + 元素类型 + 历史模式 → 分类
 *   3. 人工兜底：不确定的标记为 NEED_REVIEW
 *
 * 使用方式:
 *   const judge = new AgentVisualJudge({ llmFn });
 *   const result = await judge.judge(diffResults, { viewName, route, diffPath, baselinePath });
 *   // result => { verdict: "expected" | "regression" | "noise" | "need_review", reasoning, confidence }
 */

const fs = require("fs");
const path = require("path");

class AgentVisualJudge {
  constructor(options = {}) {
    this.llmFn = options.llmFn || null;
    this.logger = options.logger || console;
    this.noiseThreshold = options.noiseThreshold || 0.5; // <0.5% diff 视为噪声
    this.regressionThreshold = options.regressionThreshold || 2.0; // >2% diff 可能是回归
    this.needReviewThreshold = options.needReviewThreshold || 5.0; // >5% diff 需人工
  }

  /**
   * 判断单个 diff 结果
   * @param {Object} diff - { testName, route, misMatchPercentage, diffPath, baselinePath, currentPath }
   * @param {Object} ctx - { viewName?, route?, diffPath?, baselinePath? }
   * @returns {Promise<{verdict: string, reasoning: string, confidence: string}>}
   */
  async judge(diff, ctx = {}) {
    const mismatch = Number(diff.misMatchPercentage ?? ctx.misMatchPercentage ?? 0);
    const testName = diff.testName || ctx.viewName || "unknown";
    const diffPath = diff.diffPath || ctx.diffPath || null;

    // 1. 噪声：diff 比例极小，忽略
    if (mismatch <= this.noiseThreshold) {
      return { verdict: "noise", reasoning: `Diff ${mismatch.toFixed(2)}% 低于噪声阈值 ${this.noiseThreshold}%`, confidence: "high" };
    }

    // 2. 有 LLM：让 LLM 看图判断（描述性分析，框架不真的传图，Agent 用 view_image 看）
    if (this.llmFn) {
      return this._judgeWithLLM({ testName, mismatch, diffPath, route: ctx.route });
    }

    // 3. 无 LLM：规则引擎
    return this._judgeWithRules({ testName, mismatch });
  }

  /**
   * LLM 判断：构造 prompt，让 Agent 推理
   */
  async _judgeWithLLM({ testName, mismatch, diffPath, route }) {
    const prompt = [
      "You are a frontend QA engineer analyzing a visual regression test failure.",
      "",
      `Test: ${testName}`,
      mismatch ? `Diff: ${mismatch.toFixed(2)}% pixels changed` : "",
      route ? `Route: ${route}` : "",
      diffPath ? `Diff image: ${diffPath} (use view_image if available)` : "",
      "",
      "Analyze if this is an EXPECTED change (intentional UI update) or a REGRESSION (unintended bug).",
      "Output JSON ONLY:",
      JSON.stringify({
        verdict: "expected | regression | need_review",
        reasoning: "brief explanation",
        confidence: "high | medium | low",
      }),
    ].filter(Boolean).join("\n");

    try {
      const output = await this.llmFn(prompt);
      const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const first = cleaned.indexOf("{");
      const last = cleaned.lastIndexOf("}");
      if (first >= 0 && last > first) {
        const parsed = JSON.parse(cleaned.slice(first, last + 1));
        return { verdict: parsed.verdict || "need_review", reasoning: parsed.reasoning || "", confidence: parsed.confidence || "low" };
      }
    } catch (e) {
      this.logger.log("[AgentVisualJudge] LLM parse error:", e.message);
    }
    return { verdict: "need_review", reasoning: "LLM 输出解析失败，需人工确认", confidence: "low" };
  }

  /**
   * 规则引擎判断
   */
  _judgeWithRules({ testName, mismatch }) {
    const name = testName.toLowerCase();

    // 回归模式：交互组件大面积变化
    const regressionPatterns = ["button", "input", "form", "nav", "menu", "header", "footer", "modal", "dialog"];
    const isInteractive = regressionPatterns.some(p => name.includes(p));

    // 已知稳定区域
    const stablePatterns = ["loading", "skeleton", "placeholder", "ad", "banner"];
    const isStable = stablePatterns.some(p => name.includes(p));

    if (isInteractive && mismatch > this.regressionThreshold) {
      return { verdict: "regression", reasoning: `交互组件 ${testName} diff ${mismatch.toFixed(2)}% 超过回归阈值`, confidence: "medium" };
    }

    if (isStable || mismatch < this.regressionThreshold) {
      return { verdict: "noise", reasoning: `低影响区域 ${testName} diff ${mismatch.toFixed(2)}% 在容忍范围内`, confidence: "medium" };
    }

    if (mismatch > this.needReviewThreshold) {
      return { verdict: "need_review", reasoning: `大面积 diff ${mismatch.toFixed(2)}% 需人工确认`, confidence: "low" };
    }

    return { verdict: "expected", reasoning: `可能是有意变更 ${testName} (diff ${mismatch.toFixed(2)}%)`, confidence: "low" };
  }

  /**
   * 批量判断一组 diff 结果
   */
  async judgeBatch(diffs, context = {}) {
    if (!diffs || diffs.length === 0) return [];
    const results = [];
    for (const diff of diffs) {
      results.push(await this.judge(diff, context));
    }
    return results;
  }
}

module.exports = { AgentVisualJudge };
