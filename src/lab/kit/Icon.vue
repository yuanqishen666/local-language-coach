<script setup lang="ts">
defineProps<{ name: IconName; size?: number; weight?: number }>()
</script>

<script lang="ts">
const paths = {
  talk: 'M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20l1.2-5A8.5 8.5 0 1 1 21 11.5Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  repeat: 'm17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14m-14 18-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3',
  notebook: 'M7 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7V3Zm0 0v18M4 7h3m-3 5h3m-3 5h3m4-9h4',
  sliders: 'M4 6h9m4 0h3M4 12h3m4 0h9M4 18h11m4 0h1M15 4v4M9 10v4m8 2v4',
  chevron: 'm9 18 6-6-6-6',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  arrowUp: 'M7 17 17 7M8 7h9v9',
  up: 'M12 19V5m-6 6 6-6 6 6',
  back: 'M19 12H5m6 6-6-6 6-6',
  send: 'm22 2-7 20-4-9-9-4 20-7Zm-11 11L22 2',
  check: 'm5 12 4 4L19 6',
  close: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Zm0 0A2.5 2.5 0 0 0 6.5 22H20',
  volume: 'M11 5 6 9H2v6h4l5 4V5Zm4 3.5a5 5 0 0 1 0 7m2.8-10a9 9 0 0 1 0 13',
  stop: 'M7 7h10v10H7V7Z',
  link: 'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1m3.1 5.9a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  language: 'm5 8 6 6m-7 0 6-6 2-3M2 5h12M7 2v3m7 17 4-10 4 10m-7-3h6',
  download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  upload: 'M12 15V3m-5 5 5-5 5 5M5 21h14',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h4',
  archive: 'M3 4h18v4H3V4Zm2 4v12h14V8m-9 4h4',
  restore: 'M3 4h18v4H3V4Zm2 4v12h14V8m-7 9v-6m-3 3 3-3 3 3',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16v4Zm10-14 4 4',
  pin: 'M9 4h6l-1 6 4 4H6l4-4-1-6Zm3 10v6',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-9-9h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.500 5.700 12 3Z',
  lock: 'M6 11h12v9H6v-9Zm3 0V8a3 3 0 0 1 6 0v3',
  plug: 'M9 3v5m6-5v5M7 8h10v4a5 5 0 0 1-10 0V8Zm5 9v4',
  quote: 'M10 7H6v6h4v-2a4 4 0 0 1-4 4m12-8h-4v6h4v-2a4 4 0 0 1-4 4',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm7 9a7 7 0 0 1-14 0m7 7v3m-3.5 0h7',
  call: 'M21 16.5v3a1.9 1.9 0 0 1-2.1 1.9 19 19 0 0 1-8.2-2.9 18.6 18.6 0 0 1-5.7-5.7A19 19 0 0 1 2.1 4.6 1.9 1.9 0 0 1 4 2.5h3a1.9 1.9 0 0 1 1.9 1.6c.1.9.3 1.8.7 2.7a1.9 1.9 0 0 1-.4 2L8 10a15.2 15.2 0 0 0 5.7 5.7l1.2-1.2a1.9 1.9 0 0 1 2-.4c.9.4 1.8.6 2.7.7a1.9 1.9 0 0 1 1.4 1.7Z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  pause: 'M8 5v14m8-14v14',
  play: 'M7 4.5v15l12-7.5-12-7.5Z',
  dice: 'M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm2.5 5.5h.01m7 0h.01M12 12h.01m-3.5 3.5h.01m7 0h.01',
  chart: 'M3 21h18M7 17v-5m5 5V7m5 10v-8',
  moon: 'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  help: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.6 9.3a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.2-2.4 3.7m0 3.2h.01',
} as const

export type IconName = keyof typeof paths
</script>

<template>
  <svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" :stroke-width="weight || 1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name]" /></svg>
</template>
