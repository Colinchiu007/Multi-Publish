import type { IpcMain, BrowserWindow } from "electron";

interface MiscDeps {
  app: { getVersion: () => string };
  hotkeys: { getShortcuts: () => unknown[] };
  firstRun: { checkDeps: () => unknown };
  BrowserWindow: typeof BrowserWindow;
  log: { info: (msg: string) => void };
}

export default function registerHandlers(ipcMain: IpcMain, deps: MiscDeps): void {
  const { app, hotkeys, firstRun, BrowserWindow, log } = deps;
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("app:get-platform", () => process.platform);
  ipcMain.handle("hotkeys:list", async () => ({ code: 0, data: hotkeys.getShortcuts() }));
  ipcMain.handle("first-run:check", async () => ({ code: 0, data: firstRun.checkDeps() }));
  ipcMain.handle("show-notification", async (_, data: unknown) => {
    try {
      const win = BrowserWindow.getAllWindows()[0];
      if (win && !win.isDestroyed()) win.webContents.send("notification", data);
    } catch (e) { /* ignore */ }
  });
}