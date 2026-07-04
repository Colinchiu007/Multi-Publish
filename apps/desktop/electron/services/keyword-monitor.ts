import { default as logger } from "./logger";

export interface KeywordWatcherOpts {
  interval?: number;
  threshold?: number;
}

interface HistorySnapshot {
  total: number;
  topEngagement: number;
  topSource: string | null;
  topTitle: string | null;
  checkedAt: string;
}

interface Watcher {
  keyword: string;
  interval: number;
  threshold: number;
  history: HistorySnapshot[];
  timer: ReturnType<typeof setInterval> | null;
  lastTotal: number | null;
}

export class KeywordMonitor {
  private ci: any;
  private _store: any;
  private _watchers: Map<string, Watcher> = new Map();
  private _onAlert: ((keyword: string, current: number, previous: number, ratio: number) => void) | null = null;

  static readonly DEFAULT_INTERVAL = 6 * 60 * 60 * 1000;
  static readonly MAX_KEYWORDS = 20;

  constructor(contentIntelligence: any, store: any) {
    this.ci = contentIntelligence;
    this._store = store;
  }

  onAlert(cb: (keyword: string, current: number, previous: number, ratio: number) => void): void {
    this._onAlert = cb;
  }

  startMonitoring(keyword: string, opts: KeywordWatcherOpts = {}): boolean {
    if (!keyword || keyword.length < 2) return false;
    if (this._watchers.size >= KeywordMonitor.MAX_KEYWORDS) {
      logger.warn("KeywordMonitor", "Max keywords reached, cannot add: " + keyword);
      return false;
    }
    if (this._watchers.has(keyword)) return true;

    const interval = opts.interval || KeywordMonitor.DEFAULT_INTERVAL;
    const threshold = opts.threshold || 2.0;
    const history: HistorySnapshot[] = [];
    const saved = this._loadHistory(keyword);
    if (saved) history.push(...saved);

    const watcher: Watcher = {
      keyword, interval, threshold, history,
      timer: null,
      lastTotal: saved && saved.length > 0 ? saved[saved.length - 1].total : null,
    };

    this._poll(watcher);
    watcher.timer = setInterval(() => this._poll(watcher), interval);
    this._watchers.set(keyword, watcher);
    logger.info("KeywordMonitor", `Started monitoring "${keyword}" every ${Math.round(interval / 60000)}min`);
    return true;
  }

  stopMonitoring(keyword: string): boolean {
    const watcher = this._watchers.get(keyword);
    if (!watcher) return false;
    clearInterval(watcher.timer!);
    this._watchers.delete(keyword);
    logger.info("KeywordMonitor", `Stopped monitoring "${keyword}"`);
    return true;
  }

  getStatus(): Array<{ keyword: string; samples: number; lastTotal: number; lastChecked: string | null; interval: number; threshold: number }> {
    const result: any[] = [];
    for (const [keyword, w] of this._watchers) {
      result.push({
        keyword, samples: w.history.length,
        lastTotal: w.history.length > 0 ? w.history[w.history.length - 1].total : 0,
        lastChecked: w.history.length > 0 ? w.history[w.history.length - 1].checkedAt : null,
        interval: w.interval, threshold: w.threshold,
      });
    }
    return result;
  }

  getHistory(keyword: string): HistorySnapshot[] {
    const w = this._watchers.get(keyword);
    return w ? w.history : [];
  }

  getAllHistories(): Record<string, HistorySnapshot[]> {
    const result: Record<string, HistorySnapshot[]> = {};
    for (const [keyword, w] of this._watchers) {
      result[keyword] = w.history;
    }
    return result;
  }

  restoreFromState(state: Record<string, HistorySnapshot[]>): void {
    if (!state || typeof state !== "object") return;
    let count = 0;
    for (const [keyword, history] of Object.entries(state)) {
      if (this._watchers.has(keyword)) continue;
      const watcher: Watcher = {
        keyword, interval: KeywordMonitor.DEFAULT_INTERVAL, threshold: 2.0,
        history: Array.isArray(history) ? history : [],
        timer: null,
        lastTotal: Array.isArray(history) && history.length > 0 ? history[history.length - 1].total : null,
      };
      watcher.timer = setInterval(() => this._poll(watcher), KeywordMonitor.DEFAULT_INTERVAL);
      this._watchers.set(keyword, watcher);
      count++;
    }
    if (count > 0) logger.info("KeywordMonitor", `Restored ${count} keyword watchers`);
  }

  stopAll(): void {
    for (const [_keyword, w] of this._watchers) {
      clearInterval(w.timer!);
    }
    this._watchers.clear();
    logger.info("KeywordMonitor", "All watchers stopped");
  }

  private async _poll(watcher: Watcher): Promise<void> {
    try {
      const result = await this.ci.search(watcher.keyword, { limit: 5, noCache: true });
      const total = result.total || 0;
      const topEngagement = result.results?.[0]?.engagement || 0;

      const snapshot: HistorySnapshot = {
        total, topEngagement,
        topSource: result.results?.[0]?.source || null,
        topTitle: result.results?.[0]?.title?.slice(0, 60) || null,
        checkedAt: new Date().toISOString(),
      };

      watcher.history.push(snapshot);
      if (watcher.history.length > 50) watcher.history.shift();

      if (watcher.lastTotal !== null && watcher.threshold > 0) {
        const ratio = watcher.lastTotal > 0 ? total / watcher.lastTotal : 0;
        if (ratio >= watcher.threshold) {
          logger.info("KeywordMonitor", `Spike detected: "${watcher.keyword}" ${watcher.lastTotal} \u2192 ${total} (${ratio.toFixed(1)}x)`);
          if (this._onAlert) this._onAlert(watcher.keyword, total, watcher.lastTotal, ratio);
        }
      }

      watcher.lastTotal = total;
      this._persistAll();
    } catch (e: unknown) {
      logger.warn("KeywordMonitor", `Poll error for "${watcher.keyword}": ${(e as Error).message}`);
    }
  }

  private _loadHistory(keyword: string): HistorySnapshot[] | null {
    if (!this._store || !this._store._ready) return null;
    try {
      const raw = this._store.getSetting("kw_history_" + keyword);
      return raw || null;
    } catch { return null; }
  }

  private _persistAll(): void {
    if (!this._store || !this._store._ready) return;
    try {
      for (const [keyword, w] of this._watchers) {
        this._store.setSetting("kw_history_" + keyword, w.history);
      }
    } catch (e: unknown) {
      logger.warn("KeywordMonitor", `Persist error: ${(e as Error).message}`);
    }
  }
}