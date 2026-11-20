<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../stores/app'
import { browserSpeech, type SpeechFailure } from '../speech'
import { spokenRate } from '../level'
import { displayTargetLanguage } from '../../shared/locales'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  text: string
  languageCode: string
  speechId?: string
  showLabel?: boolean
  compact?: boolean
}>(), {
  speechId: '',
  showLabel: false,
  compact: false,
})

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
</script>

<template>
  <button
    v-if="available"
    type="button"
    class="speak-button"
    :class="{ active, compact }"
    :disabled="disabled"
    :title="label"
    :aria-label="label"
    :aria-pressed="active"
    @pointerdown.stop
    @pointerup.stop
    @dblclick.stop
    @click.stop="toggle"
  >
    <AppIcon :name="active ? 'stop' : 'volume'" :size="compact ? 14 : 15" />
    <span v-if="showLabel">{{ label }}</span>
  </button>
</template>

<style scoped>
.speak-button{min-width:34px;min-height:34px;padding:0 8px;border:1px solid currentColor;border-radius:999px;background:transparent;color:inherit;display:inline-flex;align-items:center;justify-content:center;gap:5px;font:inherit;font-size:11px;font-weight:700;line-height:1;cursor:pointer;user-select:none;opacity:.72;transition:opacity .16s,background-color .16s,transform .16s}.speak-button:hover:not(:disabled),.speak-button:focus-visible,.speak-button.active{opacity:1;background:color-mix(in srgb,currentColor 10%,transparent)}.speak-button:active:not(:disabled){transform:scale(.96)}.speak-button:disabled{cursor:not-allowed;opacity:.34}.speak-button.compact{min-width:30px;min-height:30px;padding:0;border-color:transparent}.speak-button span{white-space:nowrap}@media(max-width:600px){.speak-button{min-width:38px;min-height:38px}.speak-button.compact{min-width:36px;min-height:36px}}@media(prefers-reduced-motion:reduce){.speak-button{transition:none}}
</style>
