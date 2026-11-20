<script setup lang="ts">
import { computed } from 'vue'

/** A small picture for a ready-made scene or a conversation category, drawn from the same solid pieces as the rest of the page. */
const props = defineProps<{ id: string }>()

const kinds: Record<string, string> = {
  'cafe-moment': 'cafe',
  'hotel-arrival': 'stay',
  'new-colleague': 'badge',
  'friend-catchup': 'chat',
  'neighborhood-encounter': 'home',
  'shared-interest': 'both',
  daily: 'home',
  travel: 'stay',
  work: 'badge',
  social: 'chat',
  study: 'book',
  opinion: 'both',
  custom: 'pen',
}
const kind = computed(() => kinds[props.id] || 'chat')
</script>

<template>
  <svg class="ys-glyph" :class="'g-' + kind" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <template v-if="kind === 'cafe'">
      <path class="s m1" d="M25 15c-3-3 3-5 0-9" />
      <path class="s m2" d="M35 15c-3-3 3-5 0-9" />
      <path class="s" d="M45 27h3a6 6 0 0 1 0 12h-4" />
      <path class="a" d="M14 22h32v10a16 16 0 0 1-32 0z" />
      <rect class="k" x="10" y="51" width="40" height="5" rx="2.5" />
    </template>
    <template v-else-if="kind === 'stay'">
      <g class="m1">
        <path class="s" d="M24 21v-6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6" />
        <rect class="k" x="10" y="20" width="44" height="33" rx="9" />
        <rect class="a" x="10" y="32" width="44" height="7" />
        <circle class="w" cx="32" cy="35.5" r="5" />
      </g>
    </template>
    <template v-else-if="kind === 'badge'">
      <g class="m1">
        <path class="s" d="M25 4l7 11 7-11" />
        <rect class="k" x="27" y="13" width="10" height="7" rx="2.5" />
        <rect class="a" x="14" y="18" width="36" height="41" rx="9" />
        <circle class="w" cx="32" cy="33" r="6.5" />
        <rect class="w" x="21" y="44" width="22" height="4" rx="2" />
        <rect class="w dim" x="26" y="51" width="12" height="3" rx="1.5" />
      </g>
    </template>
    <template v-else-if="kind === 'home'">
      <rect class="k" x="47" y="36" width="3.5" height="17" rx="1.5" />
      <circle class="a m1" cx="48.7" cy="30" r="9.5" />
      <rect class="k" x="12" y="30" width="26" height="23" rx="3" />
      <path class="a roof" d="M9 31l16-15 16 15z" />
      <rect class="w m2" x="21" y="40" width="8" height="13" rx="2" />
      <rect class="k" x="6" y="52" width="52" height="4" rx="2" />
    </template>
    <template v-else-if="kind === 'both'">
      <circle class="k m1" cx="24" cy="32" r="16" />
      <circle class="a m2" cx="40" cy="32" r="16" />
      <path class="w m3" d="M32 18.14a16 16 0 0 1 0 27.72 16 16 0 0 1 0-27.72z" />
    </template>
    <template v-else-if="kind === 'book'">
      <path class="k m1" d="M8 16c8-3 16-3 22 2v34c-6-5-14-5-22-2z" />
      <path class="a m2" d="M56 16c-8-3-16-3-22 2v34c6-5 14-5 22-2z" />
      <rect class="w" x="13" y="25" width="12" height="3" rx="1.5" />
      <rect class="w dim" x="13" y="32" width="9" height="3" rx="1.5" />
      <rect class="w" x="39" y="25" width="12" height="3" rx="1.5" />
      <rect class="w dim" x="42" y="32" width="9" height="3" rx="1.5" />
    </template>
    <template v-else-if="kind === 'pen'">
      <rect class="a m2" x="13" y="48" width="32" height="4.5" rx="2.25" />
      <g class="m1">
        <g transform="rotate(45 32 30)">
          <rect class="k" x="26" y="4" width="12" height="36" rx="2.5" />
          <rect class="a" x="26" y="4" width="12" height="9" rx="2.5" />
          <path class="k" d="M26 39h12l-6 13z" />
        </g>
      </g>
    </template>
    <template v-else>
      <g class="m1">
        <path class="k" d="M6 15a9 9 0 0 1 9-9h18a9 9 0 0 1 9 9v8a9 9 0 0 1-9 9H19l-8 7v-8a9 9 0 0 1-5-8z" />
        <circle class="w" cx="17" cy="19" r="2.2" /><circle class="w" cx="24" cy="19" r="2.2" /><circle class="w" cx="31" cy="19" r="2.2" />
      </g>
      <path class="a m2" d="M58 35a9 9 0 0 0-9-9H33a9 9 0 0 0-9 9v6a9 9 0 0 0 9 9h13l8 7v-8a9 9 0 0 0 4-8z" />
    </template>
  </svg>
</template>
