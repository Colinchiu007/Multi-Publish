/**
 * Agent Visual Judge Report Generator
 * 
 * Purpose: After pixel diff fails, generate structured report for Agent to read screenshots and judge.
 * Agent does NOT need any external API Key - it IS the vision agent.
 * 
 * Usage:
 *   node tests/visual-testing/scripts/agent-visual-judge.js
 *   # Outputs judge-report.md and agent-judge-results.json
 *
 * Agent reads judge-report.md, uses view_image tool to inspect screenshots, judges pass/fail.
 */

const fs = require('fs');
const path = require('path');

// Find project root from __dirname (monorepo-aware: .git / AGENTS.md)
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
const OUTPUT_MD = path.join(REPORT_DIR, 'judge-report.md');
const OUTPUT_JSON = path.join(REPORT_DIR, 'agent-judge-results.json');
const PIXEL_STATUSES = new Set(['PASSED', 'FAILED']);

[REPORT_DIR, SCREENSHOT_DIR, BASELINE_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

function log(tag, msg, color = '') {
  const prefix = color ? `\x1b[${color}m[${tag}]\x1b[0m ` : `[${tag}] `;
  console.log(prefix + msg);
}

function toFileUrl(absPath) {
  if (!absPath) return 'N/A';
  return 'file:///' + absPath.replace(/\\/g, '/');
}

function toFiniteMetric(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || value.trim() === '')) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatMismatch(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : 'N/A';
}

function formatThreshold(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(0)}%` : 'N/A';
}

/**
 * Generate Markdown report (for Agent view_image tool)
 */
function generateMarkdownReport(results) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' });
  const total = results.length;
  const failed = results.filter(r => r.pixelDiff && !r.pixelDiff.passed).length;
  const passed = total - failed;

  let md = `# Agent Visual Judge Report\n\n`;
  md += `**Generated**: ${now}\n`;
  md += `**Total Tests**: ${total} | **Pixel Diff Failed**: ${failed} | **Needs Agent Review**: ${failed}\n\n`;

  md += `## Agent Review Guide\n\n`;
  md += `Please use **view_image** tool to load screenshots below.\n`;
  md += `Determine which diffs are **expected changes** (design update / intentional adjustment).\n`;
  md += `Which are **unexpected regressions** (Bug / style error).\n\n`;

  md += `---\n\n`;

  results.forEach((r, i) => {
    const diff = r.pixelDiff;
    const hasPixelDiff = diff && !diff.passed;
    const mismatch = hasPixelDiff ? formatMismatch(diff.misMatchPercentage) : '0.00%';

    md += `### ${i + 1}. ${r.testName}\n\n`;
    md += `- **Route**: \`${r.route}\`\n`;
    md += `- **Pixel Diff**: ${hasPixelDiff ? `**FAILED** (mismatch: ${mismatch})` : '**PASSED**'}\n`;
    md += `- **Current Screenshot**: \`${r.screenshotPath || 'N/A'}\`\n`;

    if (hasPixelDiff) {
      md += `- **Diff Image**: \`${diff.diffImagePath || 'N/A'}\`\n`;
      md += `- **Threshold**: ${formatThreshold(r.threshold)}\n\n`;
      md += `**Comparison Images**\n\n`;
      md += `| Type | Path |\n`;
      md += `|------|------|\n`;
      md += `| Baseline | ${toFileUrl(r.baselinePath)} |\n`;
      md += `| Current | ${toFileUrl(r.screenshotPath)} |\n`;
      md += `| Diff | ${toFileUrl(diff.diffImagePath)} |\n\n`;
      md += `**Agent Judgment**\n\n`;
      md += `- [ ] **PASS**: UI change is expected design update\n`;
      md += `- [ ] **FAIL**: UI has issues, fix and re-run test\n`;
      md += `- [ ] **UPDATE BASELINE**: If change is expected, promote current as new baseline\n\n`;
      md += `**Result**: _(please fill: PASS / FAIL / BASELINE_UPDATED)_\n\n`;
    } else {
      md += `\n`;
    }

    md += `---\n\n`;
  });

  // Summary table
  md += `## Summary\n\n`;
  md += `| Test | Pixel Diff | Agent Judgment |\n`;
  md += `|------|------------|---------------|\n`;
  results.forEach(r => {
    const diff = r.pixelDiff;
    const hasPixelDiff = diff && !diff.passed;
    const mismatch = hasPixelDiff ? `${formatMismatch(diff.misMatchPercentage)} FAILED` : 'PASSED';
    md += `| ${r.testName} | ${mismatch} | _pending_ |\n`;
  });

  md += `\n---\n`;
  md += `*This report is auto-generated by agent-visual-judge.js for Agent visual review.*\n`;

  return md;
}

/**
 * Generate JSON report for other tools
 */
function generateJsonReport(results) {
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
        threshold: r.threshold,
        invalidMetrics: r.pixelDiff.invalidMetrics,
      } : null,
      needsAgentReview: !!(r.pixelDiff && !r.pixelDiff.passed)
    })),
    reportPath: OUTPUT_MD,
    reportFileUrl: toFileUrl(OUTPUT_MD)
  };
}

