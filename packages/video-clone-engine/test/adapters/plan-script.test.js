'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createScriptPlan } = require('../../src/adapters/plan-script');
const { emptyReport } = require('../../src/clone-report');
const { VideoCloneError } = require('../../src/errors');

function baseCtx(opts = {}, fullText = '原文案') {
  const r = emptyReport();
  r.script.fullText = fullText;
  r.visual.palette = 'warm';
  r.scriptStyle.person = 'second';
  return { request: { source: { path: 'x' }, options: opts }, report: r, artifacts: { analysis: {} } };
}

test('层级/模式写入 + 默认保留原文', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({ replicationLevel: 'L2', mode: 'style' });
  await p.run(ctx);
  assert.equal(ctx.report.replication.level, 'L2');
  assert.equal(ctx.report.replication.mode, 'style');
  assert.equal(ctx.artifacts.analysis.rewrite.status, 'kept');
  assert.equal(ctx.report.script.fullText, '原文案');
});

test('rewriteScript + llmRunner → 改写生效', async () => {
  const p = createScriptPlan({ llmRunner: async ({ sourceText, mode }) => '改写:' + sourceText + ':' + mode });
  const ctx = baseCtx({ rewriteScript: true, mode: 'structure' });
  await p.run(ctx);
  assert.equal(ctx.report.script.fullText, '改写:原文案:structure');
  assert.equal(ctx.artifacts.analysis.rewrite.status, 'ok');
});

test('rewriteScript=true 但未注入 llmRunner → skipped（配置缺失不失败）', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({ rewriteScript: true });
  await p.run(ctx);
  assert.equal(ctx.report.script.fullText, '原文案');
  assert.equal(ctx.artifacts.analysis.rewrite.status, 'skipped');
});

test('改写失败 → VIDEOCLONE_REWRITE_FAILED（retryable）', async () => {
  const p = createScriptPlan({ llmRunner: async () => { throw new Error('llm boom'); } });
  const ctx = baseCtx({ rewriteScript: true });
  await assert.rejects(() => p.run(ctx), (e) => e instanceof VideoCloneError && e.code === 'VIDEOCLONE_REWRITE_FAILED' && e.retryable === true);
});

test('inspiration 模式：仅借结构，清空风格与文案', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({ mode: 'inspiration' });
  await p.run(ctx);
  assert.equal(ctx.report.replication.mode, 'inspiration');
  assert.equal(ctx.report.visual.palette, 'unknown');
  assert.equal(ctx.report.scriptStyle.person, 'unknown');
  assert.equal(ctx.report.script.fullText, '');
  assert.equal(ctx.artifacts.analysis.rewrite.inspiration, true);
});

test('无显式层级 → 按证据自动定级 L2 并写入 replication.auto', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({ mode: 'style' }); // baseCtx: fullText + palette=warm + person=second
  ctx.report.narrative.timeline = [{ t0: 0, t1: 10 }, { t0: 10, t1: 20 }];
  ctx.report.scriptStyle.tone = 'cheerful';
  await p.run(ctx);
  assert.equal(ctx.report.replication.level, 'L2');
  assert.equal(ctx.report.replication.auto.determined, true);
  assert.equal(ctx.report.replication.auto.level, 'L2');
  assert.ok(ctx.report.replication.auto.confidence >= 0.75);
});

test('风格证据不足（仅文案+结构）→ 自动定级 L1', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({}); // fullText + palette=warm + person=second（风格标签 2 个，改弱）
  ctx.report.narrative.timeline = [{ t0: 0, t1: 10 }, { t0: 10, t1: 20 }];
  ctx.report.visual.palette = 'unknown';
  ctx.report.scriptStyle.person = 'unknown';
  await p.run(ctx);
  assert.equal(ctx.report.replication.level, 'L1');
  assert.equal(ctx.report.replication.auto.determined, true);
});

test('显式 replicationLevel 优先（auto.determined=false）', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({ replicationLevel: 'L0', mode: 'structure' });
  await p.run(ctx);
  assert.equal(ctx.report.replication.level, 'L0');
  assert.equal(ctx.report.replication.auto.determined, false);
  assert.equal(ctx.report.replication.auto.source, 'explicit');
});

test('inspiration 只借结构 → 自动定级 L0（风格/文案已清空）', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = baseCtx({ mode: 'inspiration' });
  ctx.report.narrative.timeline = [{ t0: 0, t1: 10 }, { t0: 10, t1: 20 }];
  await p.run(ctx);
  assert.equal(ctx.report.replication.mode, 'inspiration');
  assert.equal(ctx.report.replication.level, 'L0');
  assert.equal(ctx.report.replication.auto.determined, true);
});

test('防御性归一化：缺失层补默认', async () => {
  const p = createScriptPlan({ llmRunner: null });
  const ctx = { request: { source: { path: 'x' }, options: {} }, report: { script: { fullText: 'x' } }, artifacts: { analysis: {} } };
  await p.run(ctx);
  assert.ok(ctx.report.visual, 'visual 层已补默认');
  assert.ok(ctx.report.elements, 'elements 层已补默认');
});
