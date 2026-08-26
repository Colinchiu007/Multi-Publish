'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  durationDeviation, intervalIoU, structureSimilarity, scriptSimilarity,
  styleOverlap, styleTagsFromReport, computeSimilarityReport,
} = require('../src/similarity');
const { emptyReport } = require('../src/clone-report');

test('durationDeviation 精确', () => {
  assert.equal(durationDeviation(60, 60), 0);
  assert.equal(durationDeviation(60, 66), 0.1);
  assert.equal(durationDeviation(60, 54), 0.1);
  assert.equal(durationDeviation(0, 10), null);
  assert.equal(durationDeviation(60, -1), null);
});

test('intervalIoU', () => {
  assert.equal(intervalIoU({ t0: 0, t1: 10 }, { t0: 0, t1: 10 }), 1);
  assert.equal(intervalIoU({ t0: 0, t1: 10 }, { t0: 20, t1: 30 }), 0);
  assert.equal(intervalIoU({ t0: 0, t1: 10 }, { t0: 5, t1: 15 }), 5 / 15);
});

test('structureSimilarity：一致/部分/不相交', () => {
  const src = [{ t0: 0, t1: 10 }];
  assert.equal(structureSimilarity(src, [{ t0: 0, t1: 10 }]), 1);
  assert.equal(structureSimilarity(src, [{ t0: 2, t1: 6 }]), 0.4);
  assert.equal(structureSimilarity(src, [{ t0: 20, t1: 30 }]), 0);
  assert.equal(structureSimilarity([], []), 1);
  assert.equal(structureSimilarity(src, []), 0);
});

test('scriptSimilarity：相同/微改/完全不同/空', () => {
  assert.equal(scriptSimilarity('abc', 'abc'), 1);
  assert.ok(scriptSimilarity('今天教大家一个技巧', '今天教大家一个方法') > 0.5);
  assert.equal(scriptSimilarity('abc', 'xyz'), 0);
  assert.equal(scriptSimilarity('', ''), 1);
  assert.equal(scriptSimilarity('', 'x'), 0);
});

test('styleOverlap：Jaccard', () => {
  assert.equal(styleOverlap(['a', 'b'], ['a', 'b', 'c']), 2 / 3);
  assert.equal(styleOverlap([], []), 1);
  assert.equal(styleOverlap(['a'], []), 0);
});

test('styleTagsFromReport 抽取', () => {
  const r = emptyReport();
  r.visual.palette = 'warm';
  r.visual.transitions = ['hard-cut'];
  r.scriptStyle.person = 'second';
  const tags = styleTagsFromReport(r);
  assert.ok(tags.includes('palette:warm'));
  assert.ok(tags.includes('transition:hard-cut'));
  assert.ok(tags.includes('person:second'));
});

test('computeSimilarityReport：完全一致 → score≈1 全部 PASS', () => {
  const r = emptyReport();
  r.meta.durationSec = 60;
  r.narrative.timeline = [{ t0: 0, t1: 10 }];
  r.script.fullText = '文案';
  r.visual.palette = 'warm';
  r.scriptStyle.person = 'second';
  const out = computeSimilarityReport({ source: r, clone: r });
  assert.ok(out.score > 0.98);
  assert.equal(out.verdict, 'pass');
  for (const k of Object.keys(out.passes)) assert.equal(out.passes[k], true, k);
  assert.equal(out.warnings.verbatimScript, true); // 文案 100% 一致触发照抄警告（合规，不影响相似度通过）
});

test('computeSimilarityReport：明显偏离 → 未达标项', () => {
  const src = emptyReport();
  src.meta.durationSec = 60;
  src.narrative.timeline = [{ t0: 0, t1: 10 }];
  src.script.fullText = 'aaa';
  src.visual.palette = 'warm';
  const clone = emptyReport();
  clone.meta.durationSec = 90; // 50% 偏差
  clone.narrative.timeline = [{ t0: 100, t1: 110 }]; // 不相交
  clone.script.fullText = 'xyz'; // 完全不同
  clone.visual.palette = 'cool';
  const out = computeSimilarityReport({ source: src, clone });
  assert.equal(out.passes.duration, false);
  assert.equal(out.passes.structure, false);
  assert.equal(out.passes.script, false);
  assert.ok(out.score < 0.5);
  assert.equal(out.verdict, 'needs_review');
});

