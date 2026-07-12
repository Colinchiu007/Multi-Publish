/**
 * RequirementsTestRunner - 需求验证运行器
 *
 * 比对 PRD 功能点与代码中已实现的功能，计算覆盖率
 *
 * 使用方式:
 *   const { RequirementsTestRunner } = require("@multi-publish/ai-autonomous-tester");
 *   const runner = new RequirementsTestRunner();
 *   const result = await runner.runTests({
 *     prdPath: "./PRD.md",
 *     srcDir: "./src"
 *   });
 */

const { BaseTestRunner } = require("./base-runner");
const { RequirementsVerifier } = require("../verifier/requirements-verifier");

class RequirementsTestRunner extends BaseTestRunner {
  constructor(options = {}) {
    super({ ...options, label: "requirements" });
    this.verifier = options.verifier || new RequirementsVerifier(options);
  }

  async runTests(context = {}) {
    if (!context.prdPath) {
      return { type: "requirements", summary: { total: 0, passed: 0, failed: 0 }, details: [], skipped: true };
    }

    const result = await this.verifier.verify(context.prdPath, { srcDir: context.srcDir });

    const details = [];
    for (const c of result.covered) {
      details.push({
        testName: c.prdFeature.name,
        status: "PASSED",
        type: "covered",
        effort: c.prdFeature.effort || "MEDIUM",
      });
    }
    for (const u of result.uncovered) {
      details.push({
        testName: u.prdFeature.name,
        status: "FAILED",
        type: "uncovered",
        effort: u.effort,
        status_reason: "PRD feature not detected in code",
      });
    }

    return {
      type: "requirements",
      summary: this.summarize(details),
      details,
      coverageRate: result.coverageRate,
      totalPrdFeatures: result.totalPrdFeatures,
      totalImplementedFeatures: result.totalImplementedFeatures,
    };
  }
}

module.exports = { RequirementsTestRunner };
