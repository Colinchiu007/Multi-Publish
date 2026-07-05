/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 hotkeys.js (JS 版) 替代。
 */

import { globalShortcut, BrowserWindow } from "electron";

export interface ShortcutConfig {
  route: string;
  label: string;
}

interface ShortcutEntry {
  accelerator: string;
  route: string;
  label: string;
}

const SHORTCUTS: Record<string, ShortcutConfig> = {
  "CmdOrCtrl+Alt+P": { route: "/publish", label: "鍙戝竷" },
  "CmdOrCtrl+Alt+M": { route: "/monitor", label: "鍒嗗睆鐩戞帶" },
  "CmdOrCtrl+Alt+D": { route: "/dashboard", label: "鏁版嵁鐪嬫澘" },
  "CmdOrCtrl+Alt+C": { route: "/collection", label: "鍐呭閲囬泦" },
  "CmdOrCtrl+Alt+H": { route: "/", label: "棣栭〉" },
  "CmdOrCtrl+Alt+N": { route: "/publish", label: "鏂板缓鍙戝竷" },
  "CmdOrCtrl+Alt+A": { route: "/accounts", label: "璐﹀彿绠＄悊" },
  "CmdOrCtrl+Alt+K": { route: "/keywords", label: "鍏抽敭璇嶇洃娴? },
  "CmdOrCtrl+Alt+V": { route: "/viral-analysis", label: "鐖嗘鍒嗘瀽" },
  "CmdOrCtrl+Comma": { route: "/accounts", label: "璁剧疆" },
  "CmdOrCtrl+Alt+Q": { route: "__quit__", label: "閫€鍑? },
};

let registered = false;

export function register(): void {
  if (registered) return;

  for (const [accelerator, config] of Object.entries(SHORTCUTS)) {
    try {
      globalShortcut.register(accelerator, () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (!win || win.isDestroyed()) return;

        if (config.route === "__quit__") {
          win.destroy();
          return;
        }

        if (win.isMinimized()) win.restore();
        if (!win.isVisible()) win.show();
        win.focus();

        win.webContents.send("app:navigate", config.route);
        const log = require("./logger");
        log.info("HotKeys", `${accelerator} 鈫?${config.label}`);
      });
    } catch (e: unknown) {
      const log = require("./logger");
      log.warn("HotKeys", `Failed to register ${accelerator}: ${(e as Error).message}`);
    }
  }

  registered = true;
  const log = require("./logger");
  log.info("HotKeys", `${Object.keys(SHORTCUTS).length} shortcuts registered`);
}

export function unregister(): void {
  globalShortcut.unregisterAll();
  registered = false;
  const log = require("./logger");
  log.info("HotKeys", "All shortcuts unregistered");
}

export function getShortcuts(): ShortcutEntry[] {
  return Object.entries(SHORTCUTS).map(([key, val]) => ({
    accelerator: key,
    ...val,
  }));
}
