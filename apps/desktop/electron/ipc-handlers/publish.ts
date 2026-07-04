import { type IpcMain } from "electron";
import { ERROR } from "../core/error-codes";

interface PublishDeps {
  taskQueue: { add: (opts: unknown) => string; getStatus: () => unknown; getHistory: () => unknown; cancel: (id: string) => boolean };
  history: { listRecords: (opts: unknown) => unknown; getRecord: (id: string) => unknown | null; getStats: () => unknown };
  BrowserWindow: { getAllWindows: () => Array<{ webContents: { send: (ch: string, d: unknown) => void }; isDestroyed: () => boolean }> };
  log: { info: (msg: string) => void };
}

export default function registerHandlers(ipcMain: IpcMain, deps: PublishDeps): void {
  const EC = ERROR;
  const { taskQueue, history } = deps;

  ipcMain.handle("publish:wechat", async (event, articleData: unknown) => {
    try {
      const offlineManager = require("../offline-manager");
      if (offlineManager.isOffline()) {
        offlineManager.addToCache({ platform: "wechat_mp", article: articleData, accountId: null });
        return { code: 0, data: { cached: true }, message: "网络离线，任务已缓存，恢复后自动发布" };
      }
      const taskId = taskQueue.add({ platform: "wechat_mp", article: articleData, retry: 2, timeout: 180000 });
      return { code: 0, data: { taskId }, message: "任务已加入队列" };
    } catch (e: unknown) { return { code: EC.REQUEST_ERROR, message: e instanceof Error ? e.message : String(e) }; }
  });

  ipcMain.handle("publish:batch", async (_, { platforms, article }: { platforms: Array<string | { platform: string; accountId: string | null }>; article: unknown }) => {
    const isObj = platforms && platforms.length > 0 && typeof platforms[0] === "object";
    const taskIds = (platforms as Array<{ platform: string; accountId: string | null }>).map((p) => {
      const platform = isObj ? (p as { platform: string }).platform : (p as unknown as string);
      const accountId = isObj ? (p as { platform: string; accountId: string | null }).accountId : null;
      return taskQueue.add({ platform, article: { ...((article as Record<string, unknown>) || {}), accountId }, accountId });
    });
    return { code: 0, data: { taskIds }, message: `已添加 ${taskIds.length} 个任务` };
  });

  ipcMain.handle("queue:status", async () => taskQueue.getStatus());
  ipcMain.handle("queue:history", async () => ({ code: 0, data: taskQueue.getHistory() }));
  ipcMain.handle("queue:cancel", async (_, taskId: string) => {
    const ok = taskQueue.cancel(taskId);
    return { code: ok ? 0 : -1, message: ok ? "任务已取消" : "任务不存在或已完成" };
  });

  ipcMain.handle("history:list", async (_, opts: unknown) => {
    try { const result = history.listRecords(opts); return { code: 0, data: result }; }
    catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e), data: { total: 0, records: [] } }; }
  });

  ipcMain.handle("history:get", async (_, id: string) => {
    const record = history.getRecord(id);
    if (!record) return { code: -1, message: "记录不存在" };
    return { code: 0, data: record };
  });

  ipcMain.handle("dashboard:stats", async () => {
    return { code: 0, data: history.getStats() };
  });
}