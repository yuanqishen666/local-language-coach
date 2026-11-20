/**
 * Reading a known sentence aloud and seeing which of its words were heard.
 *
 * What was heard comes from the browser, or from the configured model when a recording is sent
 * to it. The model also says a thing or two about how the sentence was read. Words not heard are
 * marked as a hint: the reading may have been unclear, or the listener may simply have got it wrong.
 */
import { computed, onBeforeUnmount, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from './api'
import { modelErrorKey } from './provider-error-copy'
import { SHADOW_MAX_LENGTH, type ShadowRemarks } from '../shared/voice'
import { base64Of, canRecord, compareReading, encodeWav, type ReadingComparison, type Recording } from './voice-input'
import { cancelVoice, loadSpeechCapabilities, startVoice, stopVoice, voice, voiceIssueText, voiceRouteFor } from './voice'

export function useShadow(source: { text: string; languageCode: string }) {
  const { t, locale } = useI18n()
  const owner = `shadow-${useId()}`
  const open = ref(false)
  const comparison = ref<ReadingComparison | null>(null)
  const heardText = ref('')
  /** What the model pointed out. Null when it was not asked. */
  const remarks = ref<string[] | null>(null)
  const asking = ref(false)
  const note = ref('')
  const mine = ref('')
  let player: HTMLAudioElement | null = null
  let round = 0

  const available = computed(() => {
    const text = source.text.trim()
    return text.length > 0 && text.length <= SHADOW_MAX_LENGTH
  })
  const listening = computed(() => voice.owner.value === owner && voice.phase.value === 'listening')
  const liveHeard = computed(() => (voice.owner.value === owner ? voice.heard.value : ''))
  const route = computed(() => voiceRouteFor(source.languageCode))
  const provider = computed(() => (voice.capabilities.value.provider === 'gemini' ? 'Gemini' : 'OpenAI'))
  /** A second way to read: to the model, when the browser is the one listening by default. */
  const canAsk = computed(() => route.value === 'browser' && voice.capabilities.value.modelAudio && canRecord())
  const pieces = computed(() => comparison.value?.pieces || [{ text: source.text, word: false, heard: true }])

  function forgetRecording() {
    player?.pause()
    player = null
    if (mine.value) URL.revokeObjectURL(mine.value)
    mine.value = ''
  }

  function keepRecording(recording: Recording) {
    forgetRecording()
    mine.value = URL.createObjectURL(new Blob([encodeWav(recording.samples)], { type: 'audio/wav' }))
  }

  function compare(heard: string) {
    heardText.value = heard
    comparison.value = compareReading(source.text, heard, source.languageCode)
  }

  async function askModel(recording: Recording, mark: number) {
    asking.value = true
    try {
      const data = await api.post<ShadowRemarks>('/speech/remarks', {
        audio: base64Of(encodeWav(recording.samples)),
        sentence: source.text.trim(),
        languageCode: source.languageCode,
        interfaceLocale: String(locale.value),
      })
      if (mark !== round) return
      if (!data.heard) { note.value = t('voice.problem.noSpeech'); return }
      compare(data.heard)
      remarks.value = data.remarks
    } catch (error) {
      if (mark === round) note.value = t(modelErrorKey(error) || 'voice.problem.model')
    } finally {
      if (mark === round) asking.value = false
    }
  }

  /** Starts a reading, or ends the one going on. `toModel` sends a recording to the model whatever the setting. */
  function read(toModel = false) {
    if (listening.value) { stopVoice(); return }
    if (asking.value) return
    const mark = ++round
    note.value = ''
    const recorded = toModel || route.value === 'model'
    startVoice({
      owner,
      languageCode: source.languageCode,
      route: recorded ? 'model' : undefined,
      transcribe: false,
      onDone(result) {
        if (mark !== round) return
        if (result.silent) { note.value = t('voice.problem.noSpeech'); return }
        if (result.recording) {
          keepRecording(result.recording)
          void askModel(result.recording, mark)
          return
        }
        forgetRecording()
        remarks.value = null
        compare(result.text)
      },
      onProblem(issue) {
        if (mark === round) note.value = voiceIssueText(issue, t, String(locale.value), source.languageCode)
      },
    })
  }

  function playMine() {
    if (!mine.value) return
    player?.pause()
    player = new Audio(mine.value)
    void player.play().catch(() => undefined)
  }

  function close() {
    round += 1
    if (voice.owner.value === owner) cancelVoice()
    forgetRecording()
    open.value = false
    comparison.value = null
    heardText.value = ''
    remarks.value = null
    asking.value = false
    note.value = ''
  }

  function toggle() {
    if (open.value) { close(); return }
    open.value = true
    void loadSpeechCapabilities()
  }

  onBeforeUnmount(close)

  return { t, available, open, toggle, read, listening, liveHeard, asking, comparison, pieces, heardText, remarks, note, mine, playMine, canAsk, provider }
}
