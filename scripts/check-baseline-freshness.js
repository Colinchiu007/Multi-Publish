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
 * 已登记的「跨 run 不稳定」视图：这些页面 UI 含实时值，其基线在数学上不可复现。
 * 与 KNOWN_UNCOVERED 同族纪律 —— 必须带实测理由与**漂移预算**，清单只能缩小；
 * 超出预算照红：例外只承认「这一处会变」，不承认「它会变多少都行」。
 *
 * 浅色实测依据（2026-09-30）：两次 CI run 对照，keyword-monitor 差 140 px，
 * 位置 (463,411)→(520,418)，内容是「最后检查: <ISO 时间戳>  采样: N 条」。
 * 暗色实测依据（2026-09-30，本门禁首次套到 origin/main 时抓出）：keyword-monitor-dark.png
 * 相对 main tip 那次 CI 渲染差 127 px，位置 (463,410)→(528,418)——同一行时间戳，
 * 只是暗色主题下反色像素更少。同一个视图的两套主题必须一起登记，不得只认浅色。
 * 正解是给该视图接确定性时钟（另案），届时两条一并删除；不是提阈值或遮区域。
 */
// 必须保持为空：实时值在采集层钉住（apps/desktop/tests/visual-testing/test-runner.js 的 _installCaptureClock），
// 而不是靠长期挂一张容忍表。机制保留 —— 若将来确实出现无法钉住的视图，登记必须连带根因说明。
// 判据：check-baseline-freshness.test.js 的「KNOWN_DYNAMIC 必须为空」。
const KNOWN_DYNAMIC = {};

/**
 * @returns {{violations: string[], violated: {name: string, kind: string, driftPx?: number, pct?: number, from?: string}[], uncovered: string[], notes: string[], checked: number, rows: object[]}}
 */
function evaluateFreshness (baselinesDir, rendersDir, deps, maxDriftPx = 0, partial = false) {
  const { PNG, pixelmatch } = deps || loadDeps();
  const names = fs.readdirSync(baselinesDir).filter((f) => f.endsWith('.png')).sort();
  const violations = [];
  const violated = [];
  const uncovered = [];
  const skipped = [];
  const notes = [];
  const rows = [];
  for (const name of names) {
    const hit = findRender(rendersDir, name.replace(/\.png$/, ''));
    if (!hit) {
      uncovered.push(name);
      // partial 模式：本次运行**根本没产这张图**（例如 PR 侧的 QG Visual 只跑浅色像素套）。
      // 这不是「基线过期」，也不是欠账 —— 判据不存在时不得改变结论；但必须逐个点名跳过，
      // 否则 partial 会悄悄退化成「少判几张也没人知道」。
      if (partial) {
        skipped.push(name);
        rows.push({ name, driftPx: null, note: 'partial: no render in this run' });
        continue;
      }
      if (!KNOWN_UNCOVERED[name]) {
        violations.push(`UNCOVERED_BASELINE: ${name} 在 CI 里没有同名渲染，且未带理由登记（清单只能缩小）`);
        violated.push({ name, kind: 'uncovered' });
      }
      rows.push({ name, driftPx: null, note: 'no CI render' });
      continue;
    }
    const a = PNG.sync.read(fs.readFileSync(path.join(baselinesDir, name)));
    const b = PNG.sync.read(fs.readFileSync(hit.file));
    if (a.width !== b.width || a.height !== b.height) {
      violations.push(`DIMS_MISMATCH: ${name} 基线 ${a.width}x${a.height} vs CI 渲染 ${b.width}x${b.height}`);
      rows.push({ name, driftPx: null, note: 'dims' });
      violated.push({ name, kind: 'dims' });
      continue;
    }
    const driftPx = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
    const pct = +((100 * driftPx) / (a.width * a.height)).toFixed(3);
    rows.push({ name, driftPx, from: hit.from, pct });
    const dynamic = KNOWN_DYNAMIC[name];
    if (driftPx > maxDriftPx) {
      if (dynamic && driftPx <= dynamic.maxDriftPx) {
        notes.push(`DYNAMIC_ALLOWED: ${name} 差 ${driftPx} px ≤ 已登记预算 ${dynamic.maxDriftPx} px（${dynamic.reason}）`);
      } else if (dynamic) {
        violations.push(`DYNAMIC_BUDGET_EXCEEDED: ${name} 差 ${driftPx} px，超出已登记预算 ${dynamic.maxDriftPx} px`
          + ` —— 登记理由是「${dynamic.reason}」；变这么多说明该处行为已改，须重新取证而非抬预算`);
        violated.push({ name, kind: 'dynamic-budget', driftPx, pct, from: hit.from });
      } else {
        violations.push(`BASELINE_STALE: ${name} 与同一次 CI 渲染差 ${driftPx} px（${pct}%）`
          + ` —— 基线必须由 CI artifact 的渲染重建（QM-4 第 7 条），本机 test:visual:update-baseline 的产物不得提交`);
        violated.push({ name, kind: 'stale', driftPx, pct, from: hit.from });
      }
    }
  }
  return { violations, violated, uncovered, skipped, notes, checked: names.length, rows };
}

