<script setup lang="ts">
import { ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'

/** A heading that opens what is under it. Closed content stays out of reach of the keyboard. */
const props = defineProps<{ title: string; count?: number; open?: boolean }>()
const shown = ref(Boolean(props.open))
watch(() => props.open, (value) => { shown.value = Boolean(value) })
</script>

<template>
  <section class="y-fold" :class="{ open: shown }">
    <button type="button" class="y-fold-head" :aria-expanded="shown" @click="shown = !shown">
      <Icon name="chevron" :size="13" :weight="2.2" class="turn" /><span>{{ title }}</span><em v-if="count !== undefined">{{ count }}</em><slot name="head" />
    </button>
    <div class="y-fold-body"><div :inert="!shown"><slot /></div></div>
  </section>
</template>
