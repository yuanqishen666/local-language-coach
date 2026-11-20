<script setup lang="ts">
import './daily.css'
import './pages.css'
import { computed } from 'vue'
import Icon from '../kit/Icon.vue'
import Face from '../blocks/Face.vue'
import { vTip } from '../core/tip'
import { usePlacementPage } from '../logic/PlacementPage'

const {
  t, languageCode, languageName, profile, questionCount, minutes, modelReady, stage, busy, error, progress, question, result,
  choice, answerText, heard, readInstead, levels, pickedLevel, canListen, speaking, canSubmit, resultLevel, resultName, startsAt, resultParts, spendLine,
  begin, toModelSettings, play, submit, pass, stopEarly, retry, chooseLevel, toggleLock, leave,
} = usePlacementPage()

// Presentation only.
const parts = computed(() => (canListen.value ? ['reading', 'listening', 'expression'] : ['reading', 'expression']))
const answered = computed(() => progress.value?.index || 0)
const closeLabel = computed(() => t(stage.value === 'question' && answered.value > 0 ? 'placement.stop' : 'placement.exit'))
const errorText = computed(() => t(error.value === 'grade' ? 'placement.gradeError' : error.value === 'save' ? 'onboarding.saveError' : 'placement.itemError'))
const letters = 'ABCD'
</script>

