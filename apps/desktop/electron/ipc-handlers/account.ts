import type { IpcMain, BrowserWindow } from "electron";
interface AccountDeps { accountManager: { getToken: (p: string) => Promise<string|null>; refreshToken: (p: string) => Promise<void>; logout: (p: string) => Promise<void>; getAccounts: () => Promise<unknown[]> }; authViewManager: { openLogin: (w: BrowserWindow, p: string) => Promise<void>} }
export default function registerHandlers(ipcMain: IpcMain, deps: AccountDeps): void {
  const { accountManager, authViewManager } = deps;
  ipcMain.handle("account:list", async () => { try { return { code: 0, data: await accountManager.getAccounts() } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
  ipcMain.handle("account:logout", async (_, platform: string) => { try { await accountManager.logout(platform); return { code: 0 } } catch (e: unknown) { return { code: -1, message: e instanceof Error ? e.message : String(e) } } });
}