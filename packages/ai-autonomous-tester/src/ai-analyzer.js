/**
 * AIAnalyzer - AI 分析器
 *
 * 分析测试结果，分类差异，做出决策
 *
 * 决策类型:
 *   - STOP_SUCCESS: 所有测试通过
 *   - FIX_AND_RETRY: 有问题需要修复
 *   - UPDATE_BASELINE: 预期变更，更新基线
 *   - NEED_HUMAN: 需要人工判断
 *   - STOP_NO_PROGRESS: 无进展，停止
 *
 * v0.7.0: 走 AgentJudge verdict 路径
 *   - verdict._mode === 'prompt' → NEED_HUMAN（Agent 必须先回答）
 *   - verdict.decision === 'PASS' → STOP_SUCCESS
 *   - verdict.decision === 'FAIL' → FIX_AND_RETRY (用 FixEngine.fromVerdict 生成 fixes)
 *   - verdict.decision === 'NEED_HUMAN' → NEED_HUMAN
 */

const { AgentVisualJudge } = require("./agent/agent-visual-judge");

class AIAnalyzer {
  constructor(options = {}) {
    this.noiseThreshold = options.noiseThreshold || 0.5;
    this.knownChanges = options.knownChanges || [];
    this.needHumanPatterns = options.needHumanPatterns || [
      'content_disagreement',
      'complex_layout_change',
      'cross_module_impact',
    ];
    this.requirementsNeedHumanThreshold = options.requirementsNeedHumanThreshold || 0.5;
  }

  /**
   * 分析测试结果
   */
  async analyze(testResults) {
    const analysis = {
      visual: this.analyzeVisual(testResults.visual),
      functional: this.analyzeFunctional(testResults.functional),
      requirements: this.analyzeRequirements(testResults.requirements),
      verdict: testResults.requirements?._verdict || null,
    };

    // 计算整体风险等级
    let overallRisk = 'LOW';
    if (analysis.visual.regressions.length > 0 || analysis.functional.failed.length > 0) {
      overallRisk = 'HIGH';
    } else if (analysis.visual.expectedChanges.length > 0) {
      overallRisk = 'MEDIUM';
    } else if (analysis.requirements.coverageRate < this.requirementsNeedHumanThreshold) {
      overallRisk = 'MEDIUM';
    }
    analysis.overallRisk = overallRisk;

    return analysis;
  }

  /**
   * 分析视觉测试结果
   */
  analyzeVisual(visualResults) {
    if (!visualResults || !visualResults.details) {
      return { regressions: [], expectedChanges: [], noise: [], summary: null };
    }

    const regressions = [];
    const expectedChanges = [];
    const noise = [];

    for (const result of visualResults.details) {
      const mismatch = Number(result.misMatchPercentage || 0);

      if (mismatch <= this.noiseThreshold) {
        noise.push(result);
        continue;
      }

      // Use AgentVisualJudge if available (方向3)
      if (this.visualJudge) {
        // This runs synchronously for now; async judgment happens in decide()
        if (this.isKnownChange(result)) {
          expectedChanges.push(result);
        } else if (this.isLikelyRegression(result)) {
          regressions.push(result);
        } else {
          expectedChanges.push({ ...result, uncertain: true });
        }
      } else {
        // Legacy heuristic
        if (this.isKnownChange(result)) {
          expectedChanges.push(result);
        } else if (this.isLikelyRegression(result)) {
          regressions.push(result);
        } else {
          expectedChanges.push({ ...result, uncertain: true });
        }
      }
    }

    return { regressions, expectedChanges, noise, summary: visualResults.summary };
  }

  /**
   * 分析功能测试结果
   */
  analyzeFunctional(functionalResults) {
    if (!functionalResults || !functionalResults.details) {
      return { passed: [], failed: [], flaky: [], summary: null };
    }

    const details = functionalResults.details;
    return {
      passed: details.filter(r => r.status === 'PASSED'),
      failed: details.filter(r => r.status === 'FAILED'),
      flaky: details.filter(r => r.status === 'FLAKY'),
      summary: functionalResults.summary,
    };
  }

