/**
 * FixEngine - 修复引擎
 *
 * 执行代码修复、Baseline 更新、文档更新、需求修复、verdict 推荐修复。
 *
 * v0.7.0 新增 verdict-recommendations 策略：从 AgentJudge 的 verdict.recommendations
 * 和 verdict.items (NOT_IMPLEMENTED/PARTIAL) 自动生成 priority-sorted fixes，
 * 让 orchestrator 能真正闭环 "测试 → 找 bug → 修 → 验证"。
 *
 * 使用方式:
 *   const engine = new FixEngine({ logger: console });
 *   const result = await engine.execute(fixes);
 *
 *   // 从 verdict 自动生成 fixes
 *   const fixes = FixEngine.fromVerdict(verdict);
 *   const result = await engine.execute(fixes);
 */

const fs = require('fs');
const path = require('path');

const PRIORITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const EFFORT_ORDER = { LOW: 0, MEDIUM: 1, HIGH: 2 };

class FixEngine {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.dryRun = options.dryRun !== false; // 默认 dryRun=true（只生成建议，不真改代码）
    this.workDir = options.workDir || process.cwd();

    this.strategies = {
      baseline: new BaselineStrategy({ ...options, workDir: this.workDir }),
      visual: new VisualFixStrategy(options),
      functional: new FunctionalFixStrategy(options),
      requirements: new RequirementsFixStrategy(options),
      'verdict-recommendations': new VerdictRecommendationsStrategy({
        ...options,
        workDir: this.workDir,
      }),
    };
  }

  /**
   * 从 AgentJudge verdict 自动生成 fixes（按 priority + effort 排序）
   *
   * 输入：verdict = { decision, items: [{status, prdFeature, matchedImpl, evidence, reasoning}], recommendations: [...], summary: {...} }
   * 输出：[{ type, priority, effort, ... }]
   */
  static fromVerdict(verdict, opts = {}) {
    if (!verdict) return [];

    const fixes = [];
    const seen = new Set();

    // 来源 1: verdict.recommendations（Agent 推荐的高优先级项）
    if (Array.isArray(verdict.recommendations)) {
      verdict.recommendations.forEach((rec, i) => {
        if (!rec) return;
        const key = `rec:${rec}`;
        if (seen.has(key)) return;
        seen.add(key);
        fixes.push({
          type: 'verdict-recommendations',
          priority: i === 0 ? 'HIGH' : 'MEDIUM',
          effort: inferEffort(rec),
          testName: rec,
          description: `Agent recommendation: ${rec}`,
          suggestedFix: rec,
          source: 'verdict.recommendations',
        });
      });
    }

    // 来源 2: verdict.items 中 NOT_IMPLEMENTED
    if (Array.isArray(verdict.items)) {
      for (const item of verdict.items) {
        if (item.status === 'NOT_IMPLEMENTED') {
          const key = `missing:${item.prdFeature}`;
          if (seen.has(key)) continue;
          seen.add(key);
          fixes.push({
            type: 'verdict-recommendations',
            priority: 'HIGH',
            effort: inferEffort(item.prdFeature),
            testName: item.prdFeature,
            description: `PRD feature not implemented: ${item.prdFeature}`,
            suggestedFix: item.matchedImpl
              ? `Reuse pattern from ${item.matchedImpl} to implement ${item.prdFeature}`
              : `Implement ${item.prdFeature} (${item.evidence || 'no evidence'})`,
            source: 'verdict.items.NOT_IMPLEMENTED',
            evidence: item.evidence || '',
            reasoning: item.reasoning || '',
          });
        } else if (item.status === 'PARTIAL') {
          const key = `partial:${item.prdFeature}`;
          if (seen.has(key)) continue;
          seen.add(key);
          fixes.push({
            type: 'verdict-recommendations',
            priority: 'MEDIUM',
            effort: inferEffort(item.prdFeature),
            testName: item.prdFeature,
            description: `PRD feature partially implemented: ${item.prdFeature}`,
            suggestedFix: item.reasoning
              ? `Complete missing part: ${item.reasoning}`
              : `Complete ${item.prdFeature} (matched: ${item.matchedImpl || 'unknown'})`,
            source: 'verdict.items.PARTIAL',
            evidence: item.evidence || '',
            matchedImpl: item.matchedImpl || '',
          });
        }
      }
    }

    // 排序：priority HIGH→MEDIUM→LOW，同优先级按 effort LOW→HIGH（先做容易的）
    fixes.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 1;
      const pb = PRIORITY_ORDER[b.priority] ?? 1;
      if (pa !== pb) return pa - pb;
      const ea = EFFORT_ORDER[a.effort] ?? 1;
      const eb = EFFORT_ORDER[b.effort] ?? 1;
      return ea - eb;
    });

    if (opts.maxFixes && fixes.length > opts.maxFixes) {
      fixes.length = opts.maxFixes;
    }

    return fixes;
  }

  /**
   * 执行修复列表
   */
  async execute(fixes) {
    if (!fixes || fixes.length === 0) {
      return { success: true, results: [], _empty: true };
    }

    const results = [];
    for (const fix of fixes) {
      const strategy = this.strategies[fix.type];

      if (!strategy) {
        results.push({
          fix,
          success: false,
          error: `Unknown fix type: ${fix.type}`,
        });
        continue;
      }

      this.logger.log(`[FixEngine] ${fix.priority || 'MEDIUM'} | ${fix.type} | ${fix.testName || fix.name}`);

      try {
        const result = await strategy.apply(fix, { dryRun: this.dryRun });
        results.push({ fix, success: true, ...result });
      } catch (error) {
        results.push({ fix, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(`[FixEngine] Applied: ${successCount}/${results.length}`);

    return {
      success: successCount === results.length,
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: results.length - successCount,
      },
    };
  }

  /**
   * 仅生成修复计划（dryRun + 不执行）
   */
  async plan(fixes) {
    const plan = [];
    for (const fix of fixes || []) {
      const strategy = this.strategies[fix.type];
      plan.push({
        fix,
        executable: !!strategy,
        willDryRun: this.dryRun,
        estimatedImpact: estimateImpact(fix),
      });
    }
    return plan;
  }
}

/**
 * Baseline 更新策略
 */
class BaselineStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.workDir = options.workDir || process.cwd();
  }

  async apply(fix, ctx = {}) {
    const screenshotDir = fix.screenshotDir || path.join(this.workDir, 'tests/visual-testing/screenshots');
    const baselineDir = fix.baselineDir || path.join(this.workDir, 'tests/visual-testing/base-screenshots');

    const currentPath = path.join(screenshotDir, `${fix.testName}-current.png`);
    const baselinePath = path.join(baselineDir, `${fix.testName}.png`);

    if (!fs.existsSync(currentPath)) {
      throw new Error(`Current screenshot not found: ${currentPath}`);
    }

    if (ctx.dryRun) {
      return { action: 'BASELINE_UPDATE_PLANNED', baselinePath };
    }

    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.copyFileSync(currentPath, baselinePath);
    this.logger.log(`[BaselineStrategy] Updated: ${fix.testName}`);

    return { action: 'BASELINE_UPDATED', baselinePath };
  }
}

