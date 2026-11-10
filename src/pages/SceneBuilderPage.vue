<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import type { ConversationSetup } from '../types'
import { guideToModelSettings, needsModelConfiguration, sceneDraftKey } from '../model-access'

const store = useAppStore()
const router = useRouter()
const { t } = useI18n()
const loading = ref(false)
const starting = ref(false)
const setups = ref<ConversationSetup[]>([])
const actionError = ref('')
const form = ref({ domain: 'social', place: '', detail: '' })
const domains = ['daily', 'travel', 'work', 'social', 'study', 'opinion', 'custom']

function domainName() { return t(`scene.domain.${form.value.domain}`) }
function preserveDraft() { sessionStorage.setItem(sceneDraftKey, JSON.stringify({ form: form.value, setups: setups.value })) }

onMounted(() => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(sceneDraftKey) || 'null')
    if (saved?.form) form.value = { ...form.value, ...saved.form }
    if (Array.isArray(saved?.setups)) setups.value = saved.setups
  } catch { sessionStorage.removeItem(sceneDraftKey) }
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
    const data = await api.post<{ id: string }>('/conversations', { setup })
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
    <header class="page-head">
      <div>
        <RouterLink to="/" class="back">← {{ t('common.back') }}</RouterLink>
        <h1>{{ t('scene.openTitle') }}</h1>
        <p class="subhead">{{ t('scene.openHelp') }}</p>
      </div>
    </header>

    <section class="setup-card card">
      <div class="domain-block">
        <p class="label">{{ t('scene.chooseMood') }}</p>
        <div class="domain-grid">
          <button v-for="item in domains" :key="item" :class="{ selected: form.domain === item }" @click="form.domain = item">
            <span>{{ t(`scene.domain.${item}`).slice(0, 1) }}</span>
            <div><b>{{ t(`scene.domain.${item}`) }}</b><small>{{ t(`scene.domain.${item}Help`) }}</small></div>
            <AppIcon name="check" :size="16" />
          </button>
        </div>
      </div>
      <div class="context-block">
        <p class="label">{{ t('scene.optionalContext') }}</p>
        <div class="field"><label>{{ t('scene.placeOpenLabel') }}</label><input v-model="form.place" :placeholder="t('scene.placeOpenPlaceholder')" /></div>
        <div class="field"><label>{{ t('scene.topicLabel') }}</label><textarea v-model="form.detail" :placeholder="t('scene.topicPlaceholder')" /></div>
        <button class="btn primary generate" :disabled="loading" @click="generate"><AppIcon name="spark" />{{ loading ? t('scene.generatingOpen') : t('scene.generateOpen') }}</button>
      </div>
    </section>

    <p v-if="actionError" class="action-error" role="alert">{{ actionError }}</p>
    <section v-if="setups.length" class="options">
      <div class="option-heading"><h2>{{ t('scene.choosePerson') }}</h2></div>
      <article v-for="setup in setups" :key="setup.title + setup.openingLine" class="option card">
        <div class="option-main">
          <span class="badge">{{ setup.category }} · {{ setup.difficulty }}</span>
          <h2>{{ setup.title }}</h2>
          <p>{{ setup.setting }}</p>
          <div class="partner"><span>{{ (setup.partnerName || setup.partnerRole).slice(0, 1) }}</span><div><b>{{ setup.partnerName || setup.partnerRole }}</b><small>{{ setup.partnerRole }} · {{ setup.relationship }}</small></div></div>
          <p class="topic"><small>{{ t('scene.topicSeed') }}</small>{{ setup.topicSeed }}</p>
        </div>
        <aside>
          <small>{{ t('scene.partnerOpens') }}</small>
          <blockquote>“{{ setup.openingLine }}”</blockquote>
          <button class="btn primary" :disabled="starting" @click="start(setup)">{{ t('scene.startOpen') }}<AppIcon name="arrow" /></button>
        </aside>
      </article>
    </section>
  </div>
</template>

<style scoped>
.builder{max-width:1160px}.back{display:block;font-size:11px;color:var(--muted);margin-bottom:22px}.setup-card{padding:25px;display:grid;grid-template-columns:1.2fr .8fr;gap:28px}.label{font-size:11px;font-weight:780;letter-spacing:.12em;color:var(--muted);margin:0 0 14px}.domain-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.domain-grid button{height:78px;padding:11px;border:1px solid var(--line);border-radius:13px;background:#fffefa;display:grid;grid-template-columns:38px 1fr 18px;align-items:center;text-align:left;color:var(--ink)}.domain-grid button>span{width:33px;height:33px;border-radius:9px;background:#eceee8;display:grid;place-items:center;color:var(--green);font-weight:800}.domain-grid b,.domain-grid small{display:block}.domain-grid b{font-size:12px}.domain-grid small{font-size:11px;color:var(--muted);margin-top:3px}.domain-grid svg{opacity:0}.domain-grid .selected{border-color:var(--green);box-shadow:0 0 0 2px rgba(34,78,66,.08)}.domain-grid .selected svg{opacity:1;color:var(--green)}.context-block{display:flex;flex-direction:column;gap:17px}.generate{width:100%;margin-top:auto}.action-error{margin:14px 0 0;padding:10px 12px;border-radius:9px;background:#f7e9e6;color:var(--red);font-size:11px}.options{margin-top:38px}.option-heading{margin-bottom:14px}.option{display:grid;grid-template-columns:1fr 320px;gap:24px;padding:24px;margin-bottom:12px}.option h2{font-size:20px;margin:12px 0 7px}.option-main>p{font-size:11px;color:var(--muted);line-height:1.6}.partner{display:flex;align-items:center;gap:10px;margin:18px 0}.partner>span{width:38px;height:38px;border-radius:11px;background:#e5ebe5;color:var(--green);display:grid;place-items:center;font-weight:800}.partner b,.partner small{display:block}.partner b{font-size:12px}.partner small{font-size:11px;color:var(--muted);margin-top:2px}.topic{border-left:2px solid var(--green-2);padding-left:11px}.topic small{display:block;font-size:11px;letter-spacing:.1em;margin-bottom:4px}.option aside{border-left:1px solid var(--line);padding-left:24px;display:flex;flex-direction:column;align-items:flex-start}.option aside>small{font-size:11px;letter-spacing:.1em;color:var(--muted)}blockquote{font-size:13px;line-height:1.75;margin:11px 0 20px;font-style:italic;flex:1}.option aside .btn{width:100%}
@media(max-width:850px){.setup-card,.option{display:block}.context-block,.option aside{margin-top:24px}.domain-grid{grid-template-columns:1fr}.option aside{border-left:0;border-top:1px solid var(--line);padding:20px 0 0}}
</style>
