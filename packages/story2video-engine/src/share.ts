/**
 * Share utility for video sharing functionality.
 */

export interface ShareMeta {
  prompt?: string;
  mode?: string;
  [key: string]: string | undefined;
}

/**
 * Generate a shareable URL for a video.
 */
export function generateShareUrl(
  videoId: string,
  meta?: ShareMeta,
  baseUrl?: string,
): string {
  const origin = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  const url = new URL(`/share/${videoId}`, origin);

  if (meta) {
    for (const [key, value] of Object.entries(meta)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
  }

  return url.toString();
}

/**
 * Get share text for social media.
 */
export function getShareText(shareUrl: string, prompt?: string): string {
  const promptPart = prompt ? `「${prompt}」` : '';
  return `我用AI生成的视频${promptPart}，来看看吧！\n${shareUrl}`;
}

/**
 * Get platform-specific share URL.
 */
export function getSharePlatformUrl(
  platform: string,
  shareUrl: string,
  text?: string,
): string {
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = text ? encodeURIComponent(text) : '';

  switch (platform) {
    case 'weibo':
      return `https://service.weibo.com/share/share.php?url=${encodedUrl}&title=${encodedText}`;
    default:
      return shareUrl;
  }
}

/**
 * Check if the Web Share API is supported.
 */
export function isWebShareSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export interface ShareData {
  url: string;
  title?: string;
  text?: string;
}

/**
 * Share via Web Share API, with copy-to-clipboard fallback.
 */
export async function shareVideo(data: ShareData): Promise<'shared' | 'copied'> {
  if (isWebShareSupported()) {
    try {
      await navigator.share({
        title: data.title ?? 'AI 视频',
        text: data.text ?? data.url,
        url: data.url,
      });
      return 'shared';
    } catch (err) {
      // User cancelled or Web Share failed — fall through to clipboard
      if (err instanceof Error && err.name === 'AbortError') {
        // User cancelled the share dialog
        return 'shared';
      }
    }
  }

  // Fallback: copy to clipboard
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    await navigator.clipboard.writeText(data.url);
  }
  return 'copied';
}
