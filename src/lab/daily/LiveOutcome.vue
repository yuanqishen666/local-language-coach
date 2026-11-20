<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { isErrorCategory } from '../../../shared/memory'

/** What one talk with a real person left on the learning record. */
defineProps<{
  languageCode: string
  outcome: {
    gaps: Array<{ original: string; improved: string }>
    errors: Array<{ original: string; improved: string; explanation: string; category: string }>
  }
}>()
const { t } = useI18n()
</script>

<template>
  <div class="y-live-out">
    <template v-if="outcome.gaps.length">
      <h3 class="y-h3">{{ t('live.gaps') }}</h3>
      <ul class="y-recap-pairs">
        <li v-for="(gap, index) in outcome.gaps" :key="index"><span>{{ gap.original }}</span><b :lang="languageCode">{{ gap.improved }}</b></li>
      </ul>
    </template>
    <template v-if="outcome.errors.length">
      <h3 class="y-h3">{{ t('live.errors') }}</h3>
      <ul class="y-recap-pairs">
        <li v-for="(item, index) in outcome.errors" :key="index">
          <s :lang="languageCode">{{ item.original }}</s>
          <b :lang="languageCode">{{ item.improved }}</b>
          <small><em class="y-tag">{{ t(`learning.error.${isErrorCategory(item.category) ? item.category : 'other'}`) }}</em>{{ item.explanation }}</small>
        </li>
      </ul>
    </template>
    <p v-if="!outcome.gaps.length && !outcome.errors.length" class="y-recap-note">{{ t('live.nothing') }}</p>
  </div>
</template>
