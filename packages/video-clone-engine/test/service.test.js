'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVideoCloneService } = require('../src/service');
const { createVideoClonePipeline } = require('../src/pipeline');
const { emptyReport } = require('../src/clone-report');
const { VideoCloneError } = require('../src/errors');

function stubPipeline({ failAt = null, gate = null } = {}) {
  const mk = (id) => ({
    run: async (ctx) => {
      if (gate) gate(id, ctx);
      if (failAt === id) throw new VideoCloneError('VIDEOCLONE_ANALYZE_FAILED');
      return id;
    },
  });
  return (opts) => createVideoClonePipeline({
    ingest: mk('ingest'), analyze: mk('analyze'), plan: mk('plan'),
    generate: mk('generate'), compose: mk('compose'), publish: mk('publish'),
  }, opts.executorOptions);
}

test('run 成功：会话生命周期（加入→完成→移除）+ runId', async () => {
  const svc = createVideoCloneService({ createPipeline: stubPipeline() });
  const res = await svc.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, true);
  assert.ok(res.runId);
  assert.equal(svc.activeCount(), 0);
});

test('cancel：运行中中止并返回 true；未知 runId 返回 false', async () => {
  let active = null;
  const gate = (id) => { if (id === 'ingest') active.cancel('run-1'); };
  const svc = createVideoCloneService({ createPipeline: stubPipeline({ gate }), onProgress: () => {} });
  active = svc;
  const res = await svc.run({ runId: 'run-1', source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, false);
  assert.equal(res.error.params.reason, 'aborted');
  assert.equal(svc.activeCount(), 0);
  assert.equal(svc.cancel('missing-id'), false);
});

test('失败会话清理 + activeCount', async () => {
  const svc = createVideoCloneService({ createPipeline: stubPipeline({ failAt: 'analyze' }) });
  assert.equal(svc.activeCount(), 0);
  const res = await svc.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_ANALYZE_FAILED');
  assert.equal(svc.activeCount(), 0);
});

test('applyReportPatch：合法编辑通过、非法抛错', () => {
  const svc = createVideoCloneService({ createPipeline: stubPipeline() });
  const r = emptyReport();
  const next = svc.applyReportPatch(r, { path: 'script.fullText', value: '新文案' });
  assert.equal(next.script.fullText, '新文案');
  assert.equal(r.script.fullText, '');
  assert.throws(() => svc.applyReportPatch(r, { path: 'replication.level', value: 'L9' }), VideoCloneError);
});

test('缺少 createPipeline 抛 TypeError', () => {
  assert.throws(() => createVideoCloneService({}), TypeError);
});
