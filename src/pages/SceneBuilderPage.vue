<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import type { ConversationSetup } from '../types'
import { guideToModelSettings, needsModelConfiguration, sceneDraftKey } from '../model-access'

const store = useAppStore()
const router = useRouter()
const { t, locale } = useI18n()
const loading = ref(false)
const starting = ref(false)
const setups = ref<ConversationSetup[]>([])
const actionError = ref('')
const form = ref({ domain: 'social', place: '', detail: '' })
const domains = ['daily', 'travel', 'work', 'social', 'study', 'opinion', 'custom']

function domainName() { return t(`scene.domain.${form.value.domain}`) }
function preserveDraft() { sessionStorage.setItem(sceneDraftKey, JSON.stringify({ form: form.value, setups: setups.value, interfaceLocale: String(locale.value) })) }

onMounted(() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sceneDraftKey) || 'null')
    if (saved?.form) form.value = { ...form.value, ...saved.form }
    if (saved?.interfaceLocale === String(locale.value) && Array.isArray(saved?.setups)) setups.value = saved.setups
  } catch { sessionStorage.removeItem(sceneDraftKey) }
})

watch(locale, () => {
  setups.value = []
  preserveDraft()
})

async function requireModel() {
  if (store.settings?.modelReady) return true
  preserveDraft()
  await guideToModelSettings(router, '/start')
  return false
}

async function generate() {
  actionError.value = ''
  if (!await requireModel()) return
  loading.value = true
  try {
    const data = await api.post<{ setups: ConversationSetup[] }>('/conversation-setups/suggest', {
      domain: domainName(),
      place: form.value.place,
      detail: form.value.detail,
      interfaceLocale: String(locale.value),
    })
    setups.value = data.setups
    preserveDraft()
  } catch (error) {
    if (needsModelConfiguration(error)) {
      preserveDraft()
      await guideToModelSettings(router, '/start')
    } else actionError.value = t('scene.generateOpenError')
  } finally { loading.value = false }
}

async function start(setup: ConversationSetup) {
  if (starting.value || !await requireModel()) return
  starting.value = true
  actionError.value = ''
  try {
    const data = await api.post<{ id: string }>('/conversations', { setup, interfaceLocale: String(locale.value) })
    sessionStorage.removeItem(sceneDraftKey)
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/start')
    else actionError.value = t('scene.startOpenError')
  } finally { starting.value = false }
}
</script>

