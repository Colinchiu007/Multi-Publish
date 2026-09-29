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



// 夹具：只让一小块不同 ⇒ 漂移落在预算内（默认 pngOf 的两张差 3511 px，会直接超出 200 预算，
// 那样测的是"超预算"而不是"预算内"，两条断言会互相顶掉）。
function pngWithBlock (seed, block) {
  const p = new PNG({ width: 64, height: 64 })
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = ((y * 64) + x) << 2
      const inBlock = x < 6 && y < 6
      const ink = inBlock ? (block ? 0 : 128) : ((x + y + seed) % 7) < 3 ? 20 : 240
      p.data[i] = ink; p.data[i + 1] = ink; p.data[i + 2] = ink; p.data[i + 3] = 255
    }
  }
  return PNG.sync.write(p)
}

test('已登记动态视图在预算内不报违规、只出声；超出预算报 DYNAMIC_BUDGET_EXCEEDED', () => {
  const { dir, baselines, renders } = mkDirs()
  try {
    // 注意：KNOWN_DYNAMIC / KNOWN_UNCOVERED 的键**含 .png 后缀**，而 findRender 收的是去后缀名，
    // 所以渲染文件路径直接用键本身拼，不要再 + '.png'（否则文件名变成 x.png.png ⇒ 被判成无渲染）。
    const name = Object.keys(D.KNOWN_DYNAMIC)[0]
    const budget = D.KNOWN_DYNAMIC[name].maxDriftPx
    fs.writeFileSync(path.join(baselines, name), pngWithBlock(1, false))
    fs.writeFileSync(path.join(renders, name), pngWithBlock(1, true))
    const inside = D.evaluateFreshness(baselines, renders)
    const drift = inside.rows[0].driftPx
    assert.ok(drift > 0, '夹具必须真的产生漂移，否则这条测试是空的')
    assert.ok(drift <= budget, `夹具漂移 ${drift} 应落在预算 ${budget} 内`)
    assert.deepEqual(inside.violations, [], '预算内不得报违规（否则门禁会永久红）')
    assert.equal(inside.notes.length, 1)
    assert.match(inside.notes[0], /^DYNAMIC_ALLOWED: /)
    const saved = D.KNOWN_DYNAMIC[name].maxDriftPx
    try {
      D.KNOWN_DYNAMIC[name].maxDriftPx = drift - 1
      const over = D.evaluateFreshness(baselines, renders)
      assert.equal(over.violations.length, 1)
      assert.match(over.violations[0], /^DYNAMIC_BUDGET_EXCEEDED: /)
      assert.equal(over.notes.length, 0)
    } finally {
      D.KNOWN_DYNAMIC[name].maxDriftPx = saved
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('例外按文件名逐个生效：未登记视图不得共享别人的预算', () => {
  const { dir, baselines, renders } = mkDirs()
  try {
    const dynamic = Object.keys(D.KNOWN_DYNAMIC)[0]
    fs.writeFileSync(path.join(baselines, dynamic), pngWithBlock(1, false))
    fs.writeFileSync(path.join(renders, dynamic), pngWithBlock(1, true))
    fs.writeFileSync(path.join(baselines, 'other.png'), pngWithBlock(1, false))
    fs.writeFileSync(path.join(renders, 'other.png'), pngWithBlock(1, true))
    const r = D.evaluateFreshness(baselines, renders)
    assert.equal(r.violations.length, 1, '只允许未登记那张报红')
    assert.match(r.violations[0], /^BASELINE_STALE: other.png/)
    assert.equal(r.notes.length, 1)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})
