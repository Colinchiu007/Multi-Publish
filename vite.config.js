import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  root: path.resolve(__dirname, 'src-frontend'),
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src-frontend')
    }
  }
})
