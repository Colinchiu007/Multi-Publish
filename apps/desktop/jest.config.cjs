/**
 * Jest 配置 — 仅运行 tests/ 目录下的 E2E + 集成测试
 * 单元测试使用 vitest (npm run test:vue)
 *
 * 注意：tests/ 目录中的 require 路径指向 electron/ 根目录，
 * 但大部分模块已重构到 electron/services/，通过 moduleNameMapper 透明重定向。
 */
module.exports = {
  testMatch: ['**/tests/**/*.test.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/e2e/publish-flow.test.js',
    '/tests/e2e/account-delete.test.js',
    '/tests/e2e/account-management.test.js',
  ],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json', 'node'],
  transform: {},
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  // 模块重定向 — 大部分文件已从 electron/ 根目录移至 electron/services/
  moduleNameMapper: {
    // Electron 主模块 mock
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
    // 已移到 electron/services/ 的模块
    '^\.\./electron/ai-writer$': '<rootDir>/electron/services/ai-writer',
    '^\.\./electron/cloud-publisher$': '<rootDir>/electron/services/cloud-publisher',
    '^\.\./electron/content-intelligence$': '<rootDir>/electron/services/content-intelligence',
    '^\.\./electron/flutter-skill-bridge$': '<rootDir>/electron/services/flutter-skill-bridge',
    '^\.\./electron/license-manager$': '<rootDir>/electron/services/license-manager',
    '^\.\./electron/offline-manager$': '<rootDir>/electron/services/offline-manager',
    '^\.\./electron/onboarding$': '<rootDir>/electron/services/onboarding',
    '^\.\./electron/payment-manager$': '<rootDir>/electron/services/payment-manager',
    '^\.\./electron/publish-alert$': '<rootDir>/electron/services/publish-alert',
    '^\.\./electron/publish-poller$': '<rootDir>/electron/services/publish-poller',
    '^\.\./electron/redemption-codes$': '<rootDir>/electron/services/redemption-codes',
    '^\.\./electron/rpa-view-manager$': '<rootDir>/electron/services/rpa-view-manager',
    '^\.\./electron/template-manager$': '<rootDir>/electron/services/template-manager',
    '^\.\./electron/usage-tracker$': '<rootDir>/electron/services/usage-tracker',
    '^\.\./electron/logger$': '<rootDir>/electron/services/logger',
    // container 已移到 electron/core/
    '^\.\./electron/container$': '<rootDir>/electron/core/container',
    // error-codes 有 core/ 和 services/ 两个版本，默认用 core/
    '^\.\./electron/error-codes$': '<rootDir>/electron/core/error-codes',
    // 其他 electron/ 路径不变
  },
  // 解析 mock 文件时也应用重定向
  unmockedModulePathPatterns: ['node_modules/'],
}
