// @ts-nocheck
// 
const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');
const path = require('path');

module.exports = defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    maxWorkers: 4,
    deps: { inline: ['electron', 'axios'] },
    globals: true,
    setupFiles: ['./test-setup.js'],
    include: [
      'src/**/*.test.{js,ts}', 'src/**/*.spec.{js,ts}',
      'electron/services/**/*.test.{js,ts}',
      'electron/publishers/**/*.test.{js,ts}',
      'electron/ipc-handlers/**/*.test.{js,ts}',
      'electron/preload/**/*.test.{js,ts}',
      'electron/core/**/*.test.{js,ts}',
      'electron/bootstrap/**/*.test.{js,ts}',
      'electron/bootstrap.test.{js,ts}',
      'electron/window.test.{js,ts}',
      'electron/shutdown.test.{js,ts}',
      'electron/main.test.{js,ts}',
      'electron/preload.test.{js,ts}',
      'electron/tests/**/*.test.{js,ts}',
      'tests/**/*.test.{js,ts}',
    ],
    exclude: [
      'tests/visual-testing/views/**',
      'tests/visual-testing/workflows/**',
      'tests/visual-testing/providers/**',
      'tests/visual-testing/scripts/**',
      'tests/path-utils.test.js',
      'tests/e2e/**',
      'tests/smoke/**',
      'electron/tests/e2e-bridge-integration.test.js',
      'electron/tests/e2e-full-pipeline.test.js',
      'electron/tests/e2e-pipeline-orchestrator.test.js',
      'src/__tests__/ipc-handlers.test.js',
      'node_modules/**',
      'dist/**',
    ],
    alias: {
      '@': path.resolve(__dirname, 'src')
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        statements: 55,
        branches: 40,
        functions: 60,
        lines: 55,
      },
      include: [
        'electron/services/**/*.js',
        'electron/ipc-handlers/**/*.js',
        'electron/core/**/*.js',
        'electron/bootstrap/**/*.js',
        'electron/bootstrap.js',
        'electron/main.js',
        'electron/window.js',
        'electron/shutdown.js',
        'src/stores/**/*.js',
        'src/composables/**/*.js',
      ],
      exclude: [
        '**/*.test.*',
        '**/*.spec.*',
        'vite.config.*',
        'test-setup.js',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});
