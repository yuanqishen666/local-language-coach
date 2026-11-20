<script setup lang="ts">
import { computed,onMounted,ref,watch } from 'vue';import { useI18n } from 'vue-i18n';import { api } from '../api';import { translationErrorMessage } from '../provider-error-copy';import AppIcon from '../components/AppIcon.vue';import SpeakButton from '../components/SpeakButton.vue'
import { ankiText, downloadText, fileName } from '../export-files'
const {t,locale}=useI18n();const words=ref<any[]>([]);const query=ref('');const selected=ref<any>(null);const localizing=ref('');const error=ref('')
function current(item:any){return item.interfaceLocale===String(locale.value)}
async function load(){words.value=await api.get<any[]>('/words')}onMounted(load)
watch(locale,async()=>{selected.value=null;await load()})
const shown=computed(()=>words.value.filter(w=>`${w.term} ${current(w)?w.meaning:''}`.toLowerCase().includes(query.value.toLowerCase())))
async function selectWord(word:any){error.value='';if(current(word)){selected.value=word;return}localizing.value=word.id;selected.value=null;try{const localized=await api.post<any>(`/words/${word.id}/localize`,{interfaceLocale:String(locale.value)});const index=words.value.findIndex(item=>item.id===word.id);if(index>=0)words.value[index]=localized;selected.value=localized}catch{error.value=t('common.operationFailed')}finally{localizing.value=''}}
async function remove(id:string){await api.delete(`/words/${id}`);if(selected.value?.id===id)selected.value=null;await load()}
function formatDate(value:string){return new Intl.DateTimeFormat(String(locale.value),{dateStyle:'medium'}).format(new Date(value))}
const passageTranslations=ref<Record<string,string>>({});const passageOpen=ref<Record<string,boolean>>({});const passageBusy=ref<Record<string,boolean>>({});const passageErrors=ref<Record<string,string>>({})
function passageKey(word:any){return `${word.id}:${String(locale.value)}`}
function canTranslatePassage(word:any){return Boolean(word.source_sentence)&&String(word.language||'').split('-')[0].toLowerCase()!==String(locale.value).split('-')[0].toLowerCase()}
function passageTranslation(word:any){return passageOpen.value[word.id]?passageTranslations.value[passageKey(word)]||'':''}
async function togglePassageTranslation(word:any){const id=word.id;if(passageTranslations.value[passageKey(word)]){passageOpen.value[id]=!passageOpen.value[id];return}if(passageBusy.value[id])return;passageBusy.value[id]=true;passageErrors.value[id]='';try{const data=await api.post<{translation:string;interfaceLocale:string}>(`/words/${id}/translation`,{interfaceLocale:String(locale.value)});passageTranslations.value[`${id}:${data.interfaceLocale}`]=data.translation;passageOpen.value[id]=data.interfaceLocale===String(locale.value)}catch(error){passageErrors.value[id]=translationErrorMessage(error,String(locale.value))}finally{passageBusy.value[id]=false}}
watch(locale,()=>{passageOpen.value={};passageErrors.value={}})
/** The wordbook as a text file Anki imports: the file itself names the deck and the note type. */
function exportAnki() {
  const name = `${t('product.name')} ${t('words.title')}`
  downloadText(fileName(name, 'txt'), ankiText(words.value, name))
}
</script>
<template>
  <div class="page words-page">
    <header class="page-head">
      <div><h1>{{ t('words.title') }}</h1><p class="subhead">{{ t('words.subtitle') }}</p></div>
      <RouterLink to="/review" class="btn primary"><AppIcon name="repeat" />{{ t('words.reviewDue') }}</RouterLink>
    </header>
    <div class="search"><AppIcon name="book" :size="17" /><input v-model="query" :placeholder="t('words.search')" /><span>{{ shown.length }}</span></div>
    <p v-if="error" class="load-error">{{ error }}</p>
    <div class="word-layout">
      <div v-if="shown.length" class="word-list">
        <button v-for="word in shown" :key="word.id" :disabled="localizing===word.id" :class="{ active: selected?.id === word.id }" @click="selectWord(word)">
          <div><b>{{ word.term }}</b><span v-if="word.lemma !== word.term">{{ word.lemma }}</span></div>
          <p v-if="current(word)">{{ word.meaning }}</p><small>{{ formatDate(word.created_at) }} · {{ word.language.toUpperCase() }}</small>
        </button>
      </div>
      <div v-else class="empty card"><strong>{{ t('words.emptyTitle') }}</strong>{{ t('words.emptyBody') }}</div>
      <aside v-if="selected" class="word-detail card">
        <span class="badge">{{ selected.language.toUpperCase() }}</span><div class="word-title"><h2 :lang="selected.language">{{ selected.term }}</h2><SpeakButton :speech-id="`word-${selected.id}-term`" :text="selected.term" :language-code="selected.language" /></div><p class="meaning">{{ selected.meaning }}</p>
        <div v-if="selected.source_sentence" class="word-context"><blockquote :lang="selected.language">{{ selected.source_sentence }}</blockquote><SpeakButton :speech-id="`word-${selected.id}-context`" :text="selected.source_sentence" :language-code="selected.language" compact /></div>
        <section v-if="selected.details?.senses"><h3>{{ t('words.commonUses') }}</h3><article v-for="(sense, senseIndex) in selected.details.senses" :key="sense.meaning + sense.example"><b>{{ sense.meaning }}</b><div class="word-example"><p :lang="selected.language">{{ sense.example }}</p><SpeakButton :speech-id="`word-${selected.id}-example-${senseIndex}`" :text="sense.example" :language-code="selected.language" compact /></div><small>{{ sense.translation }}</small></article></section>
        <button class="btn danger small" @click="remove(selected.id)">{{ t('words.remove') }}</button>
      </aside>
      <aside v-else-if="shown.length" class="word-placeholder card"><AppIcon name="book" :size="28" /><p>{{ t('words.select') }}</p></aside>
    </div>
  </div>
