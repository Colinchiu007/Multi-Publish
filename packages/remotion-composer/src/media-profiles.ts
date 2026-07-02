export interface MediaProfile { id: string; name: string; width: number; height: number; fps: number; maxDurationSeconds?: number; videoBitrate?: string; audioBitrate?: string; }
const PROFILES: MediaProfile[] = [
  { id: 'youtube-landscape', name: 'YouTube 横屏', width: 1920, height: 1080, fps: 30, videoBitrate: '8M', audioBitrate: '192k' },
  { id: 'youtube-4k', name: 'YouTube 4K', width: 3840, height: 2160, fps: 30, videoBitrate: '20M', audioBitrate: '256k' },
  { id: 'youtube-shorts', name: 'YouTube Shorts', width: 1080, height: 1920, fps: 30, maxDurationSeconds: 60, videoBitrate: '6M', audioBitrate: '128k' },
  { id: 'tiktok', name: '抖音/TikTok', width: 1080, height: 1920, fps: 30, maxDurationSeconds: 180, videoBitrate: '6M', audioBitrate: '128k' },
  { id: 'instagram-reels', name: 'Instagram Reels', width: 1080, height: 1920, fps: 30, maxDurationSeconds: 90, videoBitrate: '6M', audioBitrate: '128k' },
  { id: 'wechat', name: '微信视频号', width: 1080, height: 1920, fps: 30, maxDurationSeconds: 60, videoBitrate: '4M', audioBitrate: '128k' },
  { id: 'bilibili', name: 'B站', width: 1920, height: 1080, fps: 30, videoBitrate: '8M', audioBitrate: '192k' },
  { id: 'xiaohongshu', name: '小红书', width: 1080, height: 1440, fps: 30, maxDurationSeconds: 60, videoBitrate: '4M', audioBitrate: '128k' },
  { id: 'generic-hd', name: '通用 HD', width: 1920, height: 1080, fps: 30, videoBitrate: '6M', audioBitrate: '128k' },
];
const profileMap = new Map(PROFILES.map((p) => [p.id, p]));
export function getProfile(id: string): MediaProfile { return profileMap.get(id) || profileMap.get('generic-hd')!; }
export function listProfiles(): MediaProfile[] { return [...PROFILES]; }
export function getRemotionArgs(profile: MediaProfile): string[] { return ['--width', String(profile.width), '--height', String(profile.height), '--fps', String(profile.fps)]; }
export function getFfmpegArgs(profile: MediaProfile): string[] { const a: string[] = []; if (profile.videoBitrate) a.push('-b:v', profile.videoBitrate); if (profile.audioBitrate) a.push('-b:a', profile.audioBitrate); return a; }
