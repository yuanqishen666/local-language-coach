export const UI_LOCALES = [
  'zh-CN',
  'en-US',
  'es-419',
  'fr-FR',
  'ja-JP',
  'de-DE',
  'ko-KR',
  'it-IT',
  'pt-BR',
  'hi-IN',
] as const

export type UiLocale = (typeof UI_LOCALES)[number]

export const TARGET_LANGUAGES = [
  { code: 'en', name: 'English', locale: 'en-US' },
  { code: 'es', name: 'Spanish', locale: 'es-419' },
  { code: 'fr', name: 'French', locale: 'fr-FR' },
  { code: 'ja', name: 'Japanese', locale: 'ja-JP' },
  { code: 'de', name: 'German', locale: 'de-DE' },
  { code: 'ko', name: 'Korean', locale: 'ko-KR' },
  { code: 'it', name: 'Italian', locale: 'it-IT' },
  { code: 'zh', name: 'Chinese', locale: 'zh-CN' },
  { code: 'pt', name: 'Portuguese', locale: 'pt-BR' },
  { code: 'hi', name: 'Hindi', locale: 'hi-IN' },
] as const

export type TargetLanguageCode = (typeof TARGET_LANGUAGES)[number]['code']

export interface LocaleMeta {
  code: UiLocale
  shortCode: string
  nativeName: string
  promptName: string
  htmlLang: string
  voice: string
}

export const LOCALE_META: Record<UiLocale, LocaleMeta> = {
  'zh-CN': {
    code: 'zh-CN', shortCode: '中', nativeName: '简体中文', htmlLang: 'zh-CN',
    promptName: 'Simplified Chinese as used in mainland China',
    voice: 'Use contemporary, warm, direct Simplified Chinese. Address the user as “你”. Avoid translated sentence patterns, formal notices, and unnecessary linking phrases.',
  },
  'en-US': {
    code: 'en-US', shortCode: 'EN', nativeName: 'English', htmlLang: 'en-US',
    promptName: 'American English',
    voice: 'Use concise, contemporary American English. Sound helpful and human, not promotional or bureaucratic.',
  },
  'es-419': {
    code: 'es-419', shortCode: 'ES', nativeName: 'Español', htmlLang: 'es-419',
    promptName: 'neutral Latin American Spanish',
    voice: 'Use natural, widely understood Latin American Spanish. Address the user with “tú”. Avoid literal translations, stiff connectors, and Spain-only wording.',
  },
  'fr-FR': {
    code: 'fr-FR', shortCode: 'FR', nativeName: 'Français', htmlLang: 'fr-FR',
    promptName: 'French as used in France',
    voice: 'Use natural contemporary French from France. Address the user with “vous”; keep the tone warm, clear, and restrained rather than formal or promotional.',
  },
  'ja-JP': {
    code: 'ja-JP', shortCode: '日', nativeName: '日本語', htmlLang: 'ja-JP',
    promptName: 'Japanese as used in Japan',
    voice: 'Use natural modern Japanese in a friendly です・ます style. Prefer concise product language and avoid calques, excessive subjects, and ceremonial politeness.',
  },
  'de-DE': {
    code: 'de-DE', shortCode: 'DE', nativeName: 'Deutsch', htmlLang: 'de-DE',
    promptName: 'German as used in Germany',
    voice: 'Use natural contemporary German from Germany. Address the user with “du”. Keep sentences direct and avoid nominal style, anglicized syntax, and bureaucratic wording.',
  },
  'ko-KR': {
    code: 'ko-KR', shortCode: '한', nativeName: '한국어', htmlLang: 'ko-KR',
    promptName: 'Korean as used in South Korea',
    voice: 'Use natural contemporary Korean in a friendly 해요체. Keep interface wording concise and avoid translated word order, excessive nouns, and formal administrative language.',
  },
  'it-IT': {
    code: 'it-IT', shortCode: 'IT', nativeName: 'Italiano', htmlLang: 'it-IT',
    promptName: 'Italian as used in Italy',
    voice: 'Use natural contemporary Italian from Italy. Address the user with “tu”; keep it clear, warm, and conversational without filler or literal translation patterns.',
  },
  'pt-BR': {
    code: 'pt-BR', shortCode: 'PT', nativeName: 'Português', htmlLang: 'pt-BR',
    promptName: 'Brazilian Portuguese',
    voice: 'Use natural contemporary Brazilian Portuguese. Address the user with “você”. Prefer everyday phrasing and avoid European Portuguese forms, literal syntax, and stiff connectors.',
  },
  'hi-IN': {
    code: 'hi-IN', shortCode: 'हि', nativeName: 'हिन्दी', htmlLang: 'hi-IN',
    promptName: 'standard contemporary Hindi as used in India',
    voice: 'Use natural contemporary Hindi in Devanagari. Address the user respectfully with “आप”. Prefer familiar product wording and avoid word-for-word English syntax or overly Sanskritized prose.',
  },
}

export function normalizeUiLocale(value: unknown, fallback: UiLocale = 'zh-CN'): UiLocale {
  if (typeof value !== 'string') return fallback
  if ((UI_LOCALES as readonly string[]).includes(value)) return value as UiLocale
  return fallback
}

export function targetLanguage(code: string) {
  return TARGET_LANGUAGES.find((item) => item.code === code) || TARGET_LANGUAGES[0]
}

export function displayTargetLanguage(code: string, locale: unknown) {
  const language = targetLanguage(code)
  try {
    return new Intl.DisplayNames([normalizeUiLocale(locale)], { type: 'language' }).of(language.code) || language.name
  } catch {
    return language.name
  }
}

export function localeMeta(locale: unknown) {
  return LOCALE_META[normalizeUiLocale(locale)]
}