test('computeSimilarityReport：P1/P2 阈值差异', () => {
  const src = emptyReport();
  src.meta.durationSec = 100;
  src.narrative.timeline = [{ t0: 0, t1: 10 }];
  src.script.fullText = 'abcd';
  const clone = emptyReport();
  clone.meta.durationSec = 108; // 8% 偏差
  clone.narrative.timeline = [{ t0: 0, t1: 10 }];
  clone.script.fullText = 'abcd';
  const p1 = computeSimilarityReport({ source: src, clone, target: 'P1' });
  const p2 = computeSimilarityReport({ source: src, clone, target: 'P2' });
  assert.equal(p1.passes.duration, true); // ≤10%
  assert.equal(p2.passes.duration, false); // >5%
});

// —— v1.16：按复刻层级验收 ——

test('L0 文案级：仅文案必须；结构/风格不达标不阻塞 pass', () => {
  const src = emptyReport();
  src.meta.durationSec = 60;
  src.script.fullText = '同一段文案';
  src.narrative.timeline = [{ t0: 0, t1: 10 }];
  src.visual.palette = 'warm';
  const clone = emptyReport();
  clone.meta.durationSec = 60;
  clone.script.fullText = '同一段文案';
  const out = computeSimilarityReport({ source: src, clone, level: 'L0' });
  assert.equal(out.level, 'L0');
  assert.equal(out.passes.script, true);
  assert.equal(out.verdict, 'pass');
});

test('L0 文案级：文案偏离 → needs_review（不看结构/风格）', () => {
  const src = emptyReport();
  src.script.fullText = 'aaa';
  src.meta.durationSec = 60; // 带足证据避免 insufficient_evidence
  const clone = emptyReport();
  clone.script.fullText = 'xyz';
  clone.meta.durationSec = 60;
  const out = computeSimilarityReport({ source: src, clone, level: 'L0' });
  assert.equal(out.passes.script, false);
  assert.equal(out.verdict, 'needs_review');
});

test('L0 无文案证据 → insufficient_evidence（防空报告假通过）', () => {
  const out = computeSimilarityReport({ source: emptyReport(), clone: emptyReport(), level: 'L0' });
  assert.equal(out.verdict, 'insufficient_evidence');
});

test('L1 vs L2 时长阈值差异：8% 偏差 L1 过 / L2 不过', () => {
  const src = emptyReport();
  src.meta.durationSec = 100;
  src.narrative.timeline = [{ t0: 0, t1: 10 }];
  src.script.fullText = 'abcd';
  src.visual.palette = 'warm';
  src.scriptStyle.person = 'second';
  const clone = emptyReport();
  clone.meta.durationSec = 108;
  clone.narrative.timeline = [{ t0: 0, t1: 10 }];
  clone.script.fullText = 'abcd';
  clone.visual.palette = 'warm';
  clone.scriptStyle.person = 'second';
  const l1 = computeSimilarityReport({ source: src, clone, level: 'L1' });
  const l2 = computeSimilarityReport({ source: src, clone, level: 'L2' });
  assert.equal(l1.passes.duration, true);
  assert.equal(l2.passes.duration, false);
});

test('resolveLevel：显式 level > target 映射 > L1', () => {
  const { resolveLevel } = require('../src/similarity');
  assert.equal(resolveLevel('L0', 'P2'), 'L0');
  assert.equal(resolveLevel(null, 'P2'), 'L2');
  assert.equal(resolveLevel(null, 'P1'), 'L1');
  assert.equal(resolveLevel('L9', 'P1'), 'L1'); // 非法显式 → 回退
  assert.equal(resolveLevel(null, null), 'L1');
});

