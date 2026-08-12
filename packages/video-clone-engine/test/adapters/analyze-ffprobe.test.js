'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFfprobeAnalyze, aspectFromResolution } = require('../../src/adapters/analyze-ffprobe');
const { emptyReport } = require('../../src/clone-report');
const { VideoCloneError } = require('../../src/errors');

function baseCtx(mediaOver = {}) {
  const media = { path: 'C:/tmp/demo.mp4', durationSec: 10, width: 1080, height: 1920, fps: 30, hasAudio: true, format: 'mp4', ...mediaOver };
  return { request: { source: { path: 'C:/tmp/demo.mp4' }, options: {} }, report: emptyReport(), artifacts: { media } };
}

test('场景检测：切点 → shots 时间轴', async () => {
  const a = createFfprobeAnalyze({ sceneRunner: async () => [3, 7], sttRunner: null });
  const ctx = baseCtx();
  await a.run(ctx);
  assert.deepEqual(ctx.report.narrative.timeline.map((s) => [s.t0, s.t1]), [[0, 3], [3, 7], [7, 10]]);
  assert.equal(ctx.artifacts.analysis.scene.method, 'ffmpeg-scene');
});

test('场景检测失败 → 合成均匀分段（不 fail-closed）', async () => {
  const a = createFfprobeAnalyze({ sceneRunner: async () => { throw new Error('ffmpeg boom'); }, uniformSegmentSec: 4 });
  const ctx = baseCtx();
  await a.run(ctx);
  assert.equal(ctx.artifacts.analysis.scene.synthetic, true);
  assert.equal(ctx.artifacts.analysis.scene.method, 'synthetic-uniform');
  assert.ok(ctx.report.narrative.timeline.length >= 3); // 10s / 4s
});

test('sttRunner 注入 → 脚本填充', async () => {
  const a = createFfprobeAnalyze({
    sceneRunner: async () => [],
    sttRunner: async () => ({ fullText: '你好世界', lines: [{ t0: 0, t1: 1, text: '你好世界' }], language: 'zh' }),
  });
  const ctx = baseCtx();
  await a.run(ctx);
  assert.equal(ctx.report.script.fullText, '你好世界');
  assert.equal(ctx.report.script.lines[0].text, '你好世界');
  assert.equal(ctx.artifacts.analysis.asr.status, 'ok');
});

test('未注入 sttRunner → script 留空 + asr=skipped（不 fail-closed）', async () => {
  const a = createFfprobeAnalyze({ sceneRunner: async () => [], sttRunner: null });
  const ctx = baseCtx();
  await a.run(ctx);
  assert.equal(ctx.report.script.fullText, '');
  assert.equal(ctx.artifacts.analysis.asr.status, 'skipped');
});

test('requireTranscript + stt 失败 → VIDEOCLONE_ASR_FAILED', async () => {
  const a = createFfprobeAnalyze({
    sceneRunner: async () => [],
    sttRunner: async () => { throw new Error('whisper boom'); },
  });
  const ctx = baseCtx();
  ctx.request.options.requireTranscript = true;
  await assert.rejects(() => a.run(ctx), (e) => e instanceof VideoCloneError && e.code === 'VIDEOCLONE_ASR_FAILED' && e.retryable === true);
});

test('aspectFromResolution 派生画幅', () => {
  assert.equal(aspectFromResolution(1080, 1920), '9:16');
  assert.equal(aspectFromResolution(1920, 1080), '16:9');
  assert.equal(aspectFromResolution(1080, 1080), '1:1');
  assert.equal(aspectFromResolution(null, 1920), 'unknown');
});

test('链接来源无元数据时用 probeRunner 补探', async () => {
  const a = createFfprobeAnalyze({
    probeRunner: async () => ({ durationSec: 8, width: 720, height: 1280, fps: 25, hasAudio: false, format: 'mp4' }),
    sceneRunner: async () => [],
  });
  const ctx = baseCtx({ durationSec: null, width: null, height: null, fps: null, hasAudio: null });
  await a.run(ctx);
  assert.equal(ctx.report.meta.durationSec, 8);
  assert.equal(ctx.report.meta.resolution, '720x1280');
  assert.equal(ctx.report.platformParams.aspect, '9:16');
});
