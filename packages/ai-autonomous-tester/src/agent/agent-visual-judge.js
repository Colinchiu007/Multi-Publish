/**
 * AgentVisualJudge - Agent 视觉智能判断
 *
 * 核心能力：判断像素 diff 是"预期变更"还是"回归 bug"
 *
 * 三层判断策略：
 *   1. LLM 分析（有 llmFn 时）：给 LLM 看 diff/基线/当前截图（base64 内联）+ 上下文 → 判断
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

// 单图内联体积上限（3MB）：超出则跳过该图（Anthropic 图片上限 5MB，中转站 body 更小）
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

const IMAGE_MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
};

function mimeForPath(filePath) {
  const ext = path.extname(filePath || "").toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] || "image/png";
}

function encodeImage(filePath) {
  if (!filePath || typeof filePath !== "string" || !fs.existsSync(filePath)) return null;
  let size = 0;
  try {
    size = fs.statSync(filePath).size;
  } catch {
    return null;
  }
  if (size > MAX_IMAGE_BYTES) return null; // 超大图跳过内联，避免打爆请求体
  const mimeType = mimeForPath(filePath);
  const base64 = fs.readFileSync(filePath).toString("base64");
  return { path: filePath, mimeType, base64, dataUrl: `data:${mimeType};base64,${base64}` };
}

class AgentVisualJudge {
  constructor(options = {}) {
    this.llmFn = options.llmFn || null;
    this.logger = options.logger || console;
    this.noiseThreshold = options.noiseThreshold || 0.5; // <0.5% diff 视为噪声
    this.regressionThreshold = options.regressionThreshold || 2.0; // >2% diff 可能是回归
    this.needReviewThreshold = options.needReviewThreshold || 5.0; // >5% diff 需人工
    // 视觉判定：有 LLM 时默认开启，把 diff/基线/当前截图以 base64 内联发给支持视觉的模型；
    // 模型不支持图片时自动降级纯文本判定，可用 vision:false 显式关闭。
    this.vision = options.vision ?? (options.llmFn ? true : false);
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

    // 2. 有 LLM：让 LLM 真看图判断（diff/基线/当前截图 base64 内联；不支持视觉时降级纯文本）
    if (this.llmFn) {
      return this._judgeWithLLM({
        testName,
        mismatch,
        diffPath,
        baselinePath: diff.baselinePath || ctx.baselinePath || null,
        currentPath: diff.currentPath || diff.screenshotPath || ctx.currentPath || ctx.screenshotPath || null,
        route: ctx.route || diff.route,
      });
    }

    // 3. 无 LLM：规则引擎
    return this._judgeWithRules({ testName, mismatch });
  }

  /**
   * LLM 判断：构造 prompt，把 diff/基线/当前截图以 base64 内联传给支持视觉的 LLM 推理。
   * 模型不支持图片输入（如 400）时自动降级纯文本判定，保持原有文本判定能力。
   */
  async _judgeWithLLM({ testName, mismatch, diffPath, baselinePath, currentPath, route }) {
    const imagePaths = [diffPath, baselinePath, currentPath].filter(Boolean);
    const images = this.vision ? imagePaths.map(encodeImage).filter(Boolean) : [];
    const labelByPath = {
      [diffPath]: "diff (red highlights)",
      [baselinePath]: "baseline",
      [currentPath]: "current screenshot",
    };
    const attachedLabels = images.map(img => labelByPath[img.path]).filter(Boolean);
    const attachedLine = attachedLabels.length ? `Attached images: ${attachedLabels.join(", ")}.` : "";

    const prompt = [
      "You are a frontend QA engineer analyzing a visual regression test failure.",
      "",
      `Test: ${testName}`,
      mismatch ? `Diff: ${mismatch.toFixed(2)}% pixels changed` : "",
      route ? `Route: ${route}` : "",
      attachedLine,
      "",
      "Analyze if this is an EXPECTED change (intentional UI update), a REGRESSION (unintended bug), or NEEDS REVIEW (ambiguous).",
      "Output JSON ONLY:",
      JSON.stringify({
        verdict: "expected | regression | noise | need_review",
        reasoning: "brief explanation",
        confidence: "high | medium | low",
      }),
    ].filter(Boolean).join("\n");

    // 无图（视觉关闭、图片缺失或超限）→ 纯文本路径，与旧行为一致
    // 调用失败时 fail-closed 返回 need_review，绝不让异常向上传播绕开人工审核
    if (images.length === 0) {
      try {
        const verdict = await this._callAndParse(prompt);
        return verdict
          ? { ...verdict, visionUsed: false }
          : { verdict: "need_review", reasoning: "LLM 输出解析失败，需人工确认", confidence: "low", visionUsed: false };
      } catch (textError) {
        this.logger.log(`[AgentVisualJudge] LLM 文本判定调用失败，需人工确认: ${textError.message}`);
        return { verdict: "need_review", reasoning: `LLM 调用失败: ${textError.message}`, confidence: "low", visionUsed: false };
      }
    }

    try {
      const verdict = await this._callAndParse({ text: prompt, images });
      return verdict
        ? { ...verdict, visionUsed: true }
        : { verdict: "need_review", reasoning: "LLM 输出解析失败，需人工确认", confidence: "low", visionUsed: true };
    } catch (visionError) {
      // 模型/中转站不支持图片输入（如 400）→ 降级纯文本重试，保留原有文本判定能力
      this.logger.log(`[AgentVisualJudge] 视觉图片调用失败，降级纯文本判定: ${visionError.message}`);
      try {
        const verdict = await this._callAndParse(prompt);
        return verdict
          ? { ...verdict, visionUsed: false, visionFallback: true }
          : { verdict: "need_review", reasoning: "LLM 输出解析失败，需人工确认", confidence: "low", visionUsed: false, visionFallback: true };
      } catch (textError) {
        this.logger.log(`[AgentVisualJudge] 降级纯文本判定也失败，需人工确认: ${textError.message}`);
        return { verdict: "need_review", reasoning: `LLM 调用失败: ${textError.message}`, confidence: "low", visionUsed: false, visionFallback: true };
      }
    }
  }

  /**
   * 调用 llmFn 并解析 JSON 输出；调用方负责 try/catch（fail-closed 转 need_review），输出不可解析时返回 null
   */
  async _callAndParse(input) {
    const output = await this.llmFn(input);
    const cleaned = output.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const parsed = JSON.parse(cleaned.slice(first, last + 1));
      return { verdict: parsed.verdict || "need_review", reasoning: parsed.reasoning || "", confidence: parsed.confidence || "low" };
    }
    return null;
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

module.exports = { AgentVisualJudge, MAX_IMAGE_BYTES };
