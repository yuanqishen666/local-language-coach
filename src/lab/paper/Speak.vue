<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import { useSpeakButton } from '../logic/SpeakButton'

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
const { active, available, disabled, label, toggle } = useSpeakButton(props)
</script>

<template>
  <button
    v-if="available"
    type="button"
    class="speak"
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
    <Icon :name="active ? 'stop' : 'volume'" :size="compact ? 13 : 15" />
    <span v-if="showLabel">{{ label }}</span>
  </button>
</template>

<style scoped>
.speak{position:relative;flex:none;height:30px;min-width:30px;padding:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:999px;background:none;color:var(--muted);font-size:12px;vertical-align:middle;transition:color .25s,background .25s}
.speak.compact{height:24px;min-width:24px}
.speak span{padding-right:10px}
.speak:hover{color:var(--ink);background:var(--faint)}
.speak.active{color:var(--paper);background:var(--red)}
.speak.active::after{content:'';position:absolute;inset:0;border-radius:inherit;box-shadow:0 0 0 1px var(--red);animation:speak-ring 1.2s ease-out infinite}
.speak:disabled{opacity:.3}
@keyframes speak-ring{to{transform:scale(1.7);opacity:0}}
@media (prefers-reduced-motion:reduce){.speak.active::after{animation:none}}
</style>
