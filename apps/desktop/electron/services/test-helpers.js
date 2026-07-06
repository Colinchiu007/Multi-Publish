// @ts-check
/**
 * test-helpers — Electron services 测试辅助工具
 * 提供标准 mock 工厂函数，减少测试文件中的重复代码。
 * 注意：不使用 vi.fn()，由 vi.mock() 自动封装。
 */

/**
 * 创建标准 logger mock（vi.mock 自动封装 spy）
 */
function createMockLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

/**
 * 创建标准 electron mock（app + BrowserWindow）
 */
function createMockElectron() {
  return {
    app: { getPath: () => "/tmp/ph-test-data" },
    BrowserWindow: { getAllWindows: () => [] },
  };
}

/**
 * 创建标准 axios mock
 */
function createMockAxios() {
  return {
    get: () => Promise.resolve({ data: {} }),
    post: () => Promise.resolve({ data: {} }),
    put: () => Promise.resolve({ data: {} }),
    delete: () => Promise.resolve({ data: {} }),
    isAxiosError: () => false,
    create: () => null,
    interceptors: { request: { use: () => {} }, response: { use: () => {} } },
  };
}

/**
 * 设置 axios.get 返回指定数据（需要 vi 环境）
 */
/** @param {any} axios @param {any} data */
function mockAxiosGet(axios, data) {
  axios.get = () => Promise.resolve(data);
}

/**
 * 创建标准 Store mock
 */
function createMockStore() {
  return {
    getSetting: () => null,
    setSetting: () => {},
    savePublishRecord: () => {},
    getPublishHistory: () => [],
    init: () => true,
    close: () => {},
    addAccount: () => {},
    getAccount: () => null,
    listAccounts: () => [],
    deleteAccount: () => {},
  };
}

module.exports = {
  createMockLogger, createMockElectron,
  createMockAxios, mockAxiosGet, createMockStore,
};

