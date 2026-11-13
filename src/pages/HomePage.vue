<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import { guideToModelSettings, needsModelConfiguration } from '../model-access'
import { displayTargetLanguage } from '../../shared/locales'
import { conversationDisplayTitle, type ConversationListItem } from '../conversation-list'

const store = useAppStore()
const router = useRouter()
const { t, locale } = useI18n()
const history = ref<ConversationListItem[]>([])
const creating = ref(false)
const startError = ref('')
const directTitleParts = computed(() => {
  const title = t('home.openTitle')
  return String(locale.value).startsWith('zh') ? [title.slice(0, 2), title.slice(2)] : [title]
})

let loadVersion = 0
async function loadHistory() {
  const version = ++loadVersion
  const requestedLocale = String(locale.value)
  const loaded = await api.get<ConversationListItem[]>(`/conversations?interfaceLocale=${encodeURIComponent(requestedLocale)}`)
  if (version === loadVersion && requestedLocale === String(locale.value)) history.value = loaded
}
onMounted(loadHistory)
watch(locale, loadHistory)

async function startConversation() {
  startError.value = ''
  if (!store.settings?.modelReady) {
    await guideToModelSettings(router, '/')
    return
  }
  creating.value = true
  try {
    const data = await api.post<{ id: string }>('/conversations', { title: t('home.openTitle'), setup: null, interfaceLocale: String(locale.value) })
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
function displayTitle(item: ConversationListItem) {
  return conversationDisplayTitle(item, t('home.openTitle'), t('history.scene'), String(locale.value))
}
</script>

<template>
  <div class="page home">
    <header class="home-bar">
      <b>{{ t('nav.home') }}</b>
      <span>{{ displayTargetLanguage(store.settings?.learning.targetLanguageCode || 'en', locale) }} · {{ store.settings?.learning.proficiency }}</span>
    </header>

    <section class="start-stage">
      <button class="direct-entry" :disabled="creating" @click="startConversation">
        <h1><span v-for="part in directTitleParts" :key="part">{{ part }}</span></h1>
        <span class="direct-action" :aria-label="creating ? t('home.starting') : t('home.openAction')"><AppIcon name="arrow" :size="24" /></span>
      </button>

      <div class="side-stage">
        <button class="custom-entry" @click="router.push('/start')">
          <span class="custom-collage" aria-hidden="true"><i class="portrait"><b></b></i><i class="texture"></i><i class="quote">“ ”</i></span>
          <span class="custom-title"><h2>{{ t('home.settingTitle') }}</h2><AppIcon name="arrow" :size="24" /></span>
          <span class="custom-fields"><i>{{ t('home.customPerson') }}</i><i>{{ t('home.customContext') }}</i><i>{{ t('home.customTopic') }}</i></span>
        </button>

        <section class="recent">
          <div class="section-title"><h2>{{ t('home.recentOpen') }}</h2><RouterLink to="/history">{{ t('home.viewAll') }}</RouterLink></div>
          <div v-if="history.length" class="recent-list">
            <RouterLink v-for="item in history.slice(0, 2)" :key="item.id" :to="`/conversation/${item.id}`">
              <div><b>{{ displayTitle(item) }}</b><small>{{ item.kind === 'direct' ? t('history.direct') : t('history.scene') }} · {{ formatDate(item.updatedAt) }}</small></div>
              <AppIcon name="arrow" :size="16" />
            </RouterLink>
          </div>
          <div v-else class="recent-empty">{{ t('home.emptyOpenTitle') }}</div>
        </section>
      </div>
    </section>
    <p v-if="startError" class="start-error" role="alert">{{ startError }}</p>
  </div>
</template>

<style scoped>
.home{max-width:none;padding:26px 30px 46px}.home-bar{height:40px;margin-bottom:19px;display:flex;align-items:center;justify-content:space-between}.home-bar b{font-size:13px}.home-bar span{color:var(--muted);font-size:11px}.start-stage{min-height:594px;display:grid;grid-template-columns:minmax(510px,1.52fr) minmax(310px,.78fr);gap:12px}.direct-entry{position:relative;min-height:594px;padding:42px;display:flex;flex-direction:column;overflow:hidden;border:0;border-radius:28px 10px 28px 28px;background:linear-gradient(145deg,#3d65e8 0%,var(--blue) 52%,#203fa9 100%);color:white;text-align:left;isolation:isolate;box-shadow:0 20px 52px rgba(32,57,155,.16);transition:transform .24s var(--ease)}.direct-entry:before{content:'';position:absolute;width:390px;height:390px;right:-155px;top:-112px;border:1px solid rgba(255,255,255,.16);border-radius:50%;box-shadow:0 0 0 52px rgba(255,255,255,.03),0 0 0 106px rgba(255,255,255,.025);z-index:-1}.direct-entry:after{content:'';position:absolute;left:-8%;right:-8%;bottom:122px;height:1px;background:rgba(255,255,255,.14);transform:rotate(-4deg);z-index:-1}.direct-entry:hover{transform:translateY(-3px)}.direct-entry:disabled{opacity:.72}.direct-entry h1{margin:auto 0;font-family:'Songti SC',STSong,serif;font-size:clamp(68px,6.6vw,104px);font-weight:520;line-height:.94;letter-spacing:-.07em}.direct-entry h1 span{display:block}.direct-entry h1 span+span{margin-left:.56em}.direct-action{position:absolute;right:42px;bottom:34px;width:54px;height:54px;display:grid;place-items:center;border-radius:50%;background:var(--paper);color:var(--blue);transition:transform .2s var(--ease),background .18s}.direct-entry:hover .direct-action{transform:translate(3px,-3px) rotate(-4deg);background:#f7d276}.side-stage{min-width:0;display:grid;grid-template-rows:minmax(355px,1fr) 224px;gap:12px}.custom-entry{position:relative;min-height:355px;padding:26px 28px;overflow:hidden;border:0;border-radius:10px 28px 28px 10px;background:var(--cream);text-align:left;transition:transform .24s var(--ease),box-shadow .24s}.custom-entry:hover{transform:translateY(-3px);box-shadow:0 18px 40px rgba(87,64,36,.12)}.custom-collage{position:absolute;inset:0;overflow:hidden}.portrait{position:absolute;left:28px;top:26px;width:118px;height:148px;overflow:hidden;background:var(--peach);transform:rotate(-4deg);box-shadow:0 16px 30px rgba(74,52,31,.12)}.portrait:before{content:'';position:absolute;width:48px;height:48px;left:35px;top:24px;border-radius:50%;background:var(--ink)}.portrait b{position:absolute;width:86px;height:64px;left:16px;bottom:-4px;border-radius:50% 50% 0 0;background:var(--ink)}.texture{position:absolute;width:55%;height:48%;right:-8%;top:-8%;border-radius:0 0 0 65%;background:repeating-linear-gradient(0deg,transparent 0 5px,rgba(28,46,38,.08) 5px 6px),repeating-linear-gradient(90deg,transparent 0 5px,rgba(28,46,38,.06) 5px 6px),var(--sage);transform:rotate(5deg)}.quote{position:absolute;right:34px;top:105px;width:92px;height:92px;display:grid;place-items:center;border-radius:50%;background:var(--blue);color:white;font:40px/1 Georgia,serif}.custom-title{position:absolute;left:28px;right:25px;bottom:64px;display:flex;align-items:end;justify-content:space-between}.custom-title h2{font-family:'Songti SC',STSong,serif;font-size:clamp(28px,2.4vw,38px);font-weight:520;line-height:1.05;letter-spacing:-.05em}.custom-title svg{transition:transform .2s var(--ease)}.custom-entry:hover .custom-title svg{transform:translate(4px,-4px)}.custom-fields{position:absolute;left:28px;right:28px;bottom:24px;display:flex;gap:6px}.custom-fields i{padding:5px 8px;border-radius:999px;background:rgba(255,253,247,.64);font-size:10px;font-style:normal}.recent{padding:23px 25px;display:flex;flex-direction:column;border-radius:18px 18px 28px 18px;background:var(--paper)}.section-title{display:flex;align-items:center;justify-content:space-between}.section-title h2{font-size:14px}.section-title a{color:var(--muted);font-size:11px}.recent-list{margin-top:auto}.recent-list>a{min-height:61px;padding:10px 0 7px;display:grid;grid-template-columns:minmax(0,1fr) 18px;align-items:center;gap:10px;border-bottom:1px solid var(--line)}.recent-list>a>div{min-width:0}.recent-list b,.recent-list small{display:block}.recent-list b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.recent-list small{margin-top:4px;color:var(--muted);font-size:9px}.recent-list svg{color:var(--blue)}.recent-empty{margin-top:auto;padding-bottom:4px;border-bottom:1px solid var(--line);color:#989a93;font-size:12px}.start-error{margin:12px 0 0;padding:11px 13px;border-radius:10px;background:#f7e9e6;color:var(--red);font-size:11px}
@media(max-width:1040px){.start-stage{grid-template-columns:minmax(440px,1.35fr) minmax(290px,.75fr)}}
@media(max-width:760px){.home{padding:18px 16px 92px}.start-stage{display:block;min-height:0}.direct-entry{width:100%;min-height:510px;padding:28px 24px;border-radius:24px}.direct-entry h1{font-size:64px}.direct-action{right:24px;bottom:28px}.side-stage{display:block}.custom-entry{width:100%;min-height:350px;margin-top:12px;border-radius:24px}.recent{min-height:190px;margin-top:12px}}
</style>