// —— 审查回归（W2/I2：空数据假通过；W4：顺序敏感）——

test('W2: 空报告 → insufficient_evidence，不判定 PASS，无 verbatim 假警告', () => {
  const out = computeSimilarityReport({ source: emptyReport(), clone: emptyReport() });
  assert.equal(out.verdict, 'insufficient_evidence');
  assert.ok(out.confidence < 0.5);
  for (const k of Object.keys(out.passes)) assert.equal(out.passes[k], false, k);
  assert.equal(out.warnings.verbatimScript, false);
});

// —— 真度量改造：score 证据归一化 + grade 门禁 ——

test('归一化：无证据维度不计分不占权（部分证据下 score 反映真实维度）', () => {
  const src = emptyReport();
  src.meta.durationSec = 60;
  src.script.fullText = 'aaa';
  const clone = emptyReport();
  clone.meta.durationSec = 60;
  clone.script.fullText = 'xyz'; // 完全不同
  // 证据仅 script+duration；structure/style 双空不计分
  const out = computeSimilarityReport({ source: src, clone });
  assert.equal(out.confidence, 0.5);
  // 归一化：(0.25*0 + 0.15*1) / 0.40 = 0.375（旧公式含空数据满分 ≈ 0.75）
  assert.ok(out.score < 0.5, 'score 应为 ' + out.score);
  assert.equal(out.verdict, 'needs_review');
});

test('归一化：全无证据 → score=0', () => {
  const out = computeSimilarityReport({ source: emptyReport(), clone: emptyReport() });
  assert.equal(out.score, 0);
});

test('grade 门禁：已证据维度少于该层必需维度 → grade=null（即使 score 满分）', () => {
  const src = emptyReport();
  src.meta.durationSec = 60;
  src.narrative.timeline = [{ t0: 0, t1: 10 }];
  const clone = emptyReport();
  clone.meta.durationSec = 60;
  clone.narrative.timeline = [{ t0: 0, t1: 10 }];
  // 仅 structure+duration 有证据（confidence=0.5），L1 必需 4 维 → 不评级
  const out = computeSimilarityReport({ source: src, clone, level: 'L1' });
  assert.equal(out.score, 1);
  assert.equal(out.grade, null);
  assert.equal(out.verdict, 'needs_review');
});

test('grade 门禁：confidence<0.5 → grade=null（L0 空文案）', () => {
  const out = computeSimilarityReport({ source: emptyReport(), clone: emptyReport(), level: 'L0' });
  assert.equal(out.grade, null);
});

test('grade 门禁：满证据时正常评级（回归）', () => {
  const r = emptyReport();
  r.meta.durationSec = 60;
  r.narrative.timeline = [{ t0: 0, t1: 10 }];
  r.script.fullText = '文案';
  r.visual.palette = 'warm';
  r.scriptStyle.person = 'second';
  const out = computeSimilarityReport({ source: r, clone: r });
  assert.equal(out.grade, 'L2');
});

test('W4: 结构相似度对顺序敏感（倒序时间轴低分）', () => {
  const src = [{ t0: 0, t1: 5, label: 'a' }, { t0: 5, t1: 10, label: 'b' }];
  const same = [{ t0: 0, t1: 5 }, { t0: 5, t1: 10 }];
  const reversed = [{ t0: 5, t1: 10 }, { t0: 0, t1: 5 }];
  assert.equal(structureSimilarity(src, same), 1);
  const revScore = structureSimilarity(src, reversed);
  assert.ok(revScore < 1, '倒序应低于 1，实际 ' + revScore);
  assert.ok(revScore < 0.6, '倒序应显著低，实际 ' + revScore);
});

test('结构相似度：部分重叠（保序 DP）', () => {
  const src = [{ t0: 0, t1: 10 }];
  assert.equal(structureSimilarity(src, [{ t0: 2, t1: 6 }]), 0.4);
  assert.equal(structureSimilarity(src, [{ t0: 20, t1: 30 }]), 0);
});