/**
 * 两轮有界重试的终判（#31）：单张视图的采集不可复现（flake）不得卡死任意 PR。
 * 终判 = 违规视图的**两轮交集**：两轮都红是确定性漂移（stable，照旧拦），
 * 单轮红是采集 flake（only1/only2，放行但必须留痕）。
 * 判定域按视图文件名，kind 漂移不参与交集（同视图两轮的 kind 理论上一致；
 * 不一致按「两轮都红」处理——宁可多拦不可漏放）。
 */
function evaluateVerdictRounds (round1, round2) {
  const read = (r, label) => {
    if (!r || typeof r !== 'object' || Array.isArray(r) || !Array.isArray(r.violatedViews)) {
      throw new Error(`${label} 缺少 violatedViews 数组 —— 判定文件格式非法`);
    }
    const names = [];
    for (const v of r.violatedViews) {
      if (!v || typeof v.name !== 'string' || !v.name) {
        throw new Error(`${label} 的 violatedViews 条目缺少 name 字段`);
      }
      names.push(v.name);
    }
    return new Set(names);
  };
  const s1 = read(round1, 'round1');
  const s2 = read(round2, 'round2');
  // round2 的 skipped 是「这轮根本没采到」的盲区名单：round1 红的视图若落在里面，
  // 等于没有第二次证据 —— 不得当 flake 放行（判据不存在时不得改变结论）。
  const skipped2 = new Set(Array.isArray(round2.skipped) ? round2.skipped.filter((s) => typeof s === 'string') : []);
  // 镜像同判：round2 独红的视图若 round1 根本没采到（skipped1），同样只有一次红证据、
  // 没有两轮对照，也不得判 flake（QM-6 后端评审 W1）。
  const skipped1 = new Set(Array.isArray(round1.skipped) ? round1.skipped.filter((s) => typeof s === 'string') : []);
  const stable = [...s1].filter((n) => s2.has(n)).sort();
  const noEvidence = [
    ...[...s1].filter((n) => !s2.has(n) && skipped2.has(n)),
    ...[...s2].filter((n) => !s1.has(n) && skipped1.has(n)),
  ].sort();
  const only1 = [...s1].filter((n) => !s2.has(n) && !skipped2.has(n)).sort();
  const only2 = [...s2].filter((n) => !s1.has(n) && !skipped1.has(n)).sort();
  return { stable, only1, only2, noEvidence };
}

/** 把两份轮次 JSON 落盘文件读成判定输入；任何读取/解析失败都抛（调用方 fail closed）。 */
function readVerdictFile (file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.violatedViews)) {
    throw new Error(`${file} 缺少 violatedViews 数组`);
  }
  return parsed;
}

