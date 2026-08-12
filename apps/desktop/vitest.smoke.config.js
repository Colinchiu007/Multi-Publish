const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    // 启动冒烟会在 require 链上加载 electron 主进程模块（含 electron 路径解析）；
    // 冷 CI runner 首次加载可能超过 vitest 默认 10s hookTimeout（2026-08-12 回归），给 30s 容差。
    hookTimeout: 30000,
    include: ['tests/smoke/**/*.test.js'],
  },
})
