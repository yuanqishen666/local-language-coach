/**
 * Speaking and listening: what the page and the server agree on.
 *
 * Speech is turned into text by the browser when it can. When it cannot, a recording is sent to
 * the configured model provider, if that provider takes audio. Recordings are always sent as
 * 16 kHz mono WAV, the one form every such provider accepts.
 */

/** Where speech is turned into text. */
export type VoiceInputSource = 'browser' | 'model'
export const VOICE_INPUT_SOURCES: VoiceInputSource[] = ['browser', 'model']

export const VOICE_SAMPLE_RATE = 16_000
/** The longest one recording may be. A turn in a conversation is far shorter. */
export const VOICE_MAX_SECONDS = 90
const WAV_HEADER_BYTES = 44
export const VOICE_MAX_BYTES = VOICE_MAX_SECONDS * VOICE_SAMPLE_RATE * 2 + WAV_HEADER_BYTES
/** A recording shorter than this holds no word. */
export const VOICE_MIN_SECONDS = 0.3

/** How long a silence ends a turn in call mode. Generous, so that thinking is not cut off. */
export const CALL_PAUSE_MS = 2500
export const CALL_PAUSE_MIN_MS = 1500
export const CALL_PAUSE_MAX_MS = 6000

/** A sentence longer than this is not offered for reading aloud after. */
export const SHADOW_MAX_LENGTH = 240
/** At most this many remarks on how a sentence was read. */
export const SHADOW_MAX_REMARKS = 2

/** What the configured provider can do with a recording. */
export interface SpeechCapabilities {
  /** The default provider takes recordings: it can write down what was said and remark on how it was read. */
  modelAudio: boolean
  /** That provider, when it does. */
  provider: 'openai' | 'gemini' | null
}

/** What a model heard in a sentence read aloud, and what it would point out. */
export interface ShadowRemarks {
  heard: string
  remarks: string[]
}

/** The locale speech recognition is asked for. Spanish names a country, because the regional code is not accepted everywhere. */
const RECOGNITION_LOCALES: Record<string, string> = {
  en: 'en-US', es: 'es-MX', fr: 'fr-FR', ja: 'ja-JP', de: 'de-DE', ko: 'ko-KR', it: 'it-IT', zh: 'zh-CN', pt: 'pt-BR', hi: 'hi-IN',
}

export function recognitionLocale(languageCode: string) {
  const base = String(languageCode || '').trim().toLowerCase().split(/[-_]/u)[0]
  return RECOGNITION_LOCALES[base] || languageCode || 'en-US'
}

/** How long a WAV file of the form this app records lasts, or -1 when the bytes are not such a file. */
export function wavSeconds(bytes: Uint8Array) {
  if (bytes.length < WAV_HEADER_BYTES) return -1
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3])
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return -1
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const channels = view.getUint16(22, true)
  const rate = view.getUint32(24, true)
  const bits = view.getUint16(34, true)
  if (!channels || !rate || !bits) return -1
  return (bytes.length - WAV_HEADER_BYTES) / (rate * channels * (bits / 8))
}
