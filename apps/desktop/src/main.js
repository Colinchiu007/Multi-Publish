import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import { QuillEditor } from '@vueup/vue-quill'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import './styles/cohere-design-system.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)

// 全局 Vue 错误处理器 — 捕获组件渲染/事件处理中的未处理错误
app.config.errorHandler = (err, instance, info) => {
  const msg = `[Vue Error] ${info}: ${err?.message || err}`
  console.error(msg)
  console.error(err)
  try {
    if (window.electronAPI?.logError) {
      window.electronAPI.logError(msg)
    }
  } catch (_) {}
}
window.addEventListener('error', (e) => {
  if (e.message && !e.message.includes('[Vue Error]')) {
    console.error('[Global Error]', e.message)
  }
})
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection]', e.reason?.message || e.reason)
})

app.use(createPinia())
app.use(router)
app.use(ElementPlus)
app.component('QuillEditor', QuillEditor)
app.mount('#app')