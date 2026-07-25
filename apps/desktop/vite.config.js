import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  root: path.resolve(__dirname, 'src'),
  base: './',
  // postcss.config.js 由 PostCSS 自动加载，无需在 Vite 中显式指定
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    fs: {
      allow: [
        path.resolve(__dirname, 'src'),
        path.resolve(__dirname, '..', '..')
      ]
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  // workspace 包不在 node_modules 下，开发服务器不会默认预构建其 CommonJS 入口。
  optimizeDeps: {
    include: ['@multi-publish/shared-utils/src/platform-definitions'],
  },
})
