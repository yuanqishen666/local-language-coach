/**
 * Regional varieties of the learning languages, for those that differ enough across regions to
 * matter in conversation, and how formal the partner's language is.
 *
 * The first variety listed for a language is what the app already spoke before a choice existed.
 */
import { targetLanguage } from './locales.js'

export const TARGET_VARIANTS: Record<string, readonly string[]> = {
  en: ['en-US', 'en-GB', 'en-AU'],
  es: ['es-419', 'es-ES', 'es-MX', 'es-AR'],
  fr: ['fr-FR', 'fr-CA'],
  de: ['de-DE', 'de-AT', 'de-CH'],
  pt: ['pt-BR', 'pt-PT'],
  zh: ['zh-CN', 'zh-TW'],
}

export const REGISTERS = ['neutral', 'casual', 'formal'] as const
export type Register = typeof REGISTERS[number]

const baseOf = (code: string) => String(code || '').trim().toLowerCase().split(/[-_]/u)[0]

export function variantsFor(languageCode: string): readonly string[] {
  return TARGET_VARIANTS[baseOf(languageCode)] || []
}

/** The chosen variety when it is one this language has, otherwise an empty string for the usual one. */
export function normalizeVariant(languageCode: string, variant: unknown): string {
  return typeof variant === 'string' && variantsFor(languageCode).includes(variant) ? variant : ''
}

export function normalizeRegister(value: unknown): Register {
  return REGISTERS.includes(value as Register) ? value as Register : 'neutral'
}

/** The region a variety belongs to, named in the given interface language: "United Kingdom", "拉丁美洲". */
export function variantRegionName(variant: string, locale: string) {
  const region = variant.split('-')[1] || ''
  if (!region) return variant
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(region) || region
  } catch {
    return region
  }
}

/** How a prompt names the variety, in English: "Spanish as used in Argentina". Empty when none was chosen. */
export function variantPromptName(languageCode: string, variant: unknown) {
  const chosen = normalizeVariant(languageCode, variant)
  if (!chosen) return ''
  return `${targetLanguage(baseOf(languageCode)).name} as used in ${variantRegionName(chosen, 'en')}`
}

/**
 * The locale speech is read and recognised in: the chosen variety, except that Latin American
 * Spanish as a whole is no single voice and is left to the language's usual locale.
 */
export function speechVariant(languageCode: string, variant: unknown) {
  const chosen = normalizeVariant(languageCode, variant)
  return chosen && /^[a-z]{2}-[A-Z]{2}$/u.test(chosen) ? chosen : ''
}

export const CERTAINTIES = ['sure', 'either', 'unsure'] as const
export type Certainty = typeof CERTAINTIES[number]

export function normalizeCertainty(value: unknown): Certainty {
  return (CERTAINTIES as readonly string[]).includes(String(value)) ? value as Certainty : 'sure'
}

/** A remark that the learner's wording is also right, or that may not be a mistake at all, is shown to them but is not counted against them. */
export function countsAsError(correction: { certainty?: unknown }) {
  return normalizeCertainty(correction.certainty) === 'sure'
}
