'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

/**
 * 二进制解析：环境变量优先（VC_* → 通用 *_PATH → PATH 内命令）。
 * 打包/开发回退语义与 PRD §7.1 一致（环境变量仅作开发回退）。
 */
function resolveBinary(envName, genericName, fallback) {
  if (process.env[envName]) return process.env[envName];
  if (process.env[genericName]) return process.env[genericName];
  return fallback;
}

function runCommand(cmd, args, { timeoutMs = 60000, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Object.assign(new Error('命令超时'), { code: 'TIMEOUT', stderr })); }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(Object.assign(new Error('命令失败'), { code: code || 'NONZERO', stderr, stdout }));
    });
  });
}

/** 默认 ffprobe：JSON 输出元数据（duration/width/height/fps/audio） */
async function runFfprobe(mediaPath) {
  const bin = resolveBinary('VC_FFPROBE_PATH', 'FFPROBE_PATH', 'ffprobe');
  const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', mediaPath];
  const { stdout } = await runCommand(bin, args);
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new Error('ffprobe 输出无法解析'); }
  const vstream = (parsed.streams || []).find((s) => s.codec_type === 'video');
  const astream = (parsed.streams || []).some((s) => s.codec_type === 'audio');
  const format = parsed.format || {};
  const fps = vstream && vstream.avg_frame_rate && vstream.avg_frame_rate !== '0/0'
    ? Number(evalFps(vstream.avg_frame_rate)) : null;
  return {
    durationSec: Number(format.duration) || (vstream && Number(vstream.duration)) || 0,
    width: vstream ? Number(vstream.width) : null,
    height: vstream ? Number(vstream.height) : null,
    fps: Number.isFinite(fps) && fps > 0 ? fps : null,
    hasAudio: !!astream,
    format: format.format_name ? String(format.format_name).split(',')[0] : null,
  };
}

function evalFps(ratio) {
  const [a, b] = ratio.split('/').map(Number);
  return b ? a / b : a;
}

/**
 * 默认场景检测：ffmpeg scene filter + showinfo，解析 stderr 中的 pts_time。
 * threshold 默认 0.3（PRD §16 场景检测参数）。
 */
async function runFfmpegSceneDetect(mediaPath, { threshold = 0.3, timeoutMs = 120000 } = {}) {
  const bin = resolveBinary('VC_FFMPEG_PATH', 'FFMPEG_PATH', 'ffmpeg');
  const args = ['-i', mediaPath, '-vf', "select='gt(scene," + threshold + ")',showinfo", '-f', 'null', '-'];
  const { stderr } = await runCommand(bin, args, { timeoutMs });
  const times = [];
  const re = /pts_time:([0-9.]+)/g;
  let m;
  while ((m = re.exec(stderr)) !== null) times.push(Number(m[1]));
  return times;
}

/** 从场景切点时间构造镜头区间（t0,t1]，末段延伸到视频末尾 */
function timesToShots(times, durationSec) {
  const pts = times.filter((t) => Number.isFinite(t) && t > 0).sort((a, b) => a - b);
  const shots = [];
  let prev = 0;
  for (const t of pts) {
    if (t > prev) shots.push({ t0: round3(prev), t1: round3(Math.min(t, durationSec)) });
    prev = t;
  }
  if (durationSec > prev) shots.push({ t0: round3(prev), t1: round3(durationSec) });
  return shots;
}

function round3(n) { return Math.round(n * 1000) / 1000; }

/**
 * 下载错误分类（纯函数，可测）：解析 yt-dlp stderr 文本 → 错误码。
 * 匹配顺序：私密 → 会员 → 地区 → 版权/不可用 → 反爬/风控 → 默认不可用。
 */
function classifyDownloadError(text) {
  const t = String(text || '');
  if (/private|私密|不可公开|仅自己可见/i.test(t)) return 'VIDEOCLONE_LINK_PRIVATE';
  if (/member|会员|membership|premium/i.test(t)) return 'VIDEOCLONE_LINK_MEMBERSHIP';
  if (/not available in your country|地区限制|geo-restricted/i.test(t)) return 'VIDEOCLONE_LINK_REGION';
  if (/copyright|版权|takedown/i.test(t)) return 'VIDEOCLONE_LINK_UNAVAILABLE';
  if (/captcha|风控|频控|bot|verify|验证/i.test(t)) return 'VIDEOCLONE_LINK_ANTI_BOT';
  if (/unavailable|video not found|deleted|不存在|已删除|404/i.test(t)) return 'VIDEOCLONE_LINK_UNAVAILABLE';
  return 'VIDEOCLONE_LINK_UNAVAILABLE';
}

/** 默认 yt-dlp 下载器 */
async function runYtDlp(url, targetPath, { timeoutMs = 600000 } = {}) {
  const bin = resolveBinary('VC_YTDLP_PATH', 'YTDLP_PATH', 'yt-dlp');
  const args = ['--no-playlist', '-f', 'bv*+ba/b', '-o', targetPath, '--no-warnings', '--no-progress', url];
  const { stderr } = await runCommand(bin, args, { timeoutMs });
  if (/\bERROR\b/i.test(stderr)) throw Object.assign(new Error(stderr), { code: 'DOWNLOAD_FAILED' });
  return { targetPath };
}

/** 从 yt-dlp 下载文件名解析扩展名（fallback mp4） */
function extFromTarget(targetPath, fallback = 'mp4') {
  const e = path.extname(targetPath);
  return e ? e.slice(1).toLowerCase() : fallback;
}

module.exports = {
  resolveBinary, runCommand, runFfprobe, runFfmpegSceneDetect, timesToShots,
  classifyDownloadError, runYtDlp, extFromTarget,
};
