<script setup lang="ts">
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
    <span class="lips" aria-hidden="true"><i></i></span>
    <span v-if="showLabel">{{ label }}</span>
  </button>
</template>

<style scoped>
/* a little mouth: closed when quiet, moving while it speaks */
.speak{flex:none;height:34px;min-width:34px;padding:0 8px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:var(--speak-bg,rgba(21,21,21,.08));color:inherit;font-size:12px;font-weight:800;vertical-align:middle;transition:transform .45s var(--spring),background .2s}
.speak.compact{height:28px;min-width:28px;padding:0 6px}
.lips{width:18px;height:18px;display:grid;place-items:center}
.compact .lips{width:16px;height:16px}
.lips i{width:14px;height:7px;border-radius:0 0 999px 999px;background:currentColor;transition:width .4s var(--spring),height .4s var(--spring),border-radius .3s}
.speak:hover:not(:disabled){transform:scale(1.16) rotate(-8deg);background:var(--sun);color:var(--ink)}
.speak:hover:not(:disabled) .lips i{width:10px;height:10px;border-radius:50%}
.speak:active:not(:disabled){transform:scale(.88)}
.speak.active{background:var(--sun);color:var(--ink)}
.speak.active .lips i{animation:say .5s ease-in-out infinite alternate}
@keyframes say{0%{width:14px;height:7px;border-radius:0 0 999px 999px}50%{width:8px;height:11px;border-radius:999px}100%{width:12px;height:4px;border-radius:999px}}
.speak:disabled{opacity:.3}
@media (prefers-reduced-motion:reduce){.speak.active .lips i{animation:none}}
</style>
