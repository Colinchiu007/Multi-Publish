import { createI18n } from 'vue-i18n'
import zh from '../locales/zh'
import en from '../locales/en'

const storedLocale = typeof localStorage === 'undefined' ? null : localStorage.getItem('locale')
const locale = storedLocale === 'en' ? 'en' : 'zh'

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale,
  fallbackLocale: 'en',
  messages: { zh, en },
})

export default i18n
