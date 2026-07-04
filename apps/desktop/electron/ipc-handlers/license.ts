import type { IpcMain } from "electron";
interface LicenseDeps { licenseManager: { validate: (key: string) => Promise<{valid: boolean; message?: string}>; deactivate: () => Promise<void>; getStatus: () => Promise<{licensed: boolean; type?: string}> }; store: { get: (k: string) => unknown; set: (k: string, v: unknown) => void } }
export default function registerHandlers(ipcMain: IpcMain, deps: LicenseDeps): void {
  const { licenseManager, store } = deps;
  ipcMain.handle("license:validate", async (_, key: string) => { try { return { code: 0, data: await licenseManager.validate(key) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("license:deactivate", async () => { try { await licenseManager.deactivate(); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("license:status", async () => { try { return { code: 0, data: await licenseManager.getStatus() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("license:reset-cache", async () => { store.set("license_cache", null); return { code: 0 } });
}