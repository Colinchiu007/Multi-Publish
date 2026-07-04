import type { IpcMain } from "electron";
interface TemplateDeps { templateManager: { getPresets: () => Promise<unknown[]>; add: (t: unknown) => Promise<unknown>; list: () => Promise<unknown[]>; remove: (id: string) => Promise<void> } }
export default function registerHandlers(ipcMain: IpcMain, deps: TemplateDeps): void {
  const { templateManager } = deps;
  ipcMain.handle("template:list", async () => { try { return { code: 0, data: await templateManager.list() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("template:get-presets", async () => { try { return { code: 0, data: await templateManager.getPresets() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("template:add", async (_, tpl: unknown) => { try { return { code: 0, data: await templateManager.add(tpl) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("template:remove", async (_, id: string) => { try { await templateManager.remove(id); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}