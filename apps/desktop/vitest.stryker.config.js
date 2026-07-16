// @ts-nocheck
// 
const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');
const path = require('path');

module.exports = defineConfig({
  plugins: [vue()],
  test: {
    root: __dirname,
    environment: 'jsdom',
    deps: { inline: ['electron', 'axios'] },
    globals: true,
    setupFiles: ['./test-setup.js'],
    include: [
      'src/**/*.test.{js,ts}', 'src/**/*.spec.{js,ts}',
      'electron/services/**/*.test.{js,ts}',
      'electron/ipc-handlers/**/*.test.{js,ts}',
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
      'tests/visual-testing/**',
      'tests/path-utils.test.js',
      'tests/e2e/**',
      'tests/smoke/**',
      'electron/tests/ai-generator.test.js',
      'electron/tests/api-platform-adapter.test.js',
      'electron/tests/composition-manager.test.js',
      'electron/tests/e2e-bridge-integration.test.js',
      'electron/tests/e2e-full-pipeline.test.js',
      'electron/tests/e2e-pipeline-orchestrator.test.js',
      'electron/tests/pipeline-engine.test.js',
      'electron/tests/service-bus-plugin-registry.test.js',
      'electron/tests/stage-executor-publish.test.js',
      'electron/tests/stage-executor.test.js',
      'electron/tests/video-engine.test.js',
      'electron/services/ai-writer-flow.integration.test.js',
      'src/__tests__/ipc-handlers.test.js',
      'src/views/Accounts.test.js',
      'src/views/views-deep.test.js',
      'node_modules/**',
      'dist/**',
    ],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});