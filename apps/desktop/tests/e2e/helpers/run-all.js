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
const {
  E2EEnvironmentError,
  preflightE2EEnvironment,
} = require('./e2e-preflight');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const DEFAULT_TEST_URL = 'http://127.0.0.1:5174';
const ROUTES_JSON = path.join(REPORTS_DIR, 'routes-list.json');

const ROUTE_ORDER = [
  'home', 'comments', 'first-run', 'publish', 'accounts', 'dashboard',
  'collection', 'monitor', 'keywords', 'viral-analysis', 'model-providers',
  'create', 'result', 'pipeline', 'create-history', 'cloud-publish',
  'intelligence', 'calendar'
];

const FLOW_ORDER = ['flow-1', 'flow-2', 'flow-3', 'flow-4', 'flow-5', 'flow-6'];

const VALID_MODES = new Set(['all', 'routes', 'flows', 'report']);

function parseConcurrency(value = process.env.E2E_CONCURRENCY) {
  const rawValue = value == null ? '1' : String(value).trim();
  const concurrency = Number(rawValue);
  if (rawValue === '' || !Number.isFinite(concurrency) || !Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error(`E2E_CONCURRENCY 必须是正整数，收到: ${String(value)}`);
  }
  return concurrency;
}

function validateMode(mode) {
  if (!VALID_MODES.has(mode)) {
    throw new Error(`未知 E2E 模式: ${mode}`);
  }
  return mode;
}

function expectedResultCount(mode) {
  validateMode(mode);
  if (mode === 'routes') return ROUTE_ORDER.length;
  if (mode === 'flows') return FLOW_ORDER.length;
  if (mode === 'all') return ROUTE_ORDER.length + FLOW_ORDER.length;
  return 0;
}

async function runWithConcurrency(items, worker) {
  const limit = parseConcurrency();
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await worker(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
}

function hasFailures(results, expectedCount) {
  const reports = Object.values(results || {});
  if (Number.isInteger(expectedCount) && reports.length !== expectedCount) return true;
  if (reports.length === 0) return expectedCount !== 0;
  return reports.some((report) => {
    return !report || !report.checks ||
      report.checks.failed > 0 ||
      (report.consoleErrors && report.consoleErrors.length > 0) ||
      (report.pageErrors && report.pageErrors.length > 0) ||
      report.error;
  });
}

async function runRoutes(options = {}) {
  const { runRouteSpec } = require('./route-functional-suite');
  const results = {};
  await runWithConcurrency(ROUTE_ORDER, async (name) => {
    try {
      const report = await runRouteSpec(name, options);
      results[name] = report;
      const marker = report.checks.failed === 0 ? '✓' : '✗';
      console.log(`  ${marker} ${name}: ${report.checks.passed}/${report.checks.total}`);
    } catch (error) {
      console.error(`  ✗ ${name}: ${error.message}`);
      results[name] = { checks: { total: 0, passed: 0, failed: 1 }, error: error.message };
    }
  });
  return results;
}

async function runFlows(options = {}) {
  const { runFlow } = require('./integration-flows');
  const results = {};
  await runWithConcurrency(FLOW_ORDER, async (key) => {
    try {
      const report = await runFlow(key, options);
      results[key] = report;
      const marker = report.checks.failed === 0 ? '✓' : '✗';
      console.log(`  ${marker} ${key}: ${report.checks.passed}/${report.checks.total}`);
    } catch (error) {
      console.error(`  ✗ ${key}: ${error.message}`);
      results[key] = { checks: { total: 0, passed: 0, failed: 1 }, error: error.message };
    }
  });
  return results;
}

function buildReport(options = {}) {
  const { main } = require('./final-report');
  return main(options);
}

function resolveTestUrl(options = {}) {
  return options.url || process.env.TEST_URL || DEFAULT_TEST_URL;
}

function hasReportFailures(report) {
  const summary = report && report.summary;
  if (!summary || !Number.isInteger(summary.totalChecks) || summary.totalChecks <= 0) return true;
  return summary.totalFailed > 0
    || summary.totalConsoleErrors > 0
    || summary.totalPageErrors > 0;
}

function buildEnvironmentReport(error) {
  return {
    status: 'ENVIRONMENT_BLOCKED',
    code: error && error.code ? error.code : 'E2E_ENVIRONMENT_BLOCKED',
    stage: error && error.stage ? error.stage : 'unknown',
    message: error && error.message ? error.message : String(error),
    url: error && error.url ? error.url : null,
    timestamp: new Date().toISOString(),
  };
}

function writePreflightReport(error, filename = path.join(REPORTS_DIR, 'e2e-preflight.json')) {
  const report = buildEnvironmentReport(error);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return report;
}

async function main(mode = process.argv[2] || 'all', options = {}) {
  const arg = validateMode(mode);
  const testUrl = resolveTestUrl(options);
  console.log(`\n🚀 前端功能 E2E 测试统一入口 — mode=${arg}\n`);
  if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const results = {};
  if (arg !== 'report' && options.skipPreflight !== true) {
    const preflight = options.preflight || (() => preflightE2EEnvironment({
      url: testUrl,
    }));
    try {
      const result = await preflight();
      console.log(`✅ E2E 环境预检通过：${result.url}`);
    } catch (error) {
      const environmentError = error instanceof E2EEnvironmentError
        ? error
        : new E2EEnvironmentError(error.message || String(error), { cause: error });
      const reportWriter = options.writePreflightReport || writePreflightReport;
      const report = reportWriter(environmentError);
      console.error(`❌ E2E 环境阻塞（${environmentError.stage}）：${environmentError.message}`);
      return {
        results,
        failed: true,
        environmentBlocked: true,
        error: environmentError,
        preflightReport: report,
      };
    }
  }
  if (arg === 'all' || arg === 'routes') {
    console.log('=== 阶段 A: 18 路由 functional 测试 ===');
    Object.assign(results, await (options.runRoutes || runRoutes)({ url: testUrl }));
    console.log('');
  }
  if (arg === 'all' || arg === 'flows') {
    console.log('=== 阶段 B: 6 集成流测试 ===');
    Object.assign(results, await (options.runFlows || runFlows)({ url: testUrl }));
    console.log('');
  }
  let report = null;
  if (arg === 'all' || arg === 'report') {
    console.log('=== 阶段 C: 生成最终报告 ===');
    report = (options.buildReport || buildReport)({ url: testUrl });
    console.log('');
  }
  const failed = arg === 'report'
    ? hasReportFailures(report)
    : hasFailures(results, expectedResultCount(arg));
  console.log(failed ? '❌ E2E 门禁失败' : '✅ 全部完成');
  return { results, failed, ...(report ? { report } : {}) };
}

function parseCliOptions(argv = process.argv.slice(2)) {
  const args = Array.from(argv);
  const mode = args.find((value) => !String(value).startsWith('--')) || 'all';
  const skipPreflight = args.includes('--skip-preflight');
  return { mode: validateMode(mode), skipPreflight };
}

if (require.main === module) {
  const cli = parseCliOptions();
  main(cli.mode, { skipPreflight: cli.skipPreflight }).then(({ failed }) => {
    process.exitCode = failed ? 1 : 0;
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
  runRoutes,
  runFlows,
  buildReport,
  hasFailures,
  runWithConcurrency,
  parseConcurrency,
  validateMode,
  expectedResultCount,
  parseCliOptions,
  buildEnvironmentReport,
  hasReportFailures,
  writePreflightReport,
  resolveTestUrl,
  DEFAULT_TEST_URL,
};
