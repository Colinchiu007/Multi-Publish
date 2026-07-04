import * as fs from "fs";
import * as path from "path";
import { app } from "electron";

function getSchedulerPath(): string {
  return path.join(app.getPath("userData"), "scheduled-tasks.jsonl");
}

const _timers: Record<string, ReturnType<typeof setTimeout>> = {};
let _taskQueue: any = null;

export function setTaskQueue(taskQueue: any): void {
  _taskQueue = taskQueue;
}

export function schedule(platform: string, article: any, publishTime: string): string {
  const id = `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const record = { id, platform, article, publishTime, createdAt: new Date().toISOString() };

  try {
    const filePath = getSchedulerPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(filePath, JSON.stringify(record) + "\n", "utf-8");
  } catch (_e) { /* ignore */ }

  const delay = new Date(publishTime).getTime() - Date.now();
  if (delay > 0) {
    _timers[id] = setTimeout(() => {
      if (_taskQueue) _taskQueue.add({ platform, article, scheduled: true });
      delete _timers[id];
    }, delay);
  }

  return id;
}

export function cancel(id: string): boolean {
  if (_timers[id]) {
    clearTimeout(_timers[id]);
    delete _timers[id];
    return true;
  }
  return false;
}

export function loadPending(): void {
  try {
    const filePath = getSchedulerPath();
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const record = JSON.parse(line);
        const delay = new Date(record.publishTime).getTime() - Date.now();
        if (delay > 0) {
          _timers[record.id] = setTimeout(() => {
            if (_taskQueue) _taskQueue.add({ platform: record.platform, article: record.article, scheduled: true });
            delete _timers[record.id];
          }, delay);
        }
      } catch (_e) { /* ignore */ }
    }
  } catch (_e) { /* ignore */ }
}

export function clearAll(): void {
  for (const id of Object.keys(_timers)) {
    clearTimeout(_timers[id]);
    delete _timers[id];
  }
}