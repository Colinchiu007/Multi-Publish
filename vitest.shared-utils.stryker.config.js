const { defineConfig } = require('vitest/config')

module.exports = defineConfig({
  test: {
    root: process.cwd(),
    environment: 'node',
    globals: true,
    include: ['packages/shared-utils/tests/task-queue*.test.js'],
  },
})
