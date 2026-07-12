/**
 * 视觉测试环境设置脚本
 * 运行: node tests/visual-testing/scripts/setup.js
 *
 * 默认模式（像素对比 + OCR）：无需任何 API Key，开箱即用
 * AI 视觉模式（仅 CI）：在 .env 中取消注释 OPENAI_API_KEY 或 ANTHROPIC_API_KEY
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log(`
╔════════════════════════════════════════════════════════════╗
║         视觉测试环境设置                                    ║
╚════════════════════════════════════════════════════════════╝
`);

// 1. 检查依赖
console.log('\n📦 检查依赖...\n');

const requiredDeps = [
  'playwright',
  'tesseract.js',
  'resemblejs'
];

const optionalDeps = [
  'openai',
  '@anthropic-ai/sdk'
];

const missingDeps = [];

for (const dep of requiredDeps) {
  try {
    require(dep);
    console.log(`  ✅ ${dep}`);
  } catch {
    console.log(`  ❌ ${dep} (缺失)`);
    missingDeps.push(dep);
  }
}

for (const dep of optionalDeps) {
  try {
    require(dep);
    console.log(`  ✅ ${dep} (AI 视觉，可选)`);
  } catch {
    console.log(`  ⚠️  ${dep} (AI 视觉，可选，未安装)`);
  }
}

if (missingDeps.length > 0) {
  console.log('\n🔧 安装缺失依赖...\n');
  const installCmd = `npm install --save-dev ${missingDeps.join(' ')}`;
  console.log(`执行: ${installCmd}`);
  try {
    execSync(installCmd, { stdio: 'inherit', cwd: path.join(__dirname, '..', '..', '..', '..') });
    console.log('\n✅ 依赖安装完成');
  } catch (err) {
    console.log('\n❌ 依赖安装失败，请手动安装');
    process.exit(1);
  }
}

// 2. 创建目录
console.log('\n📁 创建目录...\n');

const dirs = [
  'tests/visual-testing/screenshots',
  'tests/visual-testing/reports',
  'tests/visual-testing/reports/pixel-diff',
  'tests/visual-testing/base-screenshots'
];

for (const dir of dirs) {
  const fullPath = path.join(__dirname, '..', '..', '..', '..', dir);
  fs.mkdirSync(fullPath, { recursive: true });
  console.log(`  ✅ ${dir}`);
}

// 3. 生成 .env.visual.example
console.log('\n📝 生成 .env.visual.example...\n');

const envExample = `# 视觉测试环境变量示例
# 复制此文件到 tests/visual-testing/.env 并填入实际值

# ===== 默认模式：无需 API Key =====
TEST_URL=http://localhost:5173
HEADLESS=true

# ===== AI 视觉模式（仅 CI 场景需要）=====
# 在 .env 中取消注释对应行：
# OPENAI_API_KEY=sk-your-openai-key
# ANTHROPIC_API_KEY=sk-ant-your-key
`;

const examplePath = path.join(__dirname, '..', '..', '..', '..', '.env.visual.example');
fs.writeFileSync(examplePath, envExample);
console.log('  ✅ .env.visual.example 已生成到仓库根目录');

// 4. 生成 .env（如果不存在）
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
  fs.writeFileSync(envPath, envExample);
  console.log('  ✅ tests/visual-testing/.env 已创建');
} else {
  console.log('  ℹ️  tests/visual-testing/.env 已存在，跳过');
}

console.log(`
╔════════════════════════════════════════════════════════════╗
║         环境设置完成!                                        ║
╚════════════════════════════════════════════════════════════╝

📋 测试模式说明：

  ┌─────────────────────────────────────────────────────────┐
  │ 模式          │ 依赖           │ 适用场景              │
  ├───────────────┼────────────────┼───────────────────────┤
  │ 像素对比      │ Resemble.js    │ 本地开发（默认）✅     │
  │ OCR 文字提取  │ Tesseract.js   │ 本地开发 ✅            │
  │ AI 视觉      │ OpenAI/Claude  │ 仅 CI 流水线（可选）   │
  └─────────────────────────────────────────────────────────┘

  默认模式无需任何 API Key，开箱即用！

🚀 快速开始：

  # 像素对比测试（默认，无需配置）
  npm run test:visual:pixel

  # 工作流测试
  npm run test:workflow

  # 全部测试
  npm run test:all:visual

  # 单个视图测试
  node tests/visual-testing/views/all-views.visual.test.js --single home-default

  # 列出所有测试
  node tests/visual-testing/views/all-views.visual.test.js --list

注意:
  1. 测试前请确保开发服务器已启动: npm run dev
  2. 如需更新基线截图: npm run test:visual:update-baseline
  3. 查看报告: tests/visual-testing/reports/
  4. AI 视觉模式仅在 CI 中需要，无需本地配置
`);
