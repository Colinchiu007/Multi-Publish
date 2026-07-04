import * as https from "https";
import * as http from "http";
import { URL } from "url";

const DEFAULT_TIMEOUT = 10000;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export interface AnalyticMetrics {
  fans: number;
  views: number;
  likes: number;
  collects: number;
  comments: number;
  shares: number;
}

export interface AnalyticResult {
  platform: string;
  period: string;
  metrics: Partial<AnalyticMetrics>;
  trend: Array<{ date: string; value: number }>;
  _error?: string;
}

interface Cookie {
  name: string;
  value: string;
}

function httpGet(urlStr: string, cookies: Cookie[] = [], timeout = DEFAULT_TIMEOUT): Promise<any> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const transport = url.protocol === "https:" ? https : http;

    const cookieStr = cookies
      .filter((c) => c.name && c.value)
      .map((c) => `${encodeURIComponent(c.name)}=${encodeURIComponent(c.value)}`)
      .join("; ");

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname + url.search,
      method: "GET" as const,
      timeout,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: url.origin + "/",
        ...(cookieStr ? { Cookie: cookieStr } : {}),
      },
    };

    const req = transport.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error(`JSON parse error: ${(e as Error).message}`)); }
        } else if (res.statusCode === 302 || res.statusCode === 301) {
          reject(new Error(`Redirect (${res.statusCode}) \u2014 cookie may be expired`));
        } else if (res.statusCode === 403 || res.statusCode === 401) {
          reject(new Error(`Auth failed (${res.statusCode}) \u2014 cookie invalid`));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => reject(new Error(`Request error: ${err.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
    req.end();
  });
}

export { httpGet };

export async function xiaohongshuProvider(platform: string, credentials: { cookies?: Cookie[] }): Promise<AnalyticResult> {
  const cookies = credentials?.cookies || [];
  if (cookies.length === 0) {
    return { platform: "xiaohongshu", period: "day", metrics: {}, trend: [] };
  }

  try {
    const data = await httpGet(
      "https://creator.xiaohongshu.com/api/galaxy/creator/datacenter/note/analyze/list?page_size=10&page=1",
      cookies
    );

    const result = data?.data || data?.result || {};
    const items: any[] = result?.items || result?.list || [];
    const overview = result?.overview || {};

    const metrics: AnalyticMetrics = {
      fans: overview.follower_count || overview.fans || 0,
      views: items.reduce((s: number, i: any) => s + (i.view_count || i.read_count || 0), 0),
      likes: items.reduce((s: number, i: any) => s + (i.like_count || i.likes || 0), 0),
      collects: items.reduce((s: number, i: any) => s + (i.collect_count || i.collects || 0), 0),
      comments: items.reduce((s: number, i: any) => s + (i.comment_count || i.comments || 0), 0),
      shares: items.reduce((s: number, i: any) => s + (i.share_count || i.shares || 0), 0),
    };

    return { platform: "xiaohongshu", period: "day", metrics, trend: [] };
  } catch (err: unknown) {
    return { platform: "xiaohongshu", period: "day", metrics: {}, trend: [], _error: (err as Error).message };
  }
}

export async function douyinProvider(platform: string, credentials: { cookies?: Cookie[] }): Promise<AnalyticResult> {
  const cookies = credentials?.cookies || [];
  if (cookies.length === 0) {
    return { platform: "douyin", period: "day", metrics: {}, trend: [] };
  }

  try {
    const data = await httpGet(
      "https://creator.douyin.com/creator/data/overview/v1/?need_comparison=false",
      cookies
    );

    const overview = data?.data || data?.result || {};

    const metrics: AnalyticMetrics = {
      fans: overview.follower_count || overview.fans || 0,
      views: overview.total_play || overview.total_views || overview.views || 0,
      likes: overview.total_like || overview.total_likes || overview.likes || 0,
      collects: overview.total_favorite || overview.total_favorites || overview.collects || 0,
      comments: overview.total_comment || overview.total_comments || overview.comments || 0,
      shares: overview.total_share || overview.total_shares || overview.shares || 0,
    };

    const trend = Array.isArray(overview.trend)
      ? overview.trend.map((item: any) => ({ date: item.date || item.dt || "", value: item.value || item.count || 0 }))
      : [];

    return { platform: "douyin", period: "day", metrics, trend };
  } catch (err: unknown) {
    return { platform: "douyin", period: "day", metrics: {}, trend: [], _error: (err as Error).message };
  }
}