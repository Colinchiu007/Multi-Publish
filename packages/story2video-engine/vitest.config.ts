import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['../shared-utils/network-egress-guard.setup.js'],
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
