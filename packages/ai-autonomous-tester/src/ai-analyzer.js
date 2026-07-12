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
 */

class AIAnalyzer {
  constructor(options = {}) {
    this.noiseThreshold = options.noiseThreshold || 0.5;
    this.knownChanges = options.knownChanges || [];
    this.needHumanPatterns = options.needHumanPatterns || [
      'content_disagreement',
      'complex_layout_change',
      'cross_module_impact',
    ];
  }

  /**
   * 分析测试结果
   */
  async analyze(testResults) {
    const analysis = {
      visual: this.analyzeVisual(testResults.visual),
      functional: this.analyzeFunctional(testResults.functional),
      requirements: this.analyzeRequirements(testResults.requirements),
    };

    // 计算整体风险等级
    let overallRisk = 'LOW';
    if (analysis.visual.regressions.length > 0 || analysis.functional.failed.length > 0) {
      overallRisk = 'HIGH';
    } else if (analysis.visual.expectedChanges.length > 0) {
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
      } else if (this.isKnownChange(result)) {
        expectedChanges.push(result);
      } else if (this.isLikelyRegression(result)) {
        regressions.push(result);
      } else {
        expectedChanges.push({ ...result, uncertain: true });
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
   * 分析需求验证结果
   */
  analyzeRequirements(requirementsResults) {
    if (!requirementsResults) {
      return { covered: [], uncovered: [], conflicts: [], coverageRate: 0 };
    }
    return {
      covered: requirementsResults.covered || [],
      uncovered: requirementsResults.uncovered || [],
      conflicts: requirementsResults.conflicts || [],
      coverageRate: requirementsResults.coverageRate || 0,
    };
  }

  /**
   * 做出决策
   */
  decide(analysis) {
    // 1. 有回归问题 -> 修复
    if (analysis.visual.regressions.length > 0) {
      return {
        action: 'FIX_AND_RETRY',
        fixes: this.generateFixes(analysis.visual.regressions, 'visual'),
      };
    }

    // 2. 功能测试失败 -> 修复
    if (analysis.functional.failed.length > 0) {
      return {
        action: 'FIX_AND_RETRY',
        fixes: this.generateFixes(analysis.functional.failed, 'functional'),
      };
    }

    // 3. 有未满足的需求 -> 判断是否需要人工
    if (analysis.requirements.uncovered && analysis.requirements.uncovered.length > 0) {
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

    // 4. 有预期变更 -> 更新 baseline
    if (analysis.visual.expectedChanges.length > 0) {
      return {
        action: 'UPDATE_BASELINE',
        baselines: analysis.visual.expectedChanges.map(e => e.testName),
      };
    }

    // 5. 全部通过
    return { action: 'STOP_SUCCESS' };
  }

  /**
   * 判断是否为已知变更
   */
  isKnownChange(result) {
    return this.knownChanges.some(change => result.testName && result.testName.includes(change.name));
  }

  /**
   * 判断是否为回归问题（启发式）
   */
  isLikelyRegression(result) {
    const regressionPatterns = ['button', 'input', 'form', 'nav', 'menu', 'header', 'footer', 'modal', 'dialog'];
    const testName = (result.testName || '').toLowerCase();
    const mismatch = Number(result.misMatchPercentage || 0);
    return regressionPatterns.some(p => testName.includes(p)) && mismatch > 2;
  }

  /**
   * 生成修复方案
   */
  generateFixes(items, type) {
    return items.map(item => ({
      type,
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

module.exports = { AIAnalyzer };
