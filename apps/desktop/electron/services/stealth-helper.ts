/**
 * @deprecated 此文件是 TS 迁移产物，API 与生产使用的 JS 版不兼容。
 * 请使用同目录的 stealth-helper.js (JS 版) 替代。
 */

declare const navigator: any;
declare const window: any;

export function STEALTH_SCRIPT(): void {
  try { delete navigator.__proto__.webdriver; Object.defineProperty(navigator, "webdriver", { value: undefined, writable: false, configurable: true }); }
  catch (_e) { /* ignore */ }
  try {
    const origChrome = window.chrome || {};
    window.chrome = {
      runtime: {
        id: "aohghmighlieiainnegkcijnfilokake",
        connect() { return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} } }; },
        sendMessage() {},
        onMessage: { addListener() {} }, onConnect: { addListener() {} }, lastError: undefined,
      },
      loadTimes() { return {}; }, csi() { return {}; },
      app: origChrome.app || { isInstalled: false, InstallState: { DISABLED: "disabled", INSTALLED: "installed", NOT_INSTALLED: "not_installed" }, RunningState: { CANNOT_RUN: "cannot_run", READY_TO_RUN: "ready_to_run", RUNNING: "running" } },
      webstore: origChrome.webstore || { onInstallStage: { addListener() {} } },
    };
  } catch (_e) { /* ignore */ }
  try {
    const fakePlugins = [
      { name: "Chrome PDF Plugin", filename: "internal-pdf-viewer", description: "Portable Document Format" },
      { name: "Chrome PDF Viewer", filename: "mhjfbmdgcfjbbpaeojofohoefgiehjai", description: "" },
      { name: "Native Client", filename: "internal-nacl-plugin", description: "" },
    ];
    Object.defineProperty(navigator, "plugins", {
      get() {
        const arr: any = [];
        for (let i = 0; i < fakePlugins.length; i++) arr[i] = fakePlugins[i];
        arr.length = fakePlugins.length;
        arr.item = (i: number) => arr[i] || null;
        arr.namedItem = (n: string) => { for (let j = 0; j < arr.length; j++) { if (arr[j].name === n) return arr[j]; } return null; };
        arr.refresh = () => {};
        return arr;
      }, configurable: true,
    });
  } catch (_e) { /* ignore */ }
  try { Object.defineProperty(navigator, "languages", { get() { return ["zh-CN", "zh", "en"]; }, configurable: true }); }
  catch (_e) { /* ignore */ }
  try {
    const origQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (perm: any) => {
      if (perm && perm.name === "clipboard-read") return Promise.resolve({ state: "granted", onchange: null });
      return origQuery.call(window.navigator.permissions, perm);
    };
  } catch (_e) { /* ignore */ }
}

export const STEALTH_SOURCE: string = "(" + STEALTH_SCRIPT.toString() + ")()";