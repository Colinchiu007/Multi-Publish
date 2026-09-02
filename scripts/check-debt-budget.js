#!/usr/bin/env node
/**
 * check-debt-budget.js — 债务熔断 CI 门禁
 *
 * 6 项指标量化基线，超阈值返回非零退出码阻断 merge。
 * 基线文件：scripts/debt-baseline.json（首次运行时自动生成）。
 *
 * 指标：
 *   1. 单文件最大行数（冻结现值，只降不升）
 *   2. >=1000 行文件数（不增）
 *   3. >=500 行文件数（不增）
 *   4. model-provider-manager.js require 扇出（不增）
 *   5. 循环依赖数（必须为 0）
 *   6. 覆盖率纳入面（Stage 3 后启用）
 *
 * 用法：
 *   node scripts/check-debt-budget.js               # 检查（CI 模式）
 *   node scripts/check-debt-budget.js --update       # 更新基线
 *   node scripts/check-debt-budget.js --json         # JSON 输出
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BASELINE_PATH = path.join(__dirname, 'debt-baseline.json');
const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['apps/desktop/src', 'apps/desktop/electron', 'packages', 'ops-center/backend'];
const SOURCE_EXTS = new Set(['.js', '.ts', '.vue', '.py', '.tsx', '.jsx', '.css', '.scss']);
const EXCLUDE = ['node_modules', 'dist', '.git', 'tests', 'test', '__tests__', 'dist-electron'];
const MODEL_PROVIDER_PATH = 'apps/desktop/electron/services/model-provider-manager.js';

function countFilesByMinLines(dirs, minLines) {
  let count = 0;
  let maxFile = { path: '', lines: 0 };
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      const relative = path.relative(ROOT, fp).replace(/\\/g, '/');
      if (EXCLUDE.some(x => relative.includes(x))) continue;
      if (e.isDirectory()) { walk(fp); continue; }
      if (!SOURCE_EXTS.has(path.extname(e.name))) continue;
      try {
        const lines = fs.readFileSync(fp, 'utf8').split('\n').length;
        if (lines >= minLines) {
          count++;
          files.push({ path: relative, lines });
        }
        if (lines > maxFile.lines) maxFile = { path: relative, lines };
      } catch (_) {}
    }
  }

  for (const d of dirs) walk(path.join(ROOT, d));
  return { count, maxFile, files };
}

function measureModelProviderFanOut() {
  const fp = path.join(ROOT, MODEL_PROVIDER_PATH);
  if (!fs.existsSync(fp)) return { lines: 0, uniqueRequires: 0 };
  const s = fs.readFileSync(fp, 'utf8');
  const lines = s.split('\n').length;
  const matches = s.match(/require\(['"][^'"]+['"]\)/g);
  const unique = matches ? [...new Set(matches)].sort() : [];
  return { lines, uniqueRequires: unique.length };
}

function checkCircularDeps() {
  // Simple DFS-based circular dependency detection
  const graph = new Map();
  const files = [];

  function collectFiles(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      const relative = path.relative(ROOT, fp).replace(/\\/g, '/');
      if (EXCLUDE.some(x => relative.includes(x))) continue;
      if (e.isDirectory()) { collectFiles(fp); continue; }
      if (!/\.(js|ts|vue)$/.test(e.name)) continue;
      files.push(relative);
    }
  }

  for (const d of SCAN_DIRS) collectFiles(path.join(ROOT, d));

  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const reqs = content.match(/require\(['"]([^'"]+)['"]\)/g) || [];
      const imports = content.match(/from ['"]([^'"]+)['"]/g) || [];
      const deps = [];
      for (const r of [...reqs, ...imports]) {
        const m = r.match(/['"]([^'"]+)['"]/);
        if (!m) continue;
        const target = m[1];
        if (!target.startsWith('.')) continue;
        const resolved = path.normalize(path.join(path.dirname(f), target)).replace(/\\/g, '/');
        deps.push(resolved);
      }
      graph.set(f, deps);
    } catch (_) {}
  }

  // DFS to detect cycles
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  const cycles = [];

  function dfs(node, stack) {
    color.set(node, GRAY);
    stack.push(node);
    const neighbors = graph.get(node) || [];
    for (const n of neighbors) {
      const c = color.get(n) || WHITE;
      if (c === GRAY) {
        const cycleStart = stack.indexOf(n);
        if (cycleStart >= 0) {
          cycles.push([...stack.slice(cycleStart), n]);
        }
      } else if (c === WHITE) {
        dfs(n, stack);
      }
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const [node] of graph) {
    if ((color.get(node) || WHITE) === WHITE) dfs(node, []);
  }

  return { count: cycles.length, cycles };
}

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeBaseline(data) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('Baseline written to', BASELINE_PATH);
}

function collectMetrics() {
  const r1000 = countFilesByMinLines(SCAN_DIRS, 1000);
  const r500 = countFilesByMinLines(SCAN_DIRS, 500);
  const mp = measureModelProviderFanOut();
  const cd = checkCircularDeps();

  return {
    scannedAt: new Date().toISOString(),
    maxFileLines: r1000.maxFile.lines,
    maxFilePath: r1000.maxFile.path,
    filesOver1000: r1000.count,
    filesOver500: r500.count,
    modelProviderLines: mp.lines,
    modelProviderRequireFanOut: mp.uniqueRequires,
    circularDeps: cd.count,
    circularDepDetails: cd.cycles,
  };
}

function check(baseline, current) {
  const violations = [];
  const results = [];

  // 1. 单文件最大行数
  if (baseline && current.maxFileLines > baseline.maxFileLines) {
    violations.push(`MAX_FILE_LINES: ${current.maxFileLines} > baseline ${baseline.maxFileLines} (${current.maxFilePath})`);
  }
  results.push({ metric: 'maxFileLines', current: current.maxFileLines, baseline: baseline?.maxFileLines || null, pass: !violations.some(v => v.includes('MAX_FILE_LINES')) });

  // 2. >=1000 行文件数
  if (baseline && current.filesOver1000 > baseline.filesOver1000) {
    violations.push(`FILES_OVER_1000: ${current.filesOver1000} > baseline ${baseline.filesOver1000}`);
  }
  results.push({ metric: 'filesOver1000', current: current.filesOver1000, baseline: baseline?.filesOver1000 || null, pass: !violations.some(v => v.includes('FILES_OVER_1000')) });

  // 3. >=500 行文件数
  if (baseline && current.filesOver500 > baseline.filesOver500) {
    violations.push(`FILES_OVER_500: ${current.filesOver500} > baseline ${baseline.filesOver500}`);
  }
  results.push({ metric: 'filesOver500', current: current.filesOver500, baseline: baseline?.filesOver500 || null, pass: !violations.some(v => v.includes('FILES_OVER_500')) });

  // 4. model-provider-manager require 扇出
  if (baseline && current.modelProviderRequireFanOut > baseline.modelProviderRequireFanOut) {
    violations.push(`MODEL_PROVIDER_FAN_OUT: ${current.modelProviderRequireFanOut} > baseline ${baseline.modelProviderRequireFanOut}`);
  }
  results.push({ metric: 'modelProviderRequireFanOut', current: current.modelProviderRequireFanOut, baseline: baseline?.modelProviderRequireFanOut || null, pass: !violations.some(v => v.includes('MODEL_PROVIDER_FAN_OUT')) });

  // 5. 循环依赖数
  if (current.circularDeps > 0) {
    violations.push(`CIRCULAR_DEPS: ${current.circularDeps} cycle(s) detected`);
    for (const cycle of current.circularDepDetails) {
      violations.push(`  Cycle: ${cycle.join(' -> ')}`);
    }
  }
  results.push({ metric: 'circularDeps', current: current.circularDeps, baseline: 0, pass: current.circularDeps === 0 });

  return { violations, results };
}

function main() {
  const args = process.argv.slice(2);
  const isUpdate = args.includes('--update');
  const isJson = args.includes('--json');

  const current = collectMetrics();
  const baseline = readBaseline();

  if (isUpdate) {
    writeBaseline(current);
    process.exit(0);
  }

  if (!baseline) {
    console.log('No baseline found. Creating initial baseline...');
    writeBaseline(current);
    console.log('Debt budget baseline created. Run again to check.');
    process.exit(0);
  }

  const { violations, results } = check(baseline, current);

  if (isJson) {
    console.log(JSON.stringify({ current, baseline, violations, results }, null, 2));
    process.exit(violations.length > 0 ? 1 : 0);
  }

  console.log('=== 债务熔断检查 ===');
  console.log('');
  for (const r of results) {
    const icon = r.pass ? '✅' : '❌';
    const baselineStr = r.baseline !== null ? ` (baseline: ${r.baseline})` : '';
    console.log(`${icon} ${r.metric}: ${r.current}${baselineStr}`);
  }
  console.log('');

  if (violations.length > 0) {
    console.log('❌ 债务熔断：以下指标超出基线：');
    for (const v of violations) {
      console.log(`   ${v}`);
    }
    console.log('');
    console.log('如需更新基线（如经审查确认的债务清理），请运行：');
    console.log('  node scripts/check-debt-budget.js --update');
    process.exit(1);
  }

  console.log('✅ 所有债务指标在基线内，通过。');
  process.exit(0);
}

main();
