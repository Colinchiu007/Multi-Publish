'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPublish } = require('../../src/adapters/publish');
const { VideoCloneError } = require('../../src/errors');

test('未注入 publisher → publishResult skipped（不失败）', async () => {
  const p = createPublish({ publisher: null });
  const ctx = { artifacts: { media: { path: 'x.mp4' } }, report: {} };
  await p.run(ctx);
  assert.equal(ctx.publishResult.status, 'skipped');
  assert.equal(ctx.publishResult.reason, 'no-publisher');
});

test('enabled=false → skipped', async () => {
  const p = createPublish({ publisher: async () => ({ published: true }), enabled: false });
  const ctx = { artifacts: { media: { path: 'x.mp4' } }, report: {} };
  await p.run(ctx);
  assert.equal(ctx.publishResult.status, 'skipped');
});

test('publisher 成功 → publishResult 透传', async () => {
  const p = createPublish({ publisher: async () => ({ published: true, platform: 'douyin' }) });
  const ctx = { artifacts: { output: { path: 'x.mp4' } }, report: {} };
  await p.run(ctx);
  assert.deepEqual(ctx.publishResult, { published: true, platform: 'douyin' });
});

test('publisher 抛错 → VIDEOCLONE_PUBLISH_FAILED（retryable）', async () => {
  const p = createPublish({ publisher: async () => { throw new Error('pub boom'); } });
  const ctx = { artifacts: { output: { path: 'x.mp4' } }, report: {} };
  await assert.rejects(() => p.run(ctx), (e) => e instanceof VideoCloneError && e.code === 'VIDEOCLONE_PUBLISH_FAILED' && e.retryable === true);
});
