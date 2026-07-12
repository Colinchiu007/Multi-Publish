/**
 * Agent 视觉判断报告生成器
 *
 * 用途：像素对比失败后，生成结构化报告供 Agent 读取截图并自行判断。
 * Agent 不需要任何外部 API Key —— 自己就是视觉推理引擎。
 *
 * 使用方式：
 *   node tests/visual-testing/scripts/agent-visual-judge.js
 *   # 输出 judge-report.md 和 agent-judge-results.json
 *
 * Agent 读 judge-report.md，用 view_image 工具看图，自己判断对不对。
 *
 * CI 集成：
 *   在 run-pixel-tests.js 失败后，CI 流程调用本脚本生成报告，
 *   然后将 judge-report.md 作为一个 review 步骤交给 Agent 处理。
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const REPORT_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/reports');
const SCREENSHOT_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/screenshots');
const DIFF_DIR = path.join(REPORT_DIR, 'pixel-diff');
const BASELINE_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/base-screenshots');
const OUTPUT_MD = path.join(REPORT_DIR, 'judge-report.md');
const OUTPUT_JSON = path.join(REPORT_DIR, 'agent-judge-results.json');

// 确保目录存在
[REPORT_DIR, SCREENSHOT_DIR, DIFF_DIR, BASELINE_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ANSI 颜色
const C = {
  reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', bold: '\x1b[1m', dim: '\x1b[2m'
};

function log(color, tag, msg) {
  console.log(`${color}[${tag}]${C.reset} ${msg}`);
}

function toFileUrl(absPath) {
  // Windows 路径转 file:// URL
  return 'file:///' + absPath.replace(/\\/g, '/');
}

/**
 * 扫描 pixel-diff 目录，找出最近生成的差异图
 */
function scanDiffImages() {
  if (!fs.existsSync(DIFF_DIR)) return [];
  const files = fs.readdirSync(DIFF_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(DIFF_DIR, f))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
  return files;
}

/**
 * 从差异图文件名提取测试名
 * 格式: {testName}-{timestamp}.png
 */
function extractTestName(diffPath) {
  const basename = path.basename(diffPath, '.png');
  // 去掉末尾时间戳（纯数字）
  return basename.replace(/-\d+$/, '');
}

/**
 * 生成 Markdown 报告（供 Agent view_image 读取）
 */
function generateMarkdownReport(results, diffImages) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const total = results.length;
  const failed = results.filter(r => r.pixelDiff && !r.pixelDiff.passed).length;
  const passed = total - failed;

  let md = `# Agent 视觉判断报告\n\n`;
  md += `**生成时间**: ${now}\n`;
  md += `**测试总数**: ${total} | **像素对比失败**: ${failed} | **待 Agent 判断**: ${failed}\n\n`;

  md += `## Agent 判断任务\n\n`;
  md += `请用 **view_image** 工具查看以下截图，判断每个测试是否真的有问题。\n`;
  md += `判断依据：截图是否符合预期 UI 布局、文字内容、交互状态。\n\n`;

  md += `---\n\n`;

  results.forEach((r, i) => {
    const diff = r.pixelDiff;
    const hasPixelDiff = diff && !diff.passed;

    md += `### ${i + 1}. ${r.testName}\n\n`;
    md += `- **路由**: \`${r.route}\`\n`;
    md += `- **像素对比**: ${hasPixelDiff ? `${C.red}失败${C.reset} (差异 ${diff.misMatchPercentage.toFixed(2)}%)` : `${C.green}通过${C.reset}`}\n`;
    md += `- **截图**: \`${r.screenshotPath}\`\n`;

    if (hasPixelDiff) {
      md += `- **差异图**: \`${diff.diffImagePath}\`\n`;
      md += `- **阈值**: ${(r.threshold * 100).toFixed(0)}%\n\n`;
      md += `**截图对比:**\n\n`;
      md += `| 类型 | 路径 |\n`;
      md += `|------|------|\n`;
      md += `| 基线 | ${toFileUrl(r.baselinePath)} |\n`;
      md += `| 当前 | ${toFileUrl(r.screenshotPath)} |\n`;
      md += `| 差异 | ${toFileUrl(diff.diffImagePath)} |\n\n`;
      md += `**Agent 判断:**\n\n`;
      md += `- [ ] **通过**: 截图视觉上符合预期，差异是正常的 UI 变化\n`;
      md += `- [ ] **失败**: 截图存在明显的 UI 错误（布局错乱、文字错误、元素缺失等）\n`;
      md += `- [ ] **需要人工确认**: 不确定，需要更多信息\n\n`;
      md += `**Agent 备注:** _（在此填写判断理由）_\n\n`;
    } else {
      md += `- **结论**: 像素对比通过，无需进一步判断\n\n`;
    }

    md += `---\n\n`;
  });

  md += `## 汇总\n\n`;
  md += `| 测试 | 像素对比 | Agent 判断 |\n`;
  md += `|------|----------|------------|\n`;

  results.forEach(r => {
    const diff = r.pixelDiff;
    const hasPixelDiff = diff && !diff.passed;
    const pixelStatus = hasPixelDiff ? `${diff.misMatchPercentage.toFixed(2)}% ❌` : '✅';
    md += `| ${r.testName} | ${pixelStatus} | _待填写_ |\n`;
  });

  md += `\n---\n*本报告由 agent-visual-judge.js 自动生成。请在 Agent 会话中查看上方截图并填写判断。*\n`;

  return md;
}

