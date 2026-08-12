'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createVideoClonePipeline, validateRequest } = require('../src/pipeline');
const { emptyReport } = require('../src/clone-report');

function validRequest(over = {}) {
  return {
    source: { type: 'local', path: 'C:/tmp/demo.mp4' },
    options: { replicationLevel: 'L1', mode: 'structure' },
    ...over,
  };
}

function stubAdapters({ failAt } = {}) {
  const mk = (id) => ({
    async run(ctx) {
      if (failAt === id) throw new (require('../src/errors').VideoCloneError)('VIDEOCLONE_ANALYZE_FAILED');
      if (id === 'analyze') {
        const r = emptyReport();
        r.meta = { source: 'local', platform: null, durationSec: 60, resolution: '1080x1920', fps: 30 };
        r.narrative = { structure: 'hook', timeline: [{ t0: 0, t1: 10 }], plot: 'p' };
        r.script = { fullText: '同款文案', lines: [], language: 'zh' };
        r.visual = { palette: 'warm', colorGrade: {}, shots: [], transitions: ['hard-cut'], subtitleStyle: {} };
        r.scriptStyle = { person: 'second', tone: 'commanding', sentenceStats: {}, hookLines: [] };
        ctx.report = r;
      }
      if (id === 'publish') ctx.publishResult = { published: true };
      return id;
    },
  });
  return { ingest: mk('ingest'), analyze: mk('analyze'), plan: mk('plan'), generate: mk('generate'), compose: mk('compose'), publish: mk('publish') };
}

test('validateRequest：非法请求拒绝', () => {
  assert.equal(validateRequest({}).ok, false);
  assert.equal(validateRequest({ source: { type: 'ftp' } }).ok, false);
  assert.equal(validateRequest({ source: { type: 'url' } }).ok, false);
  assert.equal(validateRequest(validRequest({ source: { type: 'local' } })).ok, false);
  assert.equal(validateRequest(validRequest({ options: { replicationLevel: 'L9' } })).ok, false);
  assert.equal(validateRequest(validRequest({ options: { mode: 'bad' } })).ok, false);
  assert.equal(validateRequest(validRequest()).ok, true);
});

test('happy path：六阶段按序执行，产出报告与相似度', async () => {
  const order = [];
  const adapters = stubAdapters();
  for (const id of Object.keys(adapters)) {
    const orig = adapters[id].run;
    adapters[id].run = async (ctx) => { order.push(id); return orig(ctx); };
  }
  const p = createVideoClonePipeline(adapters);
  const res = await p.run(validRequest());
  assert.equal(res.ok, true);
  assert.deepEqual(order, ['ingest', 'analyze', 'plan', 'generate', 'compose', 'publish']);
  assert.ok(res.runId);
  assert.equal(res.report.script.fullText, '同款文案');
  assert.equal(res.publishResult.published, true);
  assert.ok(res.similarity && res.similarity.metrics);
  assert.equal(res.similarity.metrics.durationDeviation, 0);
});

test('analyze 失败 → fail-closed，返回错误与阶段', async () => {
  const p = createVideoClonePipeline(stubAdapters({ failAt: 'analyze' }));
  const res = await p.run(validRequest());
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_ANALYZE_FAILED');
  assert.equal(res.error.phase, 'analyze');
});

test('未接线阶段 → VIDEOCLONE_STAGE_NOT_IMPLEMENTED', async () => {
  const p = createVideoClonePipeline({ ingest: { run: async () => 'ingest' } });
  const res = await p.run(validRequest());
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_STAGE_NOT_IMPLEMENTED');
});

test('非法请求在任何阶段执行前返回', async () => {
  let ran = false;
  const p = createVideoClonePipeline({ ingest: { run: async () => { ran = true; } } });
  const res = await p.run({ source: { type: 'nope' } });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_INVALID_REQUEST');
  assert.equal(ran, false);
});

