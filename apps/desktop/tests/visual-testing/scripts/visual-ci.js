/**
 * CI视觉测试集成脚本
 * 用于 GitHub Actions 或其他 CI 平台
 * 
 * GitHub Actions 使用方式:
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
 *         env:
 *           OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPORT_DIR = 'tests/visual-testing/reports';
const SCREENSHOT_DIR = 'tests/visual-testing/screenshots';
const BASELINE_DIR = 'tests/visual-testing/base-screenshots';

// ANSI颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function runTests() {
  console.log('\n🚀 CI视觉测试开始...\n');
  
  // 检查环境变量
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    log(colors.yellow, 'WARN', '未设置AI API Key，跳过AI视觉测试');
    process.env.SKIP_AI_TESTS = '1';
  }
  
  const startTime = Date.now();
  const results = { passed: 0, failed: 0, skipped: 0 };
  
  try {
    // 1. 运行像素对比测试
    log(colors.blue, 'INFO', '运行像素对比测试...');
    
    const pixelResult = execSync(
      'node tests/visual-testing/scripts/run-pixel-tests.js',
      { encoding: 'utf8', stdio: 'pipe' }
    );
    console.log(pixelResult);
    results.passed++;
    
    // 2. 运行AI视觉测试 (如果有API Key)
    if (!process.env.SKIP_AI_TESTS) {
      log(colors.blue, 'INFO', '运行AI视觉测试...');
      
      const aiResult = execSync(
        'node tests/visual-testing/scripts/run-ai-tests.js',
        { encoding: 'utf8', stdio: 'pipe' }
      );
      console.log(aiResult);
      results.passed++;
    } else {
      results.skipped++;
    }
    
    // 3. 生成报告
    generateCIReport(results, startTime);
    
    // 4. 上传产物
    uploadArtifacts();
    
    log(colors.green, 'SUCCESS', 'CI测试完成!');
    
  } catch (err) {
    log(colors.red, 'ERROR', err.message);
    results.failed++;
    generateCIReport(results, startTime);
    process.exit(1);
  }
}

function generateCIReport(results, startTime) {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  
  const report = {
    timestamp: new Date().toISOString(),
    duration: `${duration}s`,
    results,
    artifacts: {
      screenshots: SCREENSHOT_DIR,
      reports: REPORT_DIR
    }
  };
  
  fs.writeFileSync(
    path.join(REPORT_DIR, 'ci-report.json'),
    JSON.stringify(report, null, 2)
  );
  
  console.log(`
╔════════════════════════════════════════════════════╗
║              CI测试报告                              ║
╠════════════════════════════════════════════════════╣
║  总耗时: ${duration.padEnd(40)}║
║  通过: ${String(results.passed).padEnd(44)}║
║  失败: ${String(results.failed).padEnd(44)}║
║  跳过: ${String(results.skipped).padEnd(44)}║
╚════════════════════════════════════════════════════╝
`);
}

function uploadArtifacts() {
  console.log('\n📤 准备上传测试产物...\n');
  
  // 列出需要上传的文件
  const artifacts = [
    { path: REPORT_DIR, name: 'visual-test-reports' },
    { path: SCREENSHOT_DIR, name: 'visual-test-screenshots' }
  ];
  
  for (const artifact of artifacts) {
    if (fs.existsSync(artifact.path)) {
      const files = fs.readdirSync(artifact.path);
      log(colors.green, 'UPLOAD', `${artifact.name}: ${files.length} 个文件`);
    }
  }
  
  console.log('\n(CI平台会自动上传这些目录)\n');
}

// CLI入口
const args = process.argv.slice(2);

if (args[0] === '--help') {
  console.log(`
视觉测试 CI 集成脚本

用法:
  node tests/visual-testing/scripts/visual-ci.js [选项]

选项:
  --pixel-only    只运行像素对比测试
  --ai-only       只运行AI视觉测试
  --help          显示帮助

环境变量:
  OPENAI_API_KEY       OpenAI API Key (用于GPT-4o)
  ANTHROPIC_API_KEY    Anthropic API Key (用于Claude)
  SKIP_AI_TESTS        跳过AI测试

示例:
  # 使用OpenAI
  OPENAI_API_KEY=sk-xxx node tests/visual-testing/scripts/visual-ci.js

  # 只运行像素对比
  node tests/visual-testing/scripts/visual-ci.js --pixel-only
`);
} else if (args[0] === '--pixel-only') {
  console.log('运行像素对比测试...');
  execSync('node tests/visual-testing/scripts/run-pixel-tests.js', { stdio: 'inherit' });
} else if (args[0] === '--ai-only') {
  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    log(colors.red, 'ERROR', '需要设置 OPENAI_API_KEY 或 ANTHROPIC_API_KEY');
    process.exit(1);
  }
  execSync('node tests/visual-testing/scripts/run-ai-tests.js', { stdio: 'inherit' });
} else {
  runTests();
}

module.exports = { runTests };
