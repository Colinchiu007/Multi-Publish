'use strict';

/**
 * 基线新鲜度门禁：断言每张被跟踪的像素基线**逐像素等于同一次 CI 渲染**。
 *
 * 为什么要有它：QM-4 第 7 条禁止拿本机截图当基线，但这条纪律此前**没有任何检测**——
 * 一次重建（#2623）之后，后续 UI PR 只要用本机 `test:visual:update-baseline` 重捕，
 * 基线就会静默偏离 CI 渲染，而 views 侧 6% 的全页容差会把 1.5% 量级的漂移完全吃掉。
 * 实测（2026-09-30）：#2623 建立 0 px 不变量后不到一天，9 张基线漂移到 0.008%–1.573%，
 * 而 CI 全绿 —— 因为没有任何东西在看这件事。
 *
 * 判据刻意取「同一 run 的渲染」而不是「上一次 run 的渲染」：本脚本必须在采集步骤之后、
 * 同一个 job 里跑，才能同时排除渲染环境差异与代码时序差异。
 */

const fs = require('fs');
const path = require('path');

// 已知「CI 不产图」的基线：只能带理由承认，清单只能缩小（与 check-unwired-tests 同族纪律）。
const KNOWN_UNCOVERED = {
  'settings-general.png': '仅被 autonomous-loop 管线引用（autonomous-*.js / packages/ai-autonomous-tester），四套视觉与 pixelTests 都不产它的图',
  'login-form.png': '同上：autonomous-loop 专属',
  'analytics-overview.png': '同上：autonomous-loop 专属',
};

function loadDeps () {
  // 从仓库根的 node_modules 解析（node-linker=hoisted）
  const root = path.resolve(__dirname, '..');
  const { PNG } = require(path.join(root, 'node_modules/pngjs'));
  const pixelmatch = require(path.join(root, 'node_modules/pixelmatch'));
  return { PNG, pixelmatch };
}

/** 找到这张基线对应的 CI 渲染：视图套件产 `<name>.png`，像素门禁产 `<name>-current.png`。 */
function findRender (rendersDir, name) {
  const plain = path.join(rendersDir, name + '.png');
  if (fs.existsSync(plain)) return { file: plain, from: 'views' };
  const gated = path.join(rendersDir, name + '-current.png');
  if (fs.existsSync(gated)) return { file: gated, from: 'pixel-gate' };
  return null;
}

/**
 * @returns {{violations: string[], uncovered: string[], checked: number, rows: object[]}}
 */
function evaluateFreshness (baselinesDir, rendersDir, deps, maxDriftPx = 0) {
  const { PNG, pixelmatch } = deps || loadDeps();
  const names = fs.readdirSync(baselinesDir).filter((f) => f.endsWith('.png')).sort();
  const violations = [];
  const uncovered = [];
  const rows = [];
  for (const name of names) {
    const hit = findRender(rendersDir, name.replace(/\.png$/, ''));
    if (!hit) {
      uncovered.push(name);
      if (!KNOWN_UNCOVERED[name]) {
        violations.push(`UNCOVERED_BASELINE: ${name} 在 CI 里没有同名渲染，且未带理由登记（清单只能缩小）`);
      }
      rows.push({ name, driftPx: null, note: 'no CI render' });
      continue;
    }
    const a = PNG.sync.read(fs.readFileSync(path.join(baselinesDir, name)));
    const b = PNG.sync.read(fs.readFileSync(hit.file));
    if (a.width !== b.width || a.height !== b.height) {
      violations.push(`DIMS_MISMATCH: ${name} 基线 ${a.width}x${a.height} vs CI 渲染 ${b.width}x${b.height}`);
      rows.push({ name, driftPx: null, note: 'dims' });
      continue;
    }
    const driftPx = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
    rows.push({ name, driftPx, from: hit.from, pct: +((100 * driftPx) / (a.width * a.height)).toFixed(3) });
    if (driftPx > maxDriftPx) {
      violations.push(`BASELINE_STALE: ${name} 与同一次 CI 渲染差 ${driftPx} px（${((100 * driftPx) / (a.width * a.height)).toFixed(3)}%）`
        + ` —— 基线必须由 CI artifact 的渲染重建（QM-4 第 7 条），本机 test:visual:update-baseline 的产物不得提交`);
    }
  }
  return { violations, uncovered, checked: names.length, rows };
}

function main (argv = process.argv.slice(2)) {
  const get = (k, d) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : d;
  };
  const DESKTOP = path.resolve(__dirname, '../apps/desktop');
  const baselinesDir = get('baselines', path.join(DESKTOP, 'tests/visual-testing/base-screenshots'));
  const rendersDir = get('renders', '');
  const maxDriftPx = Number(get('max-drift-px', '0'));
  if (!rendersDir || !fs.existsSync(rendersDir)) {
    console.error('用法：node scripts/check-baseline-freshness.js --renders=<CI screenshots 目录> [--baselines=...] [--max-drift-px=0]');
    console.error('缺 --renders 时无法判定（不得默认通过）。');
    return 1;
  }
  const { violations, uncovered, checked, rows } = evaluateFreshness(baselinesDir, rendersDir, null, maxDriftPx);
  const stale = rows.filter((r) => typeof r.driftPx === 'number' && r.driftPx > maxDriftPx);
  console.log(`基线新鲜度：检查 ${checked} 张 / 偏离 ${stale.length} 张 / CI 无渲染 ${uncovered.length} 张`);
  for (const r of stale) console.log(`  ❌ ${r.name} ${r.driftPx} px (${r.pct}%) 来源=${r.from}`);
  for (const v of violations) if (!v.startsWith('BASELINE_STALE')) console.log('  ❌ ' + v);
  if (!violations.length) console.log('✅ 全部被跟踪基线逐像素等于本次 CI 渲染');
  return violations.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { evaluateFreshness, findRender, loadDeps, KNOWN_UNCOVERED, main };
