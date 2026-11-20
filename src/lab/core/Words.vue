<script setup lang="ts">
import { inject, type Component } from 'vue'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { vTip } from './tip'
import { useWordbookPage } from '../logic/WordbookPage'

const { t, query, selected, localizing, error, current, shown, selectWord, remove, formatDate } = useWordbookPage()
const mascot = inject<Component | null>('labMascot', null)
</script>

<template>
  <div class="c-page c-words">
    <header class="c-head">
      <h1 class="c-title">{{ t('words.title') }}</h1>
      <RouterLink to="/review" class="c-btn"><Icon name="repeat" :size="16" :weight="2" />{{ t('words.reviewDue') }}</RouterLink>
    </header>

    <label class="c-search">
      <Icon name="search" :size="18" :weight="2" />
      <input v-model="query" type="search" :placeholder="t('words.search')" :aria-label="t('words.search')" />
      <span class="c-count">{{ shown.length }}</span>
    </label>
    <p v-if="error" class="c-error">{{ error }}</p>

    <div v-if="shown.length" class="c-split" :class="{ reading: !!selected }">
      <ul class="c-list c-wordlist">
        <li v-for="word in shown" :key="word.id">
          <button type="button" class="c-row c-word" :disabled="localizing === word.id" :class="{ on: selected?.id === word.id, busy: localizing === word.id }" :aria-pressed="selected?.id === word.id" @click="selectWord(word)">
            <b :lang="word.language">{{ word.term }}</b>
            <span v-if="current(word)">{{ word.meaning }}</span>
            <Icon name="chevron" :size="15" :weight="2.2" />
          </button>
        </li>
      </ul>

      <Transition name="c-pane" mode="out-in">
        <aside v-if="selected" :key="selected.id" class="c-entry">
          <header>
            <small class="c-label">{{ selected.language.toUpperCase() }}<template v-if="selected.lemma !== selected.term"> · {{ selected.lemma }}</template> · {{ formatDate(selected.created_at) }}</small>
            <button v-tip:bottom="t('common.close')" type="button" class="c-icon c-entry-close" :aria-label="t('common.close')" @click="selected = null"><Icon name="close" :size="17" :weight="2" /></button>
            <div class="c-entry-head"><h2 :lang="selected.language">{{ selected.term }}</h2><Speak :speech-id="`word-${selected.id}-term`" :text="selected.term" :language-code="selected.language" /></div>
            <p class="c-entry-meaning">{{ selected.meaning }}</p>
          </header>
          <div v-if="selected.source_sentence" class="c-quote"><blockquote :lang="selected.language">{{ selected.source_sentence }}</blockquote><Speak :speech-id="`word-${selected.id}-context`" :text="selected.source_sentence" :language-code="selected.language" compact /></div>
          <details v-if="selected.details?.senses?.length" class="c-fold">
            <summary><span>{{ t('words.commonUses') }}</span><em>{{ selected.details.senses.length }}</em><Icon name="chevron" :size="15" :weight="2.2" /></summary>
            <div class="c-senses">
              <article v-for="(sense, senseIndex) in selected.details.senses" :key="sense.meaning + sense.example">
                <em>{{ Number(senseIndex) + 1 }}</em>
                <div>
                  <b>{{ sense.meaning }}</b>
                  <div class="c-example"><p :lang="selected.language">{{ sense.example }}</p><Speak :speech-id="`word-${selected.id}-example-${senseIndex}`" :text="sense.example" :language-code="selected.language" compact /></div>
                  <small>{{ sense.translation }}</small>
                </div>
              </article>
            </div>
          </details>
          <footer><button type="button" class="c-textbtn danger" @click="remove(selected.id)"><Icon name="trash" :size="14" :weight="2" />{{ t('words.remove') }}</button></footer>
        </aside>
        <div v-else class="c-entry-idle"><i v-if="mascot" aria-hidden="true"><component :is="mascot" /></i><p>{{ t('words.select') }}</p></div>
      </Transition>
    </div>
    <div v-else class="c-empty"><i v-if="mascot" aria-hidden="true"><component :is="mascot" mood="sleepy" /></i><p>{{ t('words.emptyTitle') }}</p></div>
  </div>
</template>
