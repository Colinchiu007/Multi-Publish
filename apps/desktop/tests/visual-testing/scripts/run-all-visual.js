/**
 * 全量视觉回归聚合器：一次跑完 views / supplementary-views / workflows / supplementary-workflows 四套注册表。
 *
 * 为什么不是 `a && b && c && d`：串联命令在第一套红时就中止，后面三套**一次都不跑**，
 * 于是「CI 产物里有没有这套用例的截图」取决于前一套的成败——而 QM-4 第 7 条要求基线只能取自 CI 产物，
 * 中止等于让基线无从同源。这里逐套隔离：任何一套失败都继续跑完剩下的，最后如实汇总。
 *
 * 每套都输出一行机器可解析的 `[VISUAL-SUMMARY]`（含耗时），让 CI 日志能证明「这套用例真的跑过、跑了几条、绿了几条」，
 * 而不是靠人数 emoji；耗时也是 CI 超时预算的唯一实测来源。
 */

const viewSuite = require('../views/all-views.visual.test');
const supplementaryViewSuite = require('../views/supplementary-views.visual.test');
const workflowSuite = require('../workflows/all-workflows.visual.test');
const supplementaryWorkflowSuite = require('../workflows/supplementary-workflows.visual.test');

const visualSuites = [
  {
    id: 'views',
    registry: viewSuite.viewTests,
    run: () => viewSuite.runAllViewTests(),
  },
  {
    id: 'supplementary-views',
    registry: supplementaryViewSuite.supplementaryViewTests,
    run: () => supplementaryViewSuite.runSupplementaryTests(),
  },
  {
    id: 'workflows',
    registry: workflowSuite.workflowTests,
    run: () => workflowSuite.runAllWorkflowTests(),
  },
  {
    id: 'supplementary-workflows',
    registry: supplementaryWorkflowSuite.supplementaryWorkflowTests,
    run: () => supplementaryWorkflowSuite.runSupplementaryWorkflows(),
  },
];

function failedFrom(error, total) {
  const raw = Array.isArray(error && error.failures) ? error.failures.length : null;
  if (raw === null) return null;
  return Math.min(raw, total);
}

// 四套用例的返回契约本来就不一致（三套抛 error.failures，all-workflows 返回 {results, failed} 且不抛），
// 归一化只在这里做一次，禁止把这套判抄进各个 suite 文件。
function normalizeOutcome(suite, result, error, elapsedMs) {
  const total = suite.registry.length;
  if (!error) {
    if (result && typeof result.failed === 'number' && Array.isArray(result.results)) {
      const failed = Math.min(result.failed, result.results.length);
      return { total: result.results.length, passed: result.results.length - failed, failed, aborted: false, elapsedMs };
    }
    if (result && typeof result.total === 'number' && typeof result.passed === 'number') {
      return { total: result.total, passed: result.passed, failed: Math.max(0, result.total - result.passed), aborted: false, elapsedMs };
    }
    return { total, passed: total, failed: 0, aborted: false, elapsedMs };
  }
  const failed = failedFrom(error, total);
  if (failed === null) {
    // 运行器起不来 / 未预期异常：一条结论都没有，不得谎报成"全红"
    return { total, passed: 0, failed: 0, aborted: true, elapsedMs };
  }
  return { total, passed: total - failed, failed, aborted: false, elapsedMs };
}

function formatSummaryLine(outcome, id) {
  const base = `[VISUAL-SUMMARY] suite=${id}`
    + ` total=${outcome.total}`
    + ` passed=${outcome.passed}`
    + ` failed=${outcome.failed}`
    + ` elapsed_ms=${outcome.elapsedMs}`;
  return outcome.aborted ? `${base} aborted=1` : base;
}

async function runAllVisualSuites(options = {}) {
  const log = options.log || ((line) => console.log(line));
  const suites = options.suites || visualSuites;
  const results = [];

  for (const suite of suites) {
    const startedAt = Date.now();
    let outcome;
    try {
      outcome = normalizeOutcome(suite, await suite.run(), null, Date.now() - startedAt);
    } catch (error) {
      outcome = normalizeOutcome(suite, null, error, Date.now() - startedAt);
    }
    log(formatSummaryLine(outcome, suite.id));
    results.push({ suite: suite.id, ...outcome });
  }

  const totals = results.reduce((acc, item) => ({
    total: acc.total + item.total,
    passed: acc.passed + item.passed,
    failed: acc.failed + item.failed,
    aborted: acc.aborted + (item.aborted ? 1 : 0),
  }), { total: 0, passed: 0, failed: 0, aborted: 0 });
  log(`[VISUAL-ALL-SUMMARY] suites=${results.length}`
    + ` total=${totals.total} passed=${totals.passed} failed=${totals.failed} aborted=${totals.aborted}`);

  return { suites: results, ...totals };
}

if (require.main === module) {
  runAllVisualSuites().then((summary) => {
    process.exitCode = summary.failed > 0 || summary.aborted > 0 ? 1 : 0;
  }).catch((error) => {
    console.error(error && error.message ? error.message : String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  visualSuites,
  normalizeOutcome,
  formatSummaryLine,
  runAllVisualSuites,
};
