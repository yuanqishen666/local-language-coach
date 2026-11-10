<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import { guideToModelSettings, needsModelConfiguration } from '../model-access'
import { displayTargetLanguage } from '../../shared/locales'

interface ConversationListItem {
  id: string
  title: string
  status: 'active' | 'archived'
  updatedAt: string
}

const store = useAppStore()
const router = useRouter()
const { t, locale } = useI18n()
const history = ref<ConversationListItem[]>([])
const creating = ref(false)
const startError = ref('')

onMounted(async () => { history.value = await api.get<ConversationListItem[]>('/conversations') })

async function startConversation() {
  startError.value = ''
  if (!store.settings?.modelReady) {
    await guideToModelSettings(router, '/')
    return
  }
  creating.value = true
  try {
    const data = await api.post<{ id: string }>('/conversations', { title: t('home.openTitle'), setup: null })
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/')
    else startError.value = t('home.startError')
  } finally {
    creating.value = false
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium' }).format(new Date(value))
}
</script>

<template>
  <div class="page home">
    <header class="hero">
      <div>
        <h1>{{ t('home.titleOpen') }}</h1>
        <p class="subhead">{{ t('home.subtitleOpen', { language: displayTargetLanguage(store.settings?.learning.targetLanguageCode || 'en', locale) }) }}</p>
      </div>
      <span class="level-stamp">{{ store.settings?.learning.proficiency }}<small>{{ t('home.level') }}</small></span>
    </header>

    <section class="start-grid">
      <button class="start-card direct" :disabled="creating" @click="startConversation">
        <span class="mode-icon"><AppIcon name="spark" :size="28" /></span>
        <h2>{{ t('home.openTitle') }}</h2>
        <p>{{ t('home.openDescription') }}</p>
        <strong>{{ creating ? t('home.starting') : t('home.openAction') }}<AppIcon name="arrow" /></strong>
      </button>
      <button class="start-card setting" @click="router.push('/start')">
        <span class="mode-icon"><AppIcon name="compass" :size="28" /></span>
        <h2>{{ t('home.settingTitle') }}</h2>
        <p>{{ t('home.settingDescription') }}</p>
        <strong>{{ t('home.settingAction') }}<AppIcon name="arrow" /></strong>
      </button>
    </section>
    <p v-if="startError" class="start-error" role="alert">{{ startError }}</p>

    <section class="recent">
      <div class="section-title">
        <h2>{{ t('home.recentOpen') }}</h2>
        <RouterLink to="/history">{{ t('home.viewAll') }} →</RouterLink>
      </div>
      <div v-if="history.length" class="recent-list">
        <RouterLink v-for="item in history.slice(0, 4)" :key="item.id" :to="`/conversation/${item.id}`">
          <span class="status-pin" :class="item.status"></span>
          <div><b>{{ item.title }}</b><small>{{ formatDate(item.updatedAt) }}</small></div>
          <em>{{ item.status === 'archived' ? t('history.archived') : t('history.continue') }}</em>
          <AppIcon name="arrow" :size="16" />
        </RouterLink>
      </div>
      <div v-else class="empty card"><strong>{{ t('home.emptyOpenTitle') }}</strong>{{ t('home.emptyOpenBody') }}</div>
    </section>
  </div>
</template>

<style scoped>
.home{max-width:1140px}.hero{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:30px}.hero h1{max-width:760px}.level-stamp{width:72px;height:72px;border-radius:50%;border:1px solid var(--green);display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--green);font-weight:800;font-size:19px;flex:0 0 auto}.level-stamp small{font-size:11px;letter-spacing:.12em;margin-top:2px}.start-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:18px}.start-card{width:100%;min-height:318px;border:1px solid var(--line);border-radius:20px;padding:26px;text-align:left;color:var(--ink);position:relative;display:flex;flex-direction:column;align-items:flex-start;overflow:hidden;transition:.2s;background:var(--paper)}.start-card:hover{transform:translateY(-3px);box-shadow:var(--shadow)}.start-card.direct{background:var(--green);border-color:var(--green);color:white}.start-card.direct:after{content:'聊';position:absolute;right:-22px;bottom:-102px;font-size:250px;font-weight:800;color:rgba(255,255,255,.035);pointer-events:none}.mode-icon{width:52px;height:52px;border-radius:14px;display:grid;place-items:center;background:#e5ebe5;color:var(--green);margin-bottom:42px}.direct .mode-icon{background:rgba(255,255,255,.12);color:white}.direct .badge{background:var(--lime);margin-bottom:7px}.start-card h2{font-size:25px;margin:9px 0}.start-card p{font-size:13px;line-height:1.75;opacity:.72;margin:0;max-width:560px}.start-card strong{width:100%;margin-top:auto;padding-top:26px;font-size:12px;display:flex;align-items:center;justify-content:space-between}.start-error{margin:12px 0 0;padding:11px 13px;border-radius:10px;background:#f7e9e6;color:var(--red);font-size:11px}.recent{margin-top:46px}.section-title{display:flex;align-items:end;justify-content:space-between;margin-bottom:16px}.section-title a{font-size:11px;color:var(--green);font-weight:700}.recent-list{border-top:1px solid var(--line)}.recent-list>a{min-height:73px;border-bottom:1px solid var(--line);display:grid;grid-template-columns:9px 1fr auto 18px;align-items:center;gap:14px;padding:10px 7px;transition:.15s}.recent-list>a:hover{background:rgba(255,255,255,.42);padding-left:12px}.status-pin{width:7px;height:7px;background:var(--green-2);border-radius:50%}.status-pin.archived{background:#a6aaa2}.recent-list b,.recent-list small{display:block}.recent-list b{font-size:13px}.recent-list small{font-size:11px;color:var(--muted);margin-top:4px}.recent-list em{font-style:normal;font-size:11px;color:var(--muted)}
.start-card strong{font-size:13px}.start-error{font-size:11px}.section-title a{font-size:12px}.recent-list small{font-size:11px}.recent-list em{font-size:11px}
@media(max-width:760px){.start-grid{display:block}.start-card{min-height:276px;margin-bottom:13px}.mode-icon{margin-bottom:28px}.level-stamp{display:none}.hero{display:block}.recent-list>a{grid-template-columns:8px 1fr 15px}.recent-list em{display:none}}
</style>
