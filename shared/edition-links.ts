import { localeSlug, type UiLocale } from './locales.js'

export function openEditionUrl(base: string, locale?: UiLocale, page?: 'privacy') {
  const path = [base.replace(/\/+$/u, ''), locale && localeSlug(locale), page].filter((part) => part !== undefined)
  return path.join('/') || '/'
}
