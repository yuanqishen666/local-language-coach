// Generated from src/components/SpeakButton.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onBeforeUnmount, onMounted, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { browserSpeech, type SpeechFailure } from '../../speech'
import { spokenRate } from '../../level'
import { displayTargetLanguage } from '../../../shared/locales'

export function useSpeakButton(props: { text: string; languageCode: string; speechId: string; showLabel: boolean; compact: boolean }) {
const store = useAppStore()
const { t, locale } = useI18n()
const generatedId = useId()
const id = computed(() => props.speechId || `speech-${generatedId}`)
const active = computed(() => browserSpeech.activeId.value === id.value)
const available = computed(() => {
  // Re-evaluate after browsers asynchronously publish their installed voices.
  browserSpeech.voicesVersion.value
  return browserSpeech.supported.value && browserSpeech.hasTrustedVoice(props.languageCode)
})
const disabled = computed(() => !props.text.trim())
const label = computed(() => active.value ? t('speech.stop') : t('speech.play'))

function errorMessage(failure: SpeechFailure) {
  if (failure === 'unsupported') return t('speech.unsupported')
  if (failure === 'voice-unavailable') return t('speech.voiceUnavailable', { language: displayTargetLanguage(props.languageCode, locale.value) })
  return t('speech.failed')
}

function toggle() {
  browserSpeech.speak({
    id: id.value,
    text: props.text,
    languageCode: props.languageCode,
    rate: spokenRate(store.settings?.learning.speechRate),
    onError: (failure) => store.notify(errorMessage(failure)),
  })
}

onMounted(() => browserSpeech.initialize())
onBeforeUnmount(() => { if (active.value) browserSpeech.stop() })
watch(() => [props.text, props.languageCode], () => { if (active.value) browserSpeech.stop() })

  return { store, t, locale, generatedId, id, active, available, disabled, label, errorMessage, toggle }
}
