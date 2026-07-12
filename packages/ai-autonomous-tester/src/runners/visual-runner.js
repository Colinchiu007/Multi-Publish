/**
 * VisualTestRunner - 视觉回归测试运行器
 *
 * 使用方式:
 *   const { VisualTestRunner } = require("@multi-publish/ai-autonomous-tester");
 *   const runner = new VisualTestRunner({ url: "http://localhost:5173" });
 *   await runner.launch();
 *   const result = await runner.runTests({ targets: [...] });
 *   await runner.close();
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { BaseTestRunner } = require("./base-runner");
const { PixelDiffProvider } = require("../providers/pixel-diff");
const { OCRProvider } = require("../providers/ocr");

class VisualTestRunner extends BaseTestRunner {
  constructor(options = {}) {
    super({ ...options, label: "visual" });
    this.url = options.url || process.env.TEST_URL || "http://localhost:5173";
    this.headless = options.headless ?? (process.env.TEST_HEADLESS !== "false");
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.screenshotDir = options.screenshotDir || "tests/visual-testing/screenshots";
    this.baselineDir = options.baselineDir || "tests/visual-testing/base-screenshots";
    this.metaDir = options.metaDir || "tests/visual-testing/meta";
    this.threshold = options.threshold || 0.1;

    this.browser = null;
    this.context = null;
    this.page = null;
    this.testMeta = {};
    this.pixelDiff = new PixelDiffProvider({
      threshold: this.threshold,
      outputDir: path.join(this.reportDir, "pixel-diff"),
    });
    this.ocr = new OCRProvider();
  }

  async launch() {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({ viewport: this.viewport });
    this.page = await this.context.newPage();

    [this.screenshotDir, this.reportDir, this.metaDir, this.baselineDir].forEach(d =>
      fs.mkdirSync(d, { recursive: true })
    );

    this._loadMeta();
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  /**
   * 运行一组视觉测试目标
   * @param {Object} context
   * @param {Array} context.targets - [{ name, route, waitFor?, waitMs? }]
   */
  async runTests(context = {}) {
    if (!this.browser) await this.launch();

    const targets = context.targets || this._defaultTargets();
    const details = [];

    for (const target of targets) {
      try {
        const r = await this._runOne(target);
        details.push({
          testName: target.name,
          route: target.route,
          status: r.passed ? "PASSED" : (r.status === "BASELINE_CREATED" ? "BASELINE_CREATED" : "FAILED"),
          misMatchPercentage: r.misMatchPercentage ?? 0,
          diffPath: r.diffImagePath || null,
        });
      } catch (err) {
        details.push({
          testName: target.name,
          route: target.route,
          status: "FAILED",
          error: err.message,
        });
      }
    }

    return {
      type: "visual",
      summary: this.summarize(details),
      details,
    };
  }

  /**
   * 像素回归测试（兼容旧 API）
   */
  async pixelRegressionTest(testName, route, options = {}) {
    return this._runOne({ name: testName, route, ...options });
  }

  async _runOne(target) {
    const { name: testName, route, waitFor, waitMs } = target;

    await this.page.goto(`${this.url}${route}`);
    if (waitFor) await this.page.waitForSelector(waitFor);
    if (waitMs) await this.page.waitForTimeout(waitMs);

    const currentPath = path.join(this.screenshotDir, `${testName}-current.png`);
    const baselinePath = path.join(this.baselineDir, `${testName}.png`);
    await this.page.screenshot({ path: currentPath });

    if (!fs.existsSync(baselinePath)) {
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      fs.copyFileSync(currentPath, baselinePath);
      this._saveMetaFor(testName, { route, createdAt: new Date().toISOString() });
      return { status: "BASELINE_CREATED", passed: true };
    }

    const result = await this.pixelDiff.compare(baselinePath, currentPath, testName);
    this._saveMetaFor(testName, {
      route,
      misMatchPercentage: result.misMatchPercentage,
      threshold: this.threshold,
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  _saveMetaFor(testName, data) {
    this.testMeta[testName] = data;
    const metaPath = path.join(this.metaDir, "pixel-tests-meta.json");
    fs.writeFileSync(metaPath, JSON.stringify(this.testMeta, null, 2), "utf8");
  }

  _loadMeta() {
    const metaPath = path.join(this.metaDir, "pixel-tests-meta.json");
    if (fs.existsSync(metaPath)) {
      try {
        this.testMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      } catch (e) {
        this.testMeta = {};
      }
    }
  }

  _defaultTargets() {
    return [
      { name: "home-baseline", route: "/" },
      { name: "accounts-list", route: "/accounts" },
      { name: "publish-form", route: "/publish" },
    ];
  }
}

module.exports = { VisualTestRunner };
