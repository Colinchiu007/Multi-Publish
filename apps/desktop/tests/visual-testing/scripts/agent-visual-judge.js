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
 *   然后把 judge-report.md 作为一个 review 步骤交给 Agent 处理。
 */

const fs = require('fs');
const path = require('path');

// 从 __dirname 向上找项目根(优先匹配 monorepo 特征: .git / AGENTS.md)
function findProjectRoot(startDir) {
  let dir = startDir;
  let lastPkg = null;
  for (let i = 0; i < 10; i++) {
    const hasGit = fs.existsSync(path.join(dir, '.git'));
    const hasAgents = fs.existsSync(path.join(dir, 'AGENTS.md'));
    if (hasGit || hasAgents) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) lastPkg = dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底:monorepo 没 .git 但有多个 package.json 时,返回最深的 package.json 的父级
  return lastPkg ? path.dirname(lastPkg) : path.resolve(startDir, '..', '..', '..', '..', '..');
}
const ROOT = findProjectRoot(__dirname);
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
 * 扫描 pixel-diff 目录下的所有差异图，按修改时间倒序
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
 * 从 diff 图文件名提取测试名（去掉末尾时间戳）
 * 命名格式: {testName}-{timestamp}.png
 */
function extractTestName(diffPath) {
  const basename = path.basename(diffPath, '.png');
  // 去掉末尾时间戳（数字），保留原始测试名
  return basename.replace(/-\d+$/, '');
}

/**
 * 生成 Markdown 报告供 Agent view_image 工具阅读
 */
function generateMarkdownReport(results, diffImages) {
  const now = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const total = results.length;
  const failed = results.filter(r => r.pixelDiff && !r.pixelDiff.passed).length;
  const passed = total - failed;

  let md = `# Agent 视觉判断报告\n\n`;
  md += `**生成时间**: ${now}\n`;
  md += `**测试总数**: ${total} | **像素对比失败**: ${failed} | **需 Agent 审查**: ${failed}\n\n`;

  md += `## Agent 审查指南\n\n`;
  md += `请逐项使用 **view_image** 工具加载下方截图，\n`;
  md += `判断哪些差异是「预期变化」（设计改版 / 故意调整）\n`;
  md += `哪些是「意外回归」（Bug / 样式错乱）。\n\n`;

  md += `---\n\n`;

  results.forEach((r, i) => {
    const diff = r.pixelDiff;
    const hasPixelDiff = diff && !diff.passed;

    md += `### ${i + 1}. ${r.testName}\n\n`;
    md += `- **路由**: \`${r.route}\`\n`;
    md += `- **像素对比**: ${hasPixelDiff ? `${C.red}失败${C.reset} (差异率 ${diff.misMatchPercentage.toFixed(2)}%)` : `${C.green}通过${C.reset}`}\n`;
    md += `- **当前截图**: \`${r.screenshotPath}\`\n`;

    if (hasPixelDiff) {
      md += `- **差异图**: \`${diff.diffImagePath}\`\n`;
      md += `- **阈值**: ${(r.threshold * 100).toFixed(0)}%\n\n`;
      md += `**对比图片**\n\n`;
      md += `| 类型 | 路径 |\n`;
      md += `|------|------|\n`;
      md += `| 基线 | ${toFileUrl(r.baselinePath)} |\n`;
      md += `| 当前 | ${toFileUrl(r.screenshotPath)} |\n`;
      md += `| 差异 | ${toFileUrl(diff.diffImagePath)} |\n\n`;
      md += `**Agent 判断清单**\n\n`;
      md += `- [ ] **通过**: 当前截图相对基线的 UI 变化符合预期设计\n`;
      md += `- [ ] **失败**: 当前截图存在 UI 问题，需修复后重新跑测试\n`;
      md += `- [ ] **需更新基线**: 如变化是预期的，把 current 提升为新基线\n\n`;
      md += `**Agent 处理结果**: _（请填写：已通过 / 已失败 / 已更新基线）_\n\n`;
    } else {
      md += `- **说明**: 像素对比通过，无需 Agent 审查\n\n`;
    }

    md += `---\n\n`;
  });

  md += `## 汇总表\n\n`;
  md += `| 测试名 | 像素对比 | Agent 判断 |\n`;
  md += `|------|----------|------------|\n`;

  results.forEach(r => {
    const diff = r.pixelDiff;
    const hasPixelDiff = diff && !diff.passed;
    const pixelStatus = hasPixelDiff ? `${diff.misMatchPercentage.toFixed(2)}% 差` : 'OK';
    md += `| ${r.testName} | ${pixelStatus} | _待审查_ |\n`;
  });

  md += `\n---\n*本报告由 agent-visual-judge.js 自动生成，供 Agent 在 review 阶段视觉判断使用。*\n`;

  return md;
}

