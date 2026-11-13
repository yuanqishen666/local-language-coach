<script setup lang="ts">
defineProps<{ name: string; size?: number }>()
const paths: Record<string, string> = {
  compass: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm3.5-13.5-2.1 4.9-4.9 2.1 2.1-4.9 4.9-2.1Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z', repeat: 'm17 1 4 4-4 4M3 11V9a4 4 0 0 1 4-4h14m-14 18-4-4 4-4m14-2v2a4 4 0 0 1-4 4H3',
  memory: 'M8 3v3m8-3v3M4 8h3M4 16h3m10-8h3m-4 8h4M9 9h6v6H9V9Zm-1 11h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2Z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.8-1L14.8 3h-4l-.4 2.6a8 8 0 0 0-1.8 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2L4.2 14l2 3.4 2.4-1a8 8 0 0 0 1.8 1l.4 2.6h4l.4-2.6a8 8 0 0 0 1.8-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z',
  arrow: 'm9 18 6-6-6-6', spark: 'm12 3 1.4 4.1L17.5 8.5 13.4 10 12 14l-1.4-4-4.1-1.5 4.1-1.4L12 3Zm6 11 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z',
  send: 'm22 2-7 20-4-9-9-4 20-7Zm-11 11L22 2', check: 'm5 12 4 4L19 6', close: 'M6 6l12 12M18 6 6 18', plus: 'M12 5v14M5 12h14',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Zm0 0A2.5 2.5 0 0 0 6.5 22H20', play: 'm8 5 11 7-11 7V5Z', download: 'M12 3v12m-5-5 5 5 5-5M5 21h14',
  phone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h4',
  link: 'M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1m3.1 5.9a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  search: 'm21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  language: 'm5 8 6 6m-7 0 6-6 2-3M2 5h12M7 2v3m7 17 4-10 4 10m-7-3h6',
}
</script>
<template><svg :width="size || 20" :height="size || 20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="paths[name] || paths.spark" /></svg></template>
