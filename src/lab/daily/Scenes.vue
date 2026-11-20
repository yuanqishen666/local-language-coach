<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import SceneGlyph from './SceneGlyph.vue'
import Toys from './Toys.vue'
import { vTip } from '../core/tip'
import { useSceneBuilderPage } from '../logic/SceneBuilderPage'

const {
  store, t, loading, startingPreset, setups, actionError, errorSource, errorFixInSettings, clearError, openModelSettings,
  customSection, form, domains, instantPresets, isStarting, openPreset, generate, start, surprise,
} = useSceneBuilderPage()

// One way of starting on screen at a time: write your own, or take a ready one.
const way = ref<'own' | 'ready'>('own')
// An error stays with the way of starting that caused it.
const errorHere = computed(() => Boolean(actionError.value) && (errorSource.value === 'random' || errorSource.value === (way.value === 'ready' ? 'preset' : 'custom')))
function go(next: 'own' | 'ready') {
  if (way.value === next) return
  way.value = next
  clearError()
}

// What the other person says is in the language being learned, whatever the page is written in.
const targetLanguageCode = computed(() => store.settings?.learning.targetLanguageCode || undefined)

// The two things to write sit in boxes that grow with the text.
const placeInput = ref<HTMLTextAreaElement | null>(null)
const topic = ref<HTMLTextAreaElement | null>(null)
function fit(el: HTMLTextAreaElement | null) {
  if (!el || !el.offsetParent) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}
watch(() => form.value.place, () => fit(placeInput.value), { flush: 'post' })
watch(() => form.value.detail, () => fit(topic.value), { flush: 'post' })
onMounted(() => {
  fit(placeInput.value)
  fit(topic.value)
})

// Someone the model left without a name or a role is still shown as a person, in the language of the page.
const who = (setup: { partnerName?: string; partnerRole?: string }) => setup.partnerName || setup.partnerRole || t('conversation.openLabel')

const people = ref<HTMLElement | null>(null)
const opened = ref(0)
watch(() => setups.value.length, async (count) => {
  if (!count) return
  opened.value = 0
  peek.value = -1
  await nextTick()
  people.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
})

// The conversation is put together on one stage, piece by piece: the kind of conversation, where
// it happens and with whom, what it is about, and then the person who opens it.
const place = computed(() => String(form.value.place || '').trim())
const detail = computed(() => String(form.value.detail || '').trim())
const at = ref(0)
const peek = ref(-1)
const person = computed(() => {
  if (!setups.value.length) return null
  return setups.value[peek.value >= 0 ? peek.value : opened.value >= 0 ? opened.value : 0] || setups.value[0]
})
const next = computed(() => (!place.value ? 2 : !detail.value ? 3 : !setups.value.length ? 4 : 0))

const speaking = ref(false)
let speakingTimer = 0
watch(() => person.value?.openingLine, (line) => {
  window.clearTimeout(speakingTimer)
  speaking.value = Boolean(line)
  if (line) speakingTimer = window.setTimeout(() => { speaking.value = false }, 1600)
})
onBeforeUnmount(() => {
  window.clearTimeout(speakingTimer)
  window.clearTimeout(pokedTimer)
})

// The face answers a click, so it is something to play with and not only to look at.
const poked = ref(false)
let pokedTimer = 0
function poke() {
  window.clearTimeout(pokedTimer)
  poked.value = false
  void nextTick(() => {
    poked.value = true
    pokedTimer = window.setTimeout(() => { poked.value = false }, 900)
  })
}

const mood = computed(() => {
  if (errorHere.value) return 'worried'
  if (isStarting.value || poked.value) return 'happy'
  if (loading.value) return 'wow'
  if (speaking.value) return 'talk'
  if (person.value || place.value || detail.value || at.value) return 'calm'
  return 'sleepy'
})
</script>

<template>
  <div class="y-page y-scenes" :aria-busy="isStarting || loading">
    <header class="y-head wrap">
      <h1>{{ t('home.settingTitle') }}</h1>
      <div class="y-seg push" role="group">
        <button type="button" :aria-pressed="way === 'own'" @click="go('own')">{{ t('scene.domain.custom') }}</button>
        <button type="button" :aria-pressed="way === 'ready'" @click="go('ready')">{{ t('scene.quickEyebrow') }}</button>
      </div>
      <div class="y-head-more">
        <button v-tip:bottom="t('scene.randomTip')" type="button" class="y-btn sm" :disabled="isStarting || loading" @click="surprise">
          <span v-if="startingPreset === 'random'" class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span><Icon v-else name="dice" :size="13" :weight="2" />{{ t('scene.random') }}
        </button>
        <RouterLink v-tip:bottom="t('import.entryTip')" to="/start/import" class="y-btn sm"><Icon name="link" :size="13" :weight="2" />{{ t('import.title') }}</RouterLink>
      </div>
    </header>

    <p v-if="errorHere" class="y-error" role="alert">
      <span>{{ actionError }}</span>
      <button v-if="errorFixInSettings" type="button" class="ys-fix" @click="openModelSettings">{{ t('nav.settings') }}<Icon name="arrow" :size="13" :weight="2.2" /></button>
    </p>

    <div v-show="way === 'own'" class="ys-own">
      <Toys side="left" />

      <section ref="customSection" class="ys-stage" :class="{ busy: loading, met: Boolean(person) }">
        <!-- The line shown here is read again, as text, on the person it belongs to below. -->
        <div class="ys-talk" aria-hidden="true">
          <div class="ys-them">
            <i class="ys-head" :class="{ poke: poked }" @click="poke"><Face :mood="mood" /></i>
            <div class="ys-bubble">
              <span v-if="loading" class="y-dots"><i></i><i></i><i></i></span>
              <template v-else-if="person">
                <small>{{ t('scene.partnerOpens') }}</small>
                <p :key="person.openingLine" :lang="targetLanguageCode">{{ person.openingLine }}</p>
              </template>
              <span v-else class="ys-rest"><i></i><i></i><i></i></span>
            </div>
          </div>
          <span class="ys-you"><i></i></span>
        </div>

        <form class="ys-bricks" autocomplete="off" @submit.prevent="generate">
          <div class="ys-brick wide on">
            <span id="custom-kind" class="ys-brick-label"><i class="ys-n on" aria-hidden="true">1</i>{{ t('scene.chooseMood') }}</span>
            <div class="ys-kinds" role="group" aria-labelledby="custom-kind">
              <button
                v-for="id in domains" :key="id" v-tip="form.domain === id ? undefined : t(`scene.domain.${id}Help`)"
                type="button" class="ys-kind" :aria-pressed="form.domain === id" @click="form.domain = id"
              >
                <SceneGlyph :id="id" />
                <b>{{ t(`scene.domain.${id}`) }}</b>
              </button>
            </div>
            <p :key="form.domain" class="ys-kind-help">{{ t(`scene.domain.${form.domain}Help`) }}</p>
          </div>
          <label class="ys-brick" :class="{ on: place, next: next === 2 }" for="custom-place">
            <span class="ys-brick-label"><i class="ys-n" :class="{ on: place }" aria-hidden="true">2</i>{{ t('scene.placeOpenLabel') }}</span>
            <textarea id="custom-place" ref="placeInput" v-model="form.place" name="place" autocomplete="off" rows="3" :placeholder="t(`scene.placeExample.${form.domain}`)" @focus="at = 2" @blur="at = 0"></textarea>
          </label>
          <label class="ys-brick" :class="{ on: detail, next: next === 3 }" for="custom-detail">
            <span class="ys-brick-label"><i class="ys-n" :class="{ on: detail }" aria-hidden="true">3</i>{{ t('scene.topicLabel') }}</span>
            <textarea id="custom-detail" ref="topic" v-model="form.detail" name="detail" autocomplete="off" rows="3" :placeholder="t(`scene.topicExample.${form.domain}`)" @focus="at = 3" @blur="at = 0"></textarea>
          </label>
          <footer>
            <button class="y-btn primary" type="submit" :disabled="loading || isStarting" :aria-label="loading ? t('scene.generatingOpen') : undefined">
              <template v-if="loading"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
              <template v-else>{{ t('scene.generateOpen') }}<Icon name="arrow" :size="14" :weight="2.2" class="go" /></template>
            </button>
          </footer>
        </form>

        <section v-if="setups.length" ref="people" class="y-people" @pointerleave="peek = -1">
          <h2 class="y-h2"><i class="ys-n on" aria-hidden="true">4</i>{{ t('scene.choosePerson') }}</h2>
          <ul>
            <li v-for="(setup, index) in setups" :key="setup.title + setup.openingLine" class="y-person" :class="{ open: opened === index }" @pointerenter="peek = index">
              <button type="button" class="y-person-head" :aria-expanded="opened === index" @click="opened = opened === index ? -1 : index">
                <i aria-hidden="true">{{ [...who(setup).trim()][0] }}</i>
                <b>{{ who(setup) }}</b>
                <span>{{ setup.partnerRole }}</span>
                <Icon name="chevron" :size="13" :weight="2.2" class="turn" />
              </button>
              <div class="y-fold-body"><div :inert="opened !== index">
                <div class="y-person-body">
                  <h3>{{ setup.title }}</h3>
                  <blockquote><small class="y-label">{{ t('scene.partnerOpens') }}</small><span :lang="targetLanguageCode">{{ setup.openingLine }}</span></blockquote>
                  <button type="button" class="y-btn primary sm" :disabled="isStarting" @click="start(setup)">{{ t('scene.startOpen') }}<Icon name="arrow" :size="13" :weight="2.2" class="go" /></button>
                </div>
              </div></div>
            </li>
          </ul>
        </section>
      </section>

      <Toys side="right" />
    </div>

    <ul v-show="way === 'ready'" class="ys-tiles">
      <li v-for="(preset, index) in instantPresets" :key="preset.id" :style="{ '--at': index }">
        <button type="button" class="ys-tile" :class="{ going: startingPreset === preset.id }" :disabled="isStarting" :aria-label="startingPreset === preset.id ? t('scene.presetStarting') : undefined" @click="openPreset(preset.id)">
          <span class="ys-thumb"><SceneGlyph :id="preset.id" /></span>
          <b>{{ t(preset.titleKey) }}</b>
          <small>{{ t(preset.descriptionKey) }}</small>
          <em class="ys-go">
            <template v-if="startingPreset === preset.id"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
            <template v-else>{{ t('home.openAction') }}<Icon name="arrow" :size="13" :weight="2.2" /></template>
          </em>
        </button>
      </li>
    </ul>
  </div>
</template>
