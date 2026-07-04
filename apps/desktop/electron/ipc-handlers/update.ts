import type { IpcMain } from "electron";

interface UpdateDeps {
  autoUpdater: {
    check: () => void;
    download: () => void;
    quitAndInstall: () => void;
  };
}

export default function registerHandlers(ipcMain: IpcMain, deps: UpdateDeps): void {
  const { autoUpdater } = deps;

  ipcMain.handle("update:check", async () => {
    autoUpdater.check();
    return { code: 0 };
  });

  ipcMain.handle("update:download", async () => {
    autoUpdater.download();
    return { code: 0 };
  });

  ipcMain.handle("update:install", async () => {
    autoUpdater.quitAndInstall();
    return { code: 0 };
  });
}