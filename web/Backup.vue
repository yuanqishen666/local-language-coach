<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import Icon from '../src/lab/kit/Icon.vue'
import type { Restored } from './backup'
import { backedUpAt, downloadBackup, noteBackup } from './last-backup'
import { restoreBackup } from './thread'

const { t, locale } = useI18n()
// The same page is offered before set-up, where restoring is all there is to do.
const newcomer = useRoute().path === '/restore'
const picker = ref<HTMLInputElement | null>(null)
const chosen = ref<File | null>(null)
const working = ref<'' | 'pack' | 'restore'>('')
const refused = ref<Exclude<Restored, 'restored'> | ''>('')
const kept = ref<boolean | null>(null)
// Chrome, Edge and the browsers built like them all name Safari in what they call themselves.
const safari = /safari/iu.test(navigator.userAgent) && !/chrom|crios|fxios|edg|android/iu.test(navigator.userAgent)

const last = computed(() => backedUpAt.value
  ? t('web.backup.last', { when: new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(backedUpAt.value) })
  : t('web.backup.never'))

onMounted(async () => {
  kept.value = (await navigator.storage?.persisted?.()) ?? null
})

async function download() {
  working.value = 'pack'
  try {
    await downloadBackup()
  } finally {
    working.value = ''
  }
}

function choose(event: Event) {
  const input = event.target as HTMLInputElement
  chosen.value = input.files?.[0] ?? null
  refused.value = ''
  // Picking the same file a second time has to count as picking it.
  input.value = ''
}

async function restore() {
  const file = chosen.value
  if (!file) return
  working.value = 'restore'
  const outcome = await restoreBackup(new Uint8Array(await file.arrayBuffer()))
  if (outcome === 'restored') {
    // Everything here is now also in that file.
    noteBackup()
    location.assign(import.meta.env.BASE_URL)
    return
  }
  chosen.value = null
  working.value = ''
  refused.value = outcome
}
</script>

<template>
  <div class="y-page narrow w-backup">
    <header class="y-head">
      <RouterLink v-if="newcomer" to="/onboarding" class="y-btn sm" :aria-label="t('common.back')"><Icon name="back" :size="14" /></RouterLink>
      <h1>{{ t(newcomer ? 'web.backup.restoreTitle' : 'web.backup.nav') }}</h1>
    </header>
    <template v-if="!newcomer">
      <p>{{ t('web.backup.body') }}</p>
      <p class="w-last">{{ last }}</p>
      <p v-if="kept !== null" class="w-quiet">{{ t(kept ? 'web.backup.kept' : 'web.backup.notKept') }}</p>
      <p v-if="safari" class="w-quiet">{{ t('web.backup.safari') }}</p>

      <section class="w-part">
        <button type="button" class="y-btn primary" :disabled="Boolean(working)" @click="download"><Icon name="download" :size="14" />{{ t('web.backup.download') }}</button>
        <p class="w-quiet">{{ t('web.backup.downloadNote') }}</p>
      </section>
    </template>

    <section :class="{ 'w-part': !newcomer, 'w-only': newcomer }">
      <h2 v-if="!newcomer">{{ t('web.backup.restoreTitle') }}</h2>
      <p class="w-quiet">{{ t('web.backup.restoreBody') }}</p>
      <input ref="picker" type="file" accept=".zip,application/zip" hidden @change="choose">
      <button type="button" class="y-btn" :disabled="Boolean(working)" @click="picker?.click()"><Icon name="upload" :size="14" />{{ t('web.backup.choose') }}</button>
      <p v-if="refused" class="w-refused" role="alert">{{ t(`web.backup.${refused}`) }}</p>
    </section>

    <Transition name="y-veil">
      <div v-if="chosen" class="y-veil" @click.self="working || (chosen = null)">
        <section class="y-dialog" role="alertdialog" aria-modal="true" :aria-label="t('web.backup.confirmTitle')">
          <h2>{{ t('web.backup.confirmTitle') }}</h2>
          <p>{{ t('web.backup.confirmBody', { name: chosen.name }) }}</p>
          <footer>
            <button type="button" class="y-btn" :disabled="Boolean(working)" @click="chosen = null">{{ t('common.cancel') }}</button>
            <button type="button" class="y-btn danger" :disabled="Boolean(working)" @click="restore">{{ working ? t('web.backup.restoring') : t('web.backup.confirm') }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.w-backup { font-size: 14px; line-height: 1.7; }
.w-backup p { max-width: 62ch; }
.w-last { margin-top: 10px; font-weight: 600; }
.w-quiet { color: var(--y-mute, inherit); font-size: 13px; }
.w-refused { color: var(--y-warn, #b3401a); font-size: 13px; }
.w-part { margin-top: 22px; padding-top: 18px; display: grid; gap: 8px; justify-items: start; border-top: 1px solid var(--y-line, rgba(0, 0, 0, .1)); }
.w-part h2 { font-size: 14.5px; font-weight: 650; }
.w-only { display: grid; gap: 8px; justify-items: start; }
</style>
