<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { LAB_THEMES, isPreview } from '../routes'

/** `low` parks the switch at the bottom on wide screens, for themes whose own navigation sits top-centre. */
defineProps<{ low?: boolean }>()

const route = useRoute()
// The app itself is drawn by one of these designs; the switch belongs to the comparison previews only.
const shown = computed(() => isPreview(route.path))
const rest = computed(() => route.fullPath.replace(/^\/lab\/[^/?#]+/u, ''))
</script>

<template>
  <nav v-if="shown" class="lab-switch" :class="{ low }">
    <RouterLink v-for="(theme, index) in LAB_THEMES" :key="theme" :to="`/lab/${theme}${rest}`" :class="{ on: route.meta.lab === theme }">{{ String(index + 1).padStart(2, '0') }}</RouterLink>
  </nav>
</template>

<style scoped>
.lab-switch{position:fixed;left:50%;top:10px;z-index:200;display:flex;gap:2px;padding:3px;border-radius:999px;background:rgba(20,20,20,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transform:translateX(-50%);box-shadow:0 0 0 1px rgba(255,255,255,.14),0 10px 30px rgba(0,0,0,.18);opacity:.5;transition:opacity .25s}
.lab-switch:hover,.lab-switch:focus-within{opacity:1}
.lab-switch a{min-width:34px;height:22px;display:grid;place-items:center;border-radius:999px;color:rgba(255,255,255,.62);font:600 10px/1 'Manrope Variable',system-ui,sans-serif;letter-spacing:.06em;font-variant-numeric:tabular-nums;transition:color .2s,background .2s}
.lab-switch a:hover{color:#fff}
.lab-switch a.on{background:#fff;color:#141414}
@media (min-width:761px){.lab-switch.low{top:auto;bottom:12px}}
</style>
