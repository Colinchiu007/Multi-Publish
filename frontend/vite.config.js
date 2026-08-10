import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'element-plus': ['element-plus'],
        },
      },
    },
  },
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 登录/注册等 auth 路由由 platform-orchestrator 提供（复用其 JWT 体系）
      '/api/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // 运营配置 API 由 ops-center 后端提供
      '/api/v1': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
      // 兜底：其余 /api 保持指向 ops-center 后端
      '/api': {
        target: 'http://localhost:8010',
        changeOrigin: true,
      },
    },
  },
})
