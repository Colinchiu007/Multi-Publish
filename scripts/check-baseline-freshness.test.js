'use strict';

/**
 * check-baseline-freshness 的门禁用例（node:test）。
 * 全部在 os.tmpdir() 里自建真实可解码 PNG，不联网、不依赖仓库基线内容。
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

const D = require('./check-baseline-freshness.js');
const { PNG } = D.loadDeps();

function pngOf (seed) {
  const p = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = ((y * 64) + x) << 2;
      const ink = ((x + y + seed) % 7) < 3 ? 20 : 240;
      p.data[i] = ink; p.data[i + 1] = ink; p.data[i + 2] = ink; p.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(p);
}

function mkDirs () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-fresh-'));
  const baselines = path.join(dir, 'base');
  const renders = path.join(dir, 'renders');
  fs.mkdirSync(baselines, { recursive: true });
  fs.mkdirSync(renders, { recursive: true });
  return { dir, baselines, renders };
}

test('基线等于 CI 渲染时不报违规', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(1));
    const r = D.evaluateFreshness(baselines, renders);
    assert.deepEqual(r.violations, []);
    assert.equal(r.checked, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('基线偏离 CI 渲染时报 BASELINE_STALE 并点名文件', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(4));
    const r = D.evaluateFreshness(baselines, renders);
    assert.equal(r.violations.length, 1);
    assert.match(r.violations[0], /^BASELINE_STALE: home\.png 与同一次 CI 渲染差 \d+ px（[\d.]+%）/);
    assert.ok(r.violations[0].includes('QM-4 第 7 条'), '违规文案必须给出正解，而不是只报数');
    assert.ok(r.rows[0].driftPx > 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('尺寸不同报 DIMS_MISMATCH 而不是崩在 pixelmatch', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    const small = new PNG({ width: 32, height: 32 });
    small.data.fill(255);
    fs.writeFileSync(path.join(renders, 'home.png'), PNG.sync.write(small));
    const r = D.evaluateFreshness(baselines, renders);
    assert.deepEqual(r.violations, ['DIMS_MISMATCH: home.png 基线 64x64 vs CI 渲染 32x32']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CI 无渲染且未登记 ⇒ 违规；已带理由登记 ⇒ 只出声不拦', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    const known = Object.keys(D.KNOWN_UNCOVERED)[0];
    fs.writeFileSync(path.join(baselines, 'ghost.png'), pngOf(1));
    fs.writeFileSync(path.join(baselines, known), pngOf(1));
    const r = D.evaluateFreshness(baselines, renders);
    assert.equal(r.violations.length, 1, '只允许未登记那张报红');
    assert.match(r.violations[0], /^UNCOVERED_BASELINE: ghost\.png/);
    assert.deepEqual(r.uncovered.sort(), ['ghost.png', known].sort());
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('渲染查找优先视图套件的 <name>.png，其次像素门禁的 <name>-current.png', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    assert.equal(D.findRender(renders, 'x'), null, '两张都不存在时必须返回 null，不得返回半个路径');
    fs.writeFileSync(path.join(renders, 'x-current.png'), pngOf(2));
    assert.equal(D.findRender(renders, 'x').from, 'pixel-gate');
    fs.writeFileSync(path.join(renders, 'x.png'), pngOf(2));
    assert.equal(D.findRender(renders, 'x').from, 'views', '两套都有时必须取视图套件那张');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--max-drift-px 是判据的一部分，不是装饰', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(4));
    const drift = D.evaluateFreshness(baselines, renders).rows[0].driftPx;
    assert.ok(drift > 1);
    assert.equal(D.evaluateFreshness(baselines, renders, null, drift).violations.length, 0);
    assert.equal(D.evaluateFreshness(baselines, renders, null, drift - 1).violations.length, 1);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('缺 --renders 时退出码为 1，不得默认通过', () => {
  const logs = [];
  const code = D.main([]);
  assert.equal(code, 1, '拿不到渲染就没有判据 —— 与 check-dep-audit 的"无判据即失败"同一条纪律');
  assert.ok(typeof code === 'number');
  assert.equal(logs.length, 0);
});
