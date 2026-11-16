export const DEFAULT_SPEECH_RATE = 0.85
export const MIN_SPEECH_RATE = 0.6
export const MAX_SPEECH_RATE = 1.2
export const SPEECH_RATE_STEP = 0.05

export function normalizeSpeechRate(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_SPEECH_RATE
  const bounded = Math.min(MAX_SPEECH_RATE, Math.max(MIN_SPEECH_RATE, numeric))
  return Number((Math.round(bounded / SPEECH_RATE_STEP) * SPEECH_RATE_STEP).toFixed(2))
}

export type SpeechPlatform = 'macos' | 'windows' | 'linux' | 'other'

export function speechPlatformFor(platform: string, userAgent = ''): SpeechPlatform {
  const source = `${platform} ${userAgent}`.toLowerCase()
  if (/mac|iphone|ipad|ipod/u.test(source)) return 'macos'
  if (/win/u.test(source)) return 'windows'
  if (/linux|x11/u.test(source) && !/android|cros/u.test(source)) return 'linux'
  return 'other'
}
