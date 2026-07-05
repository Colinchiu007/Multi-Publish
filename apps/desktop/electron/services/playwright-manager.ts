/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 playwright-manager.js (JS 版) 替代。
 */

import { BrowserWindow } from "electron";
import { default as logger } from "./logger";

interface PageCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expires?: string;
}

interface PlayPage {
  _win: BrowserWindow;
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<boolean>;
  addInitScript(fn: Function | string): Promise<void>;
  url(): string;
  context(): { addCookies(cookies: PageCookie[]): Promise<void> };
  close(): Promise<void>;
}

function createPage(timeout?: number): PlayPage {
  const win = new BrowserWindow({
    show: true,
    width: 1200,
    height: 800,
    webPreferences: { contextIsolation: false, nodeIntegration: false, sandbox: true },
  });

  let _closed = false;
  win.on("closed", () => { _closed = true; });
  let _pendingCookies: PageCookie[] = [];

  const page: PlayPage = {
    _win: win,
    async goto(url: string, options: { waitUntil?: string; timeout?: number } = {}) {
      if (_closed) throw new Error("Page already closed");
      await win.loadURL(url);
    },
    async waitForSelector(selector: string, options: { timeout?: number } = {}) {
      const t = options.timeout || 30000;
      const start = Date.now();
      while (Date.now() - start < t) {
        if (_closed) throw new Error("Page closed while waiting");
        try {
          const found = await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}) !== null`);
          if (found) return true;
        } catch { /* retry */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`Timeout waiting for selector: ${selector}`);
    },
    async addInitScript(fn: Function | string) {
      if (_closed) return;
      const code = typeof fn === "function" ? `(${fn.toString()})()` : fn;
      try { await win.webContents.executeJavaScript(code); }
      catch (e: unknown) { logger.warn("playwright-manager", `addInitScript failed: ${(e as Error).message}`); }
    },
    url() { return _closed ? "" : win.webContents.getURL(); },
    context() {
      return {
        addCookies: async (cookies: PageCookie[]) => {
          _pendingCookies = cookies || [];
          for (const c of _pendingCookies) {
            try {
              const cookie: any = {
                url: c.domain ? (c.secure ? "https://" : "http://") + c.domain : win.webContents.getURL(),
                name: c.name, value: c.value, domain: c.domain, path: c.path || "/",
                secure: c.secure || false, httpOnly: c.httpOnly || false, sameSite: c.sameSite || "lax",
              };
              if (c.expires) cookie.expirationDate = Math.floor(new Date(c.expires).getTime() / 1000);
              await win.webContents.session.cookies.set(cookie);
            } catch (e: unknown) { logger.warn("playwright-manager", `setCookie failed for ${c.name}: ${(e as Error).message}`); }
          }
        },
      };
    },
    async close() { if (!_closed && !win.isDestroyed()) win.close(); },
  };

  return page;
}

export async function getContext(): Promise<{ newPage: () => PlayPage }> {
  return { newPage: () => createPage() };
}

export async function launchBrowser(): Promise<{ newPage: () => PlayPage }> {
  logger.warn("playwright-manager", "launchBrowser \u5DF2\u5E9F\u5F03\uFF08P2-E\uFF09\uFF0C\u8BF7\u4F7F\u7528 getContext");
  return { newPage: createPage };
}

export async function closeBrowser(): Promise<void> {
  logger.warn("playwright-manager", "closeBrowser \u5DF2\u5E9F\u5F03\uFF08P2-E\uFF09");
}

export function newPage(): PlayPage {
  return createPage();
}