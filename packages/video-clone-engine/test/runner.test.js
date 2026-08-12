'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVideoCloneRunner } = require('../src/runner');
const { createVideoClonePipeline } = require('../src/pipeline');
const { VideoCloneError } = require('../src/errors');

function stubPipeline(over = {}) {
  const mk = (id) => ({ run: async (ctx) => { if (over.failAt === id) throw new VideoCloneError('VIDEOCLONE_ANALYZE_FAILED'); return id; } });
  return (opts) => createVideoClonePipeline({
    ingest: mk('ingest'), analyze: mk('analyze'), plan: mk('plan'),
    generate: mk('generate'), compose: mk('compose'), publish: mk('publish'),
  }, opts.executorOptions);
}

test('事件序列：6 阶段 started→succeeded + completed', async () => {
  const events = [];
  const runner = createVideoCloneRunner({ createPipeline: stubPipeline(), onEvent: (e) => events.push(e) });
  const res = await runner.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: { replicationLevel: 'L1', mode: 'structure' } });
  assert.equal(res.ok, true);
  const started = events.filter((e) => e.type === 'stage:started').map((e) => e.stage);
  const succeeded = events.filter((e) => e.type === 'stage:succeeded').map((e) => e.stage);
  assert.deepEqual(started, ['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish']);
  assert.deepEqual(succeeded, ['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish']);
  assert.equal(events.filter((e) => e.type === 'completed').length, 1);
  assert.equal(events.find((e) => e.type === 'completed').ok, true);
});

test('阶段失败 → stage:failed 事件 + ok:false', async () => {
  const events = [];
  const runner = createVideoCloneRunner({ createPipeline: stubPipeline({ failAt: 'analyze' }), onEvent: (e) => events.push(e) });
  const res = await runner.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, false);
  const failed = events.find((e) => e.type === 'stage:failed');
  assert.equal(failed.stage, 'analyze');
  assert.equal(failed.error.code, 'VIDEOCLONE_ANALYZE_FAILED');
});

test('中止：运行前 aborted → 立即失败', async () => {
  const ctrl = new AbortController();
  ctrl.abort();
  const events = [];
  const runner = createVideoCloneRunner({ createPipeline: stubPipeline(), onEvent: (e) => events.push(e), signal: ctrl.signal });
  const res = await runner.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, false);
  assert.equal(res.error.params.reason, 'aborted');
  assert.ok(events.some((e) => e.type === 'aborted'));
});

test('中止：ingest 阶段内触发 abort → 下一阶段边界中止', async () => {
  const ctrl = new AbortController();
  const events = [];
  const mk = (id) => ({
    run: async (ctx) => {
      if (id === 'ingest') ctrl.abort(); // 阶段内协作触发
      return id;
    },
  });
  const runner = createVideoCloneRunner({
    createPipeline: () => createVideoClonePipeline({
      ingest: mk('ingest'), analyze: mk('analyze'), plan: mk('plan'),
      generate: mk('generate'), compose: mk('compose'), publish: mk('publish'),
    }, { eventSink: (e) => events.push(e), abortSignal: ctrl.signal }),
    onEvent: (e) => events.push(e),
    signal: ctrl.signal,
  });
  const res = await runner.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, false);
  assert.equal(res.error.params.reason, 'aborted');
  const aborted = events.filter((e) => e.type === 'aborted');
  assert.ok(aborted.length >= 1);
});

test('completed 事件含 elapsedMs', async () => {
  const events = [];
  const runner = createVideoCloneRunner({ createPipeline: stubPipeline(), onEvent: (e) => events.push(e) });
  await runner.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  const c = events.find((e) => e.type === 'completed');
  assert.ok(c.elapsedMs >= 0);
  assert.ok(c.runId);
});
