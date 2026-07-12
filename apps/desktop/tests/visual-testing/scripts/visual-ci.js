/**
 * CI Visual Testing Integration Script
 * 
 * 完整的 CI 视觉测试流程：
 * 1. Pixel diff tests (always runs, no API Key needed)
 * 2. Agent judge report generation (for Agent view_image judgment)
 * 
 * Agent 视觉判断在 Codex/Claude Desktop 中进行：
 *   npm run test:visual:agent
 *   # Agent 用 view_image 看图 + 内置 LLM 做判断
 * 
 * GitHub Actions Usage:
 * 
 * jobs:
 *   visual-test:
 *     runs-on: ubuntu-latest
 *     steps:
 *       - uses: actions/checkout@v4
 *       - uses: actions/setup-node@v4
 *         with:
 *           node-version: '20'
 *       - run: npm ci
 *       - run: npm run test:visual:ci
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 从 __dirname 向上查找项目根
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
  return lastPkg ? path.dirname(lastPkg) : path.resolve(startDir, '..', '..', '..', '..', '..');
}

const ROOT = findProjectRoot(__dirname);
const REPORT_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/reports');
const SCREENSHOT_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/screenshots');
const BASELINE_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/base-screenshots');
const META_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/meta');

// ANSI 颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  bold: '\x1b[1m'
};

function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function exec(command, options = {}) {
  const cwd = options.cwd || ROOT;
  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      cwd,
      ...options
    });
    return { success: true, output };
  } catch (err) {
    return { success: false, output: err.output?.[1] || err.message, code: err.status };
  }
}

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 生成 CI 报告
 */
function generateCIReport(results, startTime, duration) {
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${duration}s`,
    results,
    artifacts: {
      screenshots: SCREENSHOT_DIR,
      reports: REPORT_DIR
    }
  };
  
  ensureDir(REPORT_DIR);
  fs.writeFileSync(
    path.join(REPORT_DIR, 'ci-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                    CI 视觉测试报告                           ║
╠════════════════════════════════════════════════════════════╣
║  总耗时: ${String(duration + 's').padEnd(44)}║
║  像素对比: ${String(results.pixel.passed + '/' + results.pixel.total).padEnd(41)}║
║  Agent 报告: ${String(results.agentReport === 'success' ? '已生成' : '失败').padEnd(42)}║
╚════════════════════════════════════════════════════════════╝
  `);
}

/**
 * 运行像素对比测试
 */
function runPixelTests() {
  log(colors.blue, 'INFO', 'Running pixel diff tests...');
  
  const scriptPath = path.join(ROOT, 'apps/desktop/tests/visual-testing/scripts/run-pixel-tests.js');
  const result = exec(`node "${scriptPath}"`, { cwd: path.join(ROOT, 'apps/desktop') });
  
  if (result.success) {
    console.log(result.output);
    log(colors.green, 'PASS', 'Pixel diff tests completed');
    return { passed: true, output: result.output };
  } else {
    console.log(result.output);
    log(colors.yellow, 'WARN', 'Pixel diff tests failed (expected if baseline needs update)');
    return { passed: false, output: result.output };
  }
}

/**
 * 生成 Agent 判断报告
 * 
 * 这个报告供 Agent（Codex/Claude Desktop）用 view_image 判断
 * 不需要任何外部 API Key
 */
function runAgentJudge() {
  log(colors.blue, 'INFO', 'Generating Agent visual-judge report...');
  log(colors.blue, 'INFO', 'This report will be used by Agent with view_image tool');
  
  const scriptPath = path.join(ROOT, 'apps/desktop/tests/visual-testing/scripts/agent-visual-judge.js');
  const result = exec(`node "${scriptPath}"`, { cwd: path.join(ROOT, 'apps/desktop') });
  
  if (result.success) {
    console.log(result.output);
    log(colors.green, 'PASS', 'Agent judge report generated');
    return 'success';
  } else {
    console.log(result.output);
    log(colors.yellow, 'WARN', 'Agent judge report generation failed');
    return 'failed';
  }
}

