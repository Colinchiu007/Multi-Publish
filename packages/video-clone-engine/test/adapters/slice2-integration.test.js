'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSlice2Pipeline } = require('../../src/adapters');
const { createVideoClonePipeline } = require('../../src/pipeline');

function resolveBin(env, generic, fallback) {
  return process.env[env] || process.env[generic] || fallback;
}
const ffmpeg = resolveBin('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg');
const ffprobe = resolveBin('VC_FFPROBE_PATH', 'FFPROBE_PATH', 'ffprobe');

function toolsAvailable() {
  for (const bin of [ffmpeg, ffprobe]) {
    const r = spawnSync(bin, ['-version'], { encoding: 'utf8' });
    if (r.status !== 0) return false;
  }
  return true;
}

function makeSampleVideo(dir) {
  const out = path.join(dir, 'sample.mp4');
  const r = spawnSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out,
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error('ffmpeg 生成样例失败: ' + (r.stderr || '').slice(0, 300));
  return out;
}

test('切片 2 集成（真实 ffprobe/ffmpeg）：默认管线停在 generate（adapter 未接线）且报告已填充', async (t) => {
  if (!toolsAvailable()) { t.skip('ffprobe/ffmpeg 不可用，跳过真实集成'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-int-'));
  try {
    const sample = makeSampleVideo(dir);
    const p = createSlice2Pipeline();
    const res = await p.run({ source: { type: 'local', path: sample }, options: { replicationLevel: 'L1', mode: 'structure' } });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VIDEOCLONE_STAGE_NOT_IMPLEMENTED');
    assert.equal(res.error.phase, 'generate');
    assert.ok(res.report.meta.durationSec > 1.5, '时长已探测: ' + res.report.meta.durationSec);
    assert.equal(res.report.meta.resolution, '320x240');
    assert.ok(res.report.narrative.timeline.length >= 1, '镜头时间轴非空');
    assert.equal(res.report.platformParams.aspect, '16:9');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('切片 2 集成：注入 generate/compose/publish stub 后全链路 ok（含 F4 相似度）', async (t) => {
  if (!toolsAvailable()) { t.skip('ffprobe/ffmpeg 不可用，跳过真实集成'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-int2-'));
  try {
    const sample = makeSampleVideo(dir);
    const stub = { run: async () => 'stub' };
    const p = createVideoClonePipeline({
      ingest: require('../../src/adapters').createDefaultIngest(),
      analyze: require('../../src/adapters').createFfprobeAnalyze(),
      plan: require('../../src/adapters').createScriptPlan(),
      generate: stub, compose: stub, publish: stub,
    });
    const res = await p.run({ source: { type: 'local', path: sample }, options: { replicationLevel: 'L1', mode: 'structure' } });
    assert.equal(res.ok, true, JSON.stringify(res.error));
    assert.ok(res.report.meta.durationSec > 1.5);
    assert.ok(res.similarity, 'F4 相似度已计算');
    // 无 STT/风格数据时证据门控：结构/时长匹配通过，verdict 为 pass 或 needs_review（证据缺失不算假通过）
    assert.ok(['pass', 'needs_review'].includes(res.similarity.verdict), 'verdict=' + res.similarity.verdict);
    assert.equal(res.similarity.metrics.structure, 1);
    assert.equal(res.similarity.passes.duration, true);
    assert.ok(res.similarity.confidence >= 0.5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
