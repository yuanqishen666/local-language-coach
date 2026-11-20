/**
 * Recordings from the page: turned into text, or listened to for how a sentence was read.
 * A recording is passed on to the configured model provider and is not kept here.
 */
import type { FastifyInstance } from 'fastify'
import { getConfig } from './services/config.js'
import { TARGET_LANGUAGES, normalizeUiLocale } from '../shared/locales.js'
import { SHADOW_MAX_LENGTH, VOICE_MAX_BYTES, VOICE_MIN_SECONDS, wavSeconds } from '../shared/voice.js'
import { remarkOnReading, speechCapabilities, transcribeSpeech } from './ai/audio.js'

/** A recording of the longest allowed length, as base64, with room for the other fields. */
const BODY_LIMIT = Math.ceil(VOICE_MAX_BYTES / 3) * 4 + 8192

function failure(message: string, statusCode: number, code: string) {
  return Object.assign(new Error(message), { statusCode, code })
}

function recording(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !value) throw failure('A recording is required', 400, 'SPEECH_AUDIO_INVALID')
  const bytes = Buffer.from(value, 'base64')
  if (bytes.length > VOICE_MAX_BYTES) throw failure('The recording is too long', 413, 'SPEECH_TOO_LONG')
  const seconds = wavSeconds(bytes)
  if (seconds < 0) throw failure('The recording is not a WAV file', 400, 'SPEECH_AUDIO_INVALID')
  if (seconds < VOICE_MIN_SECONDS) throw failure('The recording is too short', 400, 'SPEECH_TOO_SHORT')
  return bytes
}

/** The language spoken: the one named, when the app teaches it, or the one being learned now. */
async function spokenLanguage(value: unknown) {
  const code = typeof value === 'string' ? value.trim().toLowerCase().split(/[-_]/u)[0] : ''
  if (TARGET_LANGUAGES.some((language) => language.code === code)) return code
  return (await getConfig()).learning.targetLanguageCode
}

export function registerSpeechRoutes(app: FastifyInstance) {
  app.get('/api/speech/capabilities', async () => speechCapabilities())

  app.post<{ Body: { audio?: unknown; languageCode?: unknown } }>('/api/speech/transcribe', { bodyLimit: BODY_LIMIT }, async (request) => {
    const wav = recording(request.body?.audio)
    const languageCode = await spokenLanguage(request.body?.languageCode)
    return { text: await transcribeSpeech({ wav, languageCode }) }
  })

  app.post<{ Body: { audio?: unknown; sentence?: unknown; languageCode?: unknown; interfaceLocale?: unknown } }>('/api/speech/remarks', { bodyLimit: BODY_LIMIT }, async (request) => {
    const sentence = typeof request.body?.sentence === 'string' ? request.body.sentence.trim() : ''
    if (!sentence || sentence.length > SHADOW_MAX_LENGTH) throw failure('A sentence to read is required', 400, 'SPEECH_SENTENCE_INVALID')
    const wav = recording(request.body?.audio)
    const languageCode = await spokenLanguage(request.body?.languageCode)
    return remarkOnReading({ wav, sentence, languageCode, interfaceLocale: normalizeUiLocale(request.body?.interfaceLocale) })
  })
}
