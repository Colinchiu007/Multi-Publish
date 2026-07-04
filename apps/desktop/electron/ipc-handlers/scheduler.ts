import type { IpcMain } from "electron";

interface SchedulerDeps {
  scheduler: {
    create: (opts: { platform: string; article: unknown; publishTime: string }) => unknown;
    list: () => unknown[];
    cancel: (id: string) => void;
  };
}

export default function registerHandlers(ipcMain: IpcMain, deps: SchedulerDeps): void {
  const { scheduler } = deps;
  ipcMain.handle("scheduler:create", async (_, { platform, article, publishTime }: { platform: string; article: unknown; publishTime: string }) => {
    try {
      const entry = scheduler.create({ platform, article, publishTime });
      return { code: 0, data: entry, message: "定时任务已创建" };
    } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) }; }
  });
  ipcMain.handle("scheduler:list", async () => {
    try { return { code: 0, data: scheduler.list() }; } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e), data: [] }; }
  });
  ipcMain.handle("scheduler:cancel", async (_, id: string) => {
    scheduler.cancel(id);
    return { code: 0, message: "定时任务已取消" };
  });
}