function main (argv = process.argv.slice(2)) {
  const get = (k, d) => {
    const hit = argv.find((a) => a.startsWith(`--${k}=`));
    return hit ? hit.slice(k.length + 3) : d;
  };
  // 两轮终判模式：只消费两份 --json-out 产物，不碰基线/渲染目录。
  const verdictArg = get('verdict-rounds', null);
  if (verdictArg !== null) {
    const files = verdictArg.split(',').map((s) => s.trim()).filter(Boolean);
    if (files.length !== 2) {
      console.error('用法：--verdict-rounds=<round1.json>,<round2.json>（恰好两份）');
      console.error('缺两份轮次判定文件时无法终判（不得默认通过）。');
      return 1;
    }
    let round1; let round2;
    try {
      round1 = readVerdictFile(files[0]);
      round2 = readVerdictFile(files[1]);
    } catch (e) {
      console.error(`❌ 轮次判定文件不可用：${e.message}`);
      return 1;
    }
    let rounds;
    try {
      rounds = evaluateVerdictRounds(round1, round2);
    } catch (e) {
      console.error(`❌ 轮次判定文件结构非法：${e.message}`);
      return 1;
    }
    const { stable, only1, only2, noEvidence } = rounds;
    for (const n of only1) console.log(`  ⚠️ flake-confirmed（仅 round1 红）：${n}`);
    for (const n of only2) console.log(`  ⚠️ flake-confirmed（仅 round2 红）：${n}`);
    if (noEvidence.length) {
      console.error(`❌ ${noEvidence.length} 张视图只有单轮红证据且另一轮没采到（无证据，不得当 flake 放行）：`);
      for (const n of noEvidence) console.error(`   · ${n}`);
      return 1;
    }
    if (stable.length) {
      console.error(`❌ ${stable.length} 张视图两轮都红（确定性漂移，不因重试放行）：`);
      for (const n of stable) console.error(`   · ${n}`);
      return 1;
    }
    console.log(`✅ 两轮交集为空：${only1.length + only2.length} 张单轮红视图判定为采集 flake（详见上方留痕），无确定性漂移`);
    return 0;
  }

  const DESKTOP = path.resolve(__dirname, '../apps/desktop');
  const baselinesDir = get('baselines', path.join(DESKTOP, 'tests/visual-testing/base-screenshots'));
  const rendersDir = get('renders', '');
  const maxDriftPx = Number(get('max-drift-px', '0'));
  const partial = argv.includes('--partial');
  const jsonOut = get('json-out', null);
  if (!rendersDir || !fs.existsSync(rendersDir)) {
    console.error('用法：node scripts/check-baseline-freshness.js --renders=<CI screenshots 目录> [--baselines=...] [--max-drift-px=0] [--partial] [--json-out=<file>] [--verdict-rounds=<r1>,<r2>]');
    console.error('缺 --renders 时无法判定（不得默认通过）。');
    return 1;
  }
  const { violations, violated, uncovered, skipped = [], notes, checked, rows } = evaluateFreshness(baselinesDir, rendersDir, null, maxDriftPx, partial);
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify({
      checked,
      violatedViews: violated,
      uncovered,
      skipped,
      notes,
    }, null, 2) + '\n');
  }
  const drifted = rows.filter((r) => typeof r.driftPx === 'number' && r.driftPx > maxDriftPx);
  // 已登记且在预算内的动态漂移只出声、不打 ❌ —— 否则 rc=0 与满屏 ❌ 同时出现，
  // 读日志的人会按 ❌ 计数判断成败，等于把"允许"显示成"失败"。
  const allowed = new Set(notes.map((n) => n.replace(/^DYNAMIC_ALLOWED: ([^ ]+) .*/, '$1')));
  const offending = drifted.filter((r) => !allowed.has(r.name));
  console.log(`基线新鲜度${partial ? '[partial：只判本次有渲染的那些]' : ''}：检查 ${checked} 张 / 违规 ${offending.length} 张 / 登记内动态漂移 ${allowed.size} 张 / CI 无渲染 ${uncovered.length} 张 / 本次跳过 ${skipped.length} 张`);
  for (const r of offending) console.log(`  ❌ ${r.name} ${r.driftPx} px (${r.pct}%) 来源=${r.from}`);
  for (const v of violations) {
    if (v.startsWith('BASELINE_STALE') || v.startsWith('DYNAMIC_ALLOWED')) continue;
    console.log('  ❌ ' + v);
  }
  for (const n of notes) console.log('  ⚠️  ' + n);
  // 结论文案必须与实际漂移集合一致：存在任何非零漂移时不得说"全部逐像素相等"。
  if (!violations.length) {
    const judged = checked - uncovered.length;
    console.log(drifted.length
      ? `✅ 除 ${drifted.length} 张已登记动态视图外，其余 ${judged - drifted.length} 张逐像素等于本次 CI 渲染`
      : `✅ 全部 ${judged} 张有渲染的基线逐像素等于本次 CI 渲染`);
  }
  if (skipped.length) {
    // 观察者必须报告自己的盲区：partial 少判了谁必须逐个列出来，
    // 否则「PR 上绿」会被下一个会话读成「全部基线都验过」。
    console.log(`⚠️ partial 模式未判定 ${skipped.length} 张（本次运行没有它们的渲染）：`);
    for (const n of skipped) console.log(`   · ${n}`);
  }
  return violations.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();

module.exports = { evaluateFreshness, evaluateVerdictRounds, readVerdictFile, findRender, loadDeps, KNOWN_UNCOVERED, KNOWN_DYNAMIC, main };
