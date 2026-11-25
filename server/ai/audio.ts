/**
 * Recordings sent to the configured model provider: writing down what was said, and remarks on
 * how a sentence was read aloud.
 *
 * Only OpenAI and Gemini take audio. The provider's own key is used; for OpenAI the request goes
 * to its speech models rather than to the chat model chosen in settings, so the key has to be
 * allowed to use them. Nothing here keeps a recording.
 */
import { localeMeta, targetLanguage } from '../../shared/locales.js'
import { SHADOW_MAX_REMARKS, wavSeconds, type ShadowRemarks, type SpeechCapabilities } from '../../shared/voice.js'
import type { ProviderConfig } from '../types.js'
import { ProviderRequestError, checkedJson, fetchWithRetry, resolveProvider } from './provider.js'
import { meterReply, reportUsage } from './usage-meter.js'

const LISTEN_TIMEOUT_MS = 45_000
/** Tried in this order; a key without access to the first still gets an answer from the next. */
const OPENAI_TRANSCRIBERS = ['gpt-4o-mini-transcribe', 'whisper-1']
const OPENAI_LISTENERS = ['gpt-audio-mini', 'gpt-4o-mini-audio-preview', 'gpt-4o-audio-preview']

/** The provider's audio interface, when it has one. */
export function audioProvider(provider: Pick<ProviderConfig, 'id' | 'kind'> | undefined): SpeechCapabilities['provider'] {
  // By name, not by interface: another service that speaks OpenAI's chat interface has none of its speech models.
  if (provider?.id === 'openai') return 'openai'
  if (provider?.kind === 'gemini') return 'gemini'
  return null
}

export class SpeechModelUnavailableError extends Error {
  statusCode = 409
  code = 'SPEECH_MODEL_UNAVAILABLE'

  constructor() {
    super('The configured model provider does not take recordings.')
    this.name = 'SpeechModelUnavailableError'
  }
}

async function listener() {
  const { provider, key } = await resolveProvider()
  const kind = audioProvider(provider)
  if (!kind) throw new SpeechModelUnavailableError()
  return { provider, key, kind, base: provider.baseUrl.replace(/\/$/, '') }
}

/** The provider answered that this model is not there, or not for this key. */
function modelRefused(error: unknown) {
  return error instanceof ProviderRequestError && [400, 403, 404].includes(error.providerStatus || 0)
}

function languageName(languageCode: string) {
  return targetLanguage(languageCode.split(/[-_]/u)[0]).name
}

/** The first JSON object in a model's answer; models that are not held to a schema wrap it in prose or fences. */
function objectIn(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return {}
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

async function geminiHears(provider: ProviderConfig, key: string, base: string, wav: Uint8Array, instruction: string, properties: Record<string, unknown>) {
  const url = `${base}/models/${encodeURIComponent(provider.model)}:generateContent`
  const body = {
    contents: [{ role: 'user', parts: [{ text: instruction }, { inlineData: { mimeType: 'audio/wav', data: Buffer.from(wav).toString('base64') } }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties, required: Object.keys(properties) },
    },
  }
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  }, { timeoutMs: LISTEN_TIMEOUT_MS })
  const json = await checkedJson(response)
  const parts = json.candidates?.[0]?.content?.parts as Array<{ text?: string }> | undefined
  const answer = (parts || []).map((part) => part.text || '').join('')
  meterReply(provider, json, instruction, answer)
  return objectIn(answer)
}

async function openAiTranscribes(key: string, base: string, wav: Uint8Array, languageCode: string) {
  let refused: unknown
  for (const model of OPENAI_TRANSCRIBERS) {
    const form = new FormData()
    form.append('file', new Blob([wav as Uint8Array<ArrayBuffer>], { type: 'audio/wav' }), 'speech.wav')
    form.append('model', model)
    form.append('language', languageCode.split(/[-_]/u)[0])
    form.append('response_format', 'json')
    try {
      const response = await fetchWithRetry(`${base}/audio/transcriptions`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form }, { timeoutMs: LISTEN_TIMEOUT_MS })
      const json = await checkedJson(response)
      reportUsage({ providerId: 'openai', model, inputTokens: 0, outputTokens: 0, audioSeconds: Math.max(0, wavSeconds(wav)), counted: true })
      return String(json.text || '').trim()
    } catch (error) {
      if (!modelRefused(error)) throw error
      refused = error
    }
  }
  throw refused
}

