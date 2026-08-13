'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildComposeCommand, buildAssScript, resolveTargetSize, ASPECT_TARGETS } = require('../../src/adapters/compose-ffmpeg');
const { emptyReport } = require('../../src/clone-report');
const { VideoCloneError } = require('../../src/errors');

const BS = String.fromCharCode(92);

function reportWith({ shots = [{ t0: 0, t1: 2 }, { t0: 2, t1: 5 }], resolution = '320x240', aspect = null } = {}) {
  const r = emptyReport();
  r.visual.shots = shots;
  r.meta.resolution = resolution;
  if (aspect) r.platformParams.aspect = aspect;
  return r;
}

test('buildComposeCommand：输入/滤镜/时长/输出结构', () => {
  const assets = {
    scenes: [{ path: 'C:/tmp/a.png' }, { path: 'C:/tmp/b.png' }],
    audio: { path: 'C:/tmp/voice.m4a' },
    watermark: { path: 'C:/tmp/wm.png' },
    subtitles: { path: 'C:/tmp/sub.ass' },
  };
  const { args, totalDurationSec } = buildComposeCommand({ report: reportWith(), assets, outputPath: 'C:/tmp/out.mp4' });
  assert.equal(totalDurationSec, 5);
  // 输入：2 图 + 音频 + 水印 = 4
  const inputCount = args.filter((a, i) => args[i - 1] === '-i').length;
  assert.equal(inputCount, 4);
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(fc.includes('concat=n=2:v=1:a=0'), 'concat 滤镜');
  assert.ok(fc.includes('subtitles='), '字幕滤镜');
  assert.ok(fc.includes('overlay='), '水印叠加');
  assert.ok(fc.includes('scale=320:240'), '目标分辨率');
  assert.equal(args[args.length - 1], 'C:/tmp/out.mp4');
  assert.ok(args.includes('-t'));
});

test('L0 单封面合成：单输入 + 字幕/音频 + 全时长（无 concat）', () => {
  const assets = {
    level: 'L0',
    scenes: [{ path: 'C:/tmp/cover.png', durationSec: 6 }],
    audio: { path: 'C:/tmp/voice.m4a' },
    subtitles: { path: 'C:/tmp/sub.ass' },
  };
  const { args, totalDurationSec } = buildComposeCommand({ report: reportWith({ shots: [] }), assets, outputPath: 'C:/tmp/out.mp4' });
  assert.equal(totalDurationSec, 6);
  const inputCount = args.filter((a, i) => args[i - 1] === '-i').length;
  assert.equal(inputCount, 2); // 封面 + 音频
  const fc = args[args.indexOf('-filter_complex') + 1];
  assert.ok(!fc.includes('concat='), 'L0 不做逐镜头 concat');
  assert.ok(fc.includes('subtitles='), 'L0 保留字幕');
  assert.ok(args.includes('-map'));
});

test('L0 素材非单张 → 抛 VIDEOCLONE_COMPOSE_FAILED', () => {
  assert.throws(
    () => buildComposeCommand({ report: reportWith({ shots: [] }), assets: { level: 'L0', scenes: [{ path: 'a.png' }, { path: 'b.png' }] }, outputPath: 'x.mp4' }),
    (e) => e instanceof VideoCloneError && e.code === 'VIDEOCLONE_COMPOSE_FAILED',
  );
});

test('无镜头 → 抛 VIDEOCLONE_COMPOSE_FAILED', () => {
  assert.throws(
    () => buildComposeCommand({ report: reportWith({ shots: [] }), assets: { scenes: [] }, outputPath: 'x.mp4' }),
    (e) => e instanceof VideoCloneError && e.code === 'VIDEOCLONE_COMPOSE_FAILED',
  );
});

test('素材不足 → 抛 VIDEOCLONE_COMPOSE_FAILED', () => {
  assert.throws(
    () => buildComposeCommand({ report: reportWith(), assets: { scenes: [{ path: 'a.png' }] }, outputPath: 'x.mp4' }),
    (e) => e.code === 'VIDEOCLONE_COMPOSE_FAILED',
  );
});

test('resolveTargetSize：分辨率优先，其次画幅', () => {
  assert.deepEqual(resolveTargetSize(reportWith({ resolution: '640x360' })), { w: 640, h: 360 });
  assert.deepEqual(resolveTargetSize(reportWith({ resolution: null, aspect: '9:16' })), ASPECT_TARGETS['9:16']);
  assert.deepEqual(resolveTargetSize(reportWith({ resolution: null, aspect: 'unknown' })), { w: 1080, h: 1920 });
});

test('buildAssScript：头 + Dialogue 时间轴与换行转义', () => {
  const ass = buildAssScript([{ t0: 1.2, t1: 3.4, text: '第一行\n第二行' }]);
  const lines = ass.split('\n');
  assert.ok(lines[0] === '[Script Info]');
  const d = lines.find((l) => l.startsWith('Dialogue:'));
  assert.ok(d.includes('0:00:01.20,0:00:03.40'));
  assert.ok(d.includes('{'+BS+'an2}'), '锚点样式 {\an2}');
  assert.ok(d.includes(BS + 'N'), '换行转义 \N');
});
