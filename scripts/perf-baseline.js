#!/usr/bin/env node
/**
 * perf-baseline.js — 性能基线测量（Stage 3.5）
 *
 * 记录关键指标建立性能基线，用于后续性能回归检测。
 * 首次运行生成 scripts/perf-baseline.json，后续与基线比较。
 *
 * 指标：
 *   1. 测试文件数
 *   2. ops-center 后端测试数
 *   3. 桌面端测试文件数
 *   4. 最大单文件行数
 *   5. 脚本文件数
 *
 * 用法：
 *   node scripts/perf-baseline.js              # 检查
 *   node scripts/perf-baseline.js --update     # 更新基线
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASELINE_PATH = path.join(__dirname, 'perf-baseline.json');
const ROOT = path.resolve(__dirname, '..');

function countFiles(dir, ext, exclude = []) {
  let count = 0;
  function walk(d) {
    if (!fs.existsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      if (exclude.some(x => e.name.includes(x))) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      const matchExt = typeof ext === 'string' && ext.length > 0 ? e.name.includes(ext) : true;
      if (matchExt) count++;
    }
  }
  walk(dir);
  return count;
}

function maxFileLines(dir, ext, exclude = []) {
  let max = 0, maxPath = '';
  function walk(d) {
    if (!fs.existsSync(d)) return;
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const e of entries) {
      if (exclude.some(x => e.name.includes(x))) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      if (!e.name.endsWith(ext)) continue;
      try {
        const lines = fs.readFileSync(fp, 'utf8').split('\n').length;
        if (lines > max) { max = lines; maxPath = path.relative(ROOT, fp).replace(/\\/g, '/'); }
      } catch (_) {}
    }
  }
  walk(dir);
  return { lines: max, path: maxPath };
}

function collectMetrics() {
  const exclude = ['node_modules', 'dist', '.git', 'tests', 'test', '__tests__', 'dist-electron'];

  return {
    scannedAt: new Date().toISOString(),
    testFiles: {
      opsCenter: countFiles(path.join(ROOT, 'ops-center/backend/tests'), '.py', exclude),
      desktop: countFiles(path.join(ROOT, 'apps/desktop'), '.test.', exclude),
    },
    maxFileLines: maxFileLines(path.join(ROOT, 'apps/desktop/src'), '.vue', exclude),
    scriptCount: countFiles(path.join(ROOT, 'scripts'), '.', exclude),
    sourceFiles: {
      desktop: countFiles(path.join(ROOT, 'apps/desktop/src'), '.vue', exclude) +
                countFiles(path.join(ROOT, 'apps/desktop/src'), '.js', exclude),
      electron: countFiles(path.join(ROOT, 'apps/desktop/electron'), '.js', exclude),
      opsCenter: countFiles(path.join(ROOT, 'ops-center/backend'), '.py', exclude),
    },
  };
}

function readBaseline() {
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); } catch (_) { return null; }
}

function writeBaseline(data) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function main() {
  const isUpdate = process.argv.includes('--update');
  const current = collectMetrics();

  if (isUpdate) {
    writeBaseline(current);
    console.log('Performance baseline written to', BASELINE_PATH);
    console.log(JSON.stringify(current, null, 2));
    process.exit(0);
  }

  const baseline = readBaseline();
  if (!baseline) {
    console.log('No baseline found. Creating initial baseline...');
    writeBaseline(current);
    console.log('Performance baseline created. Run again to check.');
    process.exit(0);
  }

  console.log('=== 性能基线检查 ===');
  console.log(`  测试文件: ops-center ${current.testFiles.opsCenter} (基线 ${baseline.testFiles.opsCenter}), desktop ${current.testFiles.desktop} (基线 ${baseline.testFiles.desktop})`);
  console.log(`  最大文件: ${current.maxFileLines.path} = ${current.maxFileLines.lines} 行 (基线 ${baseline.maxFileLines.lines})`);
  console.log(`  脚本数: ${current.scriptCount} (基线 ${baseline.scriptCount})`);
  console.log(`  源文件: desktop ${current.sourceFiles.desktop} (基线 ${baseline.sourceFiles.desktop}), electron ${current.sourceFiles.electron} (基线 ${baseline.sourceFiles.electron}), ops-center ${current.sourceFiles.opsCenter} (基线 ${baseline.sourceFiles.opsCenter})`);
  console.log('');

  const degradation = [];
  if (current.maxFileLines.lines > baseline.maxFileLines.lines) degradation.push('maxFileLines');
  if (current.testFiles.opsCenter < baseline.testFiles.opsCenter) degradation.push('testFiles.opsCenter');

  if (degradation.length > 0) {
    console.log(`⚠️  性能退化: ${degradation.join(', ')}`);
    console.log('如需更新基线: node scripts/perf-baseline.js --update');
    process.exit(1);
  }

  console.log('✅ 性能指标在基线内，通过。');
  process.exit(0);
}

main();
