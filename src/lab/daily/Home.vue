<script setup lang="ts">
import { inject, ref, type Ref } from 'vue'
import Icon from '../kit/Icon.vue'
import { formatWhen } from '../kit/when'
import { useHomePage } from '../logic/HomePage'

const { t, locale, history, creating, startError, startConversation, displayTitle } = useHomePage()
const due = inject<Ref<number>>('labReviewDue', ref(0))
</script>

<template>
  <div class="y-page narrow y-home">
    <h1>{{ t('home.titleOpen') }}</h1>

    <div class="y-starts">
      <button type="button" class="y-start main" :disabled="creating" @click="startConversation">
        <i aria-hidden="true"><Icon name="talk" :size="16" :weight="1.9" /></i>
        <b>{{ t('home.openTitle') }}</b>
        <span class="y-btn primary sm">
          <template v-if="creating"><span class="y-dots" aria-hidden="true"><i></i><i></i><i></i></span></template>
          <template v-else>{{ t('home.openAction') }}<Icon name="arrow" :size="13" :weight="2.2" class="go" /></template>
        </span>
      </button>
      <RouterLink to="/start" class="y-start">
        <i aria-hidden="true"><Icon name="edit" :size="16" :weight="1.9" /></i>
        <b>{{ t('home.settingTitle') }}</b>
        <Icon name="chevron" :size="14" :weight="2.2" class="tail" />
      </RouterLink>
      <RouterLink v-if="due" to="/review" class="y-start">
        <i aria-hidden="true"><Icon name="repeat" :size="16" :weight="1.9" /></i>
        <b>{{ t('nav.review') }}</b>
        <em class="y-tag accent">{{ due }}</em>
        <Icon name="chevron" :size="14" :weight="2.2" class="tail" />
      </RouterLink>
    </div>
    <p v-if="startError" class="y-error" role="alert">{{ startError }}</p>

    <section v-if="history.length" class="y-recent">
      <header>
        <h2 class="y-h2">{{ t('home.recentOpen') }}</h2>
        <RouterLink to="/history" class="y-link">{{ t('home.viewAll') }}<Icon name="chevron" :size="12" :weight="2.2" /></RouterLink>
      </header>
      <ul class="y-rows">
        <li v-for="item in history.slice(0, 4)" :key="item.id">
          <RouterLink :to="`/conversation/${item.id}`" class="y-row">
            <b>{{ displayTitle(item) }}</b>
            <time>{{ formatWhen(item.updatedAt, String(locale)) }}</time>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>
