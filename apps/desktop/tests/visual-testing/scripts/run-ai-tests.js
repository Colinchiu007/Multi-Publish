/**
 * AI视觉测试运行器
 *
 * 使用场景：CI 无人值守流水线（自动判断截图是否正确）
 * 本地 / Agent 内运行：无需此模式，直接看截图 + 像素差异即可
 *
 * 运行前请确保已配置至少一个 AI API Key：
 *   OPENAI_API_KEY=sk-...  (OpenAI GPT-4o)
 *   ANTHROPIC_API_KEY=sk-ant-...  (Claude Vision)
 *
 * 如未配置 Key，脚本将安全退出，不影响其他测试。
 */

const { VisualTestRunner } = require('../test-runner');
const { viewTests } = require('../views/all-views.visual.test');
const fs = require('fs');
const path = require('path');

// 加载 .env 文件中的 Key（setup.js 会生成 .env）
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq < 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) process.env[key] = value;
  });
}

// 检查是否有 AI Key
const hasOpenAI = !!(process.env.OPENAI_API_KEY);
const hasClaude = !!(process.env.ANTHROPIC_API_KEY);

if (!hasOpenAI && !hasClaude) {
  console.log(`
⚠️  未检测到 AI API Key（OPENAI_API_KEY / ANTHROPIC_API_KEY）
   AI 视觉测试已跳过。

   如需启用 AI 视觉模式，请取消 .env 中对应行的注释：
   tests/visual-testing/.env

   注意：本地开发和 Agent 内运行无需此模式，
   像素对比（npm run test:visual:pixel）已足够验证 UI 正确性。
`);
  process.exit(0); // 安全退出，不报错
}

async function run() {
  console.log('🤖 AI视觉测试 (GPT-4o / Claude)\n');
  console.log(`   Provider: ${hasOpenAI ? 'OpenAI (GPT-4o)' : 'Claude Vision'}\n`);

  const runner = new VisualTestRunner({
    url: process.env.TEST_URL || 'http://localhost:5173'
  });

  await runner.launch();

  let passed = 0;
  let failed = 0;

  for (const test of viewTests.slice(0, 10)) { // 默认测试前 10 个视图
    console.log(`🔍 ${test.name}...`);
    try {
      await runner.aiVisionTest(test.name, test.route, test.checks, {
        waitFor: test.waitFor,
        waitMs: test.waitMs
      });
      passed++;
    } catch (err) {
      console.log(`   ❌ ${err.message}`);
      failed++;
    }
  }

  await runner.close();

  const total = viewTests.slice(0, 10).length;
  console.log(`
📊 AI 视觉结果：通过 ${passed} / 失败 ${failed} / 总计 ${total}`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error("❌ 运行器启动失败:", err.message); process.exit(1); });