/**
 * 生成 JSON 结果（供程序化读取）
 */
function generateJsonReport(results, diffImages) {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      pixelFailed: results.filter(r => r.pixelDiff && !r.pixelDiff.passed).length,
      pixelPassed: results.filter(r => !r.pixelDiff || r.pixelDiff.passed).length
    },
    tests: results.map(r => ({
      testName: r.testName,
      route: r.route,
      screenshotPath: r.screenshotPath,
      baselinePath: r.baselinePath,
      pixelDiff: r.pixelDiff ? {
        passed: r.pixelDiff.passed,
        misMatchPercentage: r.pixelDiff.misMatchPercentage,
        diffImagePath: r.pixelDiff.diffImagePath,
        threshold: r.threshold
      } : null,
      needsAgentReview: !!(r.pixelDiff && !r.pixelDiff.passed)
    })),
    reportPath: OUTPUT_MD,
    reportFileUrl: toFileUrl(OUTPUT_MD)
  };
}

/**
 * 扫描 screenshots 目录获取最新截图
 */
function scanScreenshots() {
  if (!fs.existsSync(SCREENSHOT_DIR)) return [];
  return fs.readdirSync(SCREENSHOT_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(SCREENSHOT_DIR, f))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
}

/**
 * 从截图文件名推断测试名
 * 格式: {testName}-current.png 或 {testName}.png
 */
function inferTestName(screenshotFile) {
  const basename = path.basename(screenshotFile, '.png');
  return basename.replace(/-current$/, '');
}

/**
 * 主流程
 */
function main() {
  console.log(`\n${C.bold}${C.blue}🔍 Agent 视觉判断报告生成器${C.reset}\n`);

  // Step 1: 检查是否有最近的 pixel-diff 差异图
  const diffImages = scanDiffImages();
  log(C.blue, 'INFO', `发现 ${diffImages.length} 个差异图`);

  // Step 2: 扫描截图
  const screenshots = scanScreenshots();
  log(C.blue, 'INFO', `发现 ${screenshots.length} 张截图`);

  if (screenshots.length === 0) {
    log(C.yellow, 'WARN', '未发现截图，请先运行像素对比测试');
    process.exit(0);
  }

  // Step 3: 匹配测试名，建立 (testName -> screenshotPath, baselinePath) 映射
  const testMap = new Map(); // testName -> {screenshotPath, baselinePath}

  screenshots.forEach(sc => {
    const testName = inferTestName(sc);
    const screenshotPath = sc;
    const baselinePath = path.join(BASELINE_DIR, `${testName}.png`);
    const currentPath = sc;

    // 对每个截图，检查是否有对应的差异图
    let pixelDiff = null;
    const matchedDiff = diffImages.find(d => extractTestName(d) === testName);
    if (matchedDiff && fs.existsSync(baselinePath)) {
      pixelDiff = {
        passed: false,
        misMatchPercentage: 50, // 差异图存在说明像素不匹配，标记为失败
        diffImagePath: matchedDiff,
        threshold: 0.1
      };
    }

    testMap.set(testName, {
      testName,
      screenshotPath,
      baselinePath: fs.existsSync(baselinePath) ? baselinePath : null,
      currentPath,
      pixelDiff,
      route: '/', // 路由信息从 pixel-diff 文件名中无法推断，统一用 /
      threshold: 0.1
    });
  });

  // Step 4: 对有差异图的测试，生成报告
  const results = Array.from(testMap.values())
    .filter(r => r.pixelDiff && !r.pixelDiff.passed)
    .sort((a, b) => a.testName.localeCompare(b.testName));

  if (results.length === 0) {
    log(C.green, 'RESULT', '所有测试像素对比通过，无需生成 Agent 判断报告');
    // 生成一个全通过的报告
    const allResults = Array.from(testMap.values());
    const md = generateMarkdownReport(allResults, []);
    const json = generateJsonReport(allResults, []);
    fs.writeFileSync(OUTPUT_MD, md, 'utf8');
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');
    log(C.blue, 'OUTPUT', OUTPUT_MD);
    log(C.blue, 'OUTPUT', OUTPUT_JSON);
    process.exit(0);
  }

  log(C.yellow, 'FOUND', `${results.length} 个测试像素对比失败，生成判断报告`);

  // Step 5: 生成报告
  const md = generateMarkdownReport(results, diffImages);
  const json = generateJsonReport(results, diffImages);

  fs.writeFileSync(OUTPUT_MD, md, 'utf8');
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');

  log(C.green, 'DONE', `报告已生成:`);
  log(C.blue, 'FILE', OUTPUT_MD);
  log(C.blue, 'FILE', OUTPUT_JSON);
  log(C.blue, 'URL',  toFileUrl(OUTPUT_MD));

  console.log(`\n${C.bold}下一步:${C.reset} 在 Agent 会话中读取 ${path.basename(OUTPUT_MD)}，` +
    `用 view_image 工具查看截图，然后自行判断是否真的有问题。\n`);

  // 输出退出码：0 表示报告生成成功（不表示测试通过，Agent 判断后才算）
  process.exit(0);
}

main();