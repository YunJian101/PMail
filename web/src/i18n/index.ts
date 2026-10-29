import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh'
import en from './locales/en'

export const LANGUAGES = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
] as const

export type Language = (typeof LANGUAGES)[number]['value']

const STORAGE_KEY = 'pmail.lang'

function detectLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    /* ignore */
  }
  const browser = (navigator.languages?.[0] || navigator.language || 'zh').toLowerCase()
  return browser.startsWith('zh') ? 'zh' : 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: detectLanguage(),
  fallbackLng: 'zh',
  // 词条里用的是单花括号占位符（{count} / {name}），所以把插值边界改成单括号
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
  returnNull: false,
})

document.documentElement.lang = i18n.language === 'en' ? 'en' : 'zh-CN'

export function setLanguage(language: Language) {
  void i18n.changeLanguage(language)
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    /* ignore */
  }
}

export function currentLanguage(): Language {
  return i18n.language === 'en' ? 'en' : 'zh'
}

export default i18n
