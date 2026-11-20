<script setup lang="ts">
import { computed } from 'vue'
import { normalizeLookupTerm } from '../../text-lookup'

const props = defineProps<{ text: string; languageCode?: string; disabled?: boolean }>()
const emit = defineEmits<{ pick: [term: string] }>()

const parts = computed(() => {
  try {
    const segmenter = new Intl.Segmenter(props.languageCode || undefined, { granularity: 'word' })
    return [...segmenter.segment(props.text)].map((item) => ({ text: item.segment, word: Boolean(item.isWordLike) }))
  } catch {
    return [{ text: props.text, word: false }]
  }
})

function pick(word: string) {
  // A drag that ends on a word is a phrase selection; the lookup directive already handles it.
  if (props.disabled || !window.getSelection()?.isCollapsed) return
  const term = normalizeLookupTerm(word)
  if (term) emit('pick', term)
}
</script>

<template>
  <span class="lab-words" :class="{ live: !disabled }"><template v-for="(part, index) in parts" :key="index"><span v-if="part.word" class="lab-word" @click="pick(part.text)">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></span>
</template>
