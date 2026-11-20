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
    <span class="bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    <span v-if="showLabel">{{ label }}</span>
  </button>
</template>

<style scoped>
/* a small level meter: still when idle, moving while it speaks */
.speak{flex:none;height:30px;min-width:30px;padding:0 7px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:999px;background:none;color:var(--muted);font-size:12px;vertical-align:middle;transition:color .25s,background .25s}
.speak.compact{height:24px;min-width:24px;padding:0 5px}
.bars{display:flex;align-items:center;gap:2px;height:14px}
.bars i{width:2px;border-radius:2px;background:currentColor;transition:height .3s var(--out)}
.bars i:nth-child(1){height:5px}
.bars i:nth-child(2){height:11px}
.bars i:nth-child(3){height:8px}
.bars i:nth-child(4){height:4px}
.speak:hover{color:var(--amber);background:var(--amber-soft)}
.speak:hover .bars i:nth-child(1){height:9px}
.speak:hover .bars i:nth-child(2){height:14px}
.speak:hover .bars i:nth-child(3){height:11px}
.speak:hover .bars i:nth-child(4){height:7px}
.speak.active{color:#1b1204;background:var(--amber)}
.speak.active .bars i{animation:level .7s ease-in-out infinite alternate}
.speak.active .bars i:nth-child(2){animation-delay:-.2s}
.speak.active .bars i:nth-child(3){animation-delay:-.45s}
.speak.active .bars i:nth-child(4){animation-delay:-.1s}
.speak:disabled{opacity:.3}
@keyframes level{from{height:3px}to{height:14px}}
@media (prefers-reduced-motion:reduce){.speak.active .bars i{animation:none}}
</style>