test('failOnLowSimilarity 触发相似度过低失败', async () => {
  const adapters = stubAdapters();
  adapters.plan.run = async (ctx) => { // 复刻改写：与原片明显不同
    ctx.report.script.fullText = 'bbbbbbbbbb';
    ctx.report.meta.durationSec = 90;
    ctx.report.narrative.timeline = [{ t0: 100, t1: 110 }];
    ctx.report.visual.palette = 'warm';
    return 'plan';
  };
  adapters.analyze.run = async (ctx) => {
    const r = emptyReport();
    r.meta = { source: 'local', platform: null, durationSec: 60, resolution: null, fps: null };
    r.narrative = { structure: 'unknown', timeline: [{ t0: 0, t1: 10 }], plot: '' };
    r.script = { fullText: 'aaaaaaaaaa', lines: [], language: 'zh' };
    r.visual = { palette: 'cool', colorGrade: {}, shots: [], transitions: ['fade'], subtitleStyle: {} };
    r.scriptStyle = { person: 'first', tone: 'calm', sentenceStats: {}, hookLines: [] };
    ctx.report = r;
    return 'analyze';
  };
  const p = createVideoClonePipeline(adapters);
  const res = await p.run(validRequest({ options: { replicationLevel: 'L2', mode: 'style', failOnLowSimilarity: true } }));
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_SIMILARITY_LOW');
  assert.ok(res.similarity);
});

// —— 审查回归（C2：publish 不得执行；W5：请求校验加强）——

test('C2: failOnLowSimilarity 时 publish 阶段不执行', async () => {
  let published = false;
  const adapters = stubAdapters();
  adapters.publish.run = async (ctx) => { published = true; ctx.publishResult = { published: true }; return 'publish'; };
  adapters.plan.run = async (ctx) => {
    ctx.report.script.fullText = 'bbbbbbbbbb';
    ctx.report.meta.durationSec = 90;
    ctx.report.narrative.timeline = [{ t0: 100, t1: 110 }];
    ctx.report.visual.palette = 'warm';
    return 'plan';
  };
  const p = createVideoClonePipeline(adapters);
  const res = await p.run(validRequest({ options: { replicationLevel: 'L2', mode: 'style', failOnLowSimilarity: true } }));
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_SIMILARITY_LOW');
  assert.equal(res.error.phase, 'compose');
  assert.equal(published, false);
  assert.equal(res.publishResult, null); // publish 未执行
});

test('W5: 请求校验加强（https/交叉字段/target/类型）', () => {
  assert.equal(validateRequest({ source: { type: 'url', url: 'http://x.com/v' } }).ok, false);
  assert.equal(validateRequest({ source: { type: 'url', url: 'https://x.com/v' } }).ok, true);
  assert.equal(validateRequest({ source: { type: 'local', path: 'C:/x.mp4', url: 'https://x' } }).ok, false);
  assert.equal(validateRequest(validRequest({ options: { target: 'P3' } })).ok, false);
  assert.equal(validateRequest(validRequest({ options: { rewriteScript: 'yes' } })).ok, false);
  assert.equal(validateRequest(validRequest({ options: { failOnLowSimilarity: 1 } })).ok, false);
  assert.equal(validateRequest(validRequest({ options: { target: 'P2' } })).ok, true);
});

// —— 4d：部分流水线（stageIds）+ initialReport + reportSource ——

test('部分执行：仅运行指定阶段，initialReport 保留，similarity 计算', async () => {
  const ran = [];
  const stub = { run: async (ctx) => { ran.push('x'); return 'x'; } };
  const p = createVideoClonePipeline(
    { ingest: stub, analyze: stub, plan: stub, generate: stub, compose: stub, publish: stub },
    { stageIds: ['generate', 'compose'] },
  );
  const r = emptyReport();
  r.visual.shots = [{ t0: 0, t1: 2, type: 'unknown' }];
  r.meta.durationSec = 2;
  const res = await p.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: { initialReport: r } });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.report.script.fullText, ''); // 保留 initialReport 结构
  assert.ok(res.similarity);
  assert.equal(res.similarity.metrics.structure, 1);
});

test('initialReport 非法 → VIDEOCLONE_INVALID_REPORT（阶段前失败）', async () => {
  let ran = false;
  const p = createVideoClonePipeline({ generate: { run: async () => { ran = true; } } }, { stageIds: ['generate'] });
  const bad = emptyReport();
  bad.replication.level = 'L9';
  const res = await p.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: { initialReport: bad } });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, 'VIDEOCLONE_INVALID_REPORT');
  assert.equal(ran, false);
});

test('成功结果含 reportSource', async () => {
  const stub = { run: async (ctx) => { ctx.report.script.fullText = 'x'; return 'x'; } };
  const p = createVideoClonePipeline({ analyze: stub }, { stageIds: ['analyze'] });
  const res = await p.run({ source: { type: 'local', path: 'C:/x.mp4' }, options: {} });
  assert.equal(res.ok, true);
  assert.ok(res.reportSource);
  assert.equal(res.reportSource.script.fullText, 'x');
});
