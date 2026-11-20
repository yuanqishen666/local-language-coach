<script setup lang="ts">
import './daily.css'
import './pages.css'
import Icon from '../kit/Icon.vue'
import Speak from './Speak.vue'
import Shadow from './Shadow.vue'
import { vTip } from '../core/tip'
import { useRecapPage } from '../logic/RecapPage'

const {
  t, recap, state, error, busy, actionError, minTurns, languageCode, expressionName, difficultyLine, helpUsed, changeLines,
  mistakeLabel, write, notePattern, addTakeaway, startPractice, backToConversation, spendLine,
} = useRecapPage()
</script>

<template>
  <div class="y-page narrow y-recap">
    <header class="y-head">
      <button v-tip:bottom="t('recap.back')" type="button" class="y-ic" :aria-label="t('recap.back')" @click="backToConversation"><Icon name="back" :size="16" :weight="2" /></button>
      <h1>{{ t('recap.open') }}</h1>
    </header>

    <p v-if="state === 'loading' || state === 'writing'" class="y-recap-wait" role="status"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span><template v-if="state === 'writing'">{{ t('recap.writing') }}</template></p>
    <p v-else-if="state === 'short'" class="y-recap-note">{{ t('recap.short', { count: minTurns }) }}</p>
    <p v-else-if="state === 'failed'" class="y-error y-recap-error" role="alert"><span>{{ error }}</span><button type="button" class="y-link" @click="write"><Icon name="refresh" :size="13" :weight="2" />{{ t('placement.retry') }}</button></p>

    <template v-else-if="recap">
      <p v-if="recap.stale" class="y-recap-note y-recap-stale"><span>{{ t('recap.stale') }}</span><button type="button" class="y-link" @click="write"><Icon name="refresh" :size="13" :weight="2" />{{ t('recap.refresh') }}</button></p>

      <section v-if="recap.good" class="y-recap-part">
        <h2 class="y-h2">{{ t('recap.good') }}</h2>
        <q class="y-recap-quote" :lang="languageCode">{{ recap.good.quote }}</q>
        <p v-if="recap.good.comment" class="y-recap-say">{{ recap.good.comment }}</p>
      </section>

      <section v-if="recap.pattern" class="y-recap-part">
        <h2 class="y-h2">{{ t('recap.pattern') }}</h2>
        <p class="y-recap-kind"><b>{{ mistakeLabel(recap.pattern.category) }}</b><span v-if="recap.pattern.recurring" class="y-tag">{{ t('recap.recurring') }}</span></p>
        <p v-if="recap.pattern.comment" class="y-recap-say">{{ recap.pattern.comment }}</p>
        <ul v-if="recap.pattern.examples.length" class="y-recap-pairs">
          <li v-for="(example, index) in recap.pattern.examples" :key="index" :lang="languageCode"><s>{{ example.original }}</s><b>{{ example.improved }}</b></li>
        </ul>
        <div class="y-recap-acts">
          <span v-if="recap.pattern.noted" class="y-tag accent"><Icon name="check" :size="11" :weight="2.6" />{{ t('recap.noted') }}</span>
          <button v-else v-tip="t('recap.noteTip')" type="button" class="y-btn sm" :disabled="busy === 'note'" @click="notePattern"><Icon name="pin" :size="13" :weight="2" />{{ t('recap.note') }}</button>
        </div>
      </section>

      <section v-if="recap.takeaway" class="y-recap-part">
        <h2 class="y-h2">{{ t('recap.takeaway') }}</h2>
        <p class="y-recap-take"><b :lang="languageCode">{{ recap.takeaway.improved }}</b><Speak :speech-id="`recap-${recap.conversationId}`" :text="recap.takeaway.improved" :language-code="languageCode" compact /></p>
        <div class="y-shadow-row"><Shadow :text="recap.takeaway.improved" :language-code="languageCode" /></div>
        <p v-if="recap.takeaway.meaning" class="y-recap-meaning">{{ recap.takeaway.meaning }}</p>
        <p v-if="recap.takeaway.original" class="y-recap-was" :lang="languageCode"><s>{{ recap.takeaway.original }}</s></p>
        <p v-if="recap.takeaway.comment" class="y-recap-say">{{ recap.takeaway.comment }}</p>
        <div class="y-recap-acts">
          <span v-if="recap.takeaway.wordId" class="y-tag accent"><Icon name="check" :size="11" :weight="2.6" />{{ t('lookup.saved') }}</span>
          <button v-else type="button" class="y-btn sm" :disabled="busy === 'word'" @click="addTakeaway"><Icon name="plus" :size="13" :weight="2" />{{ t('lookup.add') }}</button>
        </div>
      </section>

      <section v-if="recap.arranged?.length" class="y-recap-part">
        <h2 class="y-h2">{{ t('wordbook.arranged') }}</h2>
        <ul class="y-recap-words">
          <li v-for="word in recap.arranged" :key="word.wordId">
            <b :lang="languageCode">{{ word.term }}</b>
            <span v-if="word.meaning">{{ word.meaning }}</span>
            <em class="y-tag" :class="{ accent: word.result === 'right' }">{{ t(`wordbook.result.${word.result || 'none'}`) }}</em>
          </li>
        </ul>
      </section>

      <section v-if="recap.expression || recap.session" class="y-recap-part">
        <h2 class="y-h2">{{ t('level.title') }}</h2>
        <dl class="y-place-parts y-recap-levels">
          <div v-if="recap.expression"><dt>{{ t('recap.expression') }}</dt><dd>{{ expressionName }}</dd></div>
          <div v-if="recap.session"><dt>{{ t('level.difficulty') }}</dt><dd>{{ difficultyLine }}</dd></div>
        </dl>
        <p v-if="recap.expression?.reason" class="y-recap-say">{{ recap.expression.reason }}</p>
        <p v-if="recap.session?.verdict || helpUsed.length" class="y-place-tags">
          <span v-if="recap.session?.verdict" class="y-tag accent">{{ t(`recap.verdict.${recap.session.verdict}`) }}</span>
          <span v-for="used in helpUsed" :key="used.kind" class="y-tag">{{ t(`recap.used.${used.kind}`) }} {{ used.count }}</span>
        </p>
        <ul v-if="changeLines.length" class="y-recap-changes">
          <li v-for="(line, index) in changeLines" :key="index">{{ line }}</li>
        </ul>
      </section>

      <p v-if="spendLine" class="y-spent">{{ spendLine }}</p>
      <p v-if="actionError" class="y-error" role="alert">{{ actionError }}</p>
      <footer class="y-recap-end">
        <button type="button" class="y-btn" @click="backToConversation">{{ t('recap.back') }}</button>
        <button v-if="recap.practice" v-tip="t('recap.practiceTip')" type="button" class="y-btn primary go" :disabled="busy === 'practice'" @click="startPractice">{{ t(busy === 'practice' ? 'recap.preparingPractice' : 'recap.practice') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
      </footer>
    </template>
  </div>
</template>
