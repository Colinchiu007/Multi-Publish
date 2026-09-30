const { defineConfig } = require('vitest/config')
module.exports = defineConfig({
  test: {
    setupFiles: ['../shared-utils/network-egress-guard.setup.js'],
    include: ['tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 10000,
  },
})
