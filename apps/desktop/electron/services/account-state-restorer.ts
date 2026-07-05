/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 account-state-restorer.js (JS 版) 替代。
 */

import { default as logger } from "./logger";
import { default as EventEmitter } from "events";

const emitter = new EventEmitter();
let _scheduled: Array<{ platform: string; cookies: any[]; timestamp: number }> = [];
let _timer: ReturnType<typeof setTimeout> | null = null;

export function schedule(platform: string, cookies: any[], delayMs: number = 5000): void {
  _scheduled.push({ platform, cookies, timestamp: Date.now() + delayMs });
  if (!_timer) _timer = setTimeout(flush, delayMs);
  logger.info("AccountStateRestorer", `Scheduled restore for ${platform} in ${delayMs}ms`);
}

export function flush(): void {
  if (_timer) { clearTimeout(_timer); _timer = null; }
  const now = Date.now();
  const due = _scheduled.filter((s) => s.timestamp <= now);
  _scheduled = _scheduled.filter((s) => s.timestamp > now);

  for (const item of due) {
    logger.info("AccountStateRestorer", `Restoring state for ${item.platform}`);
    emitter.emit("restore", item);
  }
  if (_scheduled.length > 0) {
    const next = Math.min(..._scheduled.map((s) => s.timestamp)) - now;
    _timer = setTimeout(flush, Math.max(next, 100));
  }
}

export function onRestore(cb: (data: { platform: string; cookies: any[] }) => void): void {
  emitter.on("restore", cb);
}

export function hasPending(): boolean {
  return _scheduled.length > 0;
}

export function cancel(platform: string): void {
  _scheduled = _scheduled.filter((s) => s.platform !== platform);
  logger.info("AccountStateRestorer", `Cancelled restore for ${platform}`);
}