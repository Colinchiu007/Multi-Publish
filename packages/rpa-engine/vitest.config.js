import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['**/__tests__/**', '**/node_modules/**'],
    environment: 'node',
    globals: true,
  },
})
