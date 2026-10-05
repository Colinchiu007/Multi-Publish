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
 * 调用 IPC 方法，自动使用 fallback 兜底
 * @param {string} method 方法名
 * @param {any} fallback 无 API 时的默认值
 * @param {...any} args 额外参数
 */
export async function invokeWithFallback(method, fallback, ...args) {
  const result = await invoke(method, ...args);
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

export { getApi };
