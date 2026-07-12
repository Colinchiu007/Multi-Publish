/**
 * FunctionalTestRunner - 功能测试运行器
 *
 * 通过 Playwright 执行预定义步骤序列（点击、输入、等待）
 * 验证页面状态（元素可见、文字包含、URL 匹配）
 *
 * 使用方式:
 *   const { FunctionalTestRunner } = require("@multi-publish/ai-autonomous-tester");
 *   const runner = new FunctionalTestRunner({ url: "http://localhost:5173" });
 *   await runner.launch();
 *   const result = await runner.runTests({
 *     targets: [{
 *       name: "account-add",
 *       steps: [{ action: "goto", url: "/accounts" }, { action: "click", selector: "[data-testid=add]" }],
 *       assertions: [{ type: "elementVisible", selector: "[data-testid=success]" }]
 *     }]
 *   });
 *   await runner.close();
 */

const { chromium } = require("playwright");
const fs = require("fs");
const { BaseTestRunner } = require("./base-runner");

class FunctionalTestRunner extends BaseTestRunner {
  constructor(options = {}) {
    super({ ...options, label: "functional" });
    this.url = options.url || process.env.TEST_URL || "http://localhost:5173";
    this.headless = options.headless ?? (process.env.TEST_HEADLESS !== "false");
    this.viewport = options.viewport || { width: 1920, height: 1080 };
    this.timeout = options.timeout || 10000;

    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async launch() {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    this.context = await this.browser.newContext({ viewport: this.viewport });
    this.page = await this.context.newPage();

    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  /**
   * 运行一组功能测试用例
   * @param {Object} context
   * @param {Array} context.targets - [{ name, description?, steps, assertions }]
   */
  async runTests(context = {}) {
    if (!this.browser) await this.launch();

    const targets = context.targets || [];
    const details = [];

    for (const target of targets) {
      try {
        await this._runOne(target);
        details.push({
          testName: target.name,
          status: "PASSED",
          description: target.description,
        });
      } catch (err) {
        details.push({
          testName: target.name,
          status: "FAILED",
          error: err.message,
          description: target.description,
        });
      }
    }

    return {
      type: "functional",
      summary: this.summarize(details),
      details,
    };
  }

  async _runOne(target) {
    const { steps = [], assertions = [] } = target;

    for (const step of steps) {
      await this._executeStep(step);
    }

    for (const assertion of assertions) {
      const passed = await this._checkAssertion(assertion);
      if (!passed) {
        throw new Error(`Assertion failed: ${assertion.type} ${assertion.selector || assertion.text || ""}`);
      }
    }
  }

  async _executeStep(step) {
    switch (step.action) {
      case "goto":
        await this.page.goto(`${this.url}${step.url || ""}`, { timeout: this.timeout });
        break;
      case "click":
        await this.page.click(step.selector, { timeout: this.timeout });
        break;
      case "fill":
        await this.page.fill(step.selector, step.value || "");
        break;
      case "select":
        await this.page.selectOption(step.selector, step.value);
        break;
      case "waitFor":
        await this.page.waitForSelector(step.selector, { timeout: step.timeout || this.timeout });
        break;
      case "waitMs":
        await this.page.waitForTimeout(step.value || 1000);
        break;
      case "press":
        await this.page.keyboard.press(step.key);
        break;
      case "screenshot":
        await this.page.screenshot({ path: step.path });
        break;
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  async _checkAssertion(assertion) {
    switch (assertion.type) {
      case "elementVisible": {
        const visible = await this.page.isVisible(assertion.selector);
        if (!visible) throw new Error(`Element not visible: ${assertion.selector}`);
        return true;
      }
      case "elementContains": {
        const text = await this.page.textContent(assertion.selector);
        const ok = (text || "").includes(assertion.text || "");
        if (!ok) throw new Error(`Element ${assertion.selector} does not contain: ${assertion.text}`);
        return true;
      }
      case "urlContains": {
        const url = this.page.url();
        const ok = url.includes(assertion.text || "");
        if (!ok) throw new Error(`URL ${url} does not contain: ${assertion.text}`);
        return true;
      }
      default:
        throw new Error(`Unknown assertion type: ${assertion.type}`);
    }
  }
}

module.exports = { FunctionalTestRunner };
