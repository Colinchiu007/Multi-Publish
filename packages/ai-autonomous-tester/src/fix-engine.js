/**
 * FixEngine - 修复引擎
 * 
 * 执行代码修复、Baseline 更新、文档更新
 * 
 * 使用方式:
 *   const engine = new FixEngine({ logger: console });
 *   const result = await engine.execute([{ type: 'baseline', testName: 'home' }]);
 */

const fs = require('fs');
const path = require('path');

class FixEngine {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.strategies = {
      baseline: new BaselineStrategy(options),
      visual: new VisualFixStrategy(options),
      functional: new FunctionalFixStrategy(options),
      requirements: new RequirementsFixStrategy(options),
    };
  }

  /**
   * 执行修复列表
   */
  async execute(fixes) {
    if (!fixes || fixes.length === 0) {
      return { success: true, results: [] };
    }

    const results = [];
    for (const fix of fixes) {
      this.logger.log(`Applying fix: ${fix.type} - ${fix.testName}`);
      const strategy = this.strategies[fix.type];

      if (!strategy) {
        results.push({ fix, success: false, error: `Unknown fix type: ${fix.type}` });
        continue;
      }

      try {
        const result = await strategy.apply(fix);
        results.push({ fix, success: true, ...result });
      } catch (error) {
        results.push({ fix, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.log(`Fixes applied: ${successCount}/${results.length}`);

    return { success: successCount === results.length, results };
  }
}

/**
 * Baseline 更新策略
 */
class BaselineStrategy {
  constructor(options = {}) {
    this.logger = options.logger || console;
  }

  async apply(fix) {
    const screenshotDir = fix.screenshotDir || 'tests/visual-testing/screenshots';
    const baselineDir = fix.baselineDir || 'tests/visual-testing/base-screenshots';

    const currentPath = path.join(screenshotDir, `${fix.testName}-current.png`);
    const baselinePath = path.join(baselineDir, `${fix.testName}.png`);

    if (!fs.existsSync(currentPath)) {
      throw new Error(`Current screenshot not found: ${currentPath}`);
    }

    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.copyFileSync(currentPath, baselinePath);
    this.logger.log(`Baseline updated: ${fix.testName}`);

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
 * 功能修复策略
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
 * 需求修复策略
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

module.exports = { FixEngine };