<template>
  <div class="page builder">
    <header class="builder-bar">
      <RouterLink to="/" class="back" :aria-label="t('common.back')">←</RouterLink>
      <b>{{ t('home.settingTitle') }}</b>
      <span>{{ store.settings?.learning.targetLanguageCode.toUpperCase() }} · {{ store.settings?.learning.proficiency }}</span>
    </header>

    <section class="setup-stage">
      <div class="builder-heading"><span>01</span><h1>{{ t('scene.openTitle') }}</h1></div>
      <div class="domain-grid">
        <button v-for="item in domains" :key="item" :class="[{ selected: form.domain === item }, `domain-${item}`]" @click="form.domain = item">
          <span>{{ item === 'custom' ? '＋' : t(`scene.domain.${item}`).slice(0, 1) }}</span>
          <b>{{ t(`scene.domain.${item}`) }}</b>
        </button>
      </div>
      <div class="context-row">
        <div class="field"><label>{{ t('scene.placeOpenLabel') }}</label><input v-model="form.place" /></div>
        <div class="field"><label>{{ t('scene.topicLabel') }}</label><textarea v-model="form.detail" /></div>
        <button class="btn primary generate" :disabled="loading" @click="generate">{{ loading ? t('scene.generatingOpen') : t('scene.generateOpen') }}<AppIcon name="arrow" /></button>
      </div>
    </section>

    <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
    <section v-if="setups.length" class="options">
      <div class="option-heading"><span>02</span><h2>{{ t('scene.choosePerson') }}</h2></div>
      <div class="option-grid">
        <article v-for="setup in setups" :key="setup.title + setup.openingLine" class="option">
          <div class="partner-avatar">{{ (setup.partnerName || setup.partnerRole).slice(0, 1) }}</div>
          <span class="badge">{{ setup.category }} · {{ setup.difficulty }}</span>
          <h2>{{ setup.title }}</h2>
          <p class="partner-role">{{ setup.partnerName || setup.partnerRole }} · {{ setup.partnerRole }}</p>
          <blockquote>“{{ setup.openingLine }}”</blockquote>
          <button :disabled="starting" @click="start(setup)"><span>{{ t('scene.startOpen') }}</span><AppIcon name="arrow" /></button>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.builder{max-width:1240px;padding-top:26px}.builder-bar{height:56px;display:grid;grid-template-columns:42px 1fr auto;align-items:center;gap:14px;border-bottom:1px solid var(--line)}.builder-bar .back{width:38px;height:38px;display:grid;place-items:center;border-radius:50%;background:var(--paper);font-size:19px;transition:transform .18s}.builder-bar .back:hover{transform:translateX(-3px)}.builder-bar b{font-size:13px}.builder-bar>span{color:var(--muted);font-size:10px}.setup-stage{padding:48px 6px 8px}.builder-heading,.option-heading{display:flex;align-items:flex-start;gap:22px;margin-bottom:38px}.builder-heading>span,.option-heading>span{width:34px;height:34px;display:grid;place-items:center;flex:0 0 auto;border-radius:50%;background:var(--ink);color:white;font-size:10px}.builder-heading h1{font-size:clamp(48px,5vw,74px)}.domain-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.domain-grid button{position:relative;min-height:135px;padding:17px;display:flex;align-items:end;border:0;border-radius:15px;background:#e6e1d7;color:var(--ink);text-align:left;transition:transform .2s var(--ease),box-shadow .2s}.domain-grid button:hover{transform:translateY(-3px)}.domain-grid button.selected{box-shadow:inset 0 0 0 3px var(--blue)}.domain-grid button>span{position:absolute;top:15px;right:16px;color:currentColor;font:30px/1 'Songti SC',STSong,serif;opacity:.22}.domain-grid button b{font-size:14px}.domain-grid .domain-travel{background:#d9e4dc}.domain-grid .domain-work{background:#ead6cb}.domain-grid .domain-social{background:#d8dff0}.domain-grid .domain-study{background:#e6dfbd}.domain-grid .domain-opinion{background:#dcd3e8}.domain-grid .domain-custom{background:var(--ink);color:white}.context-row{margin-top:24px;display:grid;grid-template-columns:1fr 1fr auto;gap:12px}.context-row .field{min-width:0}.context-row textarea{height:54px;min-height:54px;padding-top:16px;resize:none}.generate{height:54px;align-self:end;padding:0 20px}.action-error{margin:14px 6px 0;padding:10px 12px;border-radius:9px;background:#f7e9e6;color:var(--red);font-size:11px}.options{padding:42px 6px 20px}.option-heading h2{font-family:'Songti SC',STSong,serif;font-size:clamp(38px,4vw,58px);font-weight:520;line-height:1}.option-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.option{min-height:430px;padding:24px;display:flex;flex-direction:column;border-radius:24px;background:var(--paper);transition:transform .24s var(--ease),box-shadow .24s}.option:nth-child(2){background:#dfe8df}.option:nth-child(3){background:#eadbd1}.option:hover{transform:translateY(-6px);box-shadow:0 22px 46px rgba(39,39,33,.11)}.partner-avatar{width:84px;height:84px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:white;font:34px/1 'Songti SC',STSong,serif}.option:nth-child(2) .partner-avatar{background:var(--blue)}.option:nth-child(3) .partner-avatar{background:var(--peach);color:var(--ink)}.option .badge{align-self:flex-start;margin-top:22px}.option h2{margin:16px 0 6px;font-family:'Songti SC',STSong,serif;font-size:30px;font-weight:520}.partner-role{margin:0;color:var(--muted);font-size:11px}.option blockquote{margin:auto 0 20px;padding-top:18px;border-top:1px solid var(--line);font-size:14px;line-height:1.7}.option>button{height:42px;padding:0;display:flex;align-items:center;justify-content:space-between;border:0;background:transparent;color:var(--blue);font-weight:700}.option>button:disabled{opacity:.45}
@media(max-width:1000px){.domain-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.option-grid{grid-template-columns:1fr 1fr}}
@media(max-width:760px){.builder{padding:18px 16px 92px}.setup-stage{padding:34px 0 8px}.builder-heading,.option-heading{gap:14px}.domain-grid{grid-template-columns:1fr 1fr}.context-row{grid-template-columns:1fr}.generate{width:100%;justify-content:space-between}.options{padding-left:0;padding-right:0}.option-grid{grid-template-columns:1fr}}
</style>
