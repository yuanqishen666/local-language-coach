<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import { displayTargetLanguage, LOCALE_META, TARGET_LANGUAGES, UI_LOCALES, type UiLocale } from '../../shared/locales'

const store = useAppStore(); const router = useRouter(); const { t, locale } = useI18n()
const step = ref(1)
const saving = ref(false)
const submitError = ref('')
const levels = [
  { id: 'A2', key: 'onboarding.levelA2' },
  { id: 'B1', key: 'onboarding.levelB1' },
  { id: 'B2', key: 'onboarding.levelB2' },
]
const draft = ref({ uiLocale: 'zh-CN' as UiLocale, language: 'English', code: 'en', level: 'B1' })
onMounted(() => {
  if (store.settings) draft.value = { uiLocale: store.settings.ui.locale, language: store.settings.learning.targetLanguage, code: store.settings.learning.targetLanguageCode, level: store.settings.learning.proficiency }
  locale.value = draft.value.uiLocale
})
watch(() => draft.value.uiLocale, (value) => { locale.value = value })

function chooseLanguage(code: string, name: string) { draft.value.language = name; draft.value.code = code }
async function finish() {
  if (!store.settings || saving.value) return
  saving.value = true
  submitError.value = ''
  const next = {
    ...store.settings,
    setupComplete: true,
    ui: { ...store.settings.ui, locale: draft.value.uiLocale },
    learning: {
      ...store.settings.learning,
      targetLanguage: draft.value.language,
      targetLanguageCode: draft.value.code,
      proficiency: draft.value.level,
    },
    providers: store.settings.providers.map((provider) => ({ ...provider })),
  }
  try {
    await store.save(next)
    locale.value = draft.value.uiLocale
    await router.replace('/')
  } catch {
    submitError.value = t('onboarding.saveError')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="onboard">
    <header><div class="brand-mark">见</div><b>{{ t('product.name') }} <span>{{ t('onboarding.brandSubtitle') }}</span></b><div class="step-label">{{ step }} / 3</div></header>
    <section class="onboard-body">
      <div class="onboard-copy">
        <h1 v-if="step===1">{{ t('onboarding.interfaceTitle') }}</h1>
        <h1 v-else-if="step===2">{{ t('onboarding.targetTitle') }}</h1>
        <h1 v-else>{{ t('onboarding.levelTitle') }}</h1>
        <p v-if="step===1">{{ t('onboarding.interfaceHelp') }}</p>
        <p v-else-if="step===2">{{ t('onboarding.targetHelp') }}</p>
        <p v-else>{{ t('onboarding.levelHelp') }}</p>
      </div>
      <div class="onboard-panel card">
        <div v-if="step===1" class="choice-stack interface-languages">
          <button v-for="code in UI_LOCALES" :key="code" :class="{selected:draft.uiLocale===code}" @click="draft.uiLocale=code"><span class="choice-code">{{ LOCALE_META[code].shortCode }}</span><b>{{ LOCALE_META[code].nativeName }}</b><AppIcon name="check" /></button>
        </div>
        <div v-else-if="step===2" class="language-grid">
          <button v-for="item in TARGET_LANGUAGES" :key="item.code" :class="{selected:draft.code===item.code}" @click="chooseLanguage(item.code,item.name)"><span>{{ item.code.toUpperCase() }}</span><b>{{ displayTargetLanguage(item.code,draft.uiLocale) }}</b><AppIcon name="check" :size="15" /></button>
        </div>
        <div v-else class="level-list">
          <button v-for="level in levels" :key="level.id" :class="{selected:draft.level===level.id}" @click="draft.level=level.id"><b>{{ level.id }}</b><span>{{ t(level.key) }}</span></button>
        </div>
        <p v-if="submitError" class="submit-error" role="alert">{{ submitError }}</p>
        <footer><button v-if="step>1" class="btn ghost" :disabled="saving" @click="step--">{{ t('common.back') }}</button><span></span><button class="btn primary" :disabled="saving" @click="step<3 ? step++ : finish()">{{ saving ? t('onboarding.saving') : step<3 ? t('common.continue') : t('onboarding.openWorkspace') }}<AppIcon v-if="!saving" name="arrow" :size="17" /></button></footer>
      </div>
    </section>
    <div class="privacy-note"><span>●</span>{{ t('onboarding.privacy') }}</div>
  </main>
</template>

<style scoped>
.onboard{min-height:100vh;background:#f4f1ea;padding:0 7vw 35px;display:flex;flex-direction:column}.onboard>header{height:88px;display:flex;align-items:center;gap:11px;border-bottom:1px solid var(--line)}header b{font-size:16px}header b span{font-size:11px;color:var(--muted);font-weight:500;margin-left:5px}.step-label{margin-left:auto;font-size:11px;color:var(--muted);font-weight:700}.onboard-body{display:grid;grid-template-columns:minmax(300px,470px) minmax(420px,620px);gap:8vw;align-items:center;flex:1;padding:60px 0}.onboard-copy h1{font-size:48px;line-height:1.16;letter-spacing:-.045em;margin:0 0 22px;max-width:550px}.onboard-copy>p:last-child{font-size:15px;line-height:1.8;color:var(--muted);max-width:480px}.onboard-panel{padding:24px;min-height:395px;display:flex;flex-direction:column}.choice-stack{display:grid;gap:12px}.interface-languages{grid-template-columns:1fr 1fr;gap:9px}.choice-stack button,.language-grid button,.level-list button{border:1px solid var(--line);background:white;border-radius:13px;color:var(--ink);text-align:left}.choice-stack button{min-height:88px;padding:13px;display:grid;grid-template-columns:44px 1fr 20px;align-items:center;gap:11px}.interface-languages button{min-height:76px}.choice-code{width:44px;height:44px;border-radius:12px;background:#eeefe9;display:grid;place-items:center;font-weight:800;color:var(--green)}.choice-stack b,.choice-stack small{display:block}.choice-stack small{color:var(--muted);font-size:11px;line-height:1.35;margin-top:4px}.choice-stack svg,.language-grid svg{opacity:0}.selected{border-color:var(--green)!important;box-shadow:0 0 0 2px rgba(34,78,66,.09)!important}.selected svg{opacity:1!important;color:var(--green)}.language-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}.language-grid button{min-height:58px;padding:8px 12px;display:grid;grid-template-columns:38px 1fr 18px;align-items:center}.language-grid button>span{font-size:11px;font-weight:800;color:var(--green);background:#edf1eb;width:31px;height:31px;border-radius:8px;display:grid;place-items:center}.language-grid b{font-size:12px}.level-list{display:grid;gap:10px}.level-list button{min-height:76px;padding:14px 16px;display:grid;grid-template-columns:46px 1fr auto;align-items:center;gap:12px}.level-list button>b{font-size:20px;color:var(--green)}.level-list button>span{font-size:12px;color:#555a53}.level-list em{font-style:normal;font-size:11px;background:var(--lime);color:var(--green);padding:4px 7px;border-radius:10px}.submit-error{margin:14px 0 0;padding:10px 12px;border-radius:9px;background:#f7e9e6;color:var(--red);font-size:11px;line-height:1.5}.onboard-panel footer{margin-top:auto;display:flex;justify-content:space-between;padding-top:24px}.onboard-panel footer button:disabled{cursor:wait;opacity:.65}.privacy-note{text-align:center;font-size:11px;color:var(--muted)}.privacy-note span{color:#5b8a6b;margin-right:6px;font-size:11px}@media(max-width:850px){.onboard{padding:0 20px}.onboard-body{display:block;padding:34px 0}.onboard-copy h1{font-size:35px}.onboard-panel{margin-top:28px;min-height:390px}.onboard>header{height:72px}header b span{display:none}}@media(max-width:560px){.interface-languages,.language-grid{grid-template-columns:1fr}}
.choice-stack b{display:block}.level-list button{grid-template-columns:46px 1fr}
</style>
