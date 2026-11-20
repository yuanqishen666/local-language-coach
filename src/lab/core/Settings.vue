<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import SettingsForm from './SettingsForm.vue'

const { t } = useI18n()
</script>

<template>
  <div class="c-page c-settings">
    <header class="c-head"><h1 class="c-title">{{ t('settings.title') }}</h1></header>
    <SettingsForm />
  </div>
</template>
