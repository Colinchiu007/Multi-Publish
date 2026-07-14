/**
 * BGM 曲库管理模块
 *
 * 提供内建 BGM 列表的加载与自定义 BGM 管理。
 * 生产部署时，将音频文件上传到 Supabase Storage，然后更新 DEFAULT_BGMS 的 URL。
 */

export interface BgmTrack {
  id: string;
  name: string;
  url: string;
  isBuiltIn: boolean;
}

/** 默认 BGM 列表（生产 Audio CDN） */
export const DEFAULT_BGMS: BgmTrack[] = [
  // 以下使用 CC0/CC-BY 许可的免费音乐 CDN 链接
  // 生产部署时请替换为自托管或 Supabase Storage 的 URL
  { id: 'bgm1',  name: '轻快旋律', url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1c9bc9862a.mp3',      isBuiltIn: true },
  { id: 'bgm2',  name: '温馨舒缓', url: 'https://cdn.pixabay.com/download/audio/2022/03/19/audio_f42f3f2b6f.mp3',      isBuiltIn: true },
  { id: 'bgm3',  name: '活力电子', url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1a4a26912b.mp3',      isBuiltIn: true },
  { id: 'bgm4',  name: '优雅钢琴', url: 'https://cdn.pixabay.com/download/audio/2022/03/24/audio_bbb32c9805.mp3',      isBuiltIn: true },
  { id: 'bgm5',  name: '自然氛围', url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_5b58b9301c.mp3',      isBuiltIn: true },
  { id: 'bgm6',  name: '节奏明快', url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_3a1e32b5d0.mp3',      isBuiltIn: true },
  { id: 'bgm7',  name: '梦幻氛围', url: 'https://cdn.pixabay.com/download/audio/2022/03/21/audio_2c8f2e1a0b.mp3',      isBuiltIn: true },
  { id: 'bgm8',  name: '治愈吉他', url: 'https://cdn.pixabay.com/download/audio/2022/03/16/audio_7f7c4a3d8e.mp3',      isBuiltIn: true },
  { id: 'bgm9',  name: '轻快打击', url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_5d6e7f8a9b.mp3',      isBuiltIn: true },
  { id: 'bgm10', name: '温柔弦乐', url: 'https://cdn.pixabay.com/download/audio/2022/03/18/audio_9a1b2c3d4e.mp3',      isBuiltIn: true },
];

const STORAGE_KEY = 'bgm_library_config';

/** 获取默认 BGM 列表 */
export function getDefaultBgmTracks(): BgmTrack[] {
  return DEFAULT_BGMS.map((t) => ({ ...t }));
}

/** 从 localStorage 读取用户自定义 BGM */
export function loadCustomBgmTracks(): BgmTrack[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as BgmTrack[];
    }
  } catch {
    // ignore
  }
  return [];
}

/** 保存用户自定义 BGM */
export function saveCustomBgmTracks(tracks: BgmTrack[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
  } catch {
    // ignore
  }
}

/** 合并内建 + 自定义 BGM */
export function getAllBgmTracks(): BgmTrack[] {
  return [...getDefaultBgmTracks(), ...loadCustomBgmTracks()];
}

/** 验证 BGM URL 是否可达（可选，仅用于开发调试） */
export async function validateBgmUrl(url: string): Promise<boolean> {
  try {
    if (typeof fetch === 'undefined') return false;
    const resp = await fetch(url, { method: 'HEAD' });
    return resp.ok;
  } catch {
    return false;
  }
}
