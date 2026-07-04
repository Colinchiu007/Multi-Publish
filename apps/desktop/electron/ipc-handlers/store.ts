import type { IpcMain } from "electron";
interface StoreDeps { store: { get: (k: string) => unknown; set: (k: string, v: unknown) => void; delete: (k: string) => void; clear: () => void } }
export default function registerHandlers(ipcMain: IpcMain, deps: StoreDeps): void {
  const { store } = deps;
  ipcMain.handle("store:get", async (_, key: string) => { try { return { code: 0, data: store.get(key) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("store:set", async (_, { key, value }: { key: string; value: unknown }) => { try { store.set(key, value); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("store:delete", async (_, key: string) => { try { store.delete(key); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("store:clear", async () => { try { store.clear(); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}