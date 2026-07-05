/**
 * AbortUtils — 取消信号工具集
 *
 * 从 MediaTrace 移植的标准 AbortSignal 模式：
 * - 所有循环点检查 signal.aborted
 * - AbortController 生命周期管理
 * - 超时自动取消
 *
 * 文件位置: apps/desktop/electron/services/abort-utils.js
 */

/**
 * 创建受管理的 AbortController
 * @param {number} [timeoutMs] - 超时毫秒（可选）
 * @returns {{ signal: AbortSignal, abort: Function, cleanup: Function }}
 */
function createAbort(timeoutMs) {
  var controller = new AbortController();

  var timeoutId = null;
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(function () {
      controller.abort(new Error("Operation timed out after " + timeoutMs + "ms"));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,

    abort: function (reason) {
      controller.abort(reason || new Error("Operation cancelled by user"));
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },

    cleanup: function () {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

/**
 * 检查信号是否已中止，如是则抛出
 * @param {AbortSignal} [signal]
 * @param {string} [message]
 * @throws {Error} 如果已中止
 */
function checkAborted(signal, message) {
  if (!signal) return;
  if (signal.aborted) {
    throw new Error(message || "Operation aborted");
  }
}

/**
 * 将异步函数包装为可中止版本
 * @param {Function} fn - 异步函数
 * @param {AbortSignal} signal
 * @param {object} [options]
 * @param {string} [options.abortMessage]
 * @returns {Function} 包装后的函数
 */
function wrapWithAbort(fn, signal, options) {
  options = options || {};
  return function () {
    var args = arguments;
    checkAborted(signal, options.abortMessage);
    return fn.apply(null, args);
  };
}

/**
 * 创建一个 promise 在信号中止时 reject
 * @param {AbortSignal} signal
 * @returns {Promise} 永不 resolve，仅在中止时 reject
 */
function abortPromise(signal) {
  return new Promise(function (resolve, reject) {
    if (!signal) return;
    if (signal.aborted) {
      reject(new Error("Operation aborted"));
      return;
    }
    signal.addEventListener("abort", function () {
      reject(new Error(signal.reason || "Operation aborted"));
    }, { once: true });
  });
}

/**
 * 在 Promise 数组中并入取消信号
 * @param {Promise} promise - 主要 promise
 * @param {AbortSignal} signal
 * @returns {Promise} 谁先完成就采用谁的结果
 */
function raceWithSignal(promise, signal) {
  if (!signal || signal.aborted) {
    return Promise.reject(new Error("Operation aborted"));
  }
  var abortPromise_ = new Promise(function (resolve, reject) {
    signal.addEventListener("abort", function () {
      reject(new Error(signal.reason || "Operation aborted"));
    }, { once: true });
  });
  return Promise.race([promise, abortPromise_]);
}

module.exports = {
  createAbort: createAbort,
  checkAborted: checkAborted,
  wrapWithAbort: wrapWithAbort,
  abortPromise: abortPromise,
  raceWithSignal: raceWithSignal,
};