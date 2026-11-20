<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../api'
import { useAppStore } from '../stores/app'
import type { TermLookup } from '../types'
import AppIcon from './AppIcon.vue'
import SpeakButton from './SpeakButton.vue'

const sessionCache = new Map<string, TermLookup>()
const props = defineProps<{ term: string; sentence: string; conversationId: string; open: boolean; setup?: unknown; targetLanguageCode?: string }>()
const emit = defineEmits<{ close: [] }>()
const store = useAppStore()
const { t, locale } = useI18n()
const loading = ref(false)
const data = ref<TermLookup | null>(null)
const saved = ref(false)
const error = ref('')
let requestVersion = 0

function normalized(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/gu, ' ')
}

function cacheKey() {
  return JSON.stringify([
    normalized(props.term),
    normalized(props.sentence),
    props.setup || null,
    targetLanguageCode.value,
    String(locale.value).toLowerCase(),
  ])
}

function remember(key: string, value: TermLookup) {
  if (sessionCache.size >= 200) sessionCache.delete(sessionCache.keys().next().value!)
  sessionCache.set(key, value)
}

// The conversation's own learning language when the page passes one; otherwise the current setting.
const targetLanguageCode = computed(() => props.targetLanguageCode || store.settings?.learning.targetLanguageCode || 'en')
const collocations = computed(() => ((data.value?.collocations || []) as unknown[]).map((item) => {
  if (typeof item === 'string') return { phrase: item, meaning: '' }
  if (!item || typeof item !== 'object') return { phrase: '', meaning: '' }
  const value = item as Record<string, unknown>
  return {
    phrase: String(value.phrase || value.collocation || value.text || ''),
    meaning: String(value.meaning || value.definition || value.translation || ''),
  }
}).filter((item) => item.phrase))

watch(
  () => [props.open, props.term, props.sentence, props.setup, targetLanguageCode.value, locale.value],
  async () => {
    const version = ++requestVersion
    if (!props.open || !props.term) {
      loading.value = false
      return
    }
    const key = cacheKey()
    const cached = sessionCache.get(key)
    saved.value = false
    error.value = ''
    if (cached) {
      data.value = cached
      loading.value = false
      return
    }
    loading.value = true
    data.value = null
    try {
      const result = await api.post<{ lookup: TermLookup }>('/lookup', {
        term: props.term,
        sentence: props.sentence,
        setup: props.setup,
        interfaceLocale: String(locale.value),
        conversationId: props.conversationId,
      })
      if (version !== requestVersion) return
      remember(key, result.lookup)
      data.value = result.lookup
    } catch {
      if (version === requestVersion) error.value = t('common.operationFailed')
    } finally {
      if (version === requestVersion) loading.value = false
    }
  },
  { immediate: true },
)

async function save() {
  if (!data.value || !store.settings) return
  await api.post('/words', {
    term: props.term,
    lemma: data.value.lemma,
    meaning: data.value.contextMeaning,
    language: targetLanguageCode.value,
    interfaceLocale: String(locale.value),
    details: data.value,
    sourceSentence: props.sentence,
    conversationId: props.conversationId,
  })
  saved.value = true
  store.notify(t('lookup.saved'))
}
</script>

<template>
  <Transition name="drawer">
    <aside v-if="open" class="lookup">
      <header>
        <div class="lookup-heading"><p>{{ t('lookup.title') }}</p><div class="term-row"><h2 :lang="targetLanguageCode">{{ term }}</h2><SpeakButton speech-id="lookup-term" :text="term" :language-code="targetLanguageCode" compact /></div></div>
        <button :aria-label="t('common.close')" @click="emit('close')"><AppIcon name="close" /></button>
      </header>
      <div v-if="loading" class="lookup-loading"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
      <div v-else-if="error" class="lookup-error">{{ error }}</div>
      <div v-else-if="data" class="lookup-content">
        <div class="word-meta">
          <span>{{ data.partOfSpeech }}</span>
          <span v-if="data.pronunciation">{{ data.pronunciation }}</span>
          <span v-if="data.lemma && data.lemma !== term">{{ t('lookup.lemma') }} · <b class="lemma" :lang="targetLanguageCode">{{ data.lemma }}</b></span>
        </div>
        <section class="context-sense">
          <small>{{ t('lookup.meaningHere') }}</small>
          <strong>{{ data.contextMeaning }}</strong>
          <div class="context-example"><blockquote :lang="targetLanguageCode">{{ sentence }}</blockquote><SpeakButton speech-id="lookup-context" :text="sentence" :language-code="targetLanguageCode" compact /></div>
        </section>
        <section v-if="data.forms?.length">
          <h3>{{ t('lookup.forms') }}</h3>
          <div class="forms"><span v-for="form in data.forms" :key="form.label + form.value"><b>{{ form.label }}</b><i :lang="targetLanguageCode">{{ form.value }}</i></span></div>
        </section>
        <section>
          <h3>{{ t('lookup.meanings') }}</h3>
          <article v-for="(sense, index) in data.senses" :key="sense.meaning + sense.example">
            <em>{{ Number(index) + 1 }}</em>
            <div><b>{{ sense.meaning }}</b><div class="example-line"><p :lang="targetLanguageCode">{{ sense.example }}</p><SpeakButton :speech-id="`lookup-example-${index}`" :text="sense.example" :language-code="targetLanguageCode" compact /></div><small>{{ sense.translation }}</small></div>
          </article>
        </section>
        <section v-if="collocations.length" data-qs-id="qs-lookup-collocations">
          <h3>{{ t('lookup.collocations') }}</h3>
          <dl class="collocations">
            <div v-for="(item, index) in collocations" :key="item.phrase + item.meaning" class="collocation">
              <dt :lang="targetLanguageCode"><span>{{ item.phrase }}</span><SpeakButton :speech-id="`lookup-collocation-${index}`" :text="item.phrase" :language-code="targetLanguageCode" compact /></dt>
              <dd v-if="item.meaning">{{ item.meaning }}</dd>
            </div>
          </dl>
        </section>
        <section v-if="data.register || data.regionalNotes" class="usage"><h3>{{ t('lookup.usage') }}</h3><p>{{ data.register }} {{ data.regionalNotes }}</p></section>
      </div>
      <footer><button class="btn primary" :disabled="loading || saved || !data" @click="save"><AppIcon :name="saved ? 'check' : 'plus'" />{{ saved ? t('lookup.saved') : t('lookup.add') }}</button></footer>
    </aside>
  </Transition>
  <Transition name="fade"><div v-if="open" class="lookup-backdrop" @click="emit('close')"></div></Transition>
