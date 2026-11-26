<script setup lang="ts">
import './daily.css'
import './pages.css'
import { ref } from 'vue'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import { vTip } from '../core/tip'
import { useImportPage } from '../logic/ImportPage'

const {
  t, content, items, draft, state, error, starting, saving, rereading, levelName,
  read, cancelRead, reread, cancelReread, remove, talk, keepWord, formatDate, siteOf,
} = useImportPage()

// Presentation only: deleting asks once more, in the row itself.
const pending = ref('')
</script>

<template>
  <div class="y-page narrow y-recap y-import">
    <header class="y-head">
      <RouterLink v-tip:bottom="t('common.back')" :to="state === 'ready' || state === 'missing' ? '/start/import' : '/start'" class="y-ic" :aria-label="t('common.back')"><Icon name="back" :size="16" :weight="2" /></RouterLink>
      <h1>{{ t('import.title') }}</h1>
    </header>

    <p v-if="state === 'loading'" class="y-recap-wait" role="status"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>

    <template v-else>
      <p v-if="error" class="y-error" role="alert">{{ error }}</p>

      <template v-if="state === 'ready' && content">
        <section class="y-recap-part">
          <div class="y-read-head">
            <h2 :lang="content.languageCode">{{ content.title }}</h2>
            <Speak :speech-id="`import-${content.id}`" :text="content.summary" :language-code="content.languageCode" compact />
            <span v-if="levelName" class="y-tag">{{ levelName }}</span>
          </div>
          <p class="y-read-text" :lang="content.languageCode">{{ content.summary }}</p>
          <p class="y-read-from">
            <span>{{ t('import.source') }}</span>
            <a v-if="content.source.url" :href="content.source.url" target="_blank" rel="noopener noreferrer">{{ siteOf(content.source.url) || content.source.url }}</a>
            <span v-else>{{ t('import.pasted') }}</span>
            <button v-if="content.source.url && rereading !== content.id" v-tip="t('import.rereadTip')" type="button" class="y-link" :disabled="Boolean(rereading)" @click="reread(content.id)"><Icon name="refresh" :size="13" :weight="2" />{{ t('import.reread') }}</button>
          </p>
          <div v-if="rereading === content.id" class="y-import-progress">
            <progress class="y-sr" :aria-label="t('import.reading')"></progress>
            <span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>{{ t('import.reading') }}</span>
            <button type="button" class="y-link" @click="cancelReread">{{ t('common.cancel') }}</button>
          </div>
        </section>

        <section v-if="content.words.length" class="y-recap-part">
          <h2 class="y-h2">{{ t('import.words') }}</h2>
          <ul class="y-read-keep">
            <li v-for="word in content.words" :key="word.term">
              <span><b :lang="content.languageCode">{{ word.term }}</b><small v-if="word.meaning">{{ word.meaning }}</small></span>
              <em v-if="word.wordId" class="y-tag accent"><Icon name="check" :size="11" :weight="2.6" />{{ t('lookup.saved') }}</em>
              <button v-else type="button" class="y-btn sm" :disabled="saving === word.term" @click="keepWord(word.term)"><Icon name="plus" :size="13" :weight="2" />{{ t('lookup.add') }}</button>
            </li>
          </ul>
        </section>

        <section v-if="content.questions.length" class="y-recap-part">
          <h2 class="y-h2">{{ t('import.questions') }}</h2>
          <ul class="y-read-asks">
            <li v-for="(question, at) in content.questions" :key="at">
              <button type="button" :class="{ busy: starting === at }" :disabled="starting >= 0" @click="talk(at)">
                <span :lang="content.languageCode">{{ question }}</span>
                <span v-if="starting === at" class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                <Icon v-else name="arrow" :size="14" :weight="2.2" />
              </button>
            </li>
          </ul>
        </section>
      </template>

      <template v-else-if="state === 'list' || state === 'reading'">
        <form class="y-read-box" @submit.prevent="read">
          <textarea v-model="draft" class="y-input" name="material" rows="7" :placeholder="t('import.placeholder')" :aria-label="t('import.title')"></textarea>
          <div class="y-read-box-actions">
            <div v-if="state === 'reading'" class="y-import-progress">
              <progress class="y-sr" :aria-label="t('import.reading')"></progress>
              <span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span>
              <span>{{ t('import.reading') }}</span>
              <button type="button" class="y-link" @click="cancelRead">{{ t('common.cancel') }}</button>
            </div>
            <button v-else type="submit" class="y-btn primary" :disabled="!draft.trim()">{{ t('import.read') }}</button>
          </div>
        </form>

        <section v-if="items.length" class="y-recap-part">
          <h2 class="y-h2">{{ t('import.recent') }}</h2>
          <ul class="y-rows">
            <li v-for="item in items" :key="item.id" class="y-row y-talk">
              <RouterLink :to="`/start/import/${item.id}`" class="y-talk-main">
                <b :lang="item.languageCode">{{ item.title }}</b>
                <span>{{ siteOf(item.source.url) || t('import.pasted') }}</span>
              </RouterLink>
              <time>{{ formatDate(item.createdAt) }}</time>
              <div class="y-acts" :class="{ sure: pending === item.id || rereading === item.id }">
                <template v-if="rereading === item.id">
                  <progress class="y-sr" :aria-label="t('import.reading')"></progress>
                  <span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span>
                  <button v-tip="t('common.cancel')" type="button" class="y-ic" :aria-label="t('common.cancel')" @click="cancelReread"><Icon name="close" :size="15" :weight="2" /></button>
                </template>
                <template v-else-if="pending === item.id">
                  <button type="button" class="y-btn sm danger" @click="remove(item.id)">{{ t('common.delete') }}</button>
                  <button v-tip="t('common.cancel')" type="button" class="y-ic" :aria-label="t('common.cancel')" @click="pending = ''"><Icon name="close" :size="15" :weight="2" /></button>
                </template>
                <template v-else>
                  <button v-if="item.source.url" v-tip="t('import.rereadTip')" type="button" class="y-ic" :aria-label="t('import.reread')" :disabled="Boolean(rereading)" @click="reread(item.id)"><Icon name="refresh" :size="15" :weight="1.9" /></button>
                  <button v-tip="t('common.delete')" type="button" class="y-ic danger" :aria-label="t('common.delete')" @click="pending = item.id"><Icon name="trash" :size="15" :weight="1.9" /></button>
                </template>
              </div>
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>