</template>
<style scoped>.search{height:44px;border:1px solid var(--line);border-radius:11px;background:var(--paper);display:grid;grid-template-columns:25px 1fr auto;align-items:center;padding:0 13px;margin-bottom:15px;color:var(--muted)}.search input{border:0;outline:0;background:transparent}.search span{font-size:11px}.word-layout{display:grid;grid-template-columns:1fr 370px;gap:16px;align-items:start}.word-list{border-top:1px solid var(--line)}.word-list button{width:100%;min-height:94px;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;padding:15px;display:grid;grid-template-columns:1fr;position:relative}.word-list button:hover,.word-list button.active{background:rgba(255,255,255,.55)}.word-list button.active:before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:3px;background:var(--green);border-radius:4px}.word-list b{font-size:17px}.word-list div>span{font-size:11px;color:var(--muted);margin-left:8px}.word-list p{font-size:11px;color:#575b54;margin:6px 0}.word-list small{font-size:11px;color:var(--muted)}.word-detail{padding:23px;position:sticky;top:20px}.word-title{display:flex;align-items:center;gap:8px}.word-detail h2{min-width:0;font-size:27px;margin:11px 0 7px;overflow-wrap:anywhere}.meaning{font-size:12px;line-height:1.6;color:var(--green);font-weight:650}.word-context{margin:18px 0;display:flex;align-items:center;gap:5px}.word-detail .word-context blockquote{min-width:0;flex:1;font-size:11px;line-height:1.65;margin:0;padding:13px;background:#eeefe9;border-left:2px solid var(--amber)}.word-detail h3{font-size:11px;letter-spacing:.12em;color:var(--muted)}.word-detail article{border-top:1px solid var(--line);padding:10px 0}.word-detail article b{font-size:11px}.word-example{display:flex;align-items:center;gap:5px}.word-detail article p{min-width:0;flex:1;font-size:11px;margin:5px 0}.word-detail article small{font-size:11px;color:var(--muted)}.word-placeholder{padding:50px;text-align:center;color:var(--muted)}.word-placeholder p{font-size:11px;line-height:1.6}@media(max-width:800px){.word-layout{display:block}.word-detail{margin-top:15px;position:static}.page-head>.btn{display:none}}</style>
<style scoped>
.words-page{max-width:1240px}.words-page .page-head{margin-bottom:22px}.words-page .subhead{display:none}.page-head>.btn{height:44px;padding:0 18px;border-radius:999px;background:var(--ink)}.search{height:48px;margin-bottom:16px;padding:0 16px;border:0;border-bottom:1px solid var(--line);border-radius:0;background:transparent}.search input{height:100%}.word-layout{grid-template-columns:minmax(0,1fr) 390px;gap:26px}.word-list button{min-height:102px;padding:14px 12px;transition:padding .18s,background .18s}.word-list button:hover,.word-list button.active{padding-left:20px;background:rgba(255,255,255,.36)}.word-list button.active:before{display:none}.word-list b{font-size:20px}.word-list p{color:var(--muted)}.word-list small{font-size:10px}.word-detail{min-height:520px;padding:28px;top:26px;border-radius:26px;background:var(--ink);color:white}.word-detail .badge{background:transparent;color:#acafa8;padding:0}.word-detail h2{margin:22px 0 7px;font-family:'Songti SC',STSong,serif;font-size:44px;font-weight:520}.meaning{color:var(--sage);font-size:13px}.word-detail .word-context{margin:40px 0 30px}.word-detail .word-context blockquote{padding:22px 0;border:solid rgba(255,255,255,.17);border-width:1px 0;background:transparent;font-size:15px}.word-detail h3{color:#b4b6af}.word-detail article{border-color:rgba(255,255,255,.12)}.word-detail article p{color:#d3d1ca}.word-detail article small{color:#969991}.word-detail .btn{margin-top:18px;background:rgba(255,255,255,.08)}.word-placeholder{min-height:520px;display:grid;place-items:center;border-radius:26px;background:var(--ink);color:#aaa}
@media(max-width:800px){.word-layout{display:block}.word-detail,.word-placeholder{min-height:auto;margin-top:15px;position:static}.page-head>.btn{display:none}}
</style>
