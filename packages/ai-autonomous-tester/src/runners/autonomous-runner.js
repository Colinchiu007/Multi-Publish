/**
 * AutonomousTestRunner - 聚合测试运行器
 *
 * 组合 Visual + Functional + Requirements 三类运行器，
 * 由 TestOrchestrator 调用。一次 runTests() 返回三类结果。
 *
 * 使用方式:
 *   const { AutonomousTestRunner } = require("@multi-publish/ai-autonomous-tester");
 *   const runner = new AutonomousTestRunner({ url: "..." });
 *   await runner.launch();
 *   const result = await runner.runTests({
 *     visual: { targets: [...] },
 *     functional: { targets: [...] },
 *     requirements: { prdPath: "./PRD.md", srcDir: "./src" }
 *   });
 *   await runner.close();
 */

const { VisualTestRunner } = require("./visual-runner");
const { FunctionalTestRunner } = require("./functional-runner");
const { RequirementsTestRunner } = require("./requirements-runner");

class AutonomousTestRunner {
  constructor(options = {}) {
    this.visual = options.visualRunner || new VisualTestRunner(options);
    this.functional = options.functionalRunner || new FunctionalTestRunner(options);
    this.requirements = options.requirementsRunner || new RequirementsTestRunner(options);
  }

  async launch() {
    await this.visual.launch();
    await this.functional.launch();
  }

  async close() {
    await this.visual.close();
    await this.functional.close();
  }

  /**
   * 一次跑完三类测试
   */
  async runTests(context = {}) {
    const [visual, functional, requirements] = await Promise.all([
      this.visual.runTests(context.visual || {}).catch(e => this._errorResult("visual", e)),
      this.functional.runTests(context.functional || {}).catch(e => this._errorResult("functional", e)),
      this.requirements.runTests(context.requirements || {}).catch(e => this._errorResult("requirements", e)),
    ]);

    const totalPassed =
      (visual.summary?.passed || 0) +
      (functional.summary?.passed || 0) +
      (requirements.summary?.passed || 0);
    const totalFailed =
      (visual.summary?.failed || 0) +
      (functional.summary?.failed || 0) +
      (requirements.summary?.failed || 0);

    return {
      timestamp: new Date().toISOString(),
      visual,
      functional,
      requirements,
      summary: {
        total: totalPassed + totalFailed,
        passed: totalPassed,
        failed: totalFailed,
        passRate: (totalPassed + totalFailed) > 0
          ? `${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`
          : "N/A",
      },
    };
  }

  _errorResult(type, err) {
    return {
      type,
      summary: { total: 0, passed: 0, failed: 0, error: err.message },
      details: [],
    };
  }
}

module.exports = { AutonomousTestRunner };
