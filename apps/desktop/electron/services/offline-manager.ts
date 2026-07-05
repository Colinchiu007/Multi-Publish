/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 offline-manager.js (JS 版) 替代。
 */

import { default as logger } from "./logger";
import { default as EventEmitter } from "events";

interface QueuedTask {
  id: string;
  platform: string;
  article: any;
  queuedAt: string;
}

const emitter = new EventEmitter();
let _isOnline: boolean = true;
let _checking: boolean = false;
const _queue: QueuedTask[] = [];

export function isOnline(): boolean {
  return _isOnline;
}

export function getQueue(): QueuedTask[] {
  return [..._queue];
}

export function queueLength(): number {
  return _queue.length;
}

export async function startMonitoring(intervalMs: number = 30000): Promise<void> {
  _checking = true;
  _checkConnectivity();
  setInterval(() => { if (_checking) _checkConnectivity(); }, intervalMs);
}

export function stopMonitoring(): void {
  _checking = false;
}

export function enqueueTask(platform: string, article: any): string {
  const id = `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  _queue.push({ id, platform, article, queuedAt: new Date().toISOString() });
  logger.info("OfflineManager", `Task queued: ${id} (${platform})`);
  emitter.emit("queue-changed", _queue.length);
  return id;
}

export function retryQueue(): void {
  const tasks = [..._queue];
  _queue.length = 0;
  emitter.emit("queue-changed", 0);
  for (const task of tasks) {
    logger.info("OfflineManager", `Retrying: ${task.id}`);
    try {
      const { default: TaskQueue } = require("@multi-publish/shared-utils/src/task-queue");
      TaskQueue.add({ platform: task.platform, article: task.article });
    } catch (e: unknown) {
      logger.warn("OfflineManager", `Retry failed: ${(e as Error).message}`);
      _queue.push(task);
    }
  }
}

export function onOnline(cb: () => void): void {
  emitter.on("online", cb);
}

export function onOffline(cb: () => void): void {
  emitter.on("offline", cb);
}

function _checkConnectivity(): void {
  const wasOnline = _isOnline;
  try {
    const net = require("net");
    const sock = new net.Socket();
    sock.setTimeout(5000);
    sock.on("connect", () => {
      _isOnline = true;
      sock.destroy();
      if (!wasOnline) {
        logger.info("OfflineManager", "Back online");
        emitter.emit("online");
        retryQueue();
      }
    });
    sock.on("error", () => {
      _isOnline = false;
      if (wasOnline) {
        logger.warn("OfflineManager", "Gone offline");
        emitter.emit("offline");
      }
    });
    sock.on("timeout", () => {
      _isOnline = false;
      sock.destroy();
      if (wasOnline) {
        logger.warn("OfflineManager", "Gone offline (timeout)");
        emitter.emit("offline");
      }
    });
    sock.connect(443, "8.8.8.8");
  } catch (e: unknown) {
    _isOnline = false;
    logger.warn("OfflineManager", `Check error: ${(e as Error).message}`);
  }
}