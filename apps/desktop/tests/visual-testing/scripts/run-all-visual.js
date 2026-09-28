/**
 * 全量视觉回归聚合器：一次跑完 views / supplementary-views / workflows / supplementary-workflows 四套注册表。
 *
 * 为什么不是 `a && b && c && d`：串联命令在第一套红时就中止，后面三套**一次都不跑**，
 * 于是「CI 产物里有没有这套用例的截图」取决于前一套的成败——而 QM-4 第 7 条要求基线只能取自 CI 产物，
 * 中止等于让基线无从同源。这里逐套隔离：任何一套失败都继续跑完剩下的，最后如实汇总。
 *
 * 每套输出一行机器可解析的 `[VISUAL-SUMMARY]`（含耗时），让 CI 日志能证明「这套用例真的跑过、跑了几条、绿了几条」，
 * 而不是靠人数 emoji；耗时也是 CI 超时预算的唯一实测来源。
 *
 * 归一化口径（fail-closed）：四套用例的返回契约本来就不一致（三套抛 `error.failures`，
 * all-workflows 返回 `{results, failed}` 且不抛），所有翻译只发生在这里，禁止抄进各个 suite 文件；
 * **认不出的形状一律记 `aborted`，绝不默认"全通过"**——「没拿到结论」不是「没有失败」。
 */

const fs = require('fs');
const path = require('path');

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

function clamp (value, max) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.trunc(value), max);
}

function failedFrom (error, total) {
  if (!error || !Array.isArray(error.failures)) return null;
  return clamp(error.failures.length, total);
}

function normalizeOutcome (suite, result, error, elapsedMs) {
  // total 只取注册表长度：它是用例数的唯一真源，套件返回的条数只能用来算结论
  const total = suite.registry.length;

  if (error) {
    const failed = failedFrom(error, total);
    // failed===null：一条结论都没有；failed===0：抛了错却没归因到任何一条 ——
    // 两者都是"不知道结果"，既不得谎报成"全红"，也不得当成"全通过"
    if (failed === null || failed === 0) {
      return { total, passed: 0, failed: 0, aborted: true, elapsedMs };
    }
    return { total, passed: total - failed, failed, aborted: false, elapsedMs };
  }

  // 账不平即 aborted：结论条数与注册表用例数不一致时，绝不"就近取一个数"当结果
  // （否则套件少产出一条就把分母悄悄改掉，或反过来用多余条目定义总数）
  if (result && Array.isArray(result.results) && typeof result.failed === 'number') {
    // all-workflows 的既有契约：不抛错，返回 {results, failed}；
    // 浏览器启动失败由该套件显式标 runnerLaunchFailed（否则会被算成"整套全红"这种假结论）
    if (result.results.length !== total || result.failed < 0 || result.failed > total) {
      return { total, passed: 0, failed: 0, aborted: true, elapsedMs };
    }
    const aborted = result.runnerLaunchFailed === true;
    return {
      total,
      passed: aborted ? 0 : total - result.failed,
      failed: aborted ? 0 : result.failed,
      aborted,
      elapsedMs,
    };
  }

  if (result && typeof result.total === 'number' && typeof result.passed === 'number') {
    if (result.total !== total || result.passed < 0 || result.passed > total) {
      return { total, passed: 0, failed: 0, aborted: true, elapsedMs };
    }
    return { total, passed: result.passed, failed: total - result.passed, aborted: false, elapsedMs };
  }

  // 形状不认识（缺 return、被重构过）：fail-closed 记 aborted，禁止默认"全通过"
  return { total, passed: 0, failed: 0, aborted: true, elapsedMs };
}

function formatSummaryLine (outcome, id) {
  const base = `[VISUAL-SUMMARY] suite=${id}`
    + ` total=${outcome.total}`
    + ` passed=${outcome.passed}`
    + ` failed=${outcome.failed}`
    + ` elapsed_ms=${outcome.elapsedMs}`;
  return outcome.aborted ? `${base} aborted=1` : base;
}

function writeReport (reportPath, summary) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
}

async function runAllVisualSuites (options = {}) {
  const log = options.log || (line => console.log(line));
  const suites = options.suites || visualSuites;
  const now = options.now || (Date => Date.now());
  const results = [];

  for (const suite of suites) {
    const startedAt = now(Date);
    let outcome;
    try {
      outcome = normalizeOutcome(suite, await suite.run(), null, now(Date) - startedAt);
    } catch (error) {
      outcome = normalizeOutcome(suite, null, error, now(Date) - startedAt);
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
  const summary = { suites: results, ...totals };
  log(`[VISUAL-ALL-SUMMARY] suites=${results.length}`
    + ` total=${totals.total} passed=${totals.passed} failed=${totals.failed} aborted=${totals.aborted}`);
  if (options.reportPath) writeReport(options.reportPath, summary);

  return summary;
}

if (require.main === module) {
  runAllVisualSuites({
    // 报告落进 reports/（已被 .gitignore 忽略），与像素门禁的 ci-pixel-results.json 同处，
    // 让"从 artifact 判定哪套有几条红"不必再回来扒 CI 日志。
    reportPath: path.join(__dirname, '..', 'reports', 'visual-all-summary.json'),
  }).then(summary => {
    process.exitCode = summary.failed > 0 || summary.aborted > 0 ? 1 : 0;
  }).catch(error => {
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
