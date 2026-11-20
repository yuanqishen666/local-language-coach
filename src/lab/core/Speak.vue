<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import { vTip } from './tip'
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
    v-tip="showLabel ? '' : label"
    type="button"
    class="c-speak"
    :class="{ active, compact, labeled: showLabel }"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="active"
    @pointerdown.stop
    @pointerup.stop
    @dblclick.stop
    @click.stop="toggle"
  >
    <Icon :name="active ? 'stop' : 'volume'" :size="compact ? 14 : 16" :weight="2" />
    <span v-if="showLabel">{{ label }}</span>
  </button>
</template>