  /**
   * 分析需求验证结果（v0.7.0 走 verdict 路径）
   */
  analyzeRequirements(requirementsResults) {
    if (!requirementsResults) {
      return { covered: [], uncovered: [], conflicts: [], coverageRate: 0, verdict: null };
    }

    const verdict = requirementsResults._verdict || null;

    // Prompt 包模式：未经过 Agent 判断，全部视为未确认
    if (verdict && verdict._mode === 'prompt') {
      const pending = (requirementsResults.details || []).map(d => ({
        testName: d.testName,
        prdFeature: d.testName,
        status: 'PENDING_AGENT',
        reasoning: 'verdict pending Agent review',
      }));
      return {
        covered: [],
        uncovered: pending,
        conflicts: [],
        coverageRate: 0,
        verdict,
        verdictMode: 'prompt',
      };
    }

    // 正常 verdict：从 items 拆分
    const covered = [];
    const uncovered = [];
    if (verdict && Array.isArray(verdict.items)) {
      for (const item of verdict.items) {
        if (item.status === 'COVERED' || item.status === 'PARTIAL') {
          covered.push({
            testName: item.prdFeature,
            prdFeature: item.prdFeature,
            status: item.status,
            matchedImpl: item.matchedImpl,
            reasoning: item.reasoning,
          });
        } else if (item.status === 'NOT_IMPLEMENTED') {
          uncovered.push({
            testName: item.prdFeature,
            prdFeature: item.prdFeature,
            status: 'NOT_IMPLEMENTED',
            reasoning: item.reasoning,
            effort: inferEffortFromText(item.prdFeature),
          });
        }
      }
    }

    return {
      covered,
      uncovered,
      conflicts: [],
      coverageRate: verdict?.summary?.coverageRate ?? requirementsResults.coverageRate ?? 0,
      verdict,
      verdictMode: verdict ? 'llm' : 'none',
    };
  }

  /**
   * 做出决策
   */
  decide(analysis) {
    // 0. 需求验证处于 prompt 包模式（Agent 还没回答）→ NEED_HUMAN
    if (analysis.requirements.verdictMode === 'prompt') {
      return {
        action: 'NEED_HUMAN',
        reason: 'Agent verdict pending: read result.requirements._verdict.prompt and respond',
        context: {
          prompt: analysis.requirements.verdict?.prompt,
          instructions: analysis.requirements.verdict?.instructions,
          pendingCount: analysis.requirements.uncovered.length,
        },
      };
    }

    // 1. 有回归问题 → 修复
    if (analysis.visual.regressions.length > 0) {
      return {
        action: 'FIX_AND_RETRY',
        fixes: this.generateFixes(analysis.visual.regressions, 'visual'),
      };
    }

    // 2. 功能测试失败 → 修复
    if (analysis.functional.failed.length > 0) {
      return {
        action: 'FIX_AND_RETRY',
        fixes: this.generateFixes(analysis.functional.failed, 'functional'),
      };
    }

    // 3. 需求验证：verdict 驱动
    const verdict = analysis.requirements.verdict;
    if (verdict && verdict._mode !== 'prompt') {
      if (verdict.decision === 'FAIL') {
        // 用 FixEngine.fromVerdict 风格的 fixes
        const fixes = verdictToFixes(verdict);
        return {
          action: fixes.length > 0 ? 'FIX_AND_RETRY' : 'NEED_HUMAN',
          fixes,
          reason: fixes.length === 0 ? 'verdict FAIL but no actionable recommendations' : 'verdict FAIL with recommendations',
        };
      }
      if (verdict.decision === 'NEED_HUMAN') {
        return {
          action: 'NEED_HUMAN',
          reason: verdict.reasoning || 'verdict NEED_HUMAN',
          context: verdict,
        };
      }
      // verdict.decision === 'PASS' → 继续到 4
    }

    // 3b. 旧路径兼容：无 verdict 但有 uncovered
    if (!verdict && analysis.requirements.uncovered && analysis.requirements.uncovered.length > 0) {
      const complex = analysis.requirements.uncovered.filter(u => u.effort === 'HIGH');
      if (complex.length > 0) {
        return {
          action: 'NEED_HUMAN',
          reason: 'Complex requirements uncovered',
          context: complex,
        };
      }
      return {
        action: 'FIX_AND_RETRY',
        fixes: this.generateFixes(analysis.requirements.uncovered, 'requirements'),
      };
    }

    // 4. 有预期变更 → 更新 baseline
    if (analysis.visual.expectedChanges.length > 0) {
      return {
        action: 'UPDATE_BASELINE',
        baselines: analysis.visual.expectedChanges.map(e => e.testName),
      };
    }

    // 5. 全部通过
    return { action: 'STOP_SUCCESS' };
  }

