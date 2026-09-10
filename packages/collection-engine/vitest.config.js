const { defineConfig } = require('vitest/config')
module.exports = defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    testTimeout: 10000,
  },
})
