<script setup lang="ts">
import { computed,onMounted,ref } from 'vue';import { useI18n } from 'vue-i18n';import { api } from '../api';import AppIcon from '../components/AppIcon.vue'
const {t,locale}=useI18n();const words=ref<any[]>([]);const query=ref('');const selected=ref<any>(null)
async function load(){words.value=await api.get<any[]>('/words')}onMounted(load)
const shown=computed(()=>words.value.filter(w=>`${w.term} ${w.meaning}`.toLowerCase().includes(query.value.toLowerCase())))
async function remove(id:string){await api.delete(`/words/${id}`);if(selected.value?.id===id)selected.value=null;await load()}
function formatDate(value:string){return new Intl.DateTimeFormat(String(locale.value),{dateStyle:'medium'}).format(new Date(value))}
</script>
<template>
  <div class="page words-page">
    <header class="page-head">
      <div><h1>{{ t('words.title') }}</h1><p class="subhead">{{ t('words.subtitle') }}</p></div>
      <RouterLink to="/review" class="btn primary"><AppIcon name="repeat" />{{ t('words.reviewDue') }}</RouterLink>
    </header>
    <div class="search"><AppIcon name="book" :size="17" /><input v-model="query" :placeholder="t('words.search')" /><span>{{ shown.length }}</span></div>
    <div class="word-layout">
      <div v-if="shown.length" class="word-list">
        <button v-for="word in shown" :key="word.id" :class="{ active: selected?.id === word.id }" @click="selected = word">
          <div><b>{{ word.term }}</b><span v-if="word.lemma !== word.term">{{ word.lemma }}</span></div>
          <p>{{ word.meaning }}</p><small>{{ formatDate(word.created_at) }} · {{ word.language.toUpperCase() }}</small>
        </button>
      </div>
      <div v-else class="empty card"><strong>{{ t('words.emptyTitle') }}</strong>{{ t('words.emptyBody') }}</div>
      <aside v-if="selected" class="word-detail card">
        <span class="badge">{{ selected.language.toUpperCase() }}</span><h2>{{ selected.term }}</h2><p class="meaning">{{ selected.meaning }}</p>
        <blockquote v-if="selected.source_sentence">{{ selected.source_sentence }}</blockquote>
        <section v-if="selected.details?.senses"><h3>{{ t('words.commonUses') }}</h3><article v-for="sense in selected.details.senses" :key="sense.meaning + sense.example"><b>{{ sense.meaning }}</b><p>{{ sense.example }}</p><small>{{ sense.translation }}</small></article></section>
        <button class="btn danger small" @click="remove(selected.id)">{{ t('words.remove') }}</button>
      </aside>
      <aside v-else-if="shown.length" class="word-placeholder card"><AppIcon name="book" :size="28" /><p>{{ t('words.select') }}</p></aside>
    </div>
  </div>
</template>
<style scoped>.search{height:44px;border:1px solid var(--line);border-radius:11px;background:var(--paper);display:grid;grid-template-columns:25px 1fr auto;align-items:center;padding:0 13px;margin-bottom:15px;color:var(--muted)}.search input{border:0;outline:0;background:transparent}.search span{font-size:11px}.word-layout{display:grid;grid-template-columns:1fr 370px;gap:16px;align-items:start}.word-list{border-top:1px solid var(--line)}.word-list button{width:100%;min-height:94px;border:0;border-bottom:1px solid var(--line);background:transparent;text-align:left;padding:15px;display:grid;grid-template-columns:1fr;position:relative}.word-list button:hover,.word-list button.active{background:rgba(255,255,255,.55)}.word-list button.active:before{content:'';position:absolute;left:0;top:12px;bottom:12px;width:3px;background:var(--green);border-radius:4px}.word-list b{font-size:17px}.word-list div>span{font-size:11px;color:var(--muted);margin-left:8px}.word-list p{font-size:11px;color:#575b54;margin:6px 0}.word-list small{font-size:11px;color:var(--muted)}.word-detail{padding:23px;position:sticky;top:20px}.word-detail h2{font-size:27px;margin:11px 0 7px}.meaning{font-size:12px;line-height:1.6;color:var(--green);font-weight:650}.word-detail blockquote{font-size:11px;line-height:1.65;margin:18px 0;padding:13px;background:#eeefe9;border-left:2px solid var(--amber)}.word-detail h3{font-size:11px;letter-spacing:.12em;color:var(--muted)}.word-detail article{border-top:1px solid var(--line);padding:10px 0}.word-detail article b{font-size:11px}.word-detail article p{font-size:11px;margin:5px 0}.word-detail article small{font-size:11px;color:var(--muted)}.word-placeholder{padding:50px;text-align:center;color:var(--muted)}.word-placeholder p{font-size:11px;line-height:1.6}@media(max-width:800px){.word-layout{display:block}.word-detail{margin-top:15px;position:static}.page-head>.btn{display:none}}</style>
