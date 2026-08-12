'use strict';

const { VideoCloneError } = require('../errors');
const { runFfprobe, runFfmpegSceneDetect, timesToShots } = require('./runners');

/** 分辨率 → 画幅（PRD platformParams.aspect 枚举） */
function aspectFromResolution(width, height) {
  if (!width || !height) return 'unknown';
  if (Math.abs(width / height - 9 / 16) < 0.05) return '9:16';
  if (Math.abs(width / height - 16 / 9) < 0.05) return '16:9';
  if (Math.abs(width / height - 1) < 0.05) return '1:1';
  if (Math.abs(width / height - 4 / 5) < 0.05) return '4:5';
  if (Math.abs(width / height - 3 / 4) < 0.05) return '3:4';
  return width > height ? '16:9' : '9:16';
}

/**
 * ffprobe + 场景检测 + ASR 契约的 analyze adapter（PRD F2 / §16）。
 * - probeRunner：补全元数据（链接下载后无元数据时）
 * - sceneRunner：镜头切点（缺省 → 合成均匀分段，provenance.synthetic=true）
 * - sttRunner：转写脚本（缺省 → script 留空 + provenance.asr='skipped'，不 fail-closed）
 * - 报告 7 层骨架：meta/narrative.timeline(shots)/script/visual/audio/elements/platformParams/replication
 */
function createFfprobeAnalyze({
  probeRunner = runFfprobe, sceneRunner = runFfmpegSceneDetect, sttRunner = null,
  sceneThreshold = 0.3, uniformSegmentSec = 4,
} = {}) {
  async function run(ctx) {
    const media = ctx.artifacts.media;
    if (!media || !media.path) {
      throw new VideoCloneError('VIDEOCLONE_INVALID_REQUEST', { phase: 'analyze', params: { reason: '缺少 ingest 产物' } });
    }
    // 1) 元数据（本地已探测则复用；链接下载补探）
    let meta = media;
    if (meta.durationSec == null) {
      try { meta = { ...meta, ...(await probeRunner(media.path)) }; }
      catch (err) { throw new VideoCloneError('VIDEOCLONE_PROBE_FAILED', { phase: 'analyze', cause: err }); }
    }
    ctx.artifacts.media = meta;

    // 2) 场景检测（shots timeline）
    let shots = [];
    let sceneMethod = 'ffmpeg-scene';
    try {
      const cutTimes = await sceneRunner(media.path, { threshold: sceneThreshold });
      shots = timesToShots(cutTimes, meta.durationSec);
    } catch (err) {
      // 场景检测失败 → 合成均匀分段（不 fail-closed，provenance 记录）
      sceneMethod = 'synthetic-uniform';
      shots = [];
      for (let t = 0; t < meta.durationSec; t += uniformSegmentSec) {
        shots.push({ t0: t, t1: Math.min(t + uniformSegmentSec, meta.durationSec) });
      }
      ctx.artifacts.analysis = ctx.artifacts.analysis || {};
      ctx.artifacts.analysis.scene = { method: sceneMethod, fallbackReason: String(err && err.message), synthetic: true };
    }

    // 3) ASR（sttRunner 注入才执行；缺省跳过，不 fail-closed）
    let asrStatus = 'skipped';
    if (typeof sttRunner === 'function') {
      try {
        const tr = await sttRunner(media.path);
        ctx.report.script.fullText = tr.fullText || '';
        ctx.report.script.lines = Array.isArray(tr.lines) ? tr.lines : [];
        ctx.report.script.language = tr.language || 'zh';
        asrStatus = 'ok';
      } catch (err) {
        asrStatus = 'failed';
        if (ctx.request.options && ctx.request.options.requireTranscript) {
          throw new VideoCloneError('VIDEOCLONE_ASR_FAILED', { phase: 'analyze', cause: err });
        }
      }
    }

    // 4) 组装 7 层报告骨架
    const r = ctx.report;
    r.meta.durationSec = meta.durationSec;
    if (meta.width && meta.height) r.meta.resolution = meta.width + 'x' + meta.height;
    r.meta.fps = meta.fps || null;
    r.narrative.structure = 'unknown';
    r.narrative.timeline = shots.map((s, i) => ({ t0: s.t0, t1: s.t1, label: 'shot' }));
    r.narrative.plot = '';
    r.visual.palette = 'unknown';
    r.visual.shots = shots.map((s) => ({ t0: s.t0, t1: s.t1, type: 'unknown', motion: 'unknown' }));
    r.visual.transitions = shots.length > 1 ? ['cut'] : [];
    r.platformParams.aspect = aspectFromResolution(meta.width, meta.height);
    r.audio.bgm.style = '';
    r.audio.voice.gender = meta.hasAudio === false ? 'unknown' : 'unknown';
    if (meta.hasAudio === false) r.elements.watermark = false;

    ctx.artifacts.analysis = ctx.artifacts.analysis || {};
    ctx.artifacts.analysis.scene = ctx.artifacts.analysis.scene || { method: sceneMethod, shotCount: shots.length };
    ctx.artifacts.analysis.asr = { status: asrStatus };
    ctx.artifacts.analysis.probe = { ok: true, durationSec: meta.durationSec };
    return 'analyze';
  }

  return { id: 'analyze', run };
}

module.exports = { createFfprobeAnalyze, aspectFromResolution };
