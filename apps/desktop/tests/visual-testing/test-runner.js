/**
 * 视觉测试运行器
 * 使用方式：
 *   const runner = new TestRunner({ headless: true });
 *   await runner.launch();
 *   await runner.testAllViews();
 *   await runner.close();
 */

const { chromium } = require('playwright');
const { OCRProvider } = require('./providers/ocr');
const { PixelDiffProvider } = require('./providers/pixel-diff');
const fs = require('fs');
const path = require('path');

class VisualTestRunner {
  constructor(options = {}) {
    this.url = options.url || 'http://localhost:5173';
    this.headless = options.headless ?? true;
    this.screenshotDir = options.screenshotDir || 'tests/visual-testing/screenshots';
    this.reportDir = options.reportDir || 'tests/visual-testing/reports';
    this.metaDir = options.metaDir || 'tests/visual-testing/meta';
    
    this.browser = null;
    this.context = null;
    this.page = null;
    
    // 初始化提供器
    this.ocr = new OCRProvider();
    this.pixelDiff = new PixelDiffProvider({ outputDir: `${this.reportDir}/pixel-diff` });
    
    this.results = [];
    this.testMeta = {}; // 存储每个测试的元数据
  }

  async launch() {
    this.browser = await chromium.launch({ 
      headless: this.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });
    this.page = await this.context.newPage();
    
    // 确保目录存在
    [this.screenshotDir, this.reportDir, this.metaDir].forEach(d => 
      fs.mkdirSync(d, { recursive: true })
    );
    
    // 加载已有的 meta 数据
    this._loadMeta();
  }

  /**
   * 加载已有的 meta.json 数据
   */
  _loadMeta() {
    const metaPath = path.join(this.metaDir, 'pixel-tests-meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        this.testMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {
        this.testMeta = {};
      }
    }
  }

  /**
   * 保存 meta 数据到文件
   */
  _saveMeta() {
    const metaPath = path.join(this.metaDir, 'pixel-tests-meta.json');
    fs.writeFileSync(metaPath, JSON.stringify(this.testMeta, null, 2), 'utf8');
  }

  /**
   * 截图并分析
   */
  async captureAndAnalyze(viewName, prompt, options = {}) {
    const screenshotPath = path.join(this.screenshotDir, `${viewName}.png`);
    await this.page.screenshot({ path: screenshotPath, fullPage: options.fullPage });
    
    if (options.useOCR) {
      const text = await this.ocr.extractText(screenshotPath);
      return { screenshotPath, text, prompt };
    }
    
    return { screenshotPath, prompt };
  }

  /**
   * 像素对比测试
   */
  async pixelRegressionTest(testName, route, options = {}) {
    await this.page.goto(`${this.url}${route}`);
    if (options.waitFor) await this.page.waitForSelector(options.waitFor);
    if (options.waitMs) await this.page.waitForTimeout(options.waitMs);
    
    const currentPath = path.join(this.screenshotDir, `${testName}-current.png`);
    const baselinePath = path.join('tests/visual-testing/base-screenshots', `${testName}.png`);
    
    await this.page.screenshot({ path: currentPath });
    
    // 如果没有基准图，创建
    if (!fs.existsSync(baselinePath)) {
      await this.pixelDiff.updateBaseline(currentPath, baselinePath);
      // 保存 meta 信息
      this.testMeta[testName] = { route, createdAt: new Date().toISOString() };
      this._saveMeta();
      this.results.push({ test: testName, status: 'BASELINE_CREATED', route });
      return { status: 'BASELINE_CREATED', baselinePath };
    }
    
    // 对比
    const result = await this.pixelDiff.compare(baselinePath, currentPath, testName);
    
    // 保存 meta 信息（包括真实 misMatchPercentage）
    this.testMeta[testName] = { 
      route, 
      misMatchPercentage: result.misMatchPercentage,
      threshold: this.pixelDiff.threshold,
      updatedAt: new Date().toISOString()
    };
    this._saveMeta();
    
    this.results.push({
      test: testName,
      status: result.passed ? 'PASSED' : 'FAILED',
      misMatchPercentage: result.misMatchPercentage,
      diffPath: result.diffImagePath,
      route
    });

    // 对比失败: 主动 throw, 让调用方 (run-pixel-tests.js) 记录 failed 并返回非零退出码
    // 始于 2026-07-12 质量节拍: 避免 CI 因容错错误报告通过
    if (!result.passed) {
      throw new Error(
        '像素对比失败 (' + testName + '): misMatchPercentage=' + result.misMatchPercentage.toFixed(2) + '% ' +
        '(threshold=' + (this.pixelDiff.threshold * 100) + '%); 差异图: ' + result.diffImagePath
      );
    }

    return result;
  }

  /**
   * 生成测试报告
   */
  generateReport() {
    const passed = this.results.filter(r => r.status === 'PASSED').length;
    const failed = this.results.filter(r => r.status === 'FAILED').length;
    const total = this.results.length;
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: { total, passed, failed, passRate: `${((passed/total)*100).toFixed(1)}%` },
      results: this.results
    };
    
    const reportPath = path.join(this.reportDir, `report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      视觉测试报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  总计: ${total}
  通过: ✓ ${passed}
  失败: ✗ ${failed}
  通过率: ${((passed/total)*100).toFixed(1)}%
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  报告: ${reportPath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    
    return report;
  }
}

module.exports = { VisualTestRunner };
