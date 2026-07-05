/**
 * Electron 自动 mock — vitest 通过 __mocks__/electron.js 自动加载
 * 使用 test-helpers 提供标准 mock
 */
const { createMockElectron } = require("../test-helpers");
module.exports = createMockElectron();
