/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 batch-manager.js (JS 版) 替代。
 */

import { ipcMain, BrowserWindow } from "electron";
import { default as logger } from "./logger";

interface BatchArticle {
  title: string;
  content: string;
  author?: string;
  cover_url?: string;
  video_path?: string;
  publishTime?: string;
  platforms: Array<string | { platform: string; accountId?: string }>;
}

interface BatchRecord {
  id: string;
  name: string;
  articles: BatchArticle[];
  total: number;
  completed: number;
  failed: number;
  status: string;
}

let _taskQueue: any = null;

export class BatchManager {
  private store: any;

  constructor(store: any) {
    this.store = store;
  }

  static setTaskQueue(taskQueue: any): void {
    _taskQueue = taskQueue;
  }

  createBatch(batch: { articles: BatchArticle[]; name?: string }): string {
    const id = `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const record: BatchRecord = {
      id,
      name: batch.name || `\u6279\u91CF\u53D1\u5E03 ${new Date().toLocaleDateString("zh-CN")}`,
      articles: batch.articles || [],
      total: (batch.articles || []).length,
      completed: 0,
      failed: 0,
      status: "pending",
    };

    this.store.addBatchJob(record);
    logger.info("BatchManager", `Created batch ${id}: ${record.total} articles`);
    return id;
  }

  async executeBatch(batchId: string): Promise<boolean> {
    const batch = this.store.getBatchJob(batchId);
    if (!batch) {
      logger.warn("BatchManager", `Batch ${batchId} not found`);
      return false;
    }

    this.store.updateBatchJob(batchId, { status: "running" });

    for (const article of batch.articles) {
      if (!article.platforms || article.platforms.length === 0) continue;

      for (const platform of article.platforms) {
        try {
          const platformId = typeof platform === "object" ? platform.platform : platform;
          const accountId = typeof platform === "object" ? (platform.accountId || null) : null;

          const taskId = _taskQueue.add({
            platform: platformId,
            article: {
              title: article.title,
              content: article.content,
              author: article.author || "",
              cover_url: article.cover_url || "",
              video_path: article.video_path || "",
              accountId,
            },
            batchId,
            retry: 2,
          });

          _taskQueue.once(`task:${taskId}:done`, (result: any) => {
            const current = this.store.getBatchJob(batchId);
            if (!current) return;
            const updates: any = {
              completed: (current.completed || 0) + 1,
            };
            if (result && result.error) {
              updates.failed = (current.failed || 0) + 1;
            }
            updates.status = updates.completed >= current.total ? "done" : "running";
            this.store.updateBatchJob(batchId, updates);
            this._emitProgress(batchId, String(platform), article.title, result);
          });
        } catch (e: unknown) {
          logger.error("BatchManager", `Failed to submit ${platform}: ${(e as Error).message}`);
          const current = this.store.getBatchJob(batchId);
          if (current) {
            this.store.updateBatchJob(batchId, {
              failed: (current.failed || 0) + 1,
              completed: (current.completed || 0) + 1,
            });
          }
        }
      }
    }

    return true;
  }

  duplicateArticle(article: any): any {
    return { ...article, title: `${article.title} (\u590D\u5236)`, id: undefined };
  }

  scheduleBatch(batchId: string): boolean {
    const batch = this.store.getBatchJob(batchId);
    if (!batch) return false;

    for (const article of batch.articles) {
      if (!article.publishTime || !article.platforms) continue;
      const delay = new Date(article.publishTime).getTime() - Date.now();
      if (delay <= 0) {
        for (const platform of article.platforms) {
          _taskQueue.add({ platform, article, batchId });
        }
        continue;
      }
      setTimeout(() => {
        for (const platform of article.platforms) {
          _taskQueue.add({ platform, article, batchId });
        }
      }, delay);
    }

    this.store.updateBatchJob(batchId, { status: "scheduled" });
    logger.info("BatchManager", `Batch ${batchId} scheduled (${batch.articles.length} articles)`);
    return true;
  }

  private _emitProgress(batchId: string, platform: string, title: string, result: any): void {
    const wins = BrowserWindow.getAllWindows();
    const win = wins[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send("batch:progress", {
        batchId, platform, title,
        ok: !result?.error,
        message: result?.error || "\u53D1\u5E03\u6210\u529F",
        timestamp: Date.now(),
      });
    }
  }

  registerIpcHandlers(): void {
    ipcMain.handle("batch:create", (_event: any, batch: any) => {
      try {
        const id = this.createBatch(batch);
        return { code: 0, data: { id } };
      } catch (e: unknown) {
        return { code: -1, message: (e as Error).message };
      }
    });

    ipcMain.handle("batch:execute", async (_event: any, batchId: string) => {
      try {
        await this.executeBatch(batchId);
        return { code: 0 };
      } catch (e: unknown) {
        return { code: -1, message: (e as Error).message };
      }
    });

    ipcMain.handle("batch:schedule", (_event: any, batchId: string) => {
      const ok = this.scheduleBatch(batchId);
      return ok ? { code: 0 } : { code: -1, message: "\u6279\u91CF\u4EFB\u52A1\u4E0D\u5B58\u5728" };
    });

    ipcMain.handle("batch:list", () => {
      return { code: 0, data: this.store.listBatchJobs() };
    });

    ipcMain.handle("batch:get", (_event: any, id: string) => {
      const batch = this.store.getBatchJob(id);
      return batch ? { code: 0, data: batch } : { code: -1, message: "\u672A\u627E\u5230" };
    });

    ipcMain.handle("batch:delete", (_event: any, id: string) => {
      this.store.deleteBatchJob(id);
      return { code: 0 };
    });

    ipcMain.handle("batch:duplicate-article", (_event: any, article: BatchArticle) => {
      return { code: 0, data: this.duplicateArticle(article) };
    });
  }
}