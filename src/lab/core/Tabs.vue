<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import Icon from '../kit/Icon.vue'
import { shellNav } from '../useShell'

/** Phone navigation: the four things done most, the rest behind “more”. */
const props = defineProps<{ active: (path: string) => boolean; due: number }>()
const { t } = useI18n()
const route = useRoute()
const open = ref(false)
const front = shellNav.slice(0, 4)
const rest = shellNav.slice(4)
const restActive = computed(() => rest.some((item) => props.active(item.to)))
watch(() => route.path, () => { open.value = false })
</script>

<template>
  <nav class="c-tabs">
    <RouterLink v-for="item in front" :key="item.to" :to="item.to" :class="{ on: active(item.to) }">
      <Icon :name="item.icon" :size="20" :weight="2" /><span>{{ t(item.label) }}</span>
      <em v-if="item.to === '/review' && due">{{ due }}</em>
    </RouterLink>
    <button type="button" :class="{ on: open || restActive }" :aria-expanded="open" @click="open = !open"><Icon name="more" :size="20" :weight="2" /><span>{{ t('nav.more') }}</span></button>
  </nav>
  <Transition name="c-veil"><div v-if="open" class="c-veil clear c-tabs-veil" @click="open = false"></div></Transition>
  <Transition name="c-more">
    <div v-if="open" class="c-more" role="menu">
      <RouterLink v-for="item in rest" :key="item.to" :to="item.to" role="menuitem" :class="{ on: active(item.to) }"><Icon :name="item.icon" :size="18" :weight="2" />{{ t(item.label) }}</RouterLink>
    </div>
  </Transition>
</template>
