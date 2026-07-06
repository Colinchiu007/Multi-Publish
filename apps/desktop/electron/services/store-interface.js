// @ts-check
/**
 * Store 接口定义 + Factory 工厂
 *
 * 从 MediaTrace store.ts / storeFactory.ts 移植的模式：
 * - 定义 Store 接口（JSDoc 类型约定）
 * - Factory 统一创建 Store 实例
 * - 当前仅实现 SQLiteStore（包装现有的 store.js）
 *
 * 使用:
 *   const { createStore } = require("./store-interface");
 *   const store = createStore({ type: "sqlite" });
 *   store.init();
 */

const log = require("./logger");

/**
 * Factory: 创建 Store 实例
 * @param {{ type?: string, dbPath?: string }} [opts]
 * @returns {object} Store 实例
 */
function createStore(opts) {
  opts = opts || {};
  const type = opts.type || "sqlite";

  switch (type) {
    case "sqlite":
      return _createSqliteStore(opts);
    default:
      throw new Error("Unknown store type: " + type + " (supported: sqlite)");
  }
}

/**
 * @param {{ type?: string, dbPath?: string }} opts
 * @returns {any}
 */
function _createSqliteStore(opts) {
  const Store = require("./store");
  /** @type {any} */
  const instance = new Store();

  if (opts.dbPath) {
    instance._customDbPath = opts.dbPath;
    const origInit = instance.init.bind(instance);
    instance.init = function () {
      if (this._customDbPath) {
        const electron = require("electron");
        const origGetPath = /** @type {Function} */(electron.app.getPath);
        electron.app.getPath = function (name) {
          if (name === "userData") return /** @type {string} */(opts.dbPath);
          return origGetPath.call(electron.app, name);
        };
      }
      return origInit();
    };
  }

  log.info("StoreFactory", "created sqlite store" + (opts.dbPath ? " at " + opts.dbPath : ""));
  return instance;
}

/**
 * 通用 Store 接口检查
 * @param {any} instance
 * @returns {boolean}
 */
function isValidStore(instance) {
  if (!instance || typeof instance !== "object") return false;
  const required = ["init", "close", "addAccount", "getAccount", "listAccounts",
    "addHistory", "listHistory", "getSetting", "setSetting"];
  return required.every(function (method) {
    return typeof instance[method] === "function";
  });
}

module.exports = {
  createStore: createStore,
  isValidStore: isValidStore,
};
