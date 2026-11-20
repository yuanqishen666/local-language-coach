<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import { useSceneBuilderPage } from '../logic/SceneBuilderPage'

const {
  t, loading, startingPreset, setups, actionError, customSection, form, instantPresets, isStarting, openPreset, generate, start,
} = useSceneBuilderPage()

// Presentation only. The category picker is gone: the two fields say everything, so requests go out as "custom".
onMounted(async () => {
  await nextTick()
  form.value.domain = 'custom'
})
const topic = ref<HTMLTextAreaElement | null>(null)
watch(() => form.value.detail, () => {
  const el = topic.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight + 2, 180)}px`
}, { flush: 'post' })
const people = ref<HTMLElement | null>(null)
watch(() => setups.value.length, async (count) => {
  if (!count) return
  await nextTick()
  people.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})
</script>

<template>
  <div class="c-page c-scenes" :aria-busy="isStarting || loading">
    <header class="c-head"><h1 class="c-title">{{ t('home.settingTitle') }}</h1></header>

    <section ref="customSection" class="c-own">
      <form autocomplete="off" @submit.prevent="generate">
        <div class="c-field">
          <label for="custom-place">{{ t('scene.placeOpenLabel') }}</label>
          <input id="custom-place" v-model="form.place" class="c-input" name="place" autocomplete="off" :placeholder="t('scene.placeOpenPlaceholder')" />
        </div>
        <div class="c-field">
          <label for="custom-detail">{{ t('scene.topicLabel') }}</label>
          <textarea id="custom-detail" ref="topic" v-model="form.detail" class="c-input" name="detail" autocomplete="off" rows="1"></textarea>
        </div>
        <button class="c-btn primary" type="submit" :disabled="loading || isStarting" :aria-label="loading ? t('scene.generatingOpen') : undefined">
          <template v-if="loading"><span class="c-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
          <template v-else>{{ t('scene.generateOpen') }}<Icon name="arrow" :size="16" :weight="2.2" /></template>
        </button>
      </form>
    </section>

    <p v-if="actionError" class="c-error" role="alert">{{ actionError }}</p>

    <section v-if="setups.length" ref="people" class="c-people">
      <h2 class="c-h2">{{ t('scene.choosePerson') }}</h2>
      <div class="c-people-grid">
        <article v-for="(setup, index) in setups" :key="setup.title + setup.openingLine" class="c-person" :style="{ '--i': index }">
          <header>
            <i class="c-avatar" aria-hidden="true">{{ [...(setup.partnerName || setup.partnerRole || '•').trim()][0] }}</i>
            <div><b>{{ setup.partnerName || setup.partnerRole }}</b><span>{{ setup.partnerRole }}</span></div>
          </header>
          <h3>{{ setup.title }}</h3>
          <div class="c-person-line">
            <small class="c-label">{{ t('scene.partnerOpens') }}</small>
            <blockquote>{{ setup.openingLine }}</blockquote>
          </div>
          <button type="button" class="c-btn primary" :disabled="isStarting" @click="start(setup)">{{ t('scene.startOpen') }}<Icon name="arrow" :size="15" :weight="2.2" /></button>
        </article>
      </div>
    </section>

    <section class="c-quick" :aria-label="t('scene.quickEyebrow')">
      <h2 class="c-h2">{{ t('scene.quickEyebrow') }}</h2>
      <div class="c-quick-grid">
        <button v-for="(preset, index) in instantPresets" :key="preset.id" type="button" class="c-preset" :class="{ going: startingPreset === preset.id }" :style="{ '--i': index }" :disabled="isStarting" :aria-label="startingPreset === preset.id ? t('scene.presetStarting') : undefined" @click="openPreset(preset.id)">
          <b>{{ t(preset.titleKey) }}</b>
          <small>{{ t(preset.descriptionKey) }}</small>
          <span class="c-preset-go">
            <template v-if="startingPreset === preset.id"><span class="c-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
            <template v-else>{{ t('home.openAction') }}<Icon name="arrow" :size="14" :weight="2.2" /></template>
          </span>
        </button>
      </div>
    </section>
  </div>
</template>
