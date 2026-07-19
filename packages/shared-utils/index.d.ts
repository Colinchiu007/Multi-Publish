/**
 * @multi-publish/shared-utils — 类型声明
 */

// ---- 任务队列 ----
export class TaskQueue {
  constructor(opts?: { maxConcurrent?: number });
  add(task: any): Promise<any>;
  getTasks(): any[];
  getActiveCount(): number;
  getQueueLength(): number;
  pause(): void;
  resume(): void;
  clear(): void;
}

// ---- 聚合桥接 ----
export class AggregatorBridge {
  constructor(opts?: any);
  connect(): Promise<void>;
  disconnect(): void;
  send(data: any): void;
  onMessage(cb: (msg: any) => void): void;
}

// ---- 分块上传 ----
export class ChunkedUploader {
  constructor(opts?: { chunkSize?: number });
  upload(file: string, dest: string): Promise<any>;
  cancel(): void;
  onProgress(cb: (pct: number) => void): void;
}

// ---- 代理池 ----
export class ProxyPool {
  constructor(proxies?: string[]);
  getNext(): string | null;
  add(proxy: string): void;
  remove(proxy: string): void;
  markBad(proxy: string): void;
}

// ---- 分析服务 ----
export class AnalyticsService {
  constructor(opts?: any);
  track(event: string, data?: any): void;
  getStats(): any;
}

// ---- 平台配置 ----
export const PLATFORM_LOGIN_URLS: Record<string, string>;
export const PLATFORM_NAMES: Record<string, string>;
export const PLATFORM_LOGIN_SUCCESS_SELECTORS: Record<string, string>;
export const PLATFORM_LOGIN_SUCCESS_PATTERNS: Record<string, string>;
export const QR_CODE_PLATFORMS: string[];
export const PLATFORM_DASHBOARD_URLS: Record<string, string>;
export function getPlatformName(id: string): string;

export default class PlatformConfig {
  static get(platform: string): any;
  static list(): string[];
}

// ---- 发布间隔守卫 ----
export class PublishIntervalGuard {
  constructor(opts?: { minInterval?: number });
  canPublish(platform: string): boolean;
  markPublished(platform: string): void;
  getNextAvailableTime(platform: string): number;
}

// ---- 定时发布 ----
export interface ScheduledTask {
  id: string;
  platform: string;
  article: Record<string, unknown>;
  status: 'pending' | 'dispatching' | 'executed' | 'failed' | 'cancelled';
  publishTime: string;
  createdAt?: string;
}

export interface Scheduler {
  setTaskQueue(taskQueue: { add(task: unknown): unknown | Promise<unknown> }): void;
  create(schedule: {
    platform: string;
    article: Record<string, unknown>;
    publishTime: string;
  }): ScheduledTask;
  list(): ScheduledTask[];
  cancel(id: string): boolean;
  restore(): number;
  stopAll(): Promise<unknown[]>;
}

export function createScheduler(dependencies: {
  app: { getPath(name: string): string };
  fs?: unknown;
  logger?: {
    error(scope: string, message: string): void;
    warn(scope: string, message: string): void;
  };
}): Scheduler;

// ---- 敏感词过滤 ----
export class SensitiveFilter {
  constructor(rules?: any[]);
  check(text: string): any;
  replace(text: string): any;
}

// ---- 标题优化 ----
export class TitleOptimizer {
  constructor();
  optimize(title: string, options?: any): string[];
}
