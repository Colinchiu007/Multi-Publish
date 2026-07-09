const { defineConfig } = require('vitest/config');
const vue = require('@vitejs/plugin-vue');
const path = require('path');

module.exports = defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    deps: { inline: ['electron', 'axios'] },
    globals: true,
    setupFiles: ['./test-setup.js'],
    include: [
      'src/**/*.test.{js,ts}', 'src/**/*.spec.{js,ts}',
      'electron/services/**/*.test.{js,ts}',
      'electron/ipc-handlers/**/*.test.{js,ts}',
      'electron/bootstrap.test.{js,ts}',
      'electron/window.test.{js,ts}',
      'electron/shutdown.test.{js,ts}',
      'electron/preload.test.{js,ts}',
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