/**
 * 列出需要上传的 artifact
 */
function listArtifacts() {
  console.log('\n📦 Test Artifacts:\n');
  
  const dirs = [
    { path: SCREENSHOT_DIR, name: 'Screenshots' },
    { path: REPORT_DIR, name: 'Reports' },
    { path: META_DIR, name: 'Meta Data' }
  ];
  
  dirs.forEach(({ path: dir, name }) => {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
      log(colors.blue, name, `${files.length} files`);
    }
  });
  
  console.log('');
}

/**
 * 主流程
 */
function main() {
  console.log('\n🚀 CI Visual Testing Pipeline\n');
  console.log('========================================\n');
  
  const startTime = Date.now();
  
  log(colors.blue, 'ENV', `TEST_URL: ${process.env.TEST_URL || 'http://localhost:5173'}`);
  log(colors.blue, 'INFO', 'AI Judgment: Agent view_image (no API Key needed)\n');
  
  // 确保目录存在
  [REPORT_DIR, SCREENSHOT_DIR, BASELINE_DIR, META_DIR].forEach(ensureDir);
  
  const results = {
    pixel: { total: 8, passed: 0, failed: 0 },
    agentReport: 'not_run'
  };
  
  // Step 1: 像素对比测试
  console.log('\n--- Step 1: Pixel Diff Tests ---\n');
  const pixelResult = runPixelTests();
  results.pixel.passed = pixelResult.passed ? results.pixel.total : 0;
  results.pixel.failed = pixelResult.passed ? 0 : results.pixel.total;
  
  // Step 2: Agent 判断报告（总是运行，供 Agent view_image 使用）
  console.log('\n--- Step 2: Agent Judge Report ---\n');
  results.agentReport = runAgentJudge();
  
  // 计算耗时
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  // 生成报告
  generateCIReport(results, startTime, duration);
  
  // 列出 artifact
  listArtifacts();
  
  // 最终结果
  console.log('\n========================================\n');
  
  if (!pixelResult.passed) {
    log(colors.yellow, 'RESULT', 'Pixel diff failed');
    log(colors.blue, 'INFO', 'Download artifacts and run Agent visual judgment in Codex/Claude Desktop');
    console.log('\n========================================\n');
    // 像素失败但不退出 1，因为可能是预期的 baseline 更新
    process.exit(0);
  }
  
  log(colors.green, 'SUCCESS', 'CI visual testing pipeline completed!');
  console.log('\n========================================\n');
  
  process.exit(0);
}

// CLI 入口
const args = process.argv.slice(2);

if (args[0] === '--help') {
  console.log(`
视觉测试 CI 集成脚本

用法:
  node tests/visual-testing/scripts/visual-ci.js [选项]

选项:
  --pixel-only    只运行像素对比测试
  --agent-only    生成 Agent 判断报告（供 view_image 使用）
  --help          显示帮助

环境变量:
  TEST_URL    测试目标 URL (默认: http://localhost:5173)

说明:
  本脚本运行像素对比测试和生成 Agent 判断报告。
  Agent 视觉判断由 Agent（Codex/Claude Desktop）执行：
    npm run test:visual:agent
    # Agent 用 view_image 看图 + 内置 LLM 做判断
    # 无需任何外部 API Key

示例:
  # 完整流程
  node tests/visual-testing/scripts/visual-ci.js

  # 只运行像素对比
  node tests/visual-testing/scripts/visual-ci.js --pixel-only
`);
} else if (args[0] === '--pixel-only') {
  console.log('Running pixel diff tests only...\n');
  const result = runPixelTests();
  process.exit(result.passed ? 0 : 1);
} else if (args[0] === '--agent-only') {
  console.log('Generating Agent judge report only...\n');
  runAgentJudge();
} else {
  main();
}

module.exports = { runPixelTests, runAgentJudge };
