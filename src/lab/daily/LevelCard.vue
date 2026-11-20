<script setup lang="ts">
import Icon from '../kit/Icon.vue'
import Fold from './Fold.vue'
import { vTip } from '../core/tip'
import { formatWhen } from '../kit/when'
import { useLevelCard } from '../logic/LevelCard'

/** One language's level: where it stands, why it last moved, and the ways to change it. `compact` leaves the history out. */
const props = defineProps<{ languageCode: string; compact?: boolean }>()
const {
  t, locale, loaded, profile, languageName, levelName, difficultyName, pickedLevel, levels, skills, history, latest, curve,
  quickCheck, picking, confirmingClear, busy, failed, chooseLevel, toggleLock, clear, test,
} = useLevelCard(props)
</script>

<template>
  <section v-if="loaded" class="y-level" :class="{ compact }">
    <template v-if="profile">
      <div class="y-level-now">
        <div><small class="y-h2">{{ t('level.estimate') }}</small><b>{{ levelName }}</b></div>
        <div><small class="y-h2">{{ t('level.difficulty') }}</small><b>{{ difficultyName }}</b></div>
        <p class="y-level-tags">
          <span class="y-tag">{{ t(`level.confidence.${profile.confidence}`) }}</span>
          <span class="y-tag">{{ t(`level.source.${profile.source}`) }}</span>
          <span v-if="profile.locked" class="y-tag accent">{{ t('level.locked') }}</span>
        </p>
      </div>
      <dl v-if="skills.length" class="y-level-skills">
        <div v-for="item in skills" :key="item.skill"><dt>{{ t(`level.skill.${item.skill}`) }}</dt><dd>{{ item.name }}</dd></div>
      </dl>
      <p v-if="latest" class="y-level-last"><b>{{ latest.line }}</b><span>{{ latest.reason }}</span><time>{{ formatWhen(latest.at, locale) }}</time></p>
      <p v-if="quickCheck" class="y-level-check"><span>{{ t(`level.quickCheck.${quickCheck}`) }}</span><button type="button" class="y-btn sm" @click="test('quick')">{{ t('level.quickCheckAction') }}</button></p>
    </template>
    <p v-else class="y-level-none">{{ t('level.none', { language: languageName }) }}</p>

    <div class="y-level-acts">
      <button type="button" class="y-btn sm" :class="{ primary: !profile }" @click="test()">{{ t(profile ? 'level.retest' : 'level.test') }}</button>
      <button type="button" class="y-btn sm" :aria-expanded="picking" @click="picking = !picking">{{ t(profile ? 'common.edit' : 'level.pick') }}</button>
      <template v-if="profile">
        <label v-tip="t('level.lockHelp')" class="y-place-lock">
          <span class="y-toggle"><input type="checkbox" :checked="profile.locked" :disabled="busy" @change="toggleLock" /><i></i></span>{{ t('level.lock') }}
        </label>
        <button type="button" class="y-link danger push" :class="{ on: confirmingClear }" :disabled="busy" @click="clear" @blur="confirmingClear = false">{{ t(confirmingClear ? 'level.clearConfirm' : 'level.clear') }}</button>
      </template>
    </div>
    <p v-if="failed" class="y-error" role="alert">{{ t('onboarding.saveError') }}</p>

    <div v-if="picking" class="y-picks one">
      <button v-for="level in levels" :key="level.id" type="button" :aria-pressed="pickedLevel === level.id" :disabled="busy" @click="chooseLevel(level.id)">
        <small>{{ level.id }}</small><b>{{ t(level.key) }}</b><Icon v-if="pickedLevel === level.id" name="check" :size="14" :weight="2.4" />
      </button>
    </div>

    <Fold v-if="!compact && history.length > 1" :title="t('level.history')" :count="history.length">
      <svg v-if="curve" class="y-level-curve" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline :points="curve" /></svg>
      <ul class="y-level-history">
        <li v-for="item in history" :key="item.id"><b>{{ item.line }}</b><span>{{ item.reason }}</span><time>{{ formatWhen(item.at, locale) }}</time></li>
      </ul>
    </Fold>
  </section>
</template>
