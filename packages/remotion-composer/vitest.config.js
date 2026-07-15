import { defineConfig } from 'vitest/config'

// 与 packages/rpa-engine/vitest.config.js 风格保持一致
// 测试文件位于 src/__tests__/*.test.ts
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: true,
  },
})
