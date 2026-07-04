import { WebContentsView, session, ipcMain, BrowserWindow } from "electron";
import * as path from "path";
import { default as logger } from "./logger";

const QR_SCAN_INTERVAL_MS = 2000;
const QR_REFRESH_INTERVAL_MS = 30000;

export class QrCodeLogin {
  private mainWindow: BrowserWindow | null = null;
  private currentView: WebContentsView | null = null;
  private currentPlatform: string | null = null;
  private _resolveLogin: ((value: any) => void) | null = null;
  private _rejectLogin: ((reason: any) => void) | null = null;
  private _scanTimer: ReturnType<typeof setInterval> | null = null;
  private _refreshTimer: ReturnType<typeof setInterval> | null = null;

  setMainWindow(win: BrowserWindow): void { this.mainWindow = win; }

  startLogin(platform: string, timeout: number = 300000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) { reject(new Error("\u4E3B\u7A97\u53E3\u672A\u521D\u59CB\u5316")); return; }

      const PLATFORM_LOGIN_URLS: Record<string, string> = {};
      try { Object.assign(PLATFORM_LOGIN_URLS, require("@multi-publish/shared-utils/src/platform-definitions").PLATFORM_LOGIN_URLS); } catch {}

      const loginUrl = PLATFORM_LOGIN_URLS[platform];
      if (!loginUrl) { reject(new Error(`\u4E0D\u652F\u6301\u7684\u5E73\u53F0: ${platform}`)); return; }

      this.currentPlatform = platform;
      this._resolveLogin = resolve;
      this._rejectLogin = reject;

      const partition = `persist:qrcode-${platform}-${Date.now()}`;
      const viewSession = session.fromPartition(partition, { cache: true });
      const view = new WebContentsView({
        webPreferences: { session: viewSession, preload: path.join(__dirname, "..", "auth-qrcode-preload.js"), contextIsolation: true, nodeIntegration: false },
      });
      this.currentView = view;

      const bounds = this.mainWindow.getBounds();
      view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
      this.mainWindow.contentView.addChildView(view);
      view.setVisible(true);
      view.webContents.loadURL(loginUrl);

      this.mainWindow.webContents.send("qrcode:started", { platform });

      this._startScanning(view);
    });
  }

  private _startScanning(view: WebContentsView): void {
    this._scanTimer = setInterval(async () => {
      try {
        const result = await view.webContents.executeJavaScript(`(function(){
          var imgs = document.querySelectorAll("img");
          for(var i=0;i<imgs.length;i++){
            var img=imgs[i];
            if(img.width>100&&img.height>100&&(img.alt||"").match(/qr|scan|qrcode/i)){
              return img.src;
            }
          }
          return null;
        })()`);
        if (result && this.mainWindow) {
          this.mainWindow.webContents.send("qrcode:detected", { imageUrl: result });
        }
      } catch { /* ignore */ }
    }, QR_SCAN_INTERVAL_MS);
  }

  close(): void {
    if (this._scanTimer) { clearInterval(this._scanTimer); this._scanTimer = null; }
    if (this._refreshTimer) { clearInterval(this._refreshTimer); this._refreshTimer = null; }
    if (this.currentView) {
      try { this.mainWindow?.contentView.removeChildView(this.currentView); } catch {}
      try { this.currentView.webContents.close(); } catch {}
      this.currentView = null;
    }
    this._resolveLogin = null;
    this._rejectLogin = null;
  }

  registerIpcHandlers(): void {
    ipcMain.handle("qrcode:start", async (_event: any, { platform }: { platform: string }) => {
      try { await this.startLogin(platform); return { code: 0 }; }
      catch (e: any) { return { code: -1, message: e.message }; }
    });
    ipcMain.handle("qrcode:close", () => { this.close(); return { code: 0 }; });
  }
}