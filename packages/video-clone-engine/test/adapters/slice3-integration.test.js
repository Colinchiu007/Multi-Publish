'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSlice3Pipeline } = require('../../src/adapters');

function bin(env, generic, fallback) { return process.env[env] || process.env[generic] || fallback; }
const FFMPEG = bin('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg');
const FFPROBE = bin('VC_FFPROBE_PATH', 'FFPROBE_PATH', 'ffprobe');

function toolsOk() {
  for (const b of [FFMPEG, FFPROBE]) {
    if (spawnSync(b, ['-version']).status !== 0) return false;
  }
  return true;
}

function makeSampleVideo(dir) {
  const out = path.join(dir, 'sample.mp4');
  const r = spawnSync(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out,
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0 || !fs.existsSync(out)) throw new Error('样例生成失败');
  return out;
}

test('切片 3 全链路（真实 ffprobe/ffmpeg + stub 生成器/发布）：ok + 成片 + F4', async (t) => {
  if (!toolsOk()) { t.skip('ffmpeg/ffprobe 不可用'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-s3-'));
  try {
    const sample = makeSampleVideo(dir);
    let assetNo = 0;
    const pipeline = createSlice3Pipeline({
      // 生成器：每镜头用 ffmpeg 生成一张纯色 PNG（真实产物）
      assetGenerator: async (spec) => {
        const p = path.join(dir, 'shot' + assetNo++ + '.png');
        const colors = ['red', 'blue', 'green'];
        const r = spawnSync(FFMPEG, ['-y', '-f', 'lavfi', '-i', 'color=c=' + colors[spec.index % 3] + ':s=320x240:d=1', '-frames:v', '1', p], { encoding: 'utf8' });
        if (r.status !== 0) throw new Error('素材生成失败');
        return { path: p, kind: 'image' };
      },
      publisher: async () => ({ published: true, platform: 'local-test' }),
      outputDir: dir,
      fps: 10,
    });
    const res = await pipeline.run({
      source: { type: 'local', path: sample },
      options: { replicationLevel: 'L1', mode: 'structure', rewriteScript: false },
    });
    assert.equal(res.ok, true, JSON.stringify(res.error));
    assert.ok(res.artifacts.output && res.artifacts.output.path, '成片存在');
    assert.ok(fs.existsSync(res.artifacts.output.path));
    assert.ok(res.artifacts.output.durationSec >= 1.5, '时长≈2s: ' + res.artifacts.output.durationSec);
    assert.equal(res.publishResult.published, true);
    assert.ok(res.similarity, 'F4 相似度');
    assert.equal(res.similarity.metrics.structure, 1);
    assert.ok(res.similarity.confidence >= 0.5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('切片 3 无生成器 → 停在 generate（PROVIDER_UNAVAILABLE）', async (t) => {
  if (!toolsOk()) { t.skip('ffmpeg/ffprobe 不可用'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-s3b-'));
  try {
    const sample = makeSampleVideo(dir);
    const pipeline = createSlice3Pipeline({ outputDir: dir, fps: 10 });
    const res = await pipeline.run({ source: { type: 'local', path: sample }, options: { replicationLevel: 'L1', mode: 'structure' } });
    assert.equal(res.ok, false);
    assert.equal(res.error.code, 'VIDEOCLONE_PROVIDER_UNAVAILABLE');
    assert.equal(res.error.phase, 'generate');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
