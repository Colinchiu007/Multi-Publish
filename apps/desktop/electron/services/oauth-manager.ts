/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 oauth-manager.js (JS 版) 替代。
 */

import { WebContentsView, session, ipcMain, BrowserWindow } from "electron";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { default as logger } from "./logger";

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

interface OAuthConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  redirectPort: number;
}

interface TokenRecord {
  platform: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
  createdAt: number;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

export type PlatformName = "youtube" | "tiktok" | "weibo" | "douyin";

const OAUTH_CONFIGS: Record<PlatformName, OAuthConfig> = {
  youtube: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"],
    clientId: "",
    redirectPort: 16522,
  },
  tiktok: {
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.upload", "video.publish"],
    clientId: "",
    redirectPort: 16523,
  },
  weibo: {
    authorizeUrl: "https://api.weibo.com/oauth2/authorize",
    tokenUrl: "https://api.weibo.com/oauth2/access_token",
    scopes: ["all"],
    clientId: "",
    redirectPort: 16524,
  },
  douyin: {
    authorizeUrl: "https://open.douyin.com/platform/oauth/connect",
    tokenUrl: "https://open.douyin.com/oauth/access_token/",
    scopes: ["user_info", "video.create", "video.upload"],
    clientId: "",
    redirectPort: 16525,
  },
};

export class OAuthManager {
  private mainWindow: BrowserWindow | null = null;
  private store: any;
  private currentView: WebContentsView | null = null;
  private currentPlatform: string | null = null;
  private _resolveAuth: ((value: any) => void) | null = null;
  private _rejectAuth: ((reason: any) => void) | null = null;
  private _callbackServer: http.Server | null = null;
  private _loginTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(store: any) {
    this.store = store;
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  startAuth(platform: string, credentials: OAuthCredentials, timeout: number = 300000): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.mainWindow) {
        reject(new Error("\u4E3B\u7A97\u53E3\u672A\u521D\u59CB\u5316"));
        return;
      }

      const config = OAUTH_CONFIGS[platform as PlatformName];
      if (!config) {
        reject(new Error(`\u4E0D\u652F\u6301\u7684\u5E73\u53F0: ${platform}`));
        return;
      }

      this._resolveAuth = resolve;
      this._rejectAuth = reject;
      this.currentPlatform = platform;

