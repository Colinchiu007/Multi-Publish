import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { default as logger } from "./logger";

interface UsageData {
  events: UsageEvent[];
  featureUsage: Record<string, number>;
  dailyCounts: Record<string, Record<string, number>>;
  sessions: number;
  lastActive: string;
  installDate: string;
}

interface UsageEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
  timestamp: string;
}

function getDataPath(): string {
  return path.join(app.getPath("userData"), "usage-data.json");
}

export class UsageTracker {
  private dataPath: string;
  private data: UsageData;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || getDataPath();
    this.data = this._load();
  }

  private _load(): UsageData {
    try {
      if (fs.existsSync(this.dataPath)) {
        return JSON.parse(fs.readFileSync(this.dataPath, "utf-8"));
      }
    } catch (e: unknown) {
      logger.warn("UsageTracker", `Load failed: ${(e as Error).message}`);
    }
    return { events: [], featureUsage: {}, dailyCounts: {}, sessions: 0, lastActive: "", installDate: new Date().toISOString() };
  }

  private _save(): void {
    try {
      const dir = path.dirname(this.dataPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data), "utf-8");
    } catch (e: unknown) {
      logger.warn("UsageTracker", `Save failed: ${(e as Error).message}`);
    }
  }

  trackEvent(category: string, action: string, extra?: Record<string, any>): void {
    this.data.events.push({ category, action, ...extra, timestamp: new Date().toISOString() });
    if (this.data.events.length > 10000) this.data.events = this.data.events.slice(-5000);
    this.data.lastActive = new Date().toISOString();
    this._save();
  }

  trackFeatureUsage(feature: string, action: string): void {
    const key = `${feature}:${action}`;
    this.data.featureUsage[key] = (this.data.featureUsage[key] || 0) + 1;
    this.data.lastActive = new Date().toISOString();
    this._save();
  }

  trackDaily(key: string, count: number = 1): void {
    const today = new Date().toISOString().slice(0, 10);
    if (!this.data.dailyCounts[today]) this.data.dailyCounts[today] = {};
    this.data.dailyCounts[today][key] = (this.data.dailyCounts[today][key] || 0) + count;
    this._save();
  }

  getStats(): any {
    const today = new Date().toISOString().slice(0, 10);
    const todayCounts = this.data.dailyCounts[today] || {};
    return {
      totalEvents: this.data.events.length,
      sessions: this.data.sessions,
      installDate: this.data.installDate,
      lastActive: this.data.lastActive,
      todayArticles: todayCounts.articles_published || 0,
      todayPlatforms: todayCounts.platforms_used || 0,
      topFeatures: Object.entries(this.data.featureUsage)
        .sort(([, a], [, b]) => b - a).slice(0, 10)
        .map(([k, v]) => ({ feature: k, count: v })),
    };
  }

  incrementSession(): void {
    this.data.sessions++;
    this._save();
  }

  flush(): void {
    this._save();
  }
}