/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 system-tray.js (JS 版) 替代。
 */

import { app, Menu, Tray, nativeImage, BrowserWindow } from "electron";
import * as path from "path";
import { default as logger } from "./logger";

let _tray: Tray | null = null;
let _mainWindow: BrowserWindow | null = null;

export function init(mainWin: BrowserWindow): void {
  _mainWindow = mainWin;

  try {
    const iconPath = path.join(__dirname, "..", "assets", "icon.png");
    const icon = nativeImage.createFromPath(iconPath);
    _tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "\u6253\u5F00\u4E3B\u7A97\u53E3",
        click: () => {
          if (_mainWindow) {
            _mainWindow.show();
            _mainWindow.focus();
          }
        },
      },
      { type: "separator" },
      {
        label: "\u53D1\u5E03\u72B6\u6001",
        click: () => {
          if (_mainWindow && !_mainWindow.isDestroyed()) {
            _mainWindow.webContents.send("app:navigate", "/publish");
            _mainWindow.show();
          }
        },
      },
      { type: "separator" },
      {
        label: "\u9000\u51FA",
        click: () => {
          app.quit();
        },
      },
    ]);

    _tray.setToolTip("Multi-Publish \u793E\u5A92\u7BA1\u5BB6");
    _tray.setContextMenu(contextMenu);

    _tray.on("double-click", () => {
      if (_mainWindow) {
        _mainWindow.show();
        _mainWindow.focus();
      }
    });

    logger.info("SystemTray", "Tray initialized");
  } catch (e: unknown) {
    logger.warn("SystemTray", `Failed to init tray: ${(e as Error).message}`);
  }
}

export function destroy(): void {
  if (_tray) {
    _tray.destroy();
    _tray = null;
  }
}