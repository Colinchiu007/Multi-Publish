/**
 * TestOrchestrator - 测试循环协调器
 * 
 * 管理完整的测试-分析-修复循环
 * 
 * 使用方式:
 *   const { TestOrchestrator } = require('@multi-publish/ai-autonomous-tester');
 *   const orchestrator = new TestOrchestrator({ maxIterations: 5 });
 *   const report = await orchestrator.start({ testRunner, analyzer, fixEngine });
 */

const { AIAnalyzer } = require('./ai-analyzer');
const { FixEngine } = require('./fix-engine');

class TestOrchestrator {
  constructor(options = {}) {
    this.maxIterations = options.maxIterations || 5;
    this.iterationDelay = options.iterationDelay || 5000;
    this.logger = options.logger || console;

    this.testRunner = options.testRunner || null;
    this.analyzer = options.analyzer || new AIAnalyzer();
    this.fixEngine = options.fixEngine || new FixEngine();

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
   * 开始自主测试循环
   */
  async start(context = {}) {
    this.logger.log(`\nStarting autonomous test loop (max ${this.maxIterations} iterations)`);

    if (!this.testRunner) {
      throw new Error('TestOrchestrator: testRunner is required');
    }

    while (this.currentIteration < this.maxIterations) {
      this.currentIteration++;
      this.logger.log(`\n=== Iteration ${this.currentIteration}/${this.maxIterations} ===`);

      const iterationResult = await this.runIteration(context);

      if (iterationResult.decision === 'STOP_SUCCESS') {
        return this.buildReport('SUCCESS');
      }

      if (iterationResult.decision === 'STOP_NO_PROGRESS') {
        return this.buildReport('NO_PROGRESS');
      }

      if (iterationResult.decision === 'NEED_HUMAN') {
        return this.buildReport('NEED_HUMAN', { reason: iterationResult.reason });
      }

      if (iterationResult.decision === 'FIX_AND_RETRY' || iterationResult.decision === 'UPDATE_BASELINE') {
        await this.delay(this.iterationDelay);
      }
    }

    return this.buildReport('MAX_ITERATIONS');
  }

  /**
   * 单次迭代
   */
  async runIteration(context) {
    // 1. 执行测试
    const testResults = await this.testRunner.runTests({
      ...context,
      iteration: this.currentIteration,
    });

    // 2. AI 分析
    const analysis = await this.analyzer.analyze(testResults);

    // 3. 决策
    const decisionResult = this.analyzer.decide(analysis);

    // 4. 记录历史
    const historyEntry = {
      iteration: this.currentIteration,
      timestamp: new Date().toISOString(),
      testResults,
      analysis,
      decision: decisionResult.action,
    };
    this.iterationHistory.push(historyEntry);

    // 5. 处理决策
    if (decisionResult.action === 'FIX_AND_RETRY') {
      const fixResult = await this.fixEngine.execute(decisionResult.fixes || []);
      historyEntry.fixResult = fixResult;
    }

    return { decision: decisionResult.action, ...decisionResult };
  }

  /**
   * 生成最终报告
   */
  buildReport(status, extra = {}) {
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

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { TestOrchestrator };