/**
 * 视觉修复策略（建议模式，不自动改代码）
 */
class VisualFixStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  async apply(fix) {
    return {
      action: 'SUGGESTED',
      suggestion: fix.suggestedFix || `Review ${fix.testName}: visual regression detected.`,
    };
  }
}

/**
 * 功能修复策略（建议模式）
 */
class FunctionalFixStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  async apply(fix) {
    return {
      action: 'SUGGESTED',
      suggestion: fix.suggestedFix || `Debug ${fix.testName}: ${fix.error || 'unknown error'}`,
    };
  }
}

/**
 * 需求修复策略（建议模式，兼容旧路径）
 */
class RequirementsFixStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  async apply(fix) {
    return {
      action: 'SUGGESTED',
      suggestion: fix.suggestedFix || `Implement: ${fix.testName}`,
    };
  }
}

/**
 * v0.7.0 新增: verdict-recommendations 策略
 *
 * 从 AgentJudge 的 verdict 自动生成的修复项。
 * 默认建议模式（不自动改代码），让 Agent/开发者人工判断。
 * 若提供 llmFn + workDir 可做"代码 skeleton 生成"。
 */
class VerdictRecommendationsStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.workDir = options.workDir || process.cwd();
    this.llmFn = options.llmFn || null;
  }

  async apply(fix, ctx = {}) {
    const out = {
      action: 'SUGGESTED',
      priority: fix.priority,
      effort: fix.effort,
      description: fix.description,
      suggestion: fix.suggestedFix,
      source: fix.source,
    };

    if (fix.evidence) out.evidence = fix.evidence;
    if (fix.matchedImpl) out.matchedImpl = fix.matchedImpl;
    if (fix.reasoning) out.reasoning = fix.reasoning;

    // 如果有 LLM 且不是 dryRun，尝试生成代码骨架
    if (this.llmFn && !ctx.dryRun && fix.priority === 'HIGH') {
      try {
        out.codeSkeleton = await this.generateSkeleton(fix);
        out.action = 'SKELETON_GENERATED';
      } catch (e) {
        out.skeletonError = e.message;
      }
    }

    return out;
  }

  async generateSkeleton(fix) {
    if (!this.llmFn) return null;
    const prompt = `You are a frontend engineer. Generate a minimal code skeleton (component, route registration, basic test) for this missing feature:

Feature: ${fix.testName}
Description: ${fix.description}
Evidence (where it should fit): ${fix.evidence || 'no specific location'}
Existing pattern: ${fix.matchedImpl || 'unknown'}

Output JSON: { "files": [{ "path": "...", "content": "..." }], "notes": "..." }`;
    const output = await this.llmFn(prompt);
    try {
      const cleaned = output.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
      return JSON.parse(cleaned);
    } catch (e) {
      return { _rawOutput: output.slice(0, 500), _parseError: e.message };
    }
  }
}

