/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 auto-updater.js (JS 版) 替代。
 */

import { autoUpdater } from "electron-updater";
import { BrowserWindow } from "electron";
import { default as logger } from "./logger";

let _mainWin: BrowserWindow | null = null;
let _statusCallback: ((status: string, progress?: number) => void) | null = null;

export function init(mainWin: BrowserWindow): void {
  _mainWin = mainWin;
  autoUpdater.autoDownload = false;

  autoUpdater.on("checking-for-update", () => {
    logger.info("AutoUpdater", "Checking for updates...");
    _sendStatus("checking");
  });

  autoUpdater.on("update-available", (info: any) => {
    logger.info("AutoUpdater", `Update available: ${info.version}`);
    _sendStatus("available", info.version);
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send("update:available", { version: info.version, releaseNotes: info.releaseNotes });
    }
  });

  autoUpdater.on("update-not-available", () => {
    logger.info("AutoUpdater", "No update available");
    _sendStatus("up-to-date");
  });

  autoUpdater.on("download-progress", (progress: any) => {
    _sendStatus("downloading", progress.percent || 0);
  });

  autoUpdater.on("update-downloaded", (info: any) => {
    logger.info("AutoUpdater", `Update downloaded: ${info.version}`);
    _sendStatus("downloaded", info.version);
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send("update:downloaded", { version: info.version });
    }
  });

  autoUpdater.on("error", (err: Error) => {
    logger.warn("AutoUpdater", `Error: ${err.message}`);
    _sendStatus("error", err.message);
  });
}

export function check(): void {
  try {
    autoUpdater.checkForUpdates().catch((_e: Error) => { /* GFW fallback */ });
  } catch (e: unknown) {
    logger.warn("AutoUpdater", `Check failed: ${(e as Error).message}`);
  }
}

export function downloadAndInstall(): void {
  autoUpdater.downloadUpdate()
    .then(() => {
      setImmediate(() => { autoUpdater.quitAndInstall(); });
    })
    .catch((err: Error) => {
      logger.error("AutoUpdater", `Download failed: ${err.message}`);
    });
}

function _sendStatus(status: string, data?: any): void {
  if (_statusCallback) _statusCallback(status, data);
}

export function onStatus(cb: (status: string, data?: any) => void): void {
  _statusCallback = cb;
}