  isKnownChange(result) {
    return this.knownChanges.some(change => result.testName && result.testName.includes(change.name));
  }

  isLikelyRegression(result) {
    const regressionPatterns = ['button', 'input', 'form', 'nav', 'menu', 'header', 'footer', 'modal', 'dialog'];
    const testName = (result.testName || '').toLowerCase();
    const mismatch = Number(result.misMatchPercentage || 0);
    return regressionPatterns.some(p => testName.includes(p)) && mismatch > 2;
  }

  generateFixes(items, type) {
    const usePatch = type === "visual" && (this.llmFn || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
    return items.map(item => ({
      type: usePatch ? "patch" : type,
      testName: item.testName || item.name,
      description: this.describeIssue(item, type),
      suggestedFix: this.suggestFix(item, type),
      priority: item.priority || 'MEDIUM',
    }));
  }

  describeIssue(item, type) {
    if (type === 'visual' && item.misMatchPercentage !== undefined) {
      return `Pixel diff: ${Number(item.misMatchPercentage).toFixed(2)}% in ${item.testName}`;
    }
    if (type === 'functional') {
      return `Functional test failed: ${item.testName} - ${item.error || 'unknown error'}`;
    }
    if (type === 'requirements') {
      return `Unmet requirement: ${item.prdFeature?.name || item.name || 'unknown'}`;
    }
    return `Issue in ${item.testName || item.name || 'unknown'}`;
  }

  suggestFix(item, type) {
    if (type === 'visual') {
      return `Review ${item.testName}: update baseline if change is expected, fix UI if regression.`;
    }
    if (type === 'functional') {
      return `Debug ${item.testName}: ${item.error || 'check console for details'}`;
    }
    if (type === 'requirements') {
      return `Implement requirement: ${item.prdFeature?.name || item.name}`;
    }
    return 'Manual review required';
  }
}

// ===== 辅助函数 =====

function inferEffortFromText(text) {
  if (!text) return 'MEDIUM';
  const s = String(text).toLowerCase();
  if (/(import|export|批量|batch|自动化|automate|integrate|api|oauth|sso|jwt)/.test(s)) return 'HIGH';
  if (/(显示|展示|提示|按钮|show|display|button|label|style)/.test(s)) return 'LOW';
  return 'MEDIUM';
}

function verdictToFixes(verdict) {
  // 不重复 FixEngine.fromVerdict 的逻辑，但保持兼容
  const fixes = [];
  if (Array.isArray(verdict.recommendations)) {
    verdict.recommendations.forEach((rec, i) => {
      fixes.push({
        type: 'verdict-recommendations',
        priority: i === 0 ? 'HIGH' : 'MEDIUM',
        effort: inferEffortFromText(rec),
        testName: rec,
        description: `Agent recommendation: ${rec}`,
        suggestedFix: rec,
        source: 'verdict.recommendations',
      });
    });
  }
  if (Array.isArray(verdict.items)) {
    for (const item of verdict.items) {
      if (item.status === 'NOT_IMPLEMENTED') {
        fixes.push({
          type: 'verdict-recommendations',
          priority: 'HIGH',
          effort: inferEffortFromText(item.prdFeature),
          testName: item.prdFeature,
          description: `PRD feature not implemented: ${item.prdFeature}`,
          suggestedFix: `Implement ${item.prdFeature}`,
          source: 'verdict.items.NOT_IMPLEMENTED',
        });
      } else if (item.status === 'PARTIAL') {
        fixes.push({
          type: 'verdict-recommendations',
          priority: 'MEDIUM',
          effort: inferEffortFromText(item.prdFeature),
          testName: item.prdFeature,
          description: `PRD feature partial: ${item.prdFeature}`,
          suggestedFix: `Complete ${item.prdFeature}`,
          source: 'verdict.items.PARTIAL',
        });
      }
    }
  }
  return fixes;
}

module.exports = { AIAnalyzer };