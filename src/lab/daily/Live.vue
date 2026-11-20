<script setup lang="ts">
import './daily.css'
import './pages.css'
import Icon from '../kit/Icon.vue'
import Fold from './Fold.vue'
import LiveOutcome from './LiveOutcome.vue'
import { vTip } from '../core/tip'
import { formatWhen } from '../kit/when'
import { useLivePage } from '../logic/LivePage'

const {
  t, locale, state, session, result, busy, error, used, stuck, corrected, maxNotes, languageCode, earlier,
  load, takeCard, addStuck, addCorrected, finish, remove, mistakeLabel, usedCount, back,
} = useLivePage()
</script>

<template>
  <div class="y-page narrow y-live">
    <header class="y-head">
      <button v-tip:bottom="t('common.back')" type="button" class="y-ic" :aria-label="t('common.back')" @click="back"><Icon name="back" :size="16" :weight="2" /></button>
      <h1>{{ t('live.title') }}</h1>
    </header>

    <p v-if="state === 'loading'" class="y-recap-wait" role="status"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
    <p v-else-if="state === 'failed'" class="y-error y-recap-error" role="alert"><span>{{ t('live.failed') }}</span><button type="button" class="y-link" @click="load"><Icon name="refresh" :size="13" :weight="2" />{{ t('placement.retry') }}</button></p>

    <template v-else>
      <section v-if="!session" class="y-live-start">
        <p v-if="!result" class="y-recap-note">{{ t('live.intro') }}</p>
        <button type="button" class="y-btn primary" :disabled="busy === 'card'" @click="takeCard">{{ t(result ? 'live.takeAnother' : 'live.take') }}</button>
      </section>

      <template v-if="session">
        <section class="y-recap-part">
          <h2 class="y-h2"><span>{{ t('live.card') }}</span></h2>
          <p v-if="!session.items.length" class="y-recap-note">{{ t('live.cardEmpty') }}</p>
          <ul v-else class="y-live-card">
            <li v-for="(item, index) in session.items" :key="index">
              <div v-if="item.kind === 'pattern'">
                <small>{{ t('live.watch') }}</small>
                <p><b>{{ mistakeLabel(item.category) }}</b></p>
                <p v-if="item.example" class="eg" :lang="languageCode">{{ item.example }}</p>
              </div>
              <div v-else-if="item.kind === 'words'">
                <small>{{ t('live.useWords') }}</small>
                <p v-for="word in item.words" :key="word.term"><b :lang="languageCode">{{ word.term }}</b><span v-if="word.meaning">{{ word.meaning }}</span></p>
              </div>
              <div v-else>
                <small>{{ t('live.say') }}</small>
                <p v-for="(sentence, at) in item.sentences" :key="at"><b :lang="languageCode">{{ sentence.improved }}</b><span v-if="sentence.original">{{ sentence.original }}</span></p>
              </div>
              <button v-tip="t('live.usedTip')" type="button" class="y-btn sm y-used-go" :aria-pressed="used[index]" @click="used[index] = !used[index]"><Icon v-if="used[index]" name="check" :size="12" :weight="2.6" />{{ t('live.used') }}</button>
            </li>
          </ul>
        </section>

        <section class="y-recap-part y-live-after">
          <h2 class="y-h2"><span>{{ t('live.after') }}</span></h2>
          <div class="y-field">
            <span id="live-stuck" class="y-label">{{ t('live.stuck') }}</span>
            <input v-for="(_note, index) in stuck" :key="index" v-model="stuck[index]" class="y-input" type="text" maxlength="300" aria-labelledby="live-stuck" />
            <button v-if="stuck.length < maxNotes" type="button" class="y-link" @click="addStuck"><Icon name="plus" :size="12" :weight="2.2" />{{ t('live.addLine') }}</button>
          </div>
          <div class="y-field">
            <span class="y-label">{{ t('live.corrected') }}</span>
            <div v-for="(pair, index) in corrected" :key="index" class="y-pair">
              <input v-model="pair.said" class="y-input" type="text" maxlength="300" :lang="languageCode" :placeholder="t('live.said')" :aria-label="t('live.said')" />
              <input v-model="pair.right" class="y-input" type="text" maxlength="300" :lang="languageCode" :placeholder="t('live.right')" :aria-label="t('live.right')" />
            </div>
            <button v-if="corrected.length < maxNotes" type="button" class="y-link" @click="addCorrected"><Icon name="plus" :size="12" :weight="2.2" />{{ t('live.addLine') }}</button>
          </div>
          <p v-if="error" class="y-error" role="alert">{{ error }}</p>
          <footer class="y-recap-end">
            <button type="button" class="y-btn" :disabled="Boolean(busy)" @click="remove(session.id)">{{ t('live.drop') }}</button>
            <button v-tip="t('live.finishTip')" type="button" class="y-btn primary" :disabled="Boolean(busy)" @click="finish">{{ t(busy === 'debrief' ? 'live.writing' : 'live.finish') }}</button>
          </footer>
        </section>
      </template>

      <section v-if="result?.outcome" class="y-recap-part">
        <h2 class="y-h2"><span>{{ t('live.recorded') }}</span></h2>
        <LiveOutcome :outcome="result.outcome" :language-code="result.languageCode" />
      </section>
      <p v-if="error && !session" class="y-error" role="alert">{{ error }}</p>

      <section v-if="earlier.length" class="y-recap-part y-live-past">
        <h2 class="y-h2"><span>{{ t('live.earlier') }}</span></h2>
        <Fold v-for="item in earlier" :key="item.id" :title="formatWhen(item.finishedAt || item.createdAt, locale)">
          <template #head><em v-if="item.items.length" class="y-tag">{{ t('live.usedOf', { used: usedCount(item), count: item.items.length }) }}</em></template>
          <div class="y-live-past-in">
            <LiveOutcome v-if="item.outcome" :outcome="item.outcome" :language-code="item.languageCode" />
            <button type="button" class="y-link danger" :disabled="Boolean(busy)" @click="remove(item.id)"><Icon name="trash" :size="12" :weight="2" />{{ t('common.delete') }}</button>
          </div>
        </Fold>
      </section>
    </template>
  </div>
</template>
