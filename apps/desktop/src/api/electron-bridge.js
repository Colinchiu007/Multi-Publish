/**
 * electron-bridge — 统一的 Electron IPC 桥接层
 *
 * 所有 Vue 组件通过此模块访问 Electron IPC，不直接调用 window.electronAPI。
 * 提供一致的错误处理、fallback 支持和事件监听管理。
 */

function getApi() {
  return (typeof window !== "undefined" && window.electronAPI) || null;
}

function toPlainIpcValue(value) {
  if (value === null || typeof value !== "object") return value;
  // File/Blob 由 contextBridge 原生支持原样传递：webUtils.getPathForFile 依赖真实 File 对象
  // 才能解析本地路径（BGM/旁白/视频素材选择），JSON 序列化会把 File 变成 {} 导致路径丢失。
  if (typeof File !== "undefined" && value instanceof File) return value;
  if (typeof Blob !== "undefined" && value instanceof Blob) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    throw new TypeError(`IPC 参数必须是可序列化的纯 JSON 对象: ${message}`);
  }
}

/**
 * 调用 Electron IPC 方法
 * @param {string} method electronAPI 上的方法名
 * @param {...any} args 参数
 * @returns {Promise<any|undefined>} 返回结果，无 API 时返回 undefined
 */
export async function invoke(method, ...args) {
  const api = getApi();
  if (!api || typeof api[method] !== "function") return undefined;
  return api[method](...args.map(toPlainIpcValue));
}

/**
 * preload 抛出的「许可证/登录态不足」错误的 name。
 *
 * 为什么需要单独识别：access-control.js 的 `createPermissionError()` 对
 * `authenticated` 级方法**同步 throw**，而本文件的 `invoke` 是 `async function`
 * ——同步 throw 在 async 函数里变成 **rejected promise**，于是
 * `invokeWithFallback` 的 `await` 直接抛出，**fallback 分支永不执行**。
 * 而「未登录/许可证未激活」恰恰是生产环境最高频的失败模式：preload 对
 * PUBLIC_METHODS 之外的所有方法都要求 authenticated 级。
 */
const PERMISSION_ERROR_NAME = "LicensePermissionError";

function isPermissionError(e) {
  return !!e && e.name === PERMISSION_ERROR_NAME;
}

/**
 * 带超时的 IPC 调用（M-13）。
 *
 * 为什么要有：`invoke` 本身没有任何超时包装。任一主进程 handler 卡死
 * （Python bridge 挂起 / CDP 卡住 / SQLite 锁），前端 Promise 永久 pending ——
 * 调用点 loading 永不复位、按钮永久禁用，**用户零错误提示**。
 *
 * 为什么是**新增函数而不是改 invoke 的默认行为**：`pipelineStart`、
 * `aggregationCollect`、`story2videoTranscribe` 这类长任务合法耗时可达数分钟，
 * 给它们套一个统一默认值会把「长任务」变成「必超时」。宁可让调用方显式选，
 * 也不要用一个拍脑袋的默认值制造一批新故障。
 *
 * @param {string} method electronAPI 上的方法名
 * @param {number} timeoutMs 超时毫秒；<= 0 表示不设超时（长任务用）
 * @param {any} fallback 超时后的返回值
 * @param {...any} args 参数
 * @returns {Promise<any>} 超时返回 fallback；正常返回调用结果
 */
export async function invokeWithTimeout(method, timeoutMs, fallback, ...args) {
  const pending = invoke(method, ...args);
  if (!(timeoutMs > 0)) return pending;

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (import.meta.env?.DEV || process.env.NODE_ENV === "development") {
        console.warn(
          `[electron-bridge] IPC timeout ${timeoutMs}ms: ${method} — ` +
          "main process did not settle; caller loading state will not auto-reset. Check whether the handler is stuck."
        );
      }
      resolve(fallback);
    }, timeoutMs);
  });

  try {
    // pending 若先 reject，race 会把拒绝原样抛出（不吞错）；
    // 超时那一路永远 resolve(fallback)，故 catch 里必须再判一次是否真的是它。
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 调用 IPC 方法，自动使用 fallback 兜底
 * @param {string} method 方法名
 * @param {any} fallback 无 API / 无权限 / 超时时的默认值
 * @param {...any} args 额外参数
 */
export async function invokeWithFallback(method, fallback, ...args) {
  let result;
  try {
    result = await invoke(method, ...args);
  } catch (e) {
    // M-14：权限不足必须落进 fallback 语义，否则「未登录/许可证未激活」这个
    // 最高频的失败模式拿不到兜底值，调用方若只判 res.code === 0 就会得到
    // unhandled rejection。其余错误照原样抛出 —— 静默兜底会把真实故障藏起来。
    if (isPermissionError(e)) {
      if (import.meta.env?.DEV || process.env.NODE_ENV === "development") {
        console.warn(`[electron-bridge] permission error, falling back:`, method);
      }
      return fallback;
    }
    throw e;
  }
  if (result === undefined) {
    // 开发模式下 warn，让 IPC 失败可见（之前静默降级导致 preload 问题难以排查）
    if (process.env.NODE_ENV === 'development' || location?.hostname === 'localhost') {
      console.warn('[electron-bridge] IPC fallback:', method, '— window.electronAPI 不可用或方法不存在');
    }
    return fallback;
  }
  return result;
}

/**
 * 注册 Electron IPC 事件监听
 * @param {string} event 事件名（如 "Progress" → electronAPI.onProgress）
 * @param {Function} callback 回调函数
 * @returns {Function} cleanup 函数
 */
export function on(event, callback) {
  const api = getApi();
  const method = "on" + event;
  if (!api || typeof api[method] !== "function") return () => {};
  return api[method](callback);
}

/**
 * 调用 pageManager 命名空间下的同步 IPC 方法（如 setSidebarWidth）
 * @param {string} method pageManager 上的方法名
 * @param {...any} args 参数
 * @returns {any|undefined} 返回结果，无 API 或方法不存在时返回 undefined
 */
export function invokePageManager(method, ...args) {
  const api = getApi();
  const ns = api && api.pageManager;
  if (!ns || typeof ns[method] !== "function") return undefined;
  return ns[method](...args);
}

/**
 * 调用 preload **命名空间**下的 IPC 方法（如 filmEngineering.retryShot）。
 *
 * 为什么必须有这条：preload 把影视工程那组能力暴露在 `filmEngineering` 对象下，
 * 而扁平键访问 `api["filmEngineeringRetryShot"]` 恒为 undefined ⇒ 桥接层直接
 * return undefined，调用方只拿到 fallback，功能表现为"点了没反应"且界面零提示。
 * 命名空间形态无法用扁平 invoke 表达，只能按 ns→method 两级取。
 *
 * 与 invokePageManager 的关系：后者是本函数的历史特例（pageManager 专用），
 * 保留以免牵动既有调用方；新代码一律用本函数。
 *
 * @param {string} ns 命名空间名（如 filmEngineering）
 * @param {string} method 命名空间下的方法名
 * @param {...any} args 参数
 * @returns {any|undefined} 无 API / 命名空间缺失 / 方法不存在时返回 undefined
 */
export function invokeNamespace(ns, method, ...args) {
  const api = getApi();
  const scoped = api && api[ns];
  if (!scoped || typeof scoped[method] !== "function") return undefined;
  return scoped[method](...args.map(toPlainIpcValue));
}

export { getApi, isPermissionError, PERMISSION_ERROR_NAME };
