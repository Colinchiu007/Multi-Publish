import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    deps: { inline: ['electron', 'axios'] },
    globals: true,
    include: ['src/**/*.test.{js,ts}', 'src/**/*.spec.{js,ts}', 'electron/services/**/*.test.{js,ts}', 'electron/ipc-handlers/**/*.test.{js,ts}'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
})