// ===== 辅助函数 =====

function inferEffort(text) {
  if (!text) return 'MEDIUM';
  const s = String(text).toLowerCase();
  if (/(import|export|批量|batch|自动化|automate|integrate|api|oauth|sso|jwt|crypt|oauth)/.test(s)) return 'HIGH';
  if (/(显示|展示|提示|按钮|show|display|button|label|rename|style|css|color)/.test(s)) return 'LOW';
  return 'MEDIUM';
}

function estimateImpact(fix) {
  if (fix.priority === 'HIGH') return 'HIGH';
  if (fix.priority === 'LOW') return 'LOW';
  return 'MEDIUM';
}



/**
 * PatchFixStrategy - 生成可执行代码 Patch
 *
 * v0.12.2 新增：不直接改代码，而是生成 .patch 文件（或 .diff / 命令脚本），
 * 让 Agent 审阅后执行。有 LLM 时生成智能 patch，无 LLM 时生成模板建议。
 */
class PatchFixStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.workDir = options.workDir || process.cwd();
    this.llmFn = options.llmFn || null;
    this.patchDir = options.patchDir || path.join(this.workDir, "patches");
  }

  async apply(fix, ctx = {}) {
    const ts = new Date().toISOString().slice(0, 10);
    const safeName = (fix.testName || "fix").replace(/[^a-z0-9]/gi, "-");
    const patchFile = path.join(this.patchDir, ts + "-" + safeName + ".patch");
    const shellFile = path.join(this.patchDir, ts + "-" + safeName + ".sh");
    fs.mkdirSync(this.patchDir, { recursive: true });

    if (this.llmFn && fix.error && !ctx.dryRun) {
      try {
        const prompt = "You are a frontend engineer generating a code fix patch.\nTest: " + fix.testName + "\nError: " + (fix.error || "") + "\nContext: " + (fix.description || "") + "\n\nOutput a unified diff patch (diff -u format) that fixes this issue. Use paths relative to project root.";
        const output = await this.llmFn(prompt);
        if (output && output.length > 20) {
          fs.writeFileSync(patchFile, output);
          const sh = "#!/bin/bash\n# Auto-generated fix for: " + fix.testName + "\necho \"Applying patch for " + fix.testName + "...\"\npatch -p0 < \"" + patchFile + "\" 2>/dev/null || echo \"Patch apply failed\"\n";
          fs.writeFileSync(shellFile, sh);
          return { action: "PATCH_GENERATED", patchFile, shellFile };
        }
      } catch (e) {
        this.logger.log("[PatchFixStrategy] LLM failed: " + e.message);
      }
    }

    // Template patch
    const tmpl = "--- a/unknown\n+++ b/unknown\n@@ -1,1 +1,1 @@\n-# FIX: " + fix.testName + "\n+# " + (fix.suggestedFix || "Manual fix required") + "\n";
    fs.writeFileSync(patchFile, tmpl);
    const sh = "#!/bin/bash\n# TEMPLATE: " + fix.testName + "\necho \"FIX REQUIRED: " + fix.testName + "\"\necho \"See: " + patchFile + "\"\n";
    fs.writeFileSync(shellFile, sh);
    return { action: "PATCH_TEMPLATE", patchFile, shellFile };
  }
}

module.exports = { FixEngine, inferEffort, PatchFixStrategy };