/**
 * 前端功能 E2E 测试统一入口
 *
 * 用法：
 *   node tests/e2e/helpers/run-all.js              # 跑全部 18 路由 + 6 集成流，生成最终报告
 *   node tests/e2e/helpers/run-all.js routes        # 仅跑路由
 *   node tests/e2e/helpers/run-all.js flows         # 仅跑集成流
 *   node tests/e2e/helpers/run-all.js report        # 仅重新生成最终报告
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const ROUTES_JSON = path.join(REPORTS_DIR, 'routes-list.json');

const ROUTE_ORDER = [
  'home', 'comments', 'first-run', 'publish', 'accounts', 'dashboard',
  'collection', 'monitor', 'keywords', 'viral-analysis', 'model-providers',
  'create', 'result', 'pipeline', 'create-history', 'cloud-publish',
  'intelligence', 'calendar'
];

const FLOW_ORDER = ['flow-1', 'flow-2', 'flow-3', 'flow-4', 'flow-5', 'flow-6'];

async function runRoutes() {
  const { runRouteSpec } = require('./route-functional-suite');
  const results = {};
  for (const name of ROUTE_ORDER) {
    try {
      const report = await runRouteSpec(name);
      results[name] = report;
      console.log(`  ✓ ${name}: ${report.checks.passed}/${report.checks.total}`);
    } catch (error) {
      console.error(`  ✗ ${name}: ${error.message}`);
      results[name] = { checks: { total: 0, passed: 0, failed: 1 }, error: error.message };
    }
  }
  return results;
}

async function runFlows() {
  const { runFlow } = require('./integration-flows');
  const results = {};
  for (const key of FLOW_ORDER) {
    try {
      const report = await runFlow(key);
      results[key] = report;
      console.log(`  ✓ ${key}: ${report.checks.passed}/${report.checks.total}`);
    } catch (error) {
      console.error(`  ✗ ${key}: ${error.message}`);
      results[key] = { checks: { total: 0, passed: 0, failed: 1 }, error: error.message };
    }
  }
  return results;
}

function buildReport() {
  const { main } = require('./final-report');
  main();
}

async function main() {
  const arg = process.argv[2] || 'all';
  console.log(`\n🚀 前端功能 E2E 测试统一入口 — mode=${arg}\n`);
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  if (arg === 'all' || arg === 'routes') {
    console.log('=== 阶段 A: 18 路由 functional 测试 ===');
    await runRoutes();
    console.log('');
  }
  if (arg === 'all' || arg === 'flows') {
    console.log('=== 阶段 B: 6 集成流测试 ===');
    await runFlows();
    console.log('');
  }
  if (arg === 'all' || arg === 'report') {
    console.log('=== 阶段 C: 生成最终报告 ===');
    buildReport();
    console.log('');
  }
  console.log('✅ 全部完成');
}

if (require.main === module) main();

module.exports = { main, runRoutes, runFlows, buildReport };
