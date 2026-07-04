import type { IpcMain } from "electron";
interface ProxyDeps { proxyPool: { getProxy: () => Promise<string>; setProxy: (p: string) => Promise<void>; status: () => Promise<unknown> } }
export default function registerHandlers(ipcMain: IpcMain, deps: ProxyDeps): void {
  const { proxyPool } = deps;
  ipcMain.handle("proxy:get", async () => { try { return { code: 0, data: await proxyPool.getProxy() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("proxy:set", async (_, proxy: string) => { try { await proxyPool.setProxy(proxy); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("proxy:status", async () => { try { return { code: 0, data: await proxyPool.status() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}