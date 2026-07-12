/**
 * BaseTestRunner - 测试运行器基类
 *
 * 提供通用能力：报告生成、生命周期管理、子类扩展点
 *
 * 子类需实现:
 *   - async runTests(context) 返回 { summary, details, ... }
 */

const fs = require("fs");
const path = require("path");

class BaseTestRunner {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.reportDir = options.reportDir || "tests/visual-testing/reports";
    this.results = [];
    this.label = options.label || "base";
  }

  /**
   * 子类入口
   */
  async runTests(context = {}) {
    throw new Error("BaseTestRunner: subclass must implement runTests()");
  }

  /**
   * 汇总结果
   */
  summarize(details) {
    const passed = details.filter(d => d.status === "PASSED").length;
    const failed = details.filter(d => d.status === "FAILED").length;
    const baselineCreated = details.filter(d => d.status === "BASELINE_CREATED").length;
    return {
      total: details.length,
      passed,
      failed,
      baselineCreated,
      passRate: details.length > 0
        ? `${((passed / details.length) * 100).toFixed(1)}%`
        : "N/A",
    };
  }

  /**
   * 生成报告文件
   */
  generateReportFile(type, payload) {
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
    const reportPath = path.join(this.reportDir, `${type}-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
    return reportPath;
  }
}

module.exports = { BaseTestRunner };
