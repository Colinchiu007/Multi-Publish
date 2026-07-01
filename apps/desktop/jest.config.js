module.exports = {
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
  ],
  // 模拟 Electron 模块，避免在非 Electron 环境中 require 失败
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
  },
}
