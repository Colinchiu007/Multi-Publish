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
  "CmdOrCtrl+Alt+P": { route: "/publish", label: "发布" },
  "CmdOrCtrl+Alt+M": { route: "/monitor", label: "分屏监控" },
  "CmdOrCtrl+Alt+D": { route: "/dashboard", label: "数据看板" },
  "CmdOrCtrl+Alt+C": { route: "/collection", label: "内容采集" },
  "CmdOrCtrl+Alt+H": { route: "/", label: "首页" },
  "CmdOrCtrl+Alt+N": { route: "/publish", label: "新建发布" },
  "CmdOrCtrl+Alt+A": { route: "/accounts", label: "账号管理" },
  "CmdOrCtrl+Alt+K": { route: "/keywords", label: "关键词监测" },
  "CmdOrCtrl+Alt+V": { route: "/viral-analysis", label: "爆款分析" },
  "CmdOrCtrl+Comma": { route: "/accounts", label: "设置" },
  "CmdOrCtrl+Alt+Q": { route: "__quit__", label: "退出" },
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
        log.info("HotKeys", `${accelerator} → ${config.label}`);
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
