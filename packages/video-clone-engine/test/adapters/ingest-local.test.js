'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createLocalFileIngest } = require('../../src/adapters/ingest-local');
const { emptyReport } = require('../../src/clone-report');
const { VideoCloneError } = require('../../src/errors');

function ctxWith(path) {
  return { request: { source: { path } }, report: emptyReport(), artifacts: {} };
}

function statLike(over = {}) {
  return { size: 1000, isFile: () => true, ...over };
}

const probeOk = async () => ({ durationSec: 10, width: 1080, height: 1920, fps: 30, hasAudio: true, format: 'mp4' });

test('本地文件 ingest 成功：填充 media 与 report.meta', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => statLike({ size: 2048 }) } },
    probeRunner: probeOk,
  });
  const ctx = ctxWith('C:/tmp/demo.mp4');
  const out = await ingest.run(ctx);
  assert.equal(out, 'ingest:local');
  assert.equal(ctx.artifacts.media.durationSec, 10);
  assert.equal(ctx.artifacts.media.sizeBytes, 2048);
  assert.equal(ctx.report.meta.durationSec, 10);
  assert.equal(ctx.report.meta.resolution, '1080x1920');
  assert.equal(ctx.report.meta.fps, 30);
});

test('文件不存在 → VIDEOCLONE_FILE_NOT_FOUND', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); } } },
    probeRunner: probeOk,
  });
  await assert.rejects(() => ingest.run(ctxWith('C:/nope.mp4')), (e) => {
    assert.ok(e instanceof VideoCloneError);
    assert.equal(e.code, 'VIDEOCLONE_FILE_NOT_FOUND');
    assert.equal(e.retryable, false);
    return true;
  });
});

test('目录路径 → FILE_NOT_FOUND', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => statLike({ isFile: () => false }) } },
    probeRunner: probeOk,
  });
  await assert.rejects(() => ingest.run(ctxWith('C:/dir')), (e) => e.code === 'VIDEOCLONE_FILE_NOT_FOUND');
});

test('超过 500MB → FILE_TOO_LARGE', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => statLike({ size: 501 * 1024 * 1024 }) } },
    probeRunner: probeOk,
  });
  await assert.rejects(() => ingest.run(ctxWith('C:/big.mp4')), (e) => e.code === 'VIDEOCLONE_FILE_TOO_LARGE');
});

test('扩展名不支持 → FILE_FORMAT', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => statLike() } },
    probeRunner: probeOk,
  });
  await assert.rejects(() => ingest.run(ctxWith('C:/x.txt')), (e) => e.code === 'VIDEOCLONE_FILE_FORMAT');
});

test('时长超 30 分钟 → FILE_TOO_LONG', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => statLike() } },
    probeRunner: async () => ({ durationSec: 31 * 60, width: 1080, height: 1920, fps: 30, hasAudio: true, format: 'mp4' }),
  });
  await assert.rejects(() => ingest.run(ctxWith('C:/long.mp4')), (e) => e.code === 'VIDEOCLONE_FILE_TOO_LONG');
});

test('ffprobe 失败 → PROBE_FAILED（retryable）', async () => {
  const ingest = createLocalFileIngest({
    fsImpl: { promises: { stat: async () => statLike() } },
    probeRunner: async () => { throw new Error('probe boom'); },
  });
  await assert.rejects(() => ingest.run(ctxWith('C:/x.mp4')), (e) => e.code === 'VIDEOCLONE_PROBE_FAILED' && e.retryable === true);
});
