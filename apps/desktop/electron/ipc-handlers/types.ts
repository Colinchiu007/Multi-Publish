/**
 * IPC Handler 共享类型定义
 * Layer 2: ipc-handlers — Electron IPC 通信层
 */

import type { IpcMain, BrowserWindow } from "electron";

/** IPC Handler 依赖 */
export interface IpcHandlerDeps {
  taskQueue: {
    add: (opts: { platform: string; article: unknown; retry?: number; timeout?: number; accountId?: string | null }) => string;
    getStatus: () => unknown;
    getHistory: () => unknown;
    cancel: (id: string) => boolean;
    retry: (id: string) => string | null;
  };
  store: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
    list: (prefix: string) => unknown[];
  };
  log: { info: (msg: string) => void; warn: (msg: string) => void; error: (tag: string, msg: string) => void };
  BrowserWindow: typeof BrowserWindow;
  [key: string]: unknown;
}

/** IPC Handler 注册函数签名 */
export type IpcHandlerRegistration = (ipcMain: IpcMain, deps: IpcHandlerDeps) => void;

/** 标准 IPC 响应格式 */
export interface IpcResponse<T = unknown> {
  code: number;
  data?: T;
  message?: string;
}
