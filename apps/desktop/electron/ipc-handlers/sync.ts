import type { IpcMain } from "electron";
interface SyncDeps { syncManager: { sync: (dir: string) => Promise<unknown>; status: () => Promise<unknown>; getConflicts: () => Promise<unknown[]> } }
export default function registerHandlers(ipcMain: IpcMain, deps: SyncDeps): void {
  const { syncManager } = deps;
  ipcMain.handle("sync:start", async (_, dir: string) => { try { return { code: 0, data: await syncManager.sync(dir) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("sync:status", async () => { try { return { code: 0, data: await syncManager.status() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("sync:conflicts", async () => { try { return { code: 0, data: await syncManager.getConflicts() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}