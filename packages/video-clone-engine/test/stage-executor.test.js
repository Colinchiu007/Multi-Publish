'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createStageExecutor } = require('../src/stage-executor');
const { VideoCloneError } = require('../src/errors');

function mkStages(calls, config = {}) {
  return config.ids.map((id) => ({
    id,
    run: async (ctx) => { calls.push(id); ctx[id] = id; return id; },
  }));
}

test('顺序执行全部阶段', async () => {
  const calls = [];
  const ex = createStageExecutor({ now: () => 1 });
  const out = await ex.runStages(mkStages(calls, { ids: ['a', 'b', 'c'] }), {});
  assert.equal(out.ok, true);
  assert.deepEqual(calls, ['a', 'b', 'c']);
  assert.deepEqual(out.progress.completed, ['a', 'b', 'c']);
});

test('retryable 错误重试后成功（记录重试次数）', async () => {
  let n = 0;
  const ex = createStageExecutor({ maxRetries: 2, baseBackoffMs: 1, now: () => 1 });
  const out = await ex.runStages([
    { id: 'flaky', run: async () => { n++; if (n < 3) throw new VideoCloneError('VIDEOCLONE_LINK_UNAVAILABLE'); return 'ok'; } },
    { id: 'after', run: async () => 'after' },
  ], {});
  assert.equal(out.ok, true);
  assert.equal(n, 3);
  const rec = out.progress.steps.find((s) => s.stage === 'flaky');
  assert.equal(rec.attempts, 3);
  assert.equal(rec.status, 'complete');
});

test('retryable 重试耗尽 → fail-closed 停止', async () => {
  const calls = [];
  const ex = createStageExecutor({ maxRetries: 2, baseBackoffMs: 1 });
  const out = await ex.runStages([
    { id: 'bad', run: async () => { calls.push('bad'); throw new VideoCloneError('VIDEOCLONE_ASR_FAILED'); } },
    { id: 'never', run: async () => { calls.push('never'); } },
  ], {});
  assert.equal(out.ok, false);
  assert.equal(out.failedStage, 'bad');
  assert.equal(out.error.code, 'VIDEOCLONE_ASR_FAILED');
  assert.deepEqual(calls, ['bad', 'bad', 'bad']); // 1 + maxRetries(2)
});

test('非 retryable 错误不重试', async () => {
  let n = 0;
  const ex = createStageExecutor({ maxRetries: 3, baseBackoffMs: 1 });
  const out = await ex.runStages([{ id: 'x', run: async () => { n++; throw new VideoCloneError('VIDEOCLONE_INVALID_REQUEST'); } }], {});
  assert.equal(out.ok, false);
  assert.equal(n, 1);
});

test('checkpoint 断点续跑：已完成阶段跳过', async () => {
  const calls = [];
  const ex = createStageExecutor({ now: () => 1 });
  const context = { progress: { a: 'complete', steps: [] } }; // 已完成阶段仅记录映射，completed 由本次运行追加
  const out = await ex.runStages(mkStages(calls, { ids: ['a', 'b', 'c'] }), context);
  assert.equal(out.ok, true);
  assert.deepEqual(calls, ['b', 'c']);
  assert.deepEqual(out.progress.completed, ['a', 'b', 'c']);
});

test('阶段抛普通错误（非 VideoCloneError）按不可重试处理并记录', async () => {
  const ex = createStageExecutor({ maxRetries: 1, baseBackoffMs: 1 });
  const out = await ex.runStages([{ id: 'boom', run: async () => { throw new Error('boom'); } }], {});
  assert.equal(out.ok, false);
  assert.equal(out.failedStage, 'boom');
  assert.equal(out.progress.steps[0].status, 'failed');
});

// —— 审查回归（W7：completed 去重 + 跳过阶段回填；W8：成功清 error）——

test('W7: checkpoint 跨次续跑 completed 去重，跳过阶段回填 skipped', async () => {
  const calls = [];
  const ex = createStageExecutor({ now: () => 1 });
  const context = { progress: { a: 'complete', completed: ['a'], steps: [] } };
  const out = await ex.runStages(mkStages(calls, { ids: ['a', 'b'] }), context);
  assert.equal(out.ok, true);
  assert.deepEqual(out.progress.completed, ['a', 'b']); // 不重复
  assert.deepEqual(out.results.a, { skipped: true }); // 跳过阶段回填
  assert.deepEqual(calls, ['b']);
});

test('W8: 重试成功后清除 error 并记录 retries', async () => {
  let n = 0;
  const ex = createStageExecutor({ maxRetries: 2, baseBackoffMs: 1, now: () => 1 });
  const out = await ex.runStages([
    { id: 'flaky', run: async () => { n++; if (n < 2) throw new VideoCloneError('VIDEOCLONE_LINK_UNAVAILABLE'); return 'ok'; } },
  ], {});
  assert.equal(out.ok, true);
  const rec = out.progress.steps[0];
  assert.equal(rec.status, 'complete');
  assert.equal(rec.retries, 1);
  assert.equal('error' in rec, false);
});
