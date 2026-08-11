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

export const SUPPORTED_LOCALES = Object.freeze(['zh', 'en'])

/**
 * 系统语言自动检测（user-facing-messages 规范）：
 * zh* → zh，en* → en，其余 → en（与 fallbackLocale 一致）；无 navigator 时回退 zh。
 */
export function detectSystemLocale () {
  if (typeof navigator === 'undefined' || !navigator.language) return 'zh'
  const lang = String(navigator.language || '').toLowerCase()
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('en')) return 'en'
  return 'en'
}

/** 语言解析优先级：显式设置（localStorage locale）→ 系统语言 → 默认 zh。 */
export function resolveAppLocale () {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem('locale')
  if (stored === 'en' || stored === 'zh') return stored
  return detectSystemLocale()
}

/** 读取当前生效语言（已解析，zh/en）。 */
export function getAppLocale () {
  const current = i18n.global.locale.value
  return current === 'en' ? 'en' : 'zh'
}

/**
 * 切换应用语言：持久化（localStorage）并即时生效。
 * @param {'zh'|'en'} locale
 */
export function setAppLocale (locale) {
  const normalized = locale === 'en' ? 'en' : 'zh'
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('locale', normalized)
  } catch (_) {
    // localStorage 不可用时仅内存生效
  }
  i18n.global.locale.value = normalized
  return normalized
}

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: resolveAppLocale(),
  fallbackLocale: 'en',
  messages: { zh: toMessageFunctions(zh), en: toMessageFunctions(en) },
})

export default i18n
