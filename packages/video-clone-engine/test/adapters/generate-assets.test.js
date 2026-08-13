'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGenerateAssets, createAssetPlan } = require('../../src/adapters/generate-assets');
const { emptyReport } = require('../../src/clone-report');
const { VideoCloneError } = require('../../src/errors');

function reportWithShots() {
  const r = emptyReport();
  r.visual.shots = [{ t0: 0, t1: 2, type: 'unknown' }, { t0: 2, t1: 5, type: 'unknown' }];
  r.visual.palette = 'warm';
  r.scriptStyle.tone = 'cheerful';
  r.scriptStyle.person = 'second';
  r.narrative.plot = '一个故事';
  r.replication.mode = 'style';
  r.replication.level = 'L1'; // 生产路径由 plan 定级；夹具显式 L1 走逐镜头分支
  return r;
}

test('createAssetPlan：逐镜头规格（时长/promptSeed 含风格锚点）', () => {
  const plan = createAssetPlan(reportWithShots());
  assert.equal(plan.length, 2);
  assert.equal(plan[0].durationSec, 2);
  assert.equal(plan[1].durationSec, 3);
  assert.ok(plan[0].promptSeed.includes('palette:warm'));
  assert.ok(plan[0].promptSeed.includes('tone:cheerful'));
  assert.ok(plan[0].promptSeed.includes('person:second'));
  assert.equal(plan[0].kind, 'image');
});

test('full 模式 + video 镜头 → kind=video', () => {
  const r = reportWithShots();
  r.replication.mode = 'full';
  r.visual.shots[0].type = 'video';
  const plan = createAssetPlan(r);
  assert.equal(plan[0].kind, 'video');
  assert.equal(plan[1].kind, 'image');
});

test('L0 文案级：单封面图规划（kind=cover, text-first）', () => {
  const r = emptyReport();
  r.replication.level = 'L0';
  r.meta.durationSec = 8;
  r.script.fullText = '这是文案';
  const plan = createAssetPlan(r);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].kind, 'cover');
  assert.ok(plan[0].promptSeed.includes('text-first'));
  assert.ok(plan[0].promptSeed.includes('text:这是文案'));
  assert.equal(plan[0].durationSec, 8);
});

test('L0 无有效内容（空报告）→ 空规划（generate fail-closed）', () => {
  const plan = createAssetPlan(emptyReport()); // level=L0 但无文案/时长
  assert.equal(plan.length, 0);
});

test('L0 generate 产出单封面并标记 assets.level', async () => {
  const g = createGenerateAssets({ assetGenerator: async (spec) => ({ path: 'C:/tmp/cover.png', kind: spec.kind }) });
  const r = emptyReport();
  r.replication.level = 'L0';
  r.meta.durationSec = 8;
  r.script.fullText = '文案';
  const ctx = { report: r, artifacts: {} };
  await g.run(ctx);
  assert.equal(ctx.artifacts.assets.scenes.length, 1);
  assert.equal(ctx.artifacts.assets.scenes[0].kind, 'cover');
  assert.equal(ctx.artifacts.assets.level, 'L0');
});

test('L2 逐镜头 promptSeed 追加 level:L2 锚点', () => {
  const r = reportWithShots();
  r.replication.level = 'L2';
  const plan = createAssetPlan(r);
  assert.ok(plan[0].promptSeed.includes('level:L2'));
});

test('未注入 assetGenerator → VIDEOCLONE_PROVIDER_UNAVAILABLE（fail-closed retryable）', async () => {
  const g = createGenerateAssets({ assetGenerator: null });
  const ctx = { report: reportWithShots(), artifacts: {} };
  await assert.rejects(() => g.run(ctx), (e) => e instanceof VideoCloneError && e.code === 'VIDEOCLONE_PROVIDER_UNAVAILABLE' && e.retryable === true);
});

test('generator 成功 → artifacts.assets.scenes 填充', async () => {
  const g = createGenerateAssets({ assetGenerator: async (spec) => ({ path: 'C:/tmp/shot' + spec.index + '.png', kind: 'image' }) });
  const ctx = { report: reportWithShots(), artifacts: {} };
  await g.run(ctx);
  assert.equal(ctx.artifacts.assets.scenes.length, 2);
  assert.equal(ctx.artifacts.assets.scenes[1].path, 'C:/tmp/shot1.png');
  assert.equal(ctx.artifacts.assets.scenes[1].durationSec, 3);
});

test('generator 抛错 → VIDEOCLONE_ASSET_GENERATION_FAILED（retryable）', async () => {
  const g = createGenerateAssets({ assetGenerator: async () => { throw new Error('gen boom'); } });
  const ctx = { report: reportWithShots(), artifacts: {} };
  await assert.rejects(() => g.run(ctx), (e) => e.code === 'VIDEOCLONE_ASSET_GENERATION_FAILED' && e.retryable === true);
});

test('generator 产物缺 path → 失败', async () => {
  const g = createGenerateAssets({ assetGenerator: async () => ({ kind: 'image' }) });
  const ctx = { report: reportWithShots(), artifacts: {} };
  await assert.rejects(() => g.run(ctx), (e) => e.code === 'VIDEOCLONE_ASSET_GENERATION_FAILED');
});

test('报告无镜头 → 失败', async () => {
  const g = createGenerateAssets({ assetGenerator: async () => ({ path: 'x.png' }) });
  const ctx = { report: emptyReport(), artifacts: {} };
  await assert.rejects(() => g.run(ctx), (e) => e.code === 'VIDEOCLONE_ASSET_GENERATION_FAILED');
});
