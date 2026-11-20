<script setup lang="ts">
import './daily.css'
import './pages.css'
import { RouterLink } from 'vue-router'
import Icon from '../kit/Icon.vue'
import { vTip } from '../core/tip'
import { useProgressPage } from '../logic/ProgressPage'

const {
  t, progress, state, starting, startError, languageCode, languageName, load, grid, months, weekdays, activeDays, empty,
  dayText, weeks, levelNow, levelFirst, curve, startBedtime,
} = useProgressPage()
</script>

<template>
  <div class="y-page narrow y-prog">
    <header class="y-head"><h1>{{ t('nav.progress') }}</h1><span class="y-tag">{{ languageName }}</span></header>

    <ul class="y-rows y-doors">
      <li>
        <button type="button" class="y-row" :disabled="starting" @click="startBedtime">
          <Icon name="moon" :size="15" :weight="2" />
          <b>{{ t('progress.bedtime') }}</b>
          <span>{{ t('progress.bedtimeNote') }}</span>
          <span v-if="starting" class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span>
          <Icon v-else name="arrow" :size="14" :weight="2" />
        </button>
      </li>
      <li>
        <RouterLink to="/progress/live" class="y-row">
          <Icon name="people" :size="15" :weight="2" />
          <b>{{ t('live.title') }}</b>
          <span>{{ t('live.note') }}</span>
          <Icon name="arrow" :size="14" :weight="2" />
        </RouterLink>
      </li>
    </ul>
    <p v-if="startError" class="y-error" role="alert">{{ startError }}</p>

    <p v-if="state === 'loading'" class="y-recap-wait" role="status"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>
    <p v-else-if="state === 'failed'" class="y-error y-recap-error" role="alert"><span>{{ t('progress.failed') }}</span><button type="button" class="y-link" @click="load"><Icon name="refresh" :size="13" :weight="2" />{{ t('placement.retry') }}</button></p>

    <template v-else-if="progress">
      <section class="y-recap-part y-activity">
        <h2 class="y-h2"><span>{{ t('progress.activity', { weeks: progress.weeks }) }}</span><em v-if="activeDays">{{ t('progress.activeDays', { count: activeDays }) }}</em></h2>
        <div class="y-heat" :style="{ '--weeks': grid.length }">
          <div class="y-heat-months" aria-hidden="true"><span v-for="month in months" :key="month.week" :style="{ gridColumn: month.week + 1 }">{{ month.name }}</span></div>
          <div class="y-heat-days" aria-hidden="true"><span v-for="day in weekdays" :key="day.row" :style="{ gridRow: day.row + 1 }">{{ day.name }}</span></div>
          <div class="y-heat-grid" role="img" :aria-label="t('progress.activeDays', { count: activeDays })">
            <template v-for="week in grid" :key="week[0].date">
              <i v-for="day in week" :key="day.date" v-tip="day.future ? '' : dayText(day)" :class="[`l${day.level}`, { future: day.future }]"></i>
            </template>
          </div>
        </div>
        <p v-if="empty" class="y-recap-note">{{ t('progress.empty') }}</p>
      </section>

      <section v-for="week in weeks" :key="week.id" class="y-recap-part">
        <h2 class="y-h2"><span>{{ week.title }}</span><em v-if="week.before">{{ week.before }}</em></h2>
        <dl class="y-place-parts y-week-facts">
          <div v-for="fact in week.facts" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div>
        </dl>
        <p v-if="week.fewer" class="y-week-line"><Icon name="check" :size="12" :weight="2.6" />{{ week.fewer }}</p>
        <template v-if="week.firstUsed.length">
          <h3 class="y-h3">{{ t('progress.firstUsed') }}</h3>
          <ul class="y-recap-words">
            <li v-for="word in week.firstUsed" :key="word.term"><b :lang="languageCode">{{ word.term }}</b><span v-if="word.meaning">{{ word.meaning }}</span></li>
          </ul>
        </template>
      </section>

      <section v-if="levelNow" class="y-recap-part">
        <h2 class="y-h2"><span>{{ t('level.title') }}</span></h2>
        <p class="y-level-span"><template v-if="levelFirst && levelFirst !== levelNow"><span>{{ levelFirst }}</span><Icon name="arrow" :size="13" :weight="2" /></template><b>{{ levelNow }}</b></p>
        <svg v-if="curve" class="y-level-curve wide" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><polyline :points="curve" /></svg>
      </section>
    </template>
  </div>
</template>
