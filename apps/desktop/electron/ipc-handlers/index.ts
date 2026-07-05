/**
 * IPC handlers 注册中心 — TypeScript 版
 * 将所有 ipcMain.handle 调用从 main.js 拆分到独立模块
 */

import type { IpcMain } from "electron";
import type { IpcHandlerDeps } from "./types";

import registerStore from "./store";
import registerProxy from "./proxy";
import registerAccount from "./account";
import registerKeyword from "./keyword";
import registerPublish from "./publish";
import registerAnalytics from "./analytics";
import registerSync from "./sync";
import registerUpdate from "./update";
import registerUpload from "./upload";
import registerScheduler from "./scheduler";
import registerSensitive from "./sensitive";
import registerRender from "./render";
import registerPlatform from "./platform";
import registerTemplates from "./templates";
import registerLicense from "./license";
import registerAi from "./ai";
import registerOffline from "./offline";
import registerPayment from "./payment";
import registerMisc from "./misc";

type HandlerModule = {
  default: (ipcMain: IpcMain, deps: IpcHandlerDeps) => void;
};

const handlers: Array<() => HandlerModule> = [
  () => require("./store"),
  () => require("./proxy"),
  () => require("./account"),
  () => require("./keyword"),
  () => require("./publish"),
  () => require("./analytics"),
  () => require("./sync"),
  () => require("./update"),
  () => require("./upload"),
  () => require("./scheduler"),
  () => require("./sensitive"),
  () => require("./render"),
  () => require("./platform"),
  () => require("./templates"),
  () => require("./license"),
  () => require("./ai"),
  () => require("./offline"),
  () => require("./payment"),
  () => require("./misc"),
];

export function registerAllHandlers(ipcMain: IpcMain, deps: IpcHandlerDeps): void {
  handlers.forEach((h) => h().default(ipcMain, deps));
}
