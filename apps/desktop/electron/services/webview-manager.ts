import { WebContentsView, session, ipcMain, BrowserWindow } from "electron";
import * as path from "path";
import { default as logger } from "./logger";

interface TabInfo {
  id: string;
  platform: string;
  accountId: string | null;
  view: WebContentsView;
  label: string;
}

interface TabPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class WebviewManager {
  private mainWindow: BrowserWindow | null = null;
  private tabs: TabInfo[] = [];
  private layout: number = 1;
  private _nextTabId: number = 1;

  setMainWindow(win: BrowserWindow): void { this.mainWindow = win; }

  setLayout(count: number): void {
    if (![1, 2, 3, 4, 6].includes(count)) return;
    this.layout = count;
    this._repositionAll();
    this._emit("webview:layout-changed", { layout: count, tabCount: this.tabs.length });
  }

  openTab(platform: string, accountId?: string | null, cookies?: any[], localStorage?: any, customUrl?: string): string | null {
    if (!this.mainWindow) return null;
    const url = customUrl || (() => {
      try { return require("@multi-publish/shared-utils/src/platform-definitions").PLATFORM_DASHBOARD_URLS[platform]; }
      catch { return null; }
    })();
    if (!url) { logger.warn("WebviewManager", `No dashboard URL for platform: ${platform}`); return null; }

    const tabId = `tab-${this._nextTabId++}`;
    const partition = `persist:monitor-${accountId || `${platform}-${tabId}`}`;
    const viewSession = session.fromPartition(partition, { cache: true });

    if (cookies?.length) {
      for (const c of cookies) { try { viewSession.cookies.set(c).catch(() => {}); } catch { /* skip */ } }
    }

    const view = new WebContentsView({
      webPreferences: {
        session: viewSession,
        preload: path.join(__dirname, "..", "monitor-preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
      },
    });
    view.setVisible(true);
    this.mainWindow.contentView.addChildView(view);
    view.webContents.loadURL(url);

    if (localStorage && Object.keys(localStorage).length > 0) {
      const lsData = JSON.stringify(localStorage);
      view.webContents.on("did-finish-load", () => {
        view.webContents.executeJavaScript(`(function(){var data=${lsData};Object.keys(data).forEach(function(k){try{localStorage.setItem(k,data[k])}catch(e){}});})()`).catch(() => {});
      });
    }

    view.webContents.on("did-navigate", (_event: any, navUrl: string) => {
      this._emit("webview:navigated", { tabId, platform, url: navUrl });
    });

    const tab: TabInfo = { id: tabId, platform, accountId: accountId || null, view, label: platform };
    this.tabs.push(tab);
    this._repositionAll();
    this._emit("webview:tab-opened", { tabId, platform, accountId, tabCount: this.tabs.length });
    return tabId;
  }

  closeTab(tabId: string): void {
    const idx = this.tabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    const tab = this.tabs[idx];
    try { this.mainWindow?.contentView.removeChildView(tab.view); (tab.view.webContents as any).destroy(); } catch { /* ignore */ }
    this.tabs.splice(idx, 1);
    this._repositionAll();
    this._emit("webview:tab-closed", { tabId, tabCount: this.tabs.length });
  }

  closeAll(): void {
    for (const tab of this.tabs) {
      try { this.mainWindow?.contentView.removeChildView(tab.view); (tab.view.webContents as any).destroy(); } catch { /* ignore */ }
    }
    this.tabs = [];
    this._emit("webview:all-closed", {});
  }

  resize(): void { this._repositionAll(); }

  private _repositionAll(): void {
    if (!this.mainWindow || this.tabs.length === 0) return;
    const bounds = this.mainWindow.getBounds();
    const positions = this._calculatePositions(bounds);
    for (let i = 0; i < this.tabs.length; i++) {
      if (i < positions.length) {
        const pos = positions[i];
        this.tabs[i].view.setBounds({ x: pos.x, y: pos.y, width: pos.width, height: pos.height });
        this.tabs[i].view.setVisible(true);
      } else {
        this.tabs[i].view.setVisible(false);
      }
    }
  }

  private _calculatePositions(bounds: { width: number; height: number }): TabPosition[] {
    const NAV_HEIGHT = 56;
    const GAP = 2;
    const W = bounds.width;
    const H = bounds.height - NAV_HEIGHT;
    const positions: TabPosition[] = [];

    switch (this.layout) {
      case 1: positions.push({ x: 0, y: NAV_HEIGHT, width: W, height: H }); break;
      case 2: {
        const hw = Math.floor((W - GAP) / 2);
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: H });
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: H }); break;
      }
      case 3: {
        const hw = Math.floor((W - GAP) / 2);
        const hh = Math.floor((H - GAP) / 2);
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: hh });
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: hh });
        positions.push({ x: 0, y: NAV_HEIGHT + hh + GAP, width: W, height: H - hh - GAP }); break;
      }
      case 4: {
        const hw = Math.floor((W - GAP) / 2);
        const hh = Math.floor((H - GAP) / 2);
        positions.push({ x: 0, y: NAV_HEIGHT, width: hw, height: hh });
        positions.push({ x: hw + GAP, y: NAV_HEIGHT, width: W - hw - GAP, height: hh });
        positions.push({ x: 0, y: NAV_HEIGHT + hh + GAP, width: hw, height: H - hh - GAP });
        positions.push({ x: hw + GAP, y: NAV_HEIGHT + hh + GAP, width: W - hw - GAP, height: H - hh - GAP }); break;
      }
      case 6: {
        const tw = Math.floor((W - 2 * GAP) / 3);
        const hh = Math.floor((H - GAP) / 2);
        for (let r = 0; r < 2; r++)
          for (let c = 0; c < 3; c++)
            positions.push({ x: c * (tw + GAP), y: NAV_HEIGHT + r * (hh + GAP), width: tw, height: hh });
        break;
      }
    }
    return positions;
  }

  registerIpcHandlers(): void {
    ipcMain.handle("webview:set-layout", (_event: any, count: number) => {
      this.setLayout(count); return { code: 0, data: { layout: count, tabCount: this.tabs.length } };
    });
    ipcMain.handle("webview:open-tab", (_event: any, { platform, accountId, cookies, localStorage, url }: any) => {
      const tabId = this.openTab(platform, accountId, cookies, localStorage, url);
      return tabId ? { code: 0, data: { tabId } } : { code: -1, message: `\u65E0\u6CD5\u6253\u5F00 ${platform}` };
    });
    ipcMain.handle("webview:close-tab", (_event: any, tabId: string) => {
      this.closeTab(tabId); return { code: 0 };
    });
    ipcMain.handle("webview:close-all", () => { this.closeAll(); return { code: 0 }; });
    ipcMain.handle("webview:list-tabs", () => { return { code: 0, data: this.getTabsInfo() }; });
  }

  getTabsInfo(): Array<{ id: string; platform: string; accountId: string | null; label: string }> {
    return this.tabs.map((t) => ({ id: t.id, platform: t.platform, accountId: t.accountId, label: t.label }));
  }

  private _emit(channel: string, data: any): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}