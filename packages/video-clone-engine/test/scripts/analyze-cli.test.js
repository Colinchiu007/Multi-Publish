'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function ffmpegAvailable() {
  const bin = process.env.VC_FFMPEG_PATH || process.env.FFMPEG_PATH || 'ffmpeg';
  return spawnSync(bin, ['-version']).status === 0;
}

test('analyze CLI：本地样例 → report.json + summary.txt（需要 ffmpeg）', (t) => {
  if (!ffmpegAvailable()) { t.skip('ffmpeg 不可用'); return; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-cli-'));
  const sample = path.join(tmp, 'sample.mp4');
  const out = path.join(tmp, 'out');
  const ffmpeg = process.env.VC_FFMPEG_PATH || process.env.FFMPEG_PATH || 'ffmpeg';
  const gen = spawnSync(ffmpeg, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sample,
  ], { encoding: 'utf8' });
  assert.equal(gen.status, 0, '样例生成失败: ' + (gen.stderr || '').slice(0, 200));

  const script = path.join(__dirname, '..', '..', 'scripts', 'video-clone-analyze.js');
  const r = spawnSync(process.execPath, [script, sample, '--out', out], { encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, 'CLI 应成功。stdout=' + r.stdout + ' stderr=' + r.stderr);
  assert.ok(fs.existsSync(path.join(out, 'report.json')), 'report.json 应存在');
  assert.ok(fs.existsSync(path.join(out, 'summary.txt')), 'summary.txt 应存在');
  const report = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
  assert.ok(report.meta.durationSec >= 2.5, '时长应≈3s');
  assert.ok(report.visual.shots.length >= 1, '镜头非空');
  assert.ok(r.stdout.includes('报告校验: OK'));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('analyze CLI：用法错误（无参数）→ exit 2', () => {
  const script = path.join(__dirname, '..', '..', 'scripts', 'video-clone-analyze.js');
  const r = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