      const redirectUri = `http://127.0.0.1:${config.redirectPort}/oauth/callback`;
      const clientId = credentials?.clientId || config.clientId || "";
      const state = Date.now().toString(36);

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: config.scopes.join(" "),
        state,
        access_type: "offline",
        prompt: "consent",
      });

      const authUrl = `${config.authorizeUrl}?${params.toString()}`;
      this._startCallbackServer(platform, config, state, credentials);

      const viewSession = session.fromPartition(`persist:oauth-${platform}-${Date.now()}`, { cache: true });
      const view = new WebContentsView({
        webPreferences: {
          session: viewSession,
          preload: path.join(__dirname, "..", "auth-qrcode-preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });
      this.currentView = view;

      const bounds = this.mainWindow.getBounds();
      const vw = Math.min(480, bounds.width - 40);
      const vh = Math.min(640, bounds.height - 100);
      view.setBounds({
        x: Math.max(0, Math.floor((bounds.width - vw) / 2)),
        y: 56 + Math.max(0, Math.floor((bounds.height - 56 - vh) / 2)),
        width: vw, height: vh,
      });

      this.mainWindow.contentView.addChildView(view);
      view.setVisible(true);
      view.webContents.loadURL(authUrl);
      this.mainWindow.webContents.send("oauth:opened", { platform, authUrl });

      if (timeout > 0) {
        this._loginTimeout = setTimeout(() => {
          this.close();
          reject(new Error(`${platform} OAuth \u6388\u6743\u8D85\u65F6\uFF08${Math.round(timeout / 1000 / 60)} \u5206\u949F\uFF09`));
        }, timeout);
      }

      logger.info("OAuthManager", `Started OAuth for ${platform}, redirect port ${config.redirectPort}`);
    });
  }

  private _startCallbackServer(platform: string, config: OAuthConfig, expectedState: string, credentials: OAuthCredentials): void {
    this._callbackServer = http.createServer((req, res) => {
      const urlObj = new URL(req.url || "/", `http://127.0.0.1:${config.redirectPort}`);
      if (urlObj.pathname !== "/oauth/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = urlObj.searchParams.get("code");
      const state = urlObj.searchParams.get("state");
      const error = urlObj.searchParams.get("error");

      if (error || !code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<html><body><h3>\u6388\u6743\u5931\u8D25</h3><p>${error || "\u7F3A\u5C11\u6388\u6743\u7801"}</p><p>\u53EF\u4EE5\u5173\u95ED\u6B64\u7A97\u53E3</p></body></html>`);
        this._onAuthFailed(new Error(error || "\u7F3A\u5C11\u6388\u6743\u7801"));
        return;
      }

      if (state !== expectedState) {
        logger.warn("OAuthManager", "State mismatch, possible CSRF");
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<html><body><h3>\u6388\u6743\u6210\u529F\uFF01</h3><p>\u6B63\u5728\u83B7\u53D6 Token\uFF0C\u8BF7\u7A0D\u5019...</p><script>window.close()</script></body></html>`);

      if (code) {
        this._exchangeToken(platform, code, config.redirectPort, expectedState, credentials);
      }
    });

    this._callbackServer.listen(config.redirectPort, "127.0.0.1", () => {
      logger.info("OAuthManager", `Callback server listening on port ${config.redirectPort}`);
    });
  }

  private async _exchangeToken(platform: string, code: string, port: number, _state: string, credentials: OAuthCredentials): Promise<void> {
    const config = OAUTH_CONFIGS[platform as PlatformName];
    if (!config) return;

    const redirectUri = `http://127.0.0.1:${port}/oauth/callback`;
    const clientId = credentials?.clientId || "";
    const clientSecret = credentials?.clientSecret || "";

    try {
      const postData = new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: "authorization_code",
      }).toString();

      const tokenUrl = new URL(config.tokenUrl);
      const options = {
        hostname: tokenUrl.hostname, port: 443,
        path: tokenUrl.pathname + tokenUrl.search,
        method: "POST" as const,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const tokenData: TokenResponse = await new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
          let data = "";
          res.on("data", (chunk: string) => { data += chunk; });
          res.on("end", () => {
            try { resolve(JSON.parse(data)); } catch (e) { reject(new Error(`Token response: ${data.slice(0, 200)}`)); }
          });
        });
        req.on("error", reject);
        req.write(postData);
        req.end();
      });

      if (tokenData.error) {
        this._onAuthFailed(new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`));
        return;
      }

      const tokenRecord: TokenRecord = {
        platform,
        accessToken: tokenData.access_token || "",
        refreshToken: tokenData.refresh_token || "",
        expiresIn: tokenData.expires_in || 3600,
        scope: tokenData.scope || "",
        tokenType: tokenData.token_type || "Bearer",
        createdAt: Date.now(),
      };

      const accountId = `oauth-${platform}-${Date.now()}`;
      this.store.addAccount({
        id: accountId, platform,
        name: `${platform} (OAuth)`, cookies: [],
        localStorage: { oauth_token: JSON.stringify(tokenRecord) },
      });

      this._onAuthSuccess(accountId, platform, tokenRecord);
    } catch (e: unknown) {
      logger.error("OAuthManager", `Token exchange failed for ${platform}: ${(e as Error).message}`);
      this._onAuthFailed(e as Error);
    }
  }

  private _onAuthSuccess(accountId: string, platform: string, tokenData: TokenRecord): void {
    if (this._loginTimeout) { clearTimeout(this._loginTimeout); this._loginTimeout = null; }
    logger.info("OAuthManager", `Auth success for ${platform}: ${accountId}`);

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:completed", {
        platform, accountId,
        tokenData: { type: tokenData.tokenType, scope: tokenData.scope, expiresIn: tokenData.expiresIn },
      });
    }

    if (this._resolveAuth) this._resolveAuth({ accountId, platform, tokenData });
    this._resolveAuth = null;
    this._rejectAuth = null;
    this.close();
  }

  private _onAuthFailed(error: Error): void {
    logger.error("OAuthManager", `Auth failed: ${error.message}`);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:failed", { message: error.message });
    }
    if (this._rejectAuth) this._rejectAuth(error);
    this._resolveAuth = null;
    this._rejectAuth = null;
    this.close();
  }

  close(): void {
    this._stopCallbackServer();
    if (this._loginTimeout) { clearTimeout(this._loginTimeout); this._loginTimeout = null; }

    if (this.currentView) {
      try { this.mainWindow?.contentView.removeChildView(this.currentView); } catch (_e) { /* ignore */ }
      try { this.currentView.webContents.close(); } catch (_e) { /* ignore */ }
      try { (this.currentView.webContents as any).destroy(); } catch (_e) { /* ignore */ }
      this.currentView = null;
    }

    this.currentPlatform = null;
    this._resolveAuth = null;
    this._rejectAuth = null;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("oauth:closed");
    }
    logger.info("OAuthManager", "Closed");
  }

  registerIpcHandlers(): void {
    ipcMain.handle("oauth:start", async (_event: any, { platform, credentials }: { platform: string; credentials: OAuthCredentials }) => {
      try {
        const result = await this.startAuth(platform, credentials);
        return { code: 0, data: result, message: "OAuth \u6388\u6743\u6210\u529F" };
      } catch (e: unknown) {
        return { code: -1, message: (e as Error).message };
      }
    });

    ipcMain.handle("oauth:close", () => {
      this.close();
      return { code: 0 };
    });

    ipcMain.handle("oauth:get-configs", () => {
      const list = Object.entries(OAUTH_CONFIGS).map(([platform, cfg]) => ({
        platform, scopes: cfg.scopes,
        hasClientId: !!cfg.clientId, redirectPort: cfg.redirectPort,
      }));
      return { code: 0, data: list };
    });
  }

  private _stopCallbackServer(): void {
    if (this._callbackServer) {
      try { this._callbackServer.close(); } catch (_e) { /* ignore */ }
      this._callbackServer = null;
    }
  }
}