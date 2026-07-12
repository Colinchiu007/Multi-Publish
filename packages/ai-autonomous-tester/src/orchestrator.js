/**
 * TestOrchestrator - 测试循环协调器
 *
 * 完整测试-分析-修复循环，支持自定义测试目标
 *
 * 使用方式:
 *   const { TestOrchestrator, AutonomousTestRunner } = require("@multi-publish/ai-autonomous-tester");
 *
 *   const runner = new AutonomousTestRunner({ url: "http://localhost:5173" });
 *   const orchestrator = new TestOrchestrator({ maxIterations: 5, testRunner: runner });
 *
 *   const report = await orchestrator.start({
 *     visual: { targets: [{ name: "home", route: "/" }] },
 *     functional: { targets: [{ name: "login", steps: [...], assertions: [...] }] },
 *     requirements: { prdPath: "./PRD.md", srcDir: "./src" }
 *   });
 *
 *   console.log(report.finalStatus);
 */

const { AIAnalyzer } = require("./ai-analyzer");
const { FixEngine } = require("./fix-engine");
const { AutonomousTestRunner } = require("./runners/autonomous-runner");

class TestOrchestrator {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 5;
    this.iterationDelay = options.iterationDelay || 5000;
    this.logger = options.logger || console;
    this.stopOnSuccess = options.stopOnSuccess !== false;
    this.llmFn = options.llmFn || null;

    // 顶层 llmFn 自动注入到 testRunner（如果 testRunner 是 AutonomousTestRunner）
    const runnerOptions = this.llmFn ? { llmFn: this.llmFn } : {};
    this.testRunner = options.testRunner || new AutonomousTestRunner(runnerOptions);
    if (this.llmFn && this.testRunner && !this.testRunner.options?.llmFn) {
      this.testRunner.options = { ...(this.testRunner.options || {}), llmFn: this.llmFn };
      // 重建 requirements 子 runner 以注入 llmFn
      try {
        const { RequirementsTestRunner } = require("./runners/requirements-runner");
        this.testRunner.requirements = new RequirementsTestRunner({ llmFn: this.llmFn });
      } catch (e) {
        // 非 AutonomousTestRunner 时跳过
      }
    }
    this.analyzer = options.analyzer || new AIAnalyzer();
    this.fixEngine = options.fixEngine || new FixEngine({ logger: this.logger });

    this.iterationHistory = [];
    this.currentIteration = 0;
  }

  /**
   * 设置自定义测试运行器
   */
  setTestRunner(runner) {
    this.testRunner = runner;
  }

  /**
   * 启动自主测试循环
   */
  async start(context = {}) {
    this.logger.log(`\nStarting autonomous test loop (max ${this.maxIterations} iterations)`);
    this.logger.log(`Visual | Functional | Requirements coverage\n`);

    try {
      await this.testRunner.launch?.();
    } catch (e) {
      this.logger.log(`Warning: launch failed: ${e.message}`);
    }

    try {
      while (this.currentIteration < this.maxIterations) {
        this.currentIteration++;
        this.logger.log(`\n=== Iteration ${this.currentIteration}/${this.maxIterations} ===`);

        const result = await this._runIteration(context);

        if (result.action === "STOP_SUCCESS" && this.stopOnSuccess) {
          return this._buildReport("SUCCESS");
        }
        if (result.action === "STOP_NO_PROGRESS") {
          return this._buildReport("NO_PROGRESS");
        }
        if (result.action === "NEED_HUMAN") {
          return this._buildReport("NEED_HUMAN", { reason: result.reason });
        }
        if (result.action === "FIX_AND_RETRY" || result.action === "UPDATE_BASELINE") {
          await this._delay(this.iterationDelay);
        }
      }

      return this._buildReport("MAX_ITERATIONS");
    } finally {
      try {
        await this.testRunner.close?.();
      } catch (e) {
        // ignore close errors
      }
    }
  }

  /**
   * 单次迭代
   */
  async _runIteration(context) {
    const testResults = await this.testRunner.runTests(context);

    const analysis = await this.analyzer.analyze(testResults);
    const decisionResult = this.analyzer.decide(analysis);

    const historyEntry = {
      iteration: this.currentIteration,
      timestamp: new Date().toISOString(),
      summary: testResults.summary,
      visual: testResults.visual?.summary,
      functional: testResults.functional?.summary,
      requirements: testResults.requirements?.summary,
      decision: decisionResult.action,
      analysis: {
        visual: analysis.visual ? {
          regressions: analysis.visual.regressions.length,
          expectedChanges: analysis.visual.expectedChanges.length,
          noise: analysis.visual.noise.length,
        } : null,
        functional: analysis.functional ? {
          passed: analysis.functional.passed.length,
          failed: analysis.functional.failed.length,
        } : null,
        requirements: analysis.requirements ? {
          covered: analysis.requirements.covered.length,
          uncovered: analysis.requirements.uncovered.length,
          coverageRate: analysis.requirements.coverageRate,
        } : null,
        overallRisk: analysis.overallRisk,
      },
    };
    this.iterationHistory.push(historyEntry);

    this.logger.log(`Result: ${testResults.summary.passed}/${testResults.summary.total} passed (${testResults.summary.passRate})`);
    this.logger.log(`Risk: ${analysis.overallRisk}`);
    this.logger.log(`Decision: ${decisionResult.action}`);

    if (decisionResult.action === "FIX_AND_RETRY") {
      const fixResult = await this.fixEngine.execute(decisionResult.fixes || []);
      historyEntry.fixResult = fixResult;
    }

    return { action: decisionResult.action, ...decisionResult };
  }

  /**
   * 检测无进展：连续两轮失败的 details hash 相同
   */
  _isNoProgress() {
    if (this.iterationHistory.length < 2) return false;
    const last = this.iterationHistory[this.iterationHistory.length - 1];
    const prev = this.iterationHistory[this.iterationHistory.length - 2];
    return JSON.stringify(last.summary) === JSON.stringify(prev.summary);
  }

  /**
   * 生成最终报告
   */
  _buildReport(status, extra = {}) {
    const report = {
      generatedAt: new Date().toISOString(),
      finalStatus: status,
      iterations: this.currentIteration,
      maxIterations: this.maxIterations,
      iterationHistory: this.iterationHistory,
      ...extra,
    };
    this.logger.log(`\nFinal status: ${status} (after ${this.currentIteration} iterations)`);
    return report;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { TestOrchestrator };
