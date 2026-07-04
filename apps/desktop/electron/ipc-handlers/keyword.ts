import type { IpcMain } from "electron";
interface KeywordDeps { keywordMonitor: { start: (kw: string, opts: unknown) => Promise<unknown>; stop: (kw: string) => Promise<unknown>; status: () => Promise<unknown>; history: (kw: string) => Promise<unknown[]> } }
export default function registerHandlers(ipcMain: IpcMain, deps: KeywordDeps): void {
  const { keywordMonitor } = deps;
  ipcMain.handle("keyword:status", async () => { try { return { code: 0, data: await keywordMonitor.status() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("keyword:start", async (_, { keyword, options }: { keyword: string; options: unknown }) => { try { return { code: 0, data: await keywordMonitor.start(keyword, options) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("keyword:stop", async (_, keyword: string) => { try { return { code: 0, data: await keywordMonitor.stop(keyword) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("keyword:history", async (_, keyword: string) => { try { return { code: 0, data: await keywordMonitor.history(keyword) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}