<script setup lang="ts">
import './daily.css'
import './pages.css'
import { computed } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import { vTip } from '../core/tip'
import { usePracticePage } from '../logic/PracticePage'

const {
  t, practice, at, choice, answerText, busy, error, loadFailed, finished, languageCode, languageName, total, item, result, last,
  canSubmit, letters, givenIndex, rightIndex, mistakeLabel, submit, next, leave,
} = usePracticePage()

// Presentation only: how far along the bar is, counting the question on screen once it is answered.
const done = computed(() => (finished.value ? total.value : at.value + (result.value ? 1 : 0)))
const mood = computed(() => (busy.value ? 'talk' : finished.value || result.value?.right ? 'happy' : 'calm'))
</script>

<template>
  <main class="y-onboard y-place y-practice">
    <div class="y-onboard-in wide">
      <header>
        <b class="y-brand"><i aria-hidden="true"><Face :mood="mood" /></i>{{ t('practice.title') }}</b>
        <span v-if="practice && !finished" class="y-place-count">{{ at + 1 }} / {{ total }}</span>
        <button v-tip:bottom="t('common.close')" type="button" class="y-ic" :aria-label="t('common.close')" :disabled="busy" @click="leave"><Icon name="close" :size="15" :weight="2.2" /></button>
      </header>
      <div v-if="practice && !finished" class="y-place-bar" role="progressbar" aria-valuemin="0" :aria-valuemax="total" :aria-valuenow="done"><i :style="{ width: `${(done / Math.max(1, total)) * 100}%` }"></i></div>

      <Transition name="y-view" mode="out-in">
        <section v-if="!practice" key="wait" class="y-leaf">
          <p class="y-place-wait" role="status"><template v-if="loadFailed">{{ t('practice.missing') }}</template><span v-else class="y-dots" :aria-label="t('common.loading')"><i></i><i></i><i></i></span></p>
        </section>

        <section v-else-if="finished" key="done" class="y-leaf y-place-result">
          <h1>{{ t('practice.result', { right: practice.right, total }) }}</h1>
          <ul class="y-practice-review">
            <li v-for="entry in practice.items" :key="entry.id" :class="entry.result?.right ? 'right' : 'wrong'">
              <i aria-hidden="true"><Icon :name="entry.result?.right ? 'check' : 'close'" :size="12" :weight="2.6" /></i>
              <span class="y-sr">{{ t(entry.result?.right ? 'practice.right' : 'practice.wrong') }}</span>
              <p :lang="languageCode">{{ entry.result?.answer || entry.sentence }}</p>
              <small>{{ mistakeLabel(entry.category) }}</small>
            </li>
          </ul>
        </section>

        <section v-else-if="item" :key="item.id" class="y-leaf">
          <small class="y-h2">{{ mistakeLabel(item.category) }}</small>
          <template v-if="item.kind === 'gap'">
            <h1>{{ t('practice.gap') }}</h1>
            <p class="y-place-text" :lang="languageCode">{{ item.sentence }}</p>
            <div class="y-picks one" :class="{ marked: result }">
              <button
                v-for="(option, index) in item.options"
                :key="index"
                type="button"
                :class="{ right: result && index === rightIndex, wrong: result && index === givenIndex && index !== rightIndex }"
                :aria-pressed="(result ? givenIndex : choice) === index"
                :disabled="busy || Boolean(result)"
                :lang="languageCode"
                @click="choice = index"
              ><small>{{ letters[index] }}</small><b>{{ option }}</b><Icon v-if="result && index === rightIndex" name="check" :size="14" :weight="2.4" /></button>
            </div>
          </template>
          <template v-else>
            <h1>{{ t(item.task === 'fix' ? 'practice.fix' : 'practice.rephrase') }}</h1>
            <p class="y-place-text" :lang="languageCode">{{ item.sentence }}</p>
            <label class="y-place-label" for="practice-answer">{{ t('placement.answerIn', { language: languageName }) }}</label>
            <textarea id="practice-answer" v-model="answerText" class="y-input y-place-area y-practice-area" rows="3" :lang="languageCode" :disabled="busy || Boolean(result)"></textarea>
          </template>
          <div v-if="result" class="y-practice-mark" :class="result.right ? 'right' : 'wrong'" role="status">
            <b><Icon :name="result.right ? 'check' : 'close'" :size="13" :weight="2.6" />{{ t(result.right ? 'practice.right' : 'practice.wrong') }}</b>
            <p :lang="languageCode">{{ result.answer }}</p>
            <p v-if="result.explanation" class="y-practice-why">{{ result.explanation }}</p>
          </div>
        </section>
      </Transition>

      <footer>
        <p v-if="error" class="y-error" role="alert"><span>{{ error }}</span></p>
        <div class="y-onboard-nav">
          <button v-if="!practice || finished" type="button" class="y-btn primary go push" @click="leave">{{ t(practice ? 'practice.finish' : 'common.back') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
          <button v-else-if="result" type="button" class="y-btn primary go push" @click="next">{{ t(last ? 'practice.finish' : 'placement.next') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
          <button v-else type="button" class="y-btn primary go push" :disabled="!canSubmit" @click="submit">{{ t(busy ? 'practice.checking' : 'practice.check') }}</button>
        </div>
      </footer>
    </div>
  </main>
</template>