/**
 * 生成 JSON 报告供其他工具消费
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
 * 扫描 screenshots 目录下的所有截图
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
 * 命名格式: {testName}-current.png 或 {testName}.png
 */
function inferTestName(screenshotFile) {
  const basename = path.basename(screenshotFile, '.png');
  return basename.replace(/-current$/, '');
}

/**
 * 主流程
 */
function main() {
  console.log(`\n${C.bold}${C.blue}开始 Agent 视觉判断报告生成${C.reset}\n`);

  // Step 1: 扫描最近的失败测试和 pixel-diff 差异图
  const diffImages = scanDiffImages();
  log(C.blue, 'INFO', `找到 ${diffImages.length} 张像素差异图`);

  // Step 2: 扫描所有截图
  const screenshots = scanScreenshots();
  log(C.blue, 'INFO', `找到 ${screenshots.length} 张当前截图`);

  if (screenshots.length === 0) {
    log(C.yellow, 'WARN', '没有找到任何截图，跳过报告生成。请先跑 npm run test:visual:pixel');
    process.exit(0);
  }

  // Step 3: 构建测试名到路径的映射 (testName -> screenshotPath, baselinePath)
  const testMap = new Map();

  screenshots.forEach(sc => {
    const testName = inferTestName(sc);
    const screenshotPath = sc;
    const baselinePath = path.join(BASELINE_DIR, `${testName}.png`);
    const currentPath = sc;

    // 检查是否有对应的像素差异（说明测试失败）
    let pixelDiff = null;
    const matchedDiff = diffImages.find(d => extractTestName(d) === testName);
    if (matchedDiff && fs.existsSync(baselinePath)) {
      pixelDiff = {
        passed: false,
        misMatchPercentage: 50, // 差异图存在即视为失败，具体数值需用户从像素测试结果读
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
      route: '/', // 简化处理：路由需从像素测试结果反查，这里固定为 /
      threshold: 0.1
    });
  });

  // Step 4: 筛选出有差异的测试，准备给 Agent 审查
  const results = Array.from(testMap.values())
    .filter(r => r.pixelDiff && !r.pixelDiff.passed)
    .sort((a, b) => a.testName.localeCompare(b.testName));

  if (results.length === 0) {
    log(C.green, 'RESULT', '所有测试像素对比均通过，无需 Agent 审查');
    // 仍然生成完整报告（包含全部测试的通过状态）
    const allResults = Array.from(testMap.values());
    const md = generateMarkdownReport(allResults, []);
    const json = generateJsonReport(allResults, []);
    fs.writeFileSync(OUTPUT_MD, md, 'utf8');
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');
    log(C.blue, 'OUTPUT', OUTPUT_MD);
    log(C.blue, 'OUTPUT', OUTPUT_JSON);
    process.exit(0);
  }

  log(C.yellow, 'FOUND', `${results.length} 个测试像素对比失败，已生成报告供 Agent 审查`);

  // Step 5: 写入报告
  const md = generateMarkdownReport(results, diffImages);
  const json = generateJsonReport(results, diffImages);

  fs.writeFileSync(OUTPUT_MD, md, 'utf8');
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');

  log(C.green, 'DONE', `报告已生成：`);
  log(C.blue, 'FILE', OUTPUT_MD);
  log(C.blue, 'FILE', OUTPUT_JSON);
  log(C.blue, 'URL',  toFileUrl(OUTPUT_MD));

  console.log(`\n${C.bold}下一步:${C.reset} 在 Agent 会话中读 ${path.basename(OUTPUT_MD)} +`);
  console.log(`用 view_image 工具加载截图，自己判断每个失败项是否预期变化。\n`);

  // 报告生成始终退出 0（不影响 CI 流水线，pixel 测试结果才是真正的门禁）
  process.exit(0);
}

main();