function selectLatestReportFile(reportDirectory, fileSystem = fs) {
  if (!fileSystem.existsSync(reportDirectory)) return null;
  const candidates = [];
  for (const name of fileSystem.readdirSync(reportDirectory)) {
    if (!name.startsWith('report-') || !name.endsWith('.json')) continue;
    const filename = path.join(reportDirectory, name);
    try {
      const stat = fileSystem.statSync(filename);
      if (stat.isFile()) candidates.push({ filename, name, mtimeMs: stat.mtimeMs });
    } catch (_) {
      // 无法读取元数据的历史报告不能作为本轮候选。
    }
  }
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || left.name.localeCompare(right.name));
  return candidates.length > 0 ? candidates[0].filename : null;
}

function resolveReportPath(args = process.argv.slice(2)) {
  const reportDirectory = path.resolve(REPORT_DIR);
  const reportIndex = args.indexOf('--report');
  if (reportIndex >= 0) {
    const requestedPath = args[reportIndex + 1];
    if (!requestedPath) return null;
    const resolvedPath = path.resolve(requestedPath);
    const relativePath = path.relative(reportDirectory, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null;
    return resolvedPath;
  }
  return selectLatestReportFile(REPORT_DIR);
}

function buildJudgeResults(reportData) {
  return reportData.results.map(result => {
    const testName = result.test || result.name;
    const route = typeof result.route === 'string' && result.route ? result.route : '/';
    const threshold = toFiniteMetric(result.threshold);
    const misMatchPercentage = toFiniteMetric(result.misMatchPercentage);
    const isPassed = result.status === 'PASSED';
    const isFailed = result.status === 'FAILED';
    const invalidMetrics = !isPassed && (!isFailed || threshold === null || misMatchPercentage === null);
    const screenshotPath = typeof result.screenshotPath === 'string'
      ? result.screenshotPath
      : path.join(SCREENSHOT_DIR, testName + '-current.png');
    const baselinePath = typeof result.baselinePath === 'string'
      ? result.baselinePath
      : path.join(BASELINE_DIR, testName + '.png');

    return {
      testName,
      route,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
      baselinePath: fs.existsSync(baselinePath) ? baselinePath : null,
      pixelDiff: isPassed ? null : {
        passed: false,
        misMatchPercentage,
        diffImagePath: typeof result.diffImagePath === 'string' ? result.diffImagePath : null,
        threshold,
        ...(invalidMetrics ? { invalidMetrics: true } : {}),
      },
      threshold,
    };
  });
}

function main(args = process.argv.slice(2)) {
  console.log("\n[INFO] Starting Agent Visual Judge Report Generation\n");

  let reportData = null;
  const reportPath = resolveReportPath(args);
  if (!reportPath || !fs.existsSync(reportPath) || !fs.statSync(reportPath).isFile()) {
    log('WARN', 'No test report found. Run npm run test:visual:pixel first.', '33');
    process.exit(1);
  }
  try {
    reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch (e) {
    log('ERROR', 'Report parse failed: ' + e.message, '31');
    process.exit(1);
  }

  if (!reportData || !Array.isArray(reportData.results) || reportData.results.length === 0) {
    log('ERROR', 'Report must contain at least one test result', '31');
    process.exit(1);
  }
  if (!reportData.results.every(r => r && typeof (r.test || r.name) === 'string' && PIXEL_STATUSES.has(r.status))) {
    log('ERROR', 'Report contains an invalid test result', '31');
    process.exit(1);
  }

  log('INFO', `Read ${reportData.results.length} test results from report`, '34');
  const results = buildJudgeResults(reportData);
  
  // Filter failed tests only
  const failedResults = results.filter(r => r.pixelDiff && !r.pixelDiff.passed)
    .sort((a, b) => a.testName.localeCompare(b.testName));
  
  if (failedResults.length === 0) {
    log('RESULT', 'All pixel diff tests passed, no Agent review needed', '32');
    const md = generateMarkdownReport(results);
    const json = generateJsonReport(results);
    fs.writeFileSync(OUTPUT_MD, md, 'utf8');
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');
    log('OUTPUT', OUTPUT_MD, '34');
    log('OUTPUT', OUTPUT_JSON, '34');
    process.exit(0);
  }
  
  log('FOUND', `${failedResults.length} pixel diff failures, report generated for Agent review`, '33');
  
  const md = generateMarkdownReport(results);
  const json = generateJsonReport(results);
  
  fs.writeFileSync(OUTPUT_MD, md, 'utf8');
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');
  
  log('DONE', 'Report generated!', '32');
  log('FILE', OUTPUT_MD, '34');
  log('FILE', OUTPUT_JSON, '34');
  log('URL', toFileUrl(OUTPUT_MD), '34');
  
  console.log("\n[NEXT] In Agent session, read " + path.basename(OUTPUT_MD) + " + ");
  console.log("use view_image tool to inspect screenshots and judge each failure.\n");
  
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  buildJudgeResults,
  generateJsonReport,
  generateMarkdownReport,
  resolveReportPath,
  selectLatestReportFile,
};