<template>
  <main class="y-onboard y-place">
    <div class="y-onboard-in" :class="{ wide: stage === 'question' || stage === 'result' }">
      <header>
        <b class="y-brand"><i aria-hidden="true"><Face :mood="busy ? 'talk' : stage === 'result' ? 'happy' : 'calm'" /></i>{{ t('placement.title') }}</b>
        <span v-if="stage === 'question' && progress" class="y-place-count">{{ Math.min(progress.index + 1, progress.total) }} / {{ progress.total }}</span>
        <button v-if="stage !== 'result'" v-tip:bottom="closeLabel" type="button" class="y-ic" :aria-label="closeLabel" :disabled="busy === 'grading'" @click="stage === 'question' ? stopEarly() : leave()"><Icon name="close" :size="15" :weight="2.2" /></button>
      </header>
      <div v-if="stage === 'question' && progress" class="y-place-bar" role="progressbar" aria-valuemin="0" :aria-valuemax="progress.total" :aria-valuenow="progress.index"><i :style="{ width: `${(progress.index / progress.total) * 100}%` }"></i></div>

      <Transition name="y-view" mode="out-in">
        <section v-if="stage === 'intro'" key="intro" class="y-leaf">
          <h1>{{ t('placement.introTitle', { language: languageName }) }}</h1>
          <p class="y-place-facts">{{ t('placement.introFacts', { count: questionCount, minutes }) }}</p>
          <p class="y-place-tags"><span v-for="part in parts" :key="part" class="y-tag">{{ t(`level.skill.${part}`) }}</span></p>
          <p v-if="!modelReady" class="y-place-note">{{ t('placement.needsModel') }}</p>
        </section>

        <section v-else-if="stage === 'pick'" key="pick" class="y-leaf">
          <h1>{{ t('placement.pickTitle') }}</h1>
          <div class="y-picks one">
            <button v-for="level in levels" :key="level.id" type="button" :aria-pressed="pickedLevel === level.id" :disabled="busy === 'saving'" @click="chooseLevel(level.id)">
              <small>{{ level.id }}</small><b>{{ t(level.key) }}</b><Icon v-if="pickedLevel === level.id" name="check" :size="14" :weight="2.4" />
            </button>
          </div>
        </section>

        <section v-else-if="stage === 'question'" :key="question?.id || 'wait'" class="y-leaf">
          <p v-if="!question && busy" class="y-place-wait" role="status">{{ t(busy === 'grading' ? 'placement.grading' : 'placement.preparing') }}</p>
          <template v-else-if="question">
            <small class="y-h2">{{ t(`level.skill.${question.kind}`) }}</small>
            <template v-if="question.kind === 'expression'">
              <h1>{{ t(`placement.express.${question.task}.${question.band}`) }}</h1>
              <label class="y-place-label" for="place-answer">{{ t('placement.answerIn', { language: languageName }) }}</label>
              <textarea id="place-answer" v-model="answerText" class="y-input y-place-area" rows="6" :lang="languageCode" :disabled="Boolean(busy)"></textarea>
            </template>
            <template v-else>
              <p v-if="question.kind === 'reading' || readInstead" class="y-place-text" :lang="languageCode">{{ question.text }}</p>
              <button v-else type="button" class="y-place-play" :class="{ on: speaking }" @click="play"><Icon :name="speaking ? 'stop' : 'volume'" :size="18" :weight="2.2" />{{ t(heard ? 'placement.replay' : 'placement.play') }}</button>
              <h1>{{ question.question }}</h1>
              <div class="y-picks one">
                <button v-for="(option, index) in question.options" :key="index" type="button" :aria-pressed="choice === index" :disabled="Boolean(busy) || (question.kind === 'listening' && !heard)" @click="choice = index">
                  <small>{{ letters[index] }}</small><b>{{ option }}</b>
                </button>
              </div>
            </template>
          </template>
        </section>

        <section v-else-if="result" key="result" class="y-leaf y-place-result">
          <h1>{{ t('placement.result', { language: languageName, level: resultName }) }}</h1>
          <p class="y-place-tags"><span class="y-tag accent">{{ t(`level.confidence.${result.confidence}`) }}</span></p>
          <p v-if="result.partial" class="y-place-note">{{ t('placement.resultPartial', { answered: result.answered, total: result.total }) }}</p>
          <dl v-if="resultParts.length" class="y-place-parts">
            <div v-for="part in resultParts" :key="part.skill"><dt>{{ t(`level.skill.${part.skill}`) }}</dt><dd>{{ part.name }}</dd></div>
          </dl>
          <div v-if="resultLevel" class="y-place-can">
            <section><h2 class="y-h2">{{ t('placement.canTitle') }}</h2><p>{{ t(`placement.can.${resultLevel}`) }}</p></section>
            <section><h2 class="y-h2">{{ t('placement.hardTitle') }}</h2><p>{{ t(`placement.hard.${resultLevel}`) }}</p></section>
          </div>
          <section v-if="result.evidence.length" class="y-place-evidence">
            <h2 class="y-h2">{{ t('placement.evidenceTitle') }}</h2>
            <ul>
              <li v-for="(item, index) in result.evidence" :key="index"><q :lang="languageCode">{{ item.quote }}</q><p>{{ item.comment }}</p></li>
            </ul>
          </section>
          <p v-if="startsAt" class="y-place-note">{{ startsAt }}</p>
          <p v-if="spendLine" class="y-spent">{{ spendLine }}</p>
        </section>
      </Transition>

      <footer>
        <p v-if="error" class="y-error" role="alert"><span>{{ errorText }}</span><button v-if="error !== 'save'" type="button" class="y-link" @click="retry"><Icon name="refresh" :size="13" :weight="2" />{{ t('placement.retry') }}</button></p>
        <div v-if="stage === 'intro'" class="y-onboard-nav">
          <button type="button" class="y-btn" :disabled="Boolean(busy)" @click="stage = 'pick'">{{ t('level.pick') }}</button>
          <button v-if="modelReady" type="button" class="y-btn primary go push" :disabled="Boolean(busy)" @click="begin">{{ t('placement.start') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
          <button v-else type="button" class="y-btn primary go push" @click="toModelSettings">{{ t('placement.toModelSettings') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
        </div>
        <div v-else-if="stage === 'pick'" class="y-onboard-nav">
          <button type="button" class="y-btn" :disabled="busy === 'saving'" @click="stage = result ? 'result' : 'intro'">{{ result ? t('common.back') : t('level.test') }}</button>
        </div>
        <div v-else-if="stage === 'question'" class="y-onboard-nav">
          <template v-if="question">
            <button type="button" class="y-btn" :disabled="Boolean(busy)" @click="pass">{{ t(question.kind === 'expression' ? 'placement.skip' : 'placement.unsure') }}</button>
            <button type="button" class="y-btn primary go push" :disabled="!canSubmit" @click="submit">{{ t('placement.next') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
          </template>
        </div>
        <div v-else-if="result" class="y-onboard-nav y-place-end">
          <button type="button" class="y-btn" :disabled="Boolean(busy)" @click="stage = 'pick'">{{ t('placement.changeLevel') }}</button>
          <label v-if="profile" v-tip="t('level.lockHelp')" class="y-place-lock">
            <span class="y-toggle"><input type="checkbox" :checked="profile.locked" :disabled="Boolean(busy)" @change="toggleLock" /><i></i></span>{{ t('level.lock') }}
          </label>
          <button type="button" class="y-btn primary go push" :disabled="Boolean(busy)" @click="leave">{{ t('placement.accept') }}<Icon name="arrow" :size="14" :weight="2.2" /></button>
        </div>
      </footer>
    </div>
  </main>
</template>
