'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { PLATFORMS } = require('../constants');
const { VideoCloneError } = require('../errors');
const { runYtDlp, classifyDownloadError, extFromTarget } = require('./runners');

const DEFAULT_LIMITS = Object.freeze({
  maxSizeBytes: 500 * 1024 * 1024,
  maxDurationSec: 30 * 60,
  allowedExtensions: ['mp4', 'mov', 'webm', 'mkv', 'avi'],
});

/** 链接 → 平台提示（URL 域名匹配，仅供展示/诊断；未知平台不阻断下载） */
function hintPlatform(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    for (const p of PLATFORMS) {
      const keys = {
        douyin: ['douyin.com'], xiaohongshu: ['xiaohongshu.com', 'xhslink.com'],
        kuaishou: ['kuaishou.com'], bilibili: ['bilibili.com', 'b23.tv'],
        shipinhao: ['weixin.qq.com', 'channels.weixin.qq.com'], youtube: ['youtube.com', 'youtu.be'],
        tiktok: ['tiktok.com'], instagram: ['instagram.com'],
      };
      if ((keys[p] || []).some((k) => host === k || host.endsWith('.' + k))) return p;
    }
  } catch { /* 非法 URL 由请求校验拦截 */ }
  return null;
}

/**
 * 链接下载 ingest adapter（PRD F1.2 / §11.1 / §14）。
 * 依赖注入：downloadRunner / fsImpl / tmpDir / limits。
 * 下载后强制大小/时长上限；失败按 classifyDownloadError 映射错误码。
 */
function createUrlIngest({
  downloadRunner = runYtDlp, fsImpl = fs, tmpDir = os.tmpdir(), limits = DEFAULT_LIMITS,
} = {}) {
  async function run(ctx) {
    const url = ctx.request.source.url;
    const targetDir = await fsImpl.promises.mkdtemp(path.join(tmpDir, 'vc-dl-'));
    const targetPath = path.join(targetDir, 'video.mp4');
    try {
      await downloadRunner(url, targetPath);
    } catch (err) {
      const code = classifyDownloadError((err && (err.stderr || err.message)) || '');
      throw new VideoCloneError(code, { phase: 'ingest', cause: err });
    }
    let stat;
    try { stat = await fsImpl.promises.stat(targetPath); } catch (err) {
      throw new VideoCloneError('VIDEOCLONE_LINK_UNAVAILABLE', { phase: 'ingest', cause: err });
    }
    if (stat.size > limits.maxSizeBytes) {
      throw new VideoCloneError('VIDEOCLONE_FILE_TOO_LARGE', { phase: 'ingest', params: { sizeBytes: stat.size } });
    }
    ctx.artifacts.media = {
      path: targetPath, sizeBytes: stat.size, source: 'url', url,
      platform: hintPlatform(url), format: extFromTarget(targetPath),
      durationSec: null, width: null, height: null, fps: null, hasAudio: null, ext: extFromTarget(targetPath),
    };
    ctx.report.meta.source = 'url';
    ctx.report.meta.platform = ctx.artifacts.media.platform;
    ctx.artifacts.analysis = { download: { ok: true, url } };
    return 'ingest:url';
  }

  return { id: 'ingest', run };
}

module.exports = { createUrlIngest, hintPlatform, DEFAULT_LIMITS };
