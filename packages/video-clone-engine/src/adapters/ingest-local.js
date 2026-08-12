'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { VideoCloneError } = require('../errors');
const { runFfprobe } = require('./runners');

const DEFAULT_LIMITS = Object.freeze({
  maxSizeBytes: 500 * 1024 * 1024, // PRD §11.1：≤500MB
  maxDurationSec: 30 * 60,         // PRD §11.1：≤30min
  allowedExtensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'],
});

/**
 * 本地文件 ingest adapter（PRD F1.1 / §11.1 / §14 错误码）。
 * 依赖注入：fsImpl / probeRunner / limits，便于单测与真实运行。
 */
function createLocalFileIngest({ fsImpl = fs, probeRunner = runFfprobe, limits = DEFAULT_LIMITS } = {}) {
  async function run(ctx) {
    const p = ctx.request.source.path;
    let stat;
    try {
      stat = await fsImpl.promises.stat(p);
    } catch (err) {
      throw new VideoCloneError('VIDEOCLONE_FILE_NOT_FOUND', { phase: 'ingest', cause: err });
    }
    if (!stat.isFile()) {
      throw new VideoCloneError('VIDEOCLONE_FILE_NOT_FOUND', { phase: 'ingest', params: { reason: '不是文件' } });
    }
    if (stat.size > limits.maxSizeBytes) {
      throw new VideoCloneError('VIDEOCLONE_FILE_TOO_LARGE', { phase: 'ingest', params: { sizeBytes: stat.size, maxSizeBytes: limits.maxSizeBytes } });
    }
    const ext = path.extname(p).slice(1).toLowerCase();
    if (!limits.allowedExtensions.includes(ext)) {
      throw new VideoCloneError('VIDEOCLONE_FILE_FORMAT', { phase: 'ingest', params: { ext } });
    }
    let meta;
    try {
      meta = await probeRunner(p);
    } catch (err) {
      throw new VideoCloneError('VIDEOCLONE_PROBE_FAILED', { phase: 'ingest', cause: err });
    }
    if (meta.durationSec > limits.maxDurationSec) {
      throw new VideoCloneError('VIDEOCLONE_FILE_TOO_LONG', { phase: 'ingest', params: { durationSec: meta.durationSec, maxDurationSec: limits.maxDurationSec } });
    }
    ctx.artifacts.media = {
      path: p, sizeBytes: stat.size, source: 'local',
      durationSec: meta.durationSec, width: meta.width, height: meta.height,
      fps: meta.fps, hasAudio: meta.hasAudio, format: meta.format, ext,
    };
    const r = ctx.report;
    r.meta.source = 'local';
    r.meta.durationSec = meta.durationSec;
    r.meta.fps = meta.fps || null;
    if (meta.width && meta.height) r.meta.resolution = meta.width + 'x' + meta.height;
    ctx.artifacts.analysis = { probe: { ok: true, durationSec: meta.durationSec } };
    return 'ingest:local';
  }

  return { id: 'ingest', run };
}

module.exports = { createLocalFileIngest, DEFAULT_LIMITS };
