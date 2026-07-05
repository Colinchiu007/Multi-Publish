/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 publish-impact-tracker.js (JS 版) 替代。
 */

import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

function getImpactPath(): string {
  return path.join(app.getPath("userData"), "publish-impact.json");
}

function _load(): any[] {
  try {
    const p = getImpactPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch { /* ignore */ }
  return [];
}

function _save(data: any[]): void {
  try {
    const p = getImpactPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
  } catch { /* ignore */ }
}

export function track(record: { platform: string; articleTitle: string; views?: number; likes?: number; shares?: number; comments?: number }): void {
  const data = _load();
  data.push({ ...record, trackedAt: new Date().toISOString() });
  if (data.length > 1000) data.splice(0, data.length - 1000);
  _save(data);
}

export function getTimeline(platform?: string, days: number = 30): any[] {
  const data = _load();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  let filtered = data.filter((r: any) => r.trackedAt >= cutoff);
  if (platform) filtered = filtered.filter((r: any) => r.platform === platform);
  return filtered;
}

export function getSummary(platform?: string): any {
  const data = getTimeline(platform);
  return {
    total: data.length,
    avgViews: data.length > 0 ? Math.round(data.reduce((s: number, r: any) => s + (r.views || 0), 0) / data.length) : 0,
    avgLikes: data.length > 0 ? Math.round(data.reduce((s: number, r: any) => s + (r.likes || 0), 0) / data.length) : 0,
  };
}