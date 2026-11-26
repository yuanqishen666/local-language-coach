// Generated from src/pages/WordbookPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'
import { translationErrorMessage } from '../../provider-error-copy'
import { ankiText, downloadText, fileName } from '../../export-files'
import { requestReviewDueRefresh } from '../../review-due'

export function useWordbookPage() {
const {t,locale}=useI18n();const words=ref<any[]>([]);const query=ref('');const selected=ref<any>(null);const localizing=ref('');const error=ref('')
function current(item:any){return item.interfaceLocale===String(locale.value)}
async function load(){words.value=await api.get<any[]>('/words')}onMounted(load)
watch(locale,async()=>{selected.value=null;await load()})
const shown=computed(()=>words.value.filter(w=>`${w.term} ${current(w)?w.meaning:''}`.toLowerCase().includes(query.value.toLowerCase())))
async function selectWord(word:any){error.value='';if(current(word)){selected.value=word;return}localizing.value=word.id;selected.value=null;try{const localized=await api.post<any>(`/words/${word.id}/localize`,{interfaceLocale:String(locale.value)});const index=words.value.findIndex(item=>item.id===word.id);if(index>=0)words.value[index]=localized;selected.value=localized}catch{error.value=t('common.operationFailed')}finally{localizing.value=''}}
async function remove(id:string){await api.delete(`/words/${id}`);if(selected.value?.id===id)selected.value=null;await load();requestReviewDueRefresh()}
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

  return { t, locale, words, query, selected, localizing, error, current, load, shown, selectWord, remove, formatDate, passageTranslations, passageOpen, passageBusy, passageErrors, passageKey, canTranslatePassage, passageTranslation, togglePassageTranslation, exportAnki }
}