async function openAiHears(key: string, base: string, wav: Uint8Array, instruction: string) {
  let refused: unknown
  for (const model of OPENAI_LISTENERS) {
    const payload = {
      model,
      modalities: ['text'],
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: instruction },
          { type: 'input_audio', input_audio: { data: Buffer.from(wav).toString('base64'), format: 'wav' } },
        ],
      }],
    }
    try {
      const response = await fetchWithRetry(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
      }, { timeoutMs: LISTEN_TIMEOUT_MS })
      const json = await checkedJson(response)
      const answer = String(json.choices?.[0]?.message?.content || '')
      meterReply({ id: 'openai', model }, json, instruction, answer)
      return objectIn(answer)
    } catch (error) {
      if (!modelRefused(error)) throw error
      refused = error
    }
  }
  throw refused
}

/** What was said in a recording, as spoken: mistakes are kept, nothing is corrected or translated. */
export async function transcribeSpeech(input: { wav: Uint8Array; languageCode: string }): Promise<string> {
  const { provider, key, kind, base } = await listener()
  if (kind === 'openai') return openAiTranscribes(key, base, input.wav, input.languageCode)
  const language = languageName(input.languageCode)
  const heard = await geminiHears(provider, key, base, input.wav, [
    `Write down exactly what is said in this recording. The speaker is learning ${language} and is speaking ${language}.`,
    'Keep the words as they were spoken, mistakes included. Do not correct, translate, summarize or answer what is said. Use ordinary punctuation.',
    'Return JSON with one field, text. When nobody speaks, text is empty.',
  ].join('\n'), { text: { type: 'STRING' } })
  return String(heard.text || '').trim()
}

/**
 * A sentence the learner read aloud: what was heard, and at most two things to do differently.
 * Remarks are about sounds, stress and melody only, and are never a score.
 */
export async function remarkOnReading(input: { wav: Uint8Array; sentence: string; languageCode: string; interfaceLocale: string }): Promise<ShadowRemarks> {
  const { provider, key, kind, base } = await listener()
  const language = languageName(input.languageCode)
  const instruction = [
    `A learner of ${language} read this sentence aloud:`,
    `"${input.sentence}"`,
    'Listen to the recording and return JSON with two fields.',
    `heard: what was actually said, word for word, in ${language}. Empty when nobody speaks.`,
    `remarks: at most ${SHADOW_MAX_REMARKS} remarks on how it was read: a sound, a stressed syllable, or the melody of the sentence. Each remark names the word it is about and says what to do differently, in one short plain sentence, the way a friendly teacher would say it.`,
    `Write the remarks in ${localeMeta(input.interfaceLocale).promptName}. No scores, no praise, nothing about grammar or word choice. When the sentence was read clearly, remarks is an empty list.`,
    'Answer with the JSON object only.',
  ].join('\n')
  const answer = kind === 'openai'
    ? await openAiHears(key, base, input.wav, instruction)
    : await geminiHears(provider, key, base, input.wav, instruction, { heard: { type: 'STRING' }, remarks: { type: 'ARRAY', items: { type: 'STRING' } } })
  const remarks = Array.isArray(answer.remarks) ? answer.remarks : []
  return {
    heard: String(answer.heard || '').trim(),
    remarks: remarks.map((item) => String(item || '').trim()).filter(Boolean).slice(0, SHADOW_MAX_REMARKS),
  }
}

/** What the default provider can do with a recording. No request is made. */
export async function speechCapabilities(): Promise<SpeechCapabilities> {
  try {
    const { provider } = await resolveProvider()
    const kind = audioProvider(provider)
    return { modelAudio: Boolean(kind), provider: kind }
  } catch {
    return { modelAudio: false, provider: null }
  }
}
