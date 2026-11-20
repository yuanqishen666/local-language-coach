// Generated from src/pages/ReviewPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'

export function useReviewPage() {
const {t,locale}=useI18n();const queue=ref<any[]>([]);const index=ref(0);const revealed=ref(false);const mode=ref<'recognition'|'production'>('production');const done=ref(0);const error=ref('');const loading=ref(true)
function current(item:any){return !item||item.interfaceLocale===String(locale.value)}
async function localize(item:any){return current(item)?item:api.post<any>(`/words/${item.id}/localize`,{interfaceLocale:String(locale.value)})}
onMounted(async()=>{try{const items=await api.get<any[]>('/reviews/due');if(items[0])items[0]=await localize(items[0]);queue.value=items}catch{error.value=t('common.operationFailed')}finally{loading.value=false}})
const word=computed(()=>queue.value[index.value])
// A word that comes back within this long is asked once more before the sitting ends.
const SOON=20*60_000
async function rate(rating:number){if(!word.value)return;error.value='';try{const next=index.value+1;if(queue.value[next])queue.value[next]=await localize(queue.value[next]);const result=await api.post<{dueAt:string;nextReview?:Record<number,number>|null}>(`/reviews/${word.value.id}`,{rating});if(result?.nextReview&&new Date(result.dueAt).getTime()-Date.now()<=SOON)queue.value.push({...word.value,nextReview:result.nextReview});done.value++;index.value++;revealed.value=false}catch{error.value=t('common.operationFailed')}}
/** When the word comes back after a rating, in the words of the interface language. Empty when the schedule is unknown. */
function nextIn(rating:number){const minutes=Number(word.value?.nextReview?.[rating]);if(!(minutes>0))return '';const days=minutes/1440;const [value,unit]=minutes<60?[minutes,'minute']:minutes<1440?[Math.round(minutes/60),'hour']:days<60?[Math.round(days),'day']:days<730?[Math.round(days/30),'month']:[Math.round(days/365),'year'];return new Intl.NumberFormat(String(locale.value),{style:'unit',unit,unitDisplay:'long'}).format(value)}

  return { t, locale, queue, index, revealed, mode, done, error, loading, current, localize, word, SOON, rate, nextIn }
}
