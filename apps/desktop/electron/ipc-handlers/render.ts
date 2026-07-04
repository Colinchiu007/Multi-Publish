import type { IpcMain } from "electron";
interface RenderDeps { renderEngine: { render: (opts: unknown) => Promise<unknown>; cancel: () => void; getProgress: () => Promise<unknown> } }
export default function registerHandlers(ipcMain: IpcMain, deps: RenderDeps): void {
  const { renderEngine } = deps;
  ipcMain.handle("render:start", async (_, opts: unknown) => { try { return { code: 0, data: await renderEngine.render(opts) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("render:cancel", async () => { try { renderEngine.cancel(); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("render:progress", async () => { try { return { code: 0, data: await renderEngine.getProgress() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}