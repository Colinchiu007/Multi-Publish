import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

const MAX_RECORDS = 500;

interface PublishRecord {
  id: string;
  platform: string;
  title?: string;
  success?: boolean;
  error?: string;
  timestamp: string;
  [key: string]: any;
}

interface ListOptions {
  platform?: string;
  limit?: number;
  offset?: number;
}

interface StatsResult {
  total: number;
  success: number;
  failed: number;
  successRate: number;
  perPlatform: Record<string, { total: number; success: number; failed: number }>;
  daily: Array<{ date: string; total: number; success: number }>;
}

function getHistoryPath(): string {
  return path.join(app.getPath("userData"), "publish-history.jsonl");
}

export function addRecord(record: Partial<PublishRecord>): PublishRecord {
  const filePath = getHistoryPath();
  const entry: PublishRecord = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ...record,
    timestamp: new Date().toISOString(),
  } as PublishRecord;
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n", "utf-8");
  return entry;
}

export function listRecords(opts: ListOptions = {}): { total: number; records: PublishRecord[] } {
  const { platform, limit = 50, offset = 0 } = opts;
  const filePath = getHistoryPath();
  if (!fs.existsSync(filePath)) return { total: 0, records: [] };

  const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
  let records = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as PublishRecord[];

  if (platform) records = records.filter((r) => r.platform === platform);
  const total = records.length;
  records = records.reverse().slice(offset, offset + limit);
  return { total, records };
}

export function getRecord(id: string): PublishRecord | null {
  const { records } = listRecords({ limit: MAX_RECORDS });
  return records.find((r) => r.id === id) || null;
}

export function getStats(): StatsResult {
  const filePath = getHistoryPath();
  if (!fs.existsSync(filePath)) {
    return { total: 0, success: 0, failed: 0, successRate: 0, perPlatform: {}, daily: [] };
  }

  const lines = fs.readFileSync(filePath, "utf-8").trim().split("\n").filter(Boolean);
  const records = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) as PublishRecord[];

  const total = records.length;
  const success = records.filter((r) => r.success !== false).length;
  const failed = total - success;

  const perPlatform: Record<string, { total: number; success: number; failed: number }> = {};
  for (const r of records) {
    const p = r.platform || "unknown";
    if (!perPlatform[p]) perPlatform[p] = { total: 0, success: 0, failed: 0 };
    perPlatform[p].total++;
    if (r.success !== false) perPlatform[p].success++;
    else perPlatform[p].failed++;
  }

  const dailyMap: Record<string, { date: string; total: number; success: number }> = {};
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyMap[key] = { date: key, total: 0, success: 0 };
  }
  for (const r of records) {
    if (!r.timestamp) continue;
    const key = r.timestamp.slice(0, 10);
    if (dailyMap[key]) {
      dailyMap[key].total++;
      if (r.success !== false) dailyMap[key].success++;
    }
  }

  return { total, success, failed, successRate: total > 0 ? Math.round((success / total) * 100) : 0, perPlatform, daily: Object.values(dailyMap) };
}