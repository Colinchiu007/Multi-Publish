import type { IpcMain } from "electron";

interface SensitiveDeps {
  _sensitiveFilter: { check: (text: string) => unknown; replace: (text: string) => unknown };
}

export default function registerHandlers(ipcMain: IpcMain, deps: SensitiveDeps): void {
  const { _sensitiveFilter } = deps;
  ipcMain.handle("sensitive:check", async (_, { text }: { text: string }) => {
    try { const result = _sensitiveFilter.check(text || ""); return { code: 0, data: result }; }
    catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) }; }
  });
  ipcMain.handle("sensitive:replace", async (_, { text }: { text: string }) => {
    try { const result = _sensitiveFilter.replace(text || ""); return { code: 0, data: result }; }
    catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) }; }
  });
}