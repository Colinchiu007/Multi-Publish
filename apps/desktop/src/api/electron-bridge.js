/**
 * electron-bridge — 统一的 Electron IPC 桥接层
 *
 * 所有 Vue 组件通过此模块访问 Electron IPC，不直接调用 window.electronAPI。
 * 提供一致的错误处理、fallback 支持和事件监听管理。
 */

function getApi() {
  return (typeof window !== "undefined" && window.electronAPI) || null;
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
  return api[method](...args);
}

/**
 * 调用 IPC 方法，自动使用 fallback 兜底
 * @param {string} method 方法名
 * @param {any} fallback 无 API 时的默认值
 * @param {...any} args 额外参数
 */
export async function invokeWithFallback(method, fallback, ...args) {
  const result = await invoke(method, ...args);
  return result !== undefined ? result : fallback;
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

export { getApi };
