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
    '/electron/tests/',
  ],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'mjs', 'cjs', 'json', 'node'],
  transform: {},
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  moduleNameMapper: {
    '^electron$': '<rootDir>/tests/__mocks__/electron.js',
    '@multi-publish/rpa-engine': '<rootDir>/../../packages/rpa-engine/src/index.js',
    '@multi-publish/api-publish-engine': '<rootDir>/../../packages/api-publish-engine/src/index.js',
    '^ws$': '<rootDir>/tests/__mocks__/ws.js',
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
    '^\.\./electron/container$': '<rootDir>/electron/core/container',
    '^\.\./electron/error-codes$': '<rootDir>/electron/core/error-codes',
    'publisher-router': '<rootDir>/electron/services/publisher-router',
  },
  unmockedModulePathPatterns: ['node_modules/'],
};


