import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 同时运行 tests/ 目录与源码旁的 src/**/__tests__/*.test.js（co-located 测试）
    include: ['tests/**/*.test.js', 'src/**/__tests__/*.test.js'],
    exclude: [
      '**/node_modules/**',
      // 以下为旧式手动测试脚本（自定义 test() + 顶层 process.exit，非 vitest 用例），
      // 若被 vitest 收集会在采集阶段退出进程，故保持排除。
      'src/__tests__/cover-generator.test.js',
      'src/__tests__/md-converter.test.js',
      'src/__tests__/title-optimizer.test.js',
      'src/format-adapter/__tests__/markdown-input.test.js',
    ],
    environment: 'node',

    globals: true,
    // 冷启动超时预算（2026-08-09）：scheduler.test.js 模块图在 Windows CI 冷加载可超默认 5000ms，
    // 与桌面 vitest 契约（testTimeout=10000）对齐
    testTimeout: 10000,
  },
})
