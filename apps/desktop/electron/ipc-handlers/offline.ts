import type { IpcMain } from "electron";
interface OfflineDeps { offlineManager: { getQueue: () => Promise<unknown[]>; publish: (item: unknown) => Promise<unknown>; cancel: (id: string) => Promise<void>; getStatus: () => Promise<unknown> } }
export default function registerHandlers(ipcMain: IpcMain, deps: OfflineDeps): void {
  const { offlineManager } = deps;
  ipcMain.handle("offline:queue", async () => { try { return { code: 0, data: await offlineManager.getQueue() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("offline:publish", async (_, item: unknown) => { try { return { code: 0, data: await offlineManager.publish(item) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("offline:cancel", async (_, id: string) => { try { await offlineManager.cancel(id); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("offline:status", async () => { try { return { code: 0, data: await offlineManager.getStatus() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}