</template>

<style scoped>
.lookup{position:fixed;inset:0 0 0 auto;width:390px;background:#fbfaf6;border-left:1px solid var(--line);z-index:60;box-shadow:-20px 0 55px rgba(29,34,28,.12);display:flex;flex-direction:column}.lookup header{padding:25px 24px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:start}.lookup-heading{min-width:0}.lookup header p{font-size:11px;letter-spacing:.14em;color:var(--muted);margin:0 0 5px}.term-row{display:flex;align-items:center;gap:7px}.lookup h2{min-width:0;font-size:28px;margin:0;overflow-wrap:anywhere}.lookup header>button{border:0;background:transparent;color:var(--muted)}.lookup-content{padding:19px 24px 100px;overflow:auto}.word-meta{display:flex;gap:6px;flex-wrap:wrap}.word-meta span{font-size:11px;padding:4px 7px;border-radius:7px;background:#e9ece6;color:var(--green)}.word-meta .lemma{font:inherit}.context-sense{background:var(--green);color:white;border-radius:14px;padding:17px;margin:17px 0}.context-sense small{font-size:11px;letter-spacing:.12em;color:#bed4c9;display:block;margin-bottom:7px}.context-sense strong{font-size:14px;line-height:1.55;display:block}.context-example{margin-top:12px;padding-top:8px;border-top:1px solid rgba(255,255,255,.2);display:flex;align-items:flex-start;gap:5px}.context-sense blockquote{min-width:0;flex:1;font-size:11px;line-height:1.6;margin:3px 0 0;opacity:.72}.context-sense :deep(.speak-button){flex:0 0 auto}.lookup section{margin:22px 0}.lookup h3{font-size:11px;letter-spacing:.13em;color:var(--muted);margin:0 0 11px}.forms{display:flex;gap:7px;flex-wrap:wrap}.forms>span{font-size:11px;border:1px solid var(--line);border-radius:8px;padding:6px 8px}.forms b{font-size:11px;color:var(--muted);margin-right:5px}.forms i{font-style:normal}.lookup article{display:grid;grid-template-columns:22px 1fr;gap:6px;padding:11px 0;border-top:1px solid var(--line)}.lookup article em{font-size:11px;color:var(--muted);font-style:normal}.lookup article b{font-size:11px}.example-line{display:flex;align-items:center;gap:5px}.lookup article p{min-width:0;flex:1;font-size:12px;margin:6px 0 3px;line-height:1.5}.lookup article small{font-size:11px;color:var(--muted)}.collocations{margin:0}.collocation{padding:10px 0;border-top:1px solid var(--line)}.collocation dt{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:700;line-height:1.45}.collocation dt span{min-width:0;flex:1}.collocation dd{margin:4px 0 0;color:var(--muted);font-size:11px;line-height:1.55}.usage p{font-size:11px;line-height:1.65;color:var(--muted)}.lookup footer{position:absolute;bottom:0;left:0;right:0;padding:14px 24px 22px;background:linear-gradient(transparent,#fbfaf6 20%)}.lookup footer .btn{width:100%}.lookup-loading{padding:24px}.lookup-loading span{height:75px;display:block;margin-bottom:12px;border-radius:12px}.lookup-error{padding:30px;color:var(--red);font-size:12px}.lookup-backdrop{position:fixed;inset:0;background:rgba(25,29,24,.15);z-index:55}.drawer-enter-active,.drawer-leave-active{transition:.28s ease}.drawer-enter-from,.drawer-leave-to{transform:translateX(100%)}.fade-enter-active,.fade-leave-active{transition:.2s}.fade-enter-from,.fade-leave-to{opacity:0}@media(max-width:600px){.lookup{width:100%;top:10vh;border-radius:20px 20px 0 0}.lookup-backdrop{bottom:90%}}
</style>
