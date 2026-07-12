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
const DIFF_DIR = path.join(REPORT_DIR, 'pixel-diff');
const BASELINE_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/base-screenshots');
const META_DIR = path.join(ROOT, 'apps/desktop/tests/visual-testing/meta');
const META_FILE = path.join(META_DIR, 'pixel-tests-meta.json');
const OUTPUT_MD = path.join(REPORT_DIR, 'judge-report.md');
const OUTPUT_JSON = path.join(REPORT_DIR, 'agent-judge-results.json');

// Ensure directories exist
[REPORT_DIR, SCREENSHOT_DIR, DIFF_DIR, BASELINE_DIR, META_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

function log(tag, msg, color = '') {
  const prefix = color ? `\x1b[${color}m[${tag}]\x1b[0m ` : `[${tag}] `;
  console.log(prefix + msg);
}

function toFileUrl(absPath) {
  if (!absPath) return 'N/A';
  return 'file:///' + absPath.replace(/\\/g, '/');
}

/**
 * Load meta.json to get route and misMatchPercentage
 */
function loadMeta() {
  if (!fs.existsSync(META_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

/**
 * Scan pixel-diff directory for all diff images, sorted by mtime
 */
function scanDiffImages() {
  if (!fs.existsSync(DIFF_DIR)) return [];
  return fs.readdirSync(DIFF_DIR)
    .filter(f => f.endsWith('.png'))
    .map(f => path.join(DIFF_DIR, f))
    .sort((a, b) => fs.statSync(b).mtime - fs.statSync(a).mtime);
}

/**
 * Extract test name from diff filename (remove trailing timestamp)
 */
function extractTestName(diffPath) {
  const basename = path.basename(diffPath, '.png');
  return basename.replace(/-\d+$/, '');
}

/**
 * Generate Markdown report (for Agent view_image tool)
 */
function generateMarkdownReport(results, diffImages) {
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
    const mismatch = hasPixelDiff ? Number(diff.misMatchPercentage).toFixed(2) : '0.00';

    md += `### ${i + 1}. ${r.testName}\n\n`;
    md += `- **Route**: \`${r.route}\`\n`;
    md += `- **Pixel Diff**: ${hasPixelDiff ? `**FAILED** (mismatch: ${mismatch}%)` : '**PASSED**'}\n`;
    md += `- **Current Screenshot**: \`${r.screenshotPath || 'N/A'}\`\n`;

    if (hasPixelDiff) {
      md += `- **Diff Image**: \`${diff.diffImagePath || 'N/A'}\`\n`;
      md += `- **Threshold**: ${((r.threshold || 0.1) * 100).toFixed(0)}%\n\n`;
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
    const mismatch = hasPixelDiff ? `${Number(diff.misMatchPercentage).toFixed(2)}% FAILED` : 'PASSED';
    md += `| ${r.testName} | ${mismatch} | _pending_ |\n`;
  });

  md += `\n---\n`;
  md += `*This report is auto-generated by agent-visual-judge.js for Agent visual review.*\n`;

  return md;
}

/**
 * Generate JSON report for other tools
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

function main() {
  console.log("\n[INFO] Starting Agent Visual Judge Report Generation\n");
  
  // Load meta data
  const meta = loadMeta();
  log('INFO', `Loaded meta data: ${Object.keys(meta).length} records`, '34');
  
  // Find latest test report
  let reportData = null;
  const reportFiles = fs.readdirSync(REPORT_DIR)
    .filter(f => f.startsWith("report-") && f.endsWith(".json"))
    .sort().reverse();
    
  if (reportFiles.length === 0) {
    log('WARN', 'No test report found. Run npm run test:visual:pixel first.', '33');
    process.exit(0);
  }
  
  const reportPath = path.join(REPORT_DIR, reportFiles[0]);
  try { 
    reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8')); 
  } catch (e) { 
    log('ERROR', 'Report parse failed: ' + e.message, '31'); 
    process.exit(1); 
  }
  
  log('INFO', `Read ${reportData.results.length} test results from report`, '34');
  
  // Build diff map
  const diffImages = scanDiffImages();
  const diffMap = new Map();
  diffImages.forEach(d => diffMap.set(extractTestName(d), d));
  
  // Build results: prioritize meta.json for route and misMatchPercentage
  const results = [];
  reportData.results.forEach(r => {
    const testName = r.test;
    const metaInfo = meta[testName] || {};
    
    // Priority: meta.json > report JSON
    const route = metaInfo.route || r.route || '/';
    const misMatchPercentage = metaInfo.misMatchPercentage ?? r.misMatchPercentage;
    
    const screenshotPath = path.join(SCREENSHOT_DIR, testName + "-current.png");
    const baselinePath = path.join(BASELINE_DIR, testName + ".png");
    const hasDiff = diffMap.has(testName);
    const isFailed = r.status === "FAILED";
    
    const pixelDiff = isFailed ? {
      passed: false,
      // Get real misMatchPercentage from meta to avoid 50% anomaly
      misMatchPercentage: misMatchPercentage !== undefined ? parseFloat(misMatchPercentage) : (hasDiff ? 0.01 : 0),
      diffImagePath: diffMap.get(testName) || null,
      threshold: metaInfo.threshold || 0.1
    } : null;
    
    results.push({ 
      testName, 
      route,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
      baselinePath: fs.existsSync(baselinePath) ? baselinePath : null,
      pixelDiff, 
      threshold: metaInfo.threshold || 0.1 
    });
  });
  
  // Filter failed tests only
  const failedResults = results.filter(r => r.pixelDiff && !r.pixelDiff.passed)
    .sort((a, b) => a.testName.localeCompare(b.testName));
  
  if (failedResults.length === 0) {
    log('RESULT', 'All pixel diff tests passed, no Agent review needed', '32');
    const md = generateMarkdownReport(results, diffImages);
    const json = generateJsonReport(results, diffImages);
    fs.writeFileSync(OUTPUT_MD, md, 'utf8');
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(json, null, 2), 'utf8');
    log('OUTPUT', OUTPUT_MD, '34');
    log('OUTPUT', OUTPUT_JSON, '34');
    process.exit(0);
  }
  
  log('FOUND', `${failedResults.length} pixel diff failures, report generated for Agent review`, '33');
  
  const md = generateMarkdownReport(failedResults, diffImages);
  const json = generateJsonReport(failedResults, diffImages);
  
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

main();
