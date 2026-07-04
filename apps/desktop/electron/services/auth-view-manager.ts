import { BrowserWindow, WebContentsView, session, ipcMain } from "electron";
import * as path from "path";
import { default as logger } from "./logger";

const SIDEBAR_WIDTH = 280;

interface AuthData {
  cookies: any[];
  localStorage: any;
  accountName: string;
}

export class AuthViewManager {
  private mainWindow: BrowserWindow | null = null;
  private currentView: WebContentsView | null = null;
  private currentPlatform: string | null = null;
  private currentAccountId: string | null = null;
  private _resolveLogin: ((value: AuthData | { cancelled: boolean }) => void) | null = null;
  private _rejectLogin: ((reason: any) => void) | null = null;
  private _loginTimeout: ReturnType<typeof setTimeout> | null = null;
  private _escHandler: ((event: any, input: any) => void) | null = null;
  private _resizeHandler: (() => void) | null = null;

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  private _createSession(accountId: string) {
    return session.fromPartition(`persist:auth-${accountId}`, { cache: true });
  }

  openLogin(platform: string, timeout: number = 300000): Promise<AuthData | { cancelled: boolean }> {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) { reject(new Error("\u4E3B\u7A97\u53E3\u672A\u521D\u59CB\u5316")); return; }

      const PLATFORM_LOGIN_URLS: Record<string, string> = {};
      try { Object.assign(PLATFORM_LOGIN_URLS, require("@multi-publish/shared-utils/src/platform-definitions").PLATFORM_LOGIN_URLS); } catch {}

      const loginUrl = PLATFORM_LOGIN_URLS[platform];
      if (!loginUrl) { reject(new Error(`\u4E0D\u652F\u6301\u7684\u5E73\u53F0: ${platform}`)); return; }

      const accountId = `auth-${platform}-${Date.now()}`;
      this.currentPlatform = platform;
      this.currentAccountId = accountId;
      this._resolveLogin = resolve as any;
      this._rejectLogin = reject;

      const authSession = this._createSession(accountId);
      const view = new WebContentsView({
        webPreferences: { session: authSession, preload: path.join(__dirname, "..", "auth-preload.js"), contextIsolation: true, nodeIntegration: false },
      });
      this.currentView = view;
      const bounds = this.mainWindow.getBounds();
      this._positionView(bounds);
      this.mainWindow.contentView.addChildView(view);
      view.setVisible(true);
      view.webContents.loadURL(loginUrl);

      const escHandler = (event: any, input: any) => {
        if (input && input.type === "keyDown" && input.key === "Escape") {
          this.close();
          if (this._resolveLogin) { this._resolveLogin({ cancelled: true }); this._resolveLogin = null; }
        }
      };
      view.webContents.on("before-input-event", escHandler as any);

      this._resizeHandler = () => { if (this.mainWindow) this._positionView(this.mainWindow.getBounds()); };
      this.mainWindow.on("resize", this._resizeHandler);

      if (timeout > 0) {
        this._loginTimeout = setTimeout(() => {
          this.close();
          reject(new Error(`${platform} \u767B\u5F55\u8D85\u65F6\uFF08${Math.round(timeout / 1000 / 60)} \u5206\u949F\uFF09`));
        }, timeout);
      }

      this.mainWindow.webContents.send("auth:view-opened", { platform, accountId });
      logger.info("AuthView", `Opened login for ${platform} (${accountId})`);
    });
  }

  private _positionView(bounds: { width: number; height: number }): void {
    if (!this.currentView) return;
    this.currentView.setBounds({ x: SIDEBAR_WIDTH, y: 120, width: bounds.width - SIDEBAR_WIDTH, height: bounds.height - 120 });
  }

  close(): void {
    if (this._loginTimeout) { clearTimeout(this._loginTimeout); this._loginTimeout = null; }
    if (this.currentView) {
      try { this.mainWindow?.contentView.removeChildView(this.currentView); } catch {}
      try { this.currentView.webContents.close(); } catch {}
      this.currentView = null;
    }
    if (this._resizeHandler && this.mainWindow) { this.mainWindow.removeListener("resize", this._resizeHandler); this._resizeHandler = null; }
    this.currentPlatform = null;
    this._resolveLogin = null;
    this._rejectLogin = null;
    if (this.mainWindow && !this.mainWindow.isDestroyed()) this.mainWindow.webContents.send("auth:view-closed");
  }

  registerIpcHandlers(): void {
    ipcMain.handle("auth:open-login", async (_event: any, { platform }: { platform: string }) => {
      try { const result = await this.openLogin(platform); return { code: 0, data: result }; }
      catch (e: any) { return { code: -1, message: e.message }; }
    });
    ipcMain.handle("auth:close", () => { this.close(); return { code: 0 }; });
  }
}