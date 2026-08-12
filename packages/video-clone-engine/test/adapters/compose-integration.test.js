'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createFfmpegCompose } = require('../../src/adapters/compose-ffmpeg');
const { runFfprobe } = require('../../src/adapters/runners');
const { emptyReport } = require('../../src/clone-report');

function bin(env, generic, fallback) { return process.env[env] || process.env[generic] || fallback; }
const FFMPEG = bin('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg');
const FFPROBE = bin('VC_FFPROBE_PATH', 'FFPROBE_PATH', 'ffprobe');

function toolsOk() {
  for (const b of [FFMPEG, FFPROBE]) {
    if (spawnSync(b, ['-version']).status !== 0) return false;
  }
  return true;
}

function ffmpeg(args) {
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error('ffmpeg 失败: ' + (r.stderr || '').slice(0, 300));
}

test('真实合成：2 图 + 音频 + 字幕 → mp4 输出（ffprobe 校验时长/分辨率）', async (t) => {
  if (!toolsOk()) { t.skip('ffmpeg/ffprobe 不可用'); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vc-comp-'));
  try {
    const red = path.join(dir, 'red.png');
    const blue = path.join(dir, 'blue.png');
    const audio = path.join(dir, 'voice.m4a');
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1', '-frames:v', '1', red]);
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:d=1', '-frames:v', '1', blue]);
    ffmpeg(['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5', '-c:a', 'aac', '-shortest', audio]);

    const r = emptyReport();
    r.visual.shots = [{ t0: 0, t1: 2 }, { t0: 2, t1: 5 }];
    r.meta.resolution = '320x240';
    r.meta.durationSec = 5;
    r.script.lines = [{ t0: 0.5, t1: 4.5, text: '你好世界' }];
    r.platformParams.aspect = '16:9';

    const assPath = path.join(dir, 'sub.ass');
    fs.writeFileSync(assPath, require('../../src/adapters/compose-ffmpeg').buildAssScript(r.script.lines));

    const compose = createFfmpegCompose({ outputDir: dir, fps: 10 });
    const ctx = {
      report: r,
      artifacts: { assets: { scenes: [{ path: red }, { path: blue }], audio: { path: audio }, subtitles: { path: assPath } } },
    };
    await compose.run(ctx);
    assert.ok(ctx.artifacts.output.path.endsWith('clone.mp4'));
    assert.ok(fs.existsSync(ctx.artifacts.output.path), '输出存在');
    const meta = await runFfprobe(ctx.artifacts.output.path);
    assert.ok(meta.durationSec >= 4.5, '时长≈5s，实际 ' + meta.durationSec);
    assert.equal(meta.width, 320);
    assert.equal(meta.height, 240);
    assert.equal(meta.hasAudio, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
