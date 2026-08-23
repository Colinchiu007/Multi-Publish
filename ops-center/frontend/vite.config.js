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
    // 显式绑定 IPv4：Windows 上默认 'localhost' 可能只解析到 ::1，
    // 导致访问 http://127.0.0.1:5173 连接被拒（白屏）；strictPort 防止端口被占时
    // 静默漂移到 5174 造成"打开的是别人/旧实例"。
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      // 登录由 ops-center 本地提供（自包含管理员登录，不再依赖 platform-orchestrator）
      '/api/auth': {
        target: 'http://localhost:8010',
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
