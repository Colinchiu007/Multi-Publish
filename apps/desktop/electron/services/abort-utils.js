// @ts-check
/**
 * AbortUtils 鈥?鍙栨秷淇″彿宸ュ叿闆?
 *
 * 浠?MediaTrace 绉绘鐨勬爣鍑?AbortSignal 妯″紡锛?
 * - 鎵€鏈夊惊鐜偣妫€鏌?signal.aborted
 * - AbortController 鐢熷懡鍛ㄦ湡绠＄悊
 * - 瓒呮椂鑷姩鍙栨秷
 *
 * 鏂囦欢浣嶇疆: apps/desktop/electron/services/abort-utils.js
 */

/**
 * 鍒涘缓鍙楃鐞嗙殑 AbortController
 * @param {number} [timeoutMs] - 瓒呮椂姣锛堝彲閫夛級
 * @returns {{ signal: AbortSignal, abort: Function, cleanup: Function }}
 */
function createAbort(timeoutMs) {
  const controller = new AbortController();

  /** @type {ReturnType<typeof setTimeout>|null} */
  let timeoutId = null;
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(function () {
      controller.abort(new Error("Operation timed out after " + timeoutMs + "ms"));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,

    /** @param {any} [reason] */
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
 * 妫€鏌ヤ俊鍙锋槸鍚﹀凡涓锛屽鏄垯鎶涘嚭
 * @param {AbortSignal} [signal]
 * @param {string} [message]
 * @throws {Error} 濡傛灉宸蹭腑姝?
 */
function checkAborted(signal, message) {
  if (!signal) return;
  if (signal.aborted) {
    throw new Error(message || "Operation aborted");
  }
}

/**
 * 灏嗗紓姝ュ嚱鏁板寘瑁呬负鍙腑姝㈢増鏈?
 * @param {Function} fn - 寮傛鍑芥暟
 * @param {AbortSignal} signal
 * @param {object} [options]
 * @param {string} [options.abortMessage]
 * @returns {(...args: any[]) => any} 鍖呰鍚庣殑鍑芥暟
 */
function wrapWithAbort(fn, signal, options) {
  options = options || {};
  return function () {
    const args = arguments;
    checkAborted(signal, options.abortMessage);
    return fn.apply(null, args);
  };
}

/**
 * 鍒涘缓涓€涓?promise 鍦ㄤ俊鍙蜂腑姝㈡椂 reject
 * @param {AbortSignal} signal
 * @returns {Promise<never>} 姘镐笉 resolve锛屼粎鍦ㄤ腑姝㈡椂 reject
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
 * 鍦?Promise 鏁扮粍涓苟鍏ュ彇娑堜俊鍙?
 * @param {Promise<any>} promise - 涓昏 promise
 * @param {AbortSignal} signal
 * @returns {Promise<any>} 璋佸厛瀹屾垚灏遍噰鐢ㄨ皝鐨勭粨鏋?
 */
function raceWithSignal(promise, signal) {
  if (!signal || signal.aborted) {
    return Promise.reject(new Error("Operation aborted"));
  }
  /** @type {Promise<any>} */
  const abortPromise_ = new Promise(function (resolve, reject) {
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
