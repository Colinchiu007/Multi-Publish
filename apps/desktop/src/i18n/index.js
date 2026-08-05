import { createI18n } from 'vue-i18n'
import zh from '../locales/zh'
import en from '../locales/en'

// 静态消息统一转换为 vue-i18n Message Function，避免运行时编译（new Function）
// 被 Electron CSP（script-src 'self'）以 'unsafe-eval' 拦截。
// 否则包含动态翻译的页面（如视频创作/图片轮播）会在渲染时抛出 EvalError 导致白屏。
// 当前语料全部为静态字符串（无 {name} 插值、无复数 |、无 @: 链接消息）；
// 若后续需要插值，请直接使用 (ctx) => ctx.named('name') 形式编写消息。
function toMessageFunctions (value) {
  if (typeof value === 'string') {
    const source = value
    return () => source
  }
  if (Array.isArray(value)) {
    return value.map(toMessageFunctions)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const output = {}
  for (const [key, child] of Object.entries(value)) {
    output[key] = toMessageFunctions(child)
  }
  return output
}

const storedLocale = typeof localStorage === 'undefined' ? null : localStorage.getItem('locale')
const locale = storedLocale === 'en' ? 'en' : 'zh'

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale,
  fallbackLocale: 'en',
  messages: { zh: toMessageFunctions(zh), en: toMessageFunctions(en) },
})

export default i18n
