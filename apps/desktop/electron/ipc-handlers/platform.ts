import { type IpcMain, BrowserWindow } from "electron";
interface PlatformDeps { _platformStates: Map<string, unknown>; authViewManager: { openLogin: (w: BrowserWindow, p: string) => Promise<void> }; platformPublish: (p: string, a: unknown) => Promise<unknown> }
export default function registerHandlers(ipcMain: IpcMain, deps: PlatformDeps): void {
  const { _platformStates, authViewManager, platformPublish } = deps;
  ipcMain.handle("platform:login", async (event, platform: string) => { try { const win = BrowserWindow.fromWebContents(event.sender); if (win) await authViewManager.openLogin(win, platform); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("platform:publish", async (_, { platform, article }: { platform: string; article: unknown }) => { try { return { code: 0, data: await platformPublish(platform, article) } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}