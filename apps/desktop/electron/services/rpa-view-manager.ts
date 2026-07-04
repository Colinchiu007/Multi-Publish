import { BrowserWindow, session, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { default as logger } from "./logger";

export interface RpaPublishTask {
  platform: string;
  article: {
    title: string;
    content: string;
    video_path?: string | null;
    cover_path?: string | null;
    tags: string[];
    draft: boolean;
  };
  authData?: { cookies: any[]; localStorage?: any };
  timeout?: number;
}

export interface RpaPublishResult {
  success: boolean;
  url?: string;
  error?: string;
}

class ProgressThrottle {
  private _lastTime = 0;
  private _lastPercent = 0;
  private _minInterval: number;
  private _minPercentDelta: number;
  constructor(minInterval = 5000, minPercentDelta = 10) { this._minInterval = minInterval; this._minPercentDelta = minPercentDelta; }
  shouldReport(percent: number): boolean {
    if (percent === 100) return true;
    if (percent - this._lastPercent < this._minPercentDelta && Date.now() - this._lastTime < this._minInterval) return false;
    this._lastTime = Date.now(); this._lastPercent = percent; return true;
  }
  reset(): void { this._lastTime = 0; this._lastPercent = 0; }
}

export class RpaViewManager {
  private _selCache: Map<string, any> = new Map();
  private mainWindow: BrowserWindow | null = null;

  setMainWindow(win: BrowserWindow): void { this.mainWindow = win; }

  async publish(task: RpaPublishTask): Promise<RpaPublishResult> {
    const { platform, article, authData, timeout } = task;
    let win: BrowserWindow | null = null;
    try {
      const platformConfig = this._getPlatformConfig(platform);
      const selectors = this._loadSelectors(platform);
      const partition = `persist:rpa-${platform}-${Date.now()}`;
      const viewSession = session.fromPartition(partition, { cache: true });

      win = new BrowserWindow({
        show: true, width: 1200, height: 900,
        webPreferences: { session: viewSession, preload: path.join(__dirname, "..", "rpa-preload.js"), contextIsolation: true, nodeIntegration: false },
      });

      const STEALTH_SOURCE: string = (() => { try { return require("./stealth-helper").STEALTH_SOURCE; } catch { return ""; } })();
      if (STEALTH_SOURCE) win.webContents.on("did-finish-load", () => { win!.webContents.executeJavaScript(STEALTH_SOURCE).catch(() => {}); });

      if (authData?.cookies?.length) {
        for (const c of authData.cookies) { try { await viewSession.cookies.set(c); } catch {} }
      }

      const publishUrl = platformConfig?.publish_url || "";
      if (!publishUrl) throw new Error(`\u53D1\u5E03\u9875\u9762\u672A\u914D\u7F6E: ${platform}`);

      const maxWait = timeout || 120000;
      await win.loadURL(publishUrl, { userAgent: platformConfig?.user_agent });

      if (selectors?.titleInput) {
        const exists = await this._waitForElement(win, selectors.titleInput, 15000);
        if (!exists) throw new Error("\u6807\u9898\u8F93\u5165\u6846\u672A\u52A0\u8F7D");
        await this._typeText(win, selectors.titleInput, article.title);
      }

      if (selectors?.contentEditor) {
        await this._typeText(win, selectors.contentEditor, article.content);
      }

      if (selectors?.videoInput && article.video_path) {
        const fileInput = await this._waitForElement(win, selectors.videoInput, 20000);
        if (fileInput) await win.webContents.executeJavaScript(`document.querySelector('${selectors.videoInput}').value=''`);
      }

      if (selectors?.submitButton) {
        const btn = await this._waitForElement(win, selectors.submitButton, 30000);
        if (!btn) throw new Error("\u53D1\u5E03\u6309\u94AE\u672A\u52A0\u8F7D");
        await win.webContents.executeJavaScript(`document.querySelector('${selectors.submitButton}').click()`);
      }

      await new Promise((r) => setTimeout(r, 3000));
      logger.info("RpaViewManager", `Published to ${platform}`);
      return { success: true, url: win.webContents.getURL() };
    } catch (e: any) {
      logger.error("RpaViewManager", `${platform} publish failed: ${e.message}`);
      return { success: false, error: e.message };
    } finally {
      if (win && !win.isDestroyed()) try { win.close(); } catch {}
    }
  }

  private _getPlatformConfig(platform: string): any {
    try {
      const PlatformConfig = require("@multi-publish/shared-utils/src/platform-config");
      const cfg = new PlatformConfig();
      return cfg.getPlatform(platform);
    } catch { return {}; }
  }

  private _loadSelectors(platform: string): any {
    if (this._selCache.has(platform)) return this._selCache.get(platform);
    try {
      const { platformSelectors } = require("@multi-publish/rpa-engine");
      const s = platformSelectors[platform];
      this._selCache.set(platform, s);
      return s;
    } catch { return {}; }
  }

  private async _waitForElement(win: BrowserWindow, selector: string, timeout: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      try {
        const found = await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}) !== null`);
        if (found) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    logger.warn("RpaViewManager", `Element not found: ${selector}`);
    return false;
  }

  private async _typeText(win: BrowserWindow, selector: string, text: string): Promise<void> {
    await win.webContents.executeJavaScript(`(function(){
      var el=document.querySelector(${JSON.stringify(selector)});
      if(!el) return;
      if(el.tagName==="DIV"&&el.getAttribute("contenteditable")){
        el.textContent=${JSON.stringify(text)};
        el.dispatchEvent(new Event("input",{bubbles:true}));
      }else{
        el.value=${JSON.stringify(text)};
        el.dispatchEvent(new Event("input",{bubbles:true}));
        el.dispatchEvent(new Event("change",{bubbles:true}));
      }
    })()`);
  }

  registerIpcHandlers(): void {
    ipcMain.handle("rpa:publish", async (_event: any, task: RpaPublishTask) => {
      return await this.publish(task);
    });
  }
}