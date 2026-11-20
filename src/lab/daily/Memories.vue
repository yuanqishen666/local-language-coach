<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { displayTargetLanguage } from '../../../shared/locales'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import Fold from './Fold.vue'
import LevelCard from './LevelCard.vue'
import { vTip } from '../core/tip'
import { useMemoriesPage } from '../logic/MemoriesPage'
import { usePaged } from './text'

const {
  t, locale, memories, suggestions, learning, editing, value, error, memoryDirty, groups, coreCount, edit, cancelEdit, save, remove,
  toggleTier, renew, resolveSuggestion, forgetMistakes, forgetLearningRecord, exportMemories, formatDate, importing, importMemories,
} = useMemoriesPage()
const vFocus = { mounted: (el: HTMLInputElement) => el.focus() }

// Presentation only. One layer is on screen at a time, a memory shows two lines until it is
// opened, and its actions and where it came from belong to the opened row.
type Layer = 'about' | 'plan' | 'learning'
const keys: Layer[] = ['about', 'plan', 'learning']
const picked = ref<Layer | ''>('')
const hasRecord = computed(() => learning.value.some((item) => item.errors.length || item.gaps.length || item.topics.length))
// The learning layer always has the level of the language in use to show, so it is what opens when nothing has been remembered yet.
const tab = computed<Layer>(() => picked.value || keys.find((key) => groups.value[key].length) || 'learning')
const hasAnything = computed(() => memories.value.length > 0 || suggestions.value.length > 0 || hasRecord.value || learning.value.length > 0)

// The learning layer is kept per language; the one being learned now opens first.
const languageCode = ref('')
const language = computed(() => learning.value.find((item) => item.code === languageCode.value) || learning.value.find((item) => item.current) || learning.value[0])
const record = computed(() => (tab.value === 'learning' ? language.value : undefined))
const recurring = computed(() => record.value?.errors.filter((item) => !item.quiet) || [])
const quietMistakes = computed(() => record.value?.errors.filter((item) => item.quiet) || [])
const recordEmpty = computed(() => !record.value || !(record.value.errors.length || record.value.gaps.length || record.value.topics.length))
function inLanguage(item: any) {
  return tab.value !== 'learning' || !language.value || !item.targetLanguageCode || item.targetLanguageCode === language.value.code
}

// What has run out is put away under its own heading instead of sitting among what still holds.
const live = computed<any[]>(() => groups.value[tab.value].filter((item) => !item.expired && inLanguage(item)))
const expired = computed<any[]>(() => groups.value[tab.value].filter((item) => item.expired && inLanguage(item)))
const { rows, left, more, reset } = usePaged(live, 8)
const picker = ref<HTMLInputElement | null>(null)
const { rows: pendingRows, left: pendingLeft, more: pendingMore } = usePaged(suggestions, 3)
const openId = ref('')
watch([tab, languageCode], () => { reset(); openId.value = '' })

function toggle(item: any) {
  openId.value = openId.value === String(item.id) ? '' : String(item.id)
}
const MISTAKES = new Set(['tense', 'agreement', 'article', 'particle', 'word_order', 'word_choice', 'collocation', 'word_form', 'register', 'phrasing', 'other'])
function mistakeLabel(category: string) {
  return t(`learning.error.${MISTAKES.has(category) ? category : 'other'}`)
}
function sourceLabel(source: any) {
  return [source.sceneTitle, formatDate(source.createdAt)].filter(Boolean).join(' · ')
}

const settled = ref(false)
onMounted(() => { window.setTimeout(() => { settled.value = true }, 700) })
</script>

<template>
  <div class="y-page y-memories">
    <header class="y-head">
      <h1>{{ t('memories.title') }}</h1>
      <span v-if="memories.length" v-tip:bottom="t('memories.coreHelp')" class="y-tag push" :class="{ accent: coreCount >= 15 }">{{ t('memories.coreCount', { count: coreCount }) }}</span>
      <button v-tip:bottom="t('memories.import')" type="button" class="y-ic" :class="{ push: !memories.length }" :aria-label="t('memories.import')" :disabled="importing" @click="picker?.click()"><Icon name="upload" :size="15" :weight="2" /></button>
      <input ref="picker" type="file" accept="application/json,.json" hidden @change="importMemories" />
      <button v-if="hasAnything" v-tip:bottom="t('memories.export')" type="button" class="y-ic" :aria-label="t('memories.export')" @click="exportMemories"><Icon name="download" :size="15" :weight="2" /></button>
    </header>
    <p v-if="error" class="y-error" role="alert">{{ error }}</p>

    <template v-if="hasAnything">
      <Fold v-if="suggestions.length" :title="t('memories.pending')" :count="suggestions.length" open class="y-pending">
        <ul>
          <li v-for="item in pendingRows" :key="item.id" class="y-pend">
            <small>{{ t(`memories.suggest.${item.kind}`) }}</small>
            <s v-if="item.kind === 'conflict' && item.memoryValue">{{ item.memoryValue }}</s>
            <b>{{ item.kind === 'conflict' || item.kind === 'promote' ? item.value : item.memoryValue || item.value }}</b>
            <p v-if="item.note">{{ item.note }}</p>
            <p v-if="item.conversationTitle || item.quote" class="y-pend-src">
              <RouterLink v-if="item.conversationId && item.conversationTitle" :to="`/conversation/${item.conversationId}`" class="y-link">{{ item.conversationTitle }}</RouterLink>
              <q v-if="item.quote">{{ item.quote }}</q>
            </p>
            <div class="y-pend-acts">
              <template v-if="item.kind === 'review' || item.kind === 'stale'">
                <button type="button" class="y-btn sm" @click="resolveSuggestion(item, 'dismiss')">{{ t('memories.keep') }}</button>
                <button v-if="item.kind === 'review' && item.conversationTitle" type="button" class="y-btn sm" @click="resolveSuggestion(item, 'toConversation')">{{ t('memories.moveToConversation') }}</button>
                <button type="button" class="y-btn sm danger" @click="resolveSuggestion(item, 'delete')">{{ t('common.delete') }}</button>
              </template>
              <template v-else>
                <button type="button" class="y-btn sm primary" @click="resolveSuggestion(item, 'accept')">{{ item.kind === 'conflict' ? t('conversation.confirmMemoryUpdate') : t('conversation.keepAlways') }}</button>
                <button type="button" class="y-btn sm" @click="resolveSuggestion(item, 'dismiss')">{{ t('memories.skip') }}</button>
              </template>
            </div>
          </li>
        </ul>
        <div v-if="pendingLeft" class="y-more-row"><button type="button" class="y-btn sm" @click="pendingMore">{{ t('nav.more') }}<em class="y-count">{{ pendingLeft }}</em></button></div>
      </Fold>

      <div class="y-seg y-mem-tabs" role="tablist">
        <button v-for="key in keys" :key="key" v-tip:bottom="t(`memories.${key}Help`)" type="button" role="tab" :aria-selected="tab === key" :aria-pressed="tab === key" @click="picked = key">{{ t(`memory.category.${key}`) }}<em>{{ groups[key].length }}</em></button>
      </div>
      <div v-if="tab === 'learning' && learning.length > 1" class="y-seg plain y-lang-seg">
        <button v-for="item in learning" :key="item.code" type="button" :aria-pressed="language?.code === item.code" @click="languageCode = item.code">{{ displayTargetLanguage(item.code, locale) }}</button>
      </div>

      <LevelCard v-if="tab === 'learning' && language" :language-code="language.code" />

      <h2 v-if="tab === 'learning' && live.length" class="y-h2 y-learn-h">{{ t('learning.goals') }}</h2>
      <TransitionGroup v-if="live.length" tag="ul" name="y-line" class="y-rows y-memlist">
        <li v-for="item in rows" :key="item.id" class="y-mem" :class="{ open: openId === String(item.id), editing: editing === item.id }">
          <div v-if="editing === item.id" class="y-mem-edit">
            <input v-model="value" v-focus class="y-input" :aria-label="t('common.edit')" @keydown.enter="save(item)" @keydown.esc="cancelEdit" />
            <button type="button" class="y-btn primary sm" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button>
            <button type="button" class="y-btn sm" @click="cancelEdit">{{ t('common.cancel') }}</button>
          </div>
          <template v-else>
            <button type="button" class="y-mem-main" :aria-expanded="openId === String(item.id)" @click="toggle(item)">
              <p :class="{ 'y-clamp2': openId !== String(item.id) }"><Icon v-if="item.tier === 'core'" name="pin" :size="12" :weight="2.2" class="y-mem-pin" :aria-label="t('memory.category.core')" /><em v-if="item.sensitive" class="y-tag">{{ t('memories.sensitive') }}</em>{{ item.value }}</p>
              <time>{{ item.validTo ? t('memory.until', { date: formatDate(item.validTo) }) : formatDate(item.updatedAt) }}</time>
            </button>
            <div class="y-fold" :class="{ open: openId === String(item.id) }">
              <div class="y-fold-body"><div :inert="openId !== String(item.id)">
                <ul v-if="item.sources?.length" class="y-mem-src">
                  <li v-for="(source, at) in item.sources.slice(0, 3)" :key="at">
                    <RouterLink v-if="source.conversationExists" :to="`/conversation/${source.conversationId}`" class="y-link">{{ sourceLabel(source) }}</RouterLink>
                    <span v-else>{{ sourceLabel(source) }}</span>
                    <q v-if="source.quote">{{ source.quote }}</q>
                  </li>
                </ul>
                <div class="y-mem-acts">
                  <button v-if="item.canBeCore || item.tier === 'core'" type="button" class="y-link" :class="{ on: item.tier === 'core' }" :aria-pressed="item.tier === 'core'" @click="toggleTier(item)"><Icon name="pin" :size="13" :weight="2" />{{ item.tier === 'core' ? t('memories.demote') : t('memories.promote') }}</button>
                  <button v-if="item.validTo" type="button" class="y-link" @click="renew(item)"><Icon name="refresh" :size="13" :weight="2" />{{ t('memories.renew') }}</button>
                  <button type="button" class="y-link" @click="edit(item)"><Icon name="edit" :size="13" :weight="2" />{{ t('common.edit') }}</button>
                  <button type="button" class="y-link danger" @click="remove(item.id)"><Icon name="trash" :size="13" :weight="2" />{{ t('common.delete') }}</button>
                </div>
              </div></div>
            </div>
          </template>
        </li>
      </TransitionGroup>
      <div v-if="left" class="y-more-row"><button type="button" class="y-btn sm" @click="more">{{ t('nav.more') }}<em class="y-count">{{ left }}</em></button></div>

      <template v-if="record">
        <section v-if="recurring.length" class="y-learn">
          <h2 class="y-h2">{{ t('learning.recurring') }}</h2>
          <ul>
            <li v-for="item in recurring" :key="item.category">
              <b>{{ mistakeLabel(item.category) }}</b><em class="y-count">{{ item.count }}</em><em v-if="item.noted" class="y-tag accent">{{ t('recap.noted') }}</em>
              <span v-if="item.examples[0]" :lang="record.code"><s>{{ item.examples[0].original }}</s>{{ item.examples[0].improved }}</span>
              <small v-if="item.practice && (item.practice.right || item.practice.wrong)">{{ t('learning.practice', { right: item.practice.right, wrong: item.practice.wrong }) }}</small>
              <button v-tip:left="t('common.delete')" type="button" class="y-ic danger" :aria-label="t('common.delete')" @click="forgetMistakes(record.code, item.category)"><Icon name="trash" :size="14" :weight="2" /></button>
            </li>
          </ul>
        </section>
        <section v-if="record.gaps.length" class="y-learn">
          <h2 class="y-h2">{{ t('learning.gaps') }}</h2>
          <ul>
            <li v-for="item in record.gaps" :key="item.id">
              <b :lang="record.code">{{ item.improved }}</b>
              <span>{{ item.original }}</span>
              <button v-tip:left="t('common.delete')" type="button" class="y-ic danger" :aria-label="t('common.delete')" @click="forgetLearningRecord(item.id)"><Icon name="trash" :size="14" :weight="2" /></button>
            </li>
          </ul>
        </section>
        <section v-if="quietMistakes.length" class="y-learn">
          <h2 class="y-h2">{{ t('learning.mastered') }}</h2>
          <p class="y-learn-tags"><span v-for="item in quietMistakes" :key="item.category" class="y-tag">{{ mistakeLabel(item.category) }}</span></p>
        </section>
        <section v-if="record.topics.length" class="y-learn">
          <h2 class="y-h2">{{ t('learning.topics') }}</h2>
          <ul>
            <li v-for="item in record.topics" :key="item.title">
              <b>{{ item.title }}</b><em v-if="item.count > 1" class="y-count">{{ item.count }}</em>
              <time>{{ formatDate(item.lastAt) }}</time>
            </li>
          </ul>
        </section>
      </template>

      <Fold v-if="expired.length" :title="t('memories.expired')" :count="expired.length" class="y-mem-old">
        <ul>
          <li v-for="item in expired" :key="item.id" class="y-mem-gone">
            <p>{{ item.value }}</p>
            <time>{{ formatDate(item.validTo) }}</time>
            <button type="button" class="y-link" @click="renew(item)">{{ t('memories.renew') }}</button>
            <button v-tip:left="t('common.delete')" type="button" class="y-ic danger" :aria-label="t('common.delete')" @click="remove(item.id)"><Icon name="trash" :size="14" :weight="2" /></button>
          </li>
        </ul>
      </Fold>

      <div v-if="!live.length && !expired.length && recordEmpty" class="y-empty"><p>{{ t(`memories.${tab}Help`) }}</p></div>
    </template>
    <div v-else-if="settled" class="y-empty"><i aria-hidden="true"><Face mood="sleepy" /></i><p>{{ t('memories.emptyTitle') }}</p></div>
  </div>
</template>
