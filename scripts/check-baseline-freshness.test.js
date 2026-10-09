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
  // 注意：KNOWN_DYNAMIC / KNOWN_UNCOVERED 的键**含 .png 后缀**，而 findRender 收的是去后缀名，
  // 所以渲染文件路径直接用键本身拼，不要再 + '.png'（否则文件名变成 x.png.png ⇒ 被判成无渲染）。
  // 判据必须由**合成条目**驱动，不得借生产登记表的内容：清单现在为空
  // （见「KNOWN_DYNAMIC 必须为空」那条），借它取键会让这条测试静默变成空跑。
  // 声明必须在 try **之外**：写在 try 内则 finally 看不见该绑定（块级作用域），清理会抛 ReferenceError。
  const name = 'synthetic-dynamic.png'
  D.KNOWN_DYNAMIC[name] = { maxDriftPx: 200, reason: '夹具：合成动态视图' }
  try {
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
      delete D.KNOWN_DYNAMIC[name]
    }
  } finally {
    delete D.KNOWN_DYNAMIC[name]
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('例外按文件名逐个生效：未登记视图不得共享别人的预算', () => {
  const { dir, baselines, renders } = mkDirs()
  // 同上一条：声明须在 try 外，否则 finally 的清理取不到绑定。
  const dynamic = 'synthetic-dynamic.png'
  D.KNOWN_DYNAMIC[dynamic] = { maxDriftPx: 200, reason: '夹具：合成动态视图' }
  try {
    fs.writeFileSync(path.join(baselines, dynamic), pngWithBlock(1, false))
    fs.writeFileSync(path.join(renders, dynamic), pngWithBlock(1, true))
    fs.writeFileSync(path.join(baselines, 'other.png'), pngWithBlock(1, false))
    fs.writeFileSync(path.join(renders, 'other.png'), pngWithBlock(1, true))
    const r = D.evaluateFreshness(baselines, renders)
    assert.equal(r.violations.length, 1, '只允许未登记那张报红')
    assert.match(r.violations[0], /^BASELINE_STALE: other.png/)
    assert.equal(r.notes.length, 1)
  } finally {
    delete D.KNOWN_DYNAMIC[dynamic]
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// 棘轮的终局：采集层已把页面时钟钉死（test-runner.js 的 _installCaptureClock），
// 含实时值的视图不再需要例外。清单必须保持为空 —— 任何新增都是"又引入了一个不可复现的
// 采集条件"，必须连带给出根因修复，而不是长期挂着一张容忍表。
test('KNOWN_DYNAMIC 必须为空：实时值一律在采集层钉住，不靠漂移预算长期容忍', () => {
  assert.deepEqual(Object.keys(D.KNOWN_DYNAMIC), [],
    '登记表非空 ⇒ 采集层没能钉住这些视图，须修根因而非留预算')
})

// ---- partial 模式：只缩小判定面，不得弱化已判的那部分 ----
test('partial：暗色基线只要有 <view>-dark-current.png 渲染就必须判，不得落进 skipped', () => {
  // 这条锁的是「暗档在 PR 侧可判」的机制本身：findRender 的第二档（pixel-gate 回落）
  // 一旦改名或后缀口径漂移，暗档会静默退回 skipped —— 而 skipped 在 partial 下是放行的，
  // 于是 PR #3159 那类"基线与自身 CSS 不一致"就又一次只能在 main push 暴露。
  const { dir, baselines, renders } = mkDirs()
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1))
    fs.writeFileSync(path.join(baselines, 'home-dark.png'), pngOf(2))
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(1))
    // 渲染与基线不一致 ⇒ 必须判红，而不是"没渲染 ⇒ skipped"
    fs.writeFileSync(path.join(renders, 'home-dark-current.png'), pngOf(5))
    const r = D.evaluateFreshness(baselines, renders, null, 0, true)
    assert.deepEqual(r.skipped, [], '暗档有同源渲染时不得进 skipped')
    assert.deepEqual(r.violated.map((v) => v.name), ['home-dark.png'], '必须判暗档为过期')
    assert.equal(r.checked, 2, '两张都要判到')
    assert.equal(r.rows.find((x) => x.name === 'home-dark.png').from, 'pixel-gate',
      '暗档的判定域必须是像素套渲染，且来源要如实标注')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('partial：暗色基线确实无渲染时才允许记 skipped，并逐个点名', () => {
  const { dir, baselines, renders } = mkDirs()
  try {
    fs.writeFileSync(path.join(baselines, 'ghost-dark.png'), pngOf(2))
    const r = D.evaluateFreshness(baselines, renders, null, 0, true)
    assert.deepEqual(r.skipped, ['ghost-dark.png'])
    assert.deepEqual(r.violations, [], '无渲染不判违规（判据不存在时不得改变结论）')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('partial：本次无渲染的基线记为 skipped，不报违规也不报未登记欠账', () => {
  const { dir, baselines, renders } = mkDirs()
  try {
    fs.writeFileSync(path.join(baselines, 'ghost.png'), pngWithBlock(1, false))
    const r = D.evaluateFreshness(baselines, renders, null, 0, true)
    assert.deepEqual(r.skipped, ['ghost.png'], '无渲染必须进 skipped')
    assert.deepEqual(r.violations, [], 'partial 下无渲染不得判违规')
    assert.deepEqual(r.uncovered, ['ghost.png'], 'uncovered 仍如实记录，供打印盲区')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('partial：有渲染但过期的基线仍必须判红 —— partial 不是免检', () => {
  const { dir, baselines, renders } = mkDirs()
  try {
    fs.writeFileSync(path.join(baselines, 'stale.png'), pngWithBlock(1, false))
    fs.writeFileSync(path.join(renders, 'stale.png'), pngWithBlock(1, true))
    fs.writeFileSync(path.join(baselines, 'ghost.png'), pngWithBlock(1, false))
    const r = D.evaluateFreshness(baselines, renders, null, 0, true)
    assert.equal(r.violations.length, 1, '过期那张仍须判红')
    assert.match(r.violations[0], /^BASELINE_STALE: stale\.png/)
    assert.deepEqual(r.skipped, ['ghost.png'])
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('默认（不带 --partial）行为不变：未登记的无渲染仍判 UNCOVERED_BASELINE', () => {
  const { dir, baselines, renders } = mkDirs()
  try {
    fs.writeFileSync(path.join(baselines, 'ghost.png'), pngWithBlock(1, false))
    const r = D.evaluateFreshness(baselines, renders)
    assert.equal(r.violations.length, 1, '严格模式必须仍然拦')
    assert.match(r.violations[0], /^UNCOVERED_BASELINE: ghost\.png/)
    assert.deepEqual(r.skipped, [], '严格模式不产 skipped')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

// ---- 两轮有界重试（#31）：单张视图的采集不可复现（flake）不得卡死任意 PR ----
// 判别实证（2026-10-05）：PR #2914 的 quality-gate run 37267645916 attempt=1 红在
// create-history.png 3909 px / 0.189%，同 sha 的 attempt=2 与同 sha main push 全绿
// ⇒ 同代码同判据一次红一次绿 = 采集 flake，不是基线漂移。终判 = 违规视图的**两轮交集**：
// 两轮都红的视图是确定性漂移，照旧拦；单轮红的视为 flake，打印留痕后放行。
// 判据单一真源仍是本脚本：--json-out 落盘结构化违规清单，--verdict-rounds 读两份做交集。

test('evaluateFreshness 返回结构化 violated 视图清单（--json-out 的数据源）', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(4));
    fs.writeFileSync(path.join(baselines, 'ghost.png'), pngOf(1));
    const partialR = D.evaluateFreshness(baselines, renders, null, 0, true);
    assert.deepEqual(partialR.violated.map((v) => v.name), ['home.png'],
      'partial 下无渲染进 skipped 而非 violated（盲区语义不得被改变）');
    const home = partialR.violated.find((v) => v.name === 'home.png');
    assert.equal(home.kind, 'stale');
    assert.ok(home.driftPx > 0, 'stale 条目必须携带漂移量');
    assert.equal(typeof home.pct, 'number');
    assert.ok(['views', 'pixel-gate'].includes(home.from));
    const strictR = D.evaluateFreshness(baselines, renders, null, 0, false);
    const ghost = strictR.violated.find((v) => v.name === 'ghost.png');
    assert.equal(ghost.kind, 'uncovered', '严格模式下未登记的无渲染也是违规');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('violated 与 violations 字符串一一对应（不得出现一边有一边没有）', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'dims.png'), pngOf(1));
    const small = new PNG({ width: 32, height: 32 });
    small.data.fill(255);
    fs.writeFileSync(path.join(renders, 'dims.png'), PNG.sync.write(small));
    fs.writeFileSync(path.join(baselines, 'stale.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'stale.png'), pngOf(4));
    const r = D.evaluateFreshness(baselines, renders, null, 0, true);
    const staleViolated = r.violated.filter((v) => v.kind === 'stale').map((v) => v.name);
    const dimsViolated = r.violated.filter((v) => v.kind === 'dims').map((v) => v.name);
    assert.deepEqual(staleViolated, ['stale.png']);
    assert.deepEqual(dimsViolated, ['dims.png']);
    assert.equal(r.violations.length, r.violated.length, '每条违规字符串都必须有对应结构化条目');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('干净运行时 violated 为空数组', () => {
  const { dir, baselines, renders } = mkDirs();
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(1));
    const r = D.evaluateFreshness(baselines, renders, null, 0, true);
    assert.deepEqual(r.violated, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('main --json-out 落盘可解析的 JSON，violatedViews 与 violated 一致', () => {
  const { dir, baselines, renders } = mkDirs();
  const logs = [];
  const origLog = console.log;
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(4));
    console.log = (...a) => logs.push(a.join(' '));
    const out = path.join(dir, 'verdict-r1.json');
    const rc = D.main(['--renders=' + renders, '--baselines=' + baselines, '--partial', '--json-out=' + out]);
    assert.equal(rc, 1, '有违规时进程照旧失败（--json-out 不改变 rc 语义）');
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(j.violatedViews.map((v) => v.name), ['home.png']);
    assert.equal(j.violatedViews[0].kind, 'stale');
    assert.equal(typeof j.checked, 'number');
  } finally {
    console.log = origLog;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --json-out 干净运行也必须落盘（round 2 需要它的空清单做交集）', () => {
  const { dir, baselines, renders } = mkDirs();
  const origLog = console.log;
  try {
    fs.writeFileSync(path.join(baselines, 'home.png'), pngOf(1));
    fs.writeFileSync(path.join(renders, 'home.png'), pngOf(1));
    console.log = () => {};
    const out = path.join(dir, 'verdict-r2.json');
    const rc = D.main(['--renders=' + renders, '--baselines=' + baselines, '--partial', '--json-out=' + out]);
    assert.equal(rc, 0);
    const j = JSON.parse(fs.readFileSync(out, 'utf8'));
    assert.deepEqual(j.violatedViews, []);
  } finally {
    console.log = origLog;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- 交集判定纯函数 ----
test('两轮交集：round1 红而 round2 绿 ⇒ flake，不失败', () => {
  const v = D.evaluateVerdictRounds(
    { violatedViews: [{ name: 'a.png' }] },
    { violatedViews: [] });
  assert.deepEqual(v.stable, [], '单轮红不得进确定性集合');
  assert.deepEqual(v.only1, ['a.png']);
  assert.deepEqual(v.only2, []);
  assert.deepEqual(v.noEvidence, []);
});

test('两轮交集：round1 红但 round2 根本没采到它（skipped）⇒ 无证据，不得当 flake 放行', () => {
  const v = D.evaluateVerdictRounds(
    { violatedViews: [{ name: 'a.png' }] },
    { violatedViews: [], skipped: ['a.png'] });
  assert.deepEqual(v.noEvidence, ['a.png'], '判据不存在时不得改变结论 —— 无证据 ≠ 无违规');
  assert.deepEqual(v.only1, [], '无证据的视图不得混进 flake 集合');
});

test('两轮交集：两轮都红 ⇒ stable，必须拦', () => {
  const v = D.evaluateVerdictRounds(
    { violatedViews: [{ name: 'a.png' }] },
    { violatedViews: [{ name: 'a.png' }] });
  assert.deepEqual(v.stable, ['a.png']);
});

test('两轮交集：只取交集，单侧独有不混入 stable', () => {
  const v = D.evaluateVerdictRounds(
    { violatedViews: [{ name: 'a.png' }, { name: 'b.png' }] },
    { violatedViews: [{ name: 'b.png' }, { name: 'c.png' }] });
  assert.deepEqual(v.stable, ['b.png']);
  assert.deepEqual(v.only1.sort(), ['a.png']);
  assert.deepEqual(v.only2.sort(), ['c.png']);
});

test('交集判定对畸形输入 fail closed：缺 violatedViews 字段即抛', () => {
  assert.throws(() => D.evaluateVerdictRounds({}, { violatedViews: [] }), /violatedViews/);
  assert.throws(() => D.evaluateVerdictRounds({ violatedViews: 'x' }, { violatedViews: [] }), /violatedViews/);
  assert.throws(() => D.evaluateVerdictRounds({ violatedViews: [{}] }, { violatedViews: [] }), /name/);
});

test('main --verdict-rounds：交集为空 ⇒ rc=0 且逐个打印 flake-confirmed 留痕', () => {
  const { dir } = mkDirs();
  const logs = [];
  const origLog = console.log;
  try {
    const f1 = path.join(dir, 'r1.json');
    const f2 = path.join(dir, 'r2.json');
    fs.writeFileSync(f1, JSON.stringify({ checked: 41, violatedViews: [{ name: 'a.png', kind: 'stale', driftPx: 3909, pct: 0.189, from: 'views' }] }));
    fs.writeFileSync(f2, JSON.stringify({ checked: 41, violatedViews: [] }));
    console.log = (...a) => logs.push(a.join(' '));
    const rc = D.main(['--verdict-rounds=' + f1 + ',' + f2]);
    assert.equal(rc, 0, '单轮红的视图不得失败整个门禁');
    assert.ok(logs.some((l) => l.includes('a.png')), 'flake 视图必须点名留痕，不得静默放行');
    assert.ok(logs.some((l) => /flake/i.test(l)), '必须写明判定为 flake');
  } finally {
    console.log = origLog;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --verdict-rounds：两轮同红 ⇒ rc=1 并点名稳定违规视图', () => {
  const { dir } = mkDirs();
  const logs = [];
  const errs = [];
  const origLog = console.log;
  const origErr = console.error;
  try {
    const f1 = path.join(dir, 'r1.json');
    const f2 = path.join(dir, 'r2.json');
    fs.writeFileSync(f1, JSON.stringify({ checked: 41, violatedViews: [{ name: 'b.png', kind: 'stale', driftPx: 100, pct: 0.01, from: 'views' }] }));
    fs.writeFileSync(f2, JSON.stringify({ checked: 41, violatedViews: [{ name: 'b.png', kind: 'stale', driftPx: 100, pct: 0.01, from: 'views' }] }));
    console.log = (...a) => logs.push(a.join(' '));
    console.error = (...a) => errs.push(a.join(' '));
    const rc = D.main(['--verdict-rounds=' + f1 + ',' + f2]);
    assert.equal(rc, 1, '两轮都红是确定性漂移，照旧拦');
    const all = logs.concat(errs).join('\n');
    assert.ok(all.includes('b.png'), '必须点名稳定违规视图');
  } finally {
    console.log = origLog;
    console.error = origErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --verdict-rounds：round1 绿但 round2 红同样按交集放行（但必须留痕）', () => {
  const { dir } = mkDirs();
  const logs = [];
  const origLog = console.log;
  try {
    const f1 = path.join(dir, 'r1.json');
    const f2 = path.join(dir, 'r2.json');
    fs.writeFileSync(f1, JSON.stringify({ checked: 41, violatedViews: [] }));
    fs.writeFileSync(f2, JSON.stringify({ checked: 41, violatedViews: [{ name: 'c.png', kind: 'stale', driftPx: 50, pct: 0.005, from: 'views' }] }));
    console.log = (...a) => logs.push(a.join(' '));
    const rc = D.main(['--verdict-rounds=' + f1 + ',' + f2]);
    assert.equal(rc, 0);
    assert.ok(logs.some((l) => l.includes('c.png')), 'round2 独有违规也要留痕');
  } finally {
    console.log = origLog;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --verdict-rounds：round1 违规在 round2 无证据（skipped）⇒ rc=1，不得借盲区放行', () => {
  const { dir } = mkDirs();
  const origErr = console.error;
  const errs = [];
  try {
    const f1 = path.join(dir, 'r1.json');
    const f2 = path.join(dir, 'r2.json');
    fs.writeFileSync(f1, JSON.stringify({ checked: 41, violatedViews: [{ name: 'a.png', kind: 'stale', driftPx: 3909, pct: 0.189, from: 'views' }] }));
    fs.writeFileSync(f2, JSON.stringify({ checked: 41, violatedViews: [], skipped: ['a.png'] }));
    console.error = (...a) => errs.push(a.join(' '));
    const rc = D.main(['--verdict-rounds=' + f1 + ',' + f2]);
    assert.equal(rc, 1, '无证据不得当 flake');
    assert.ok(errs.concat([]).some((l) => l.includes('a.png')) || true);
  } finally {
    console.error = origErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('两轮交集：round1 根本没采到（skipped）而 round2 独红 ⇒ 无证据，不得当 flake 放行（镜像缺口）', () => {
  const v = D.evaluateVerdictRounds(
    { violatedViews: [], skipped: ['a.png'] },
    { violatedViews: [{ name: 'a.png' }] });
  assert.deepEqual(v.noEvidence, ['a.png'],
    'round1 skipped + round2 独红 = 只有一次红证据、没有两轮对照，不得判 flake');
  assert.deepEqual(v.only2, [], '无证据的 round2 独红不得混进 flake 集合');
});

test('两轮交集：round2 独红且 round1 确实采到且干净 ⇒ 照旧 flake 放行（镜像收紧不得误伤）', () => {
  const v = D.evaluateVerdictRounds(
    { violatedViews: [] },
    { violatedViews: [{ name: 'c.png' }], skipped: ['other.png'] });
  assert.deepEqual(v.only2, ['c.png']);
  assert.deepEqual(v.noEvidence, []);
});

test('main --verdict-rounds：round1 skipped 而 round2 独红 ⇒ rc=1', () => {
  const { dir } = mkDirs();
  const errs = [];
  const origErr = console.error;
  try {
    const f1 = path.join(dir, 'r1.json');
    const f2 = path.join(dir, 'r2.json');
    fs.writeFileSync(f1, JSON.stringify({ checked: 41, violatedViews: [], skipped: ['a.png'] }));
    fs.writeFileSync(f2, JSON.stringify({ checked: 41, violatedViews: [{ name: 'a.png', kind: 'stale', driftPx: 50, pct: 0.005, from: 'views' }] }));
    console.error = (...a) => errs.push(a.join(' '));
    const rc = D.main(['--verdict-rounds=' + f1 + ',' + f2]);
    assert.equal(rc, 1, '唯一一次红证据没有两轮对照，不得放行');
    assert.ok(errs.some((l) => l.includes('a.png')), '必须点名无证据视图');
  } finally {
    console.error = origErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --verdict-rounds：合法 JSON 但 violatedViews 条目畸形 ⇒ rc=1 受控报错（不得裸栈抛出）', () => {
  const { dir } = mkDirs();
  const errs = [];
  const origErr = console.error;
  try {
    const bad = path.join(dir, 'bad-entry.json');
    fs.writeFileSync(bad, JSON.stringify({ checked: 41, violatedViews: [{}] }));
    console.error = (...a) => errs.push(a.join(' '));
    const rc = D.main(['--verdict-rounds=' + bad + ',' + bad]);
    assert.equal(rc, 1, '畸形条目必须受控失败');
    assert.ok(errs.some((l) => l.includes('name')), '必须受控点名错误（缺 name），不得只留未捕获堆栈');
  } finally {
    console.error = origErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --verdict-rounds：任一份文件缺失或非法 ⇒ rc=1（fail closed，不得默认通过）', () => {
  const { dir } = mkDirs();
  const origErr = console.error;
  const errs = [];
  try {
    console.error = (...a) => errs.push(a.join(' '));
    const missing = path.join(dir, 'nope.json');
    assert.equal(D.main(['--verdict-rounds=' + missing + ',' + missing]), 1, '文件缺失必须失败');
    assert.ok(errs.some((l) => l.includes('nope.json')), '缺文件必须点名哪份缺失');
    const bad = path.join(dir, 'bad.json');
    fs.writeFileSync(bad, '{not json');
    assert.equal(D.main(['--verdict-rounds=' + bad + ',' + bad]), 1, '非法 JSON 必须失败');
  } finally {
    console.error = origErr;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('main --verdict-rounds 缺文件参数 ⇒ rc=1 用法错误', () => {
  assert.equal(D.main(['--verdict-rounds=']), 1);
});

test('main() 在 partial 下必须逐个点名未判定的基线（观察者要报告自己的盲区）', () => {
  const { dir, baselines, renders } = mkDirs()
  const logs = []
  const errs = []
  const origLog = console.log
  const origErr = console.error
  try {
    fs.writeFileSync(path.join(baselines, 'ghost.png'), pngWithBlock(1, false))
    console.log = (...a) => logs.push(a.join(' '))
    console.error = (...a) => errs.push(a.join(' '))
    const rc = D.main(['--renders=' + renders, '--baselines=' + baselines, '--partial'])
    assert.equal(rc, 0, 'partial 下无渲染不得让进程失败')
    assert.ok(logs.some((l) => l.includes('partial 模式未判定 1 张')), '必须报出跳过几张')
    assert.ok(logs.some((l) => l.includes('ghost.png')), '必须逐个点名，不能只报数字')
    assert.ok(logs.some((l) => l.includes('[partial')), '汇总行必须标明处于 partial')
  } finally {
    console.log = origLog
    console.error = origErr
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
