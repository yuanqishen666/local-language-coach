import { createI18n } from 'vue-i18n'
import { buildMessages } from './copy'

export const messages = buildMessages()

export const i18n = createI18n({
  legacy: false,
  locale: 'zh-CN',
  fallbackLocale: false,
  messages,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: false,
})
