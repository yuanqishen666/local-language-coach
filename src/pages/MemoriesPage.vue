<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, ApiError } from '../api'
import AppIcon from '../components/AppIcon.vue'
import { hasMeaningfulTextChange } from '../form-state'

const { t, locale } = useI18n()
const memories = ref<any[]>([])
const editing = ref('')
const value = ref('')
const initialValue = ref('')
const error = ref('')
const memoryDirty = computed(() =>
  hasMeaningfulTextChange(value.value, initialValue.value),
)

async function load() {
  memories.value = await api.get<any[]>('/memories')
}
onMounted(load)

const groups = computed(() => ({
  core: memories.value.filter((memory) => memory.tier === 'core'),
  personal: memories.value.filter((memory) => memory.tier !== 'core' && memory.category === 'personal'),
  learning: memories.value.filter((memory) => memory.tier !== 'core' && memory.category === 'learning'),
  scene: memories.value.filter((memory) => memory.tier !== 'core' && memory.category === 'scene'),
}))
const coreCount = computed(() => groups.value.core.length)

function edit(item: any) {
  editing.value = item.id
  value.value = item.value
  initialValue.value = item.value
}
function cancelEdit() {
  editing.value = ''
  value.value = ''
  initialValue.value = ''
}
async function save(item: any) {
  if (!memoryDirty.value) return
  await api.put(`/memories/${item.id}`, { value: value.value.trim() })
  cancelEdit()
  await load()
}
async function remove(id: string) {
  await api.delete(`/memories/${id}`)
  await load()
}
async function toggleTier(item: any) {
  error.value = ''
  try {
    await api.patch(`/memories/${item.id}/tier`, { tier: item.tier === 'core' ? 'long_term' : 'core' })
    await load()
  } catch (value) {
    error.value = value instanceof ApiError && value.code === 'CORE_MEMORY_LIMIT'
      ? t('memories.coreLimit')
      : value instanceof Error ? value.message : t('memories.updateError')
  }
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), {
    dateStyle: 'medium',
  }).format(new Date(value))
}
</script>
<template>
  <div class="page">
    <header class="page-head"><div><h1>{{ t('memories.title') }}</h1><p class="subhead">{{ t('memories.subtitle') }}</p></div><span v-if="memories.length" class="core-count">{{ t('memories.coreCount', { count: coreCount }) }}</span></header>
    <p v-if="error" class="memory-error" role="alert">{{ error }}</p>
    <div v-if="memories.length" class="memory-groups">
      <section v-for="(items, key) in groups" :key="key" class="memory-section">
        <div class="memory-title"><div><h2>{{ t(`memory.category.${key}`) }}</h2><p>{{ t(`memories.${key}Help`) }}</p></div></div>
        <div class="memory-list">
          <article v-for="item in items" :key="item.id" class="card">
            <span v-if="item.sensitive" class="sensitive">{{ t('memories.sensitive') }}</span><span v-else-if="item.tier === 'core'">{{ t('memory.category.core') }}</span><b>{{ item.key }}</b>
            <template v-if="editing === item.id"><input v-model="value" @keydown.enter="save(item)" /><div><button class="btn small primary" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button><button class="btn small" @click="cancelEdit">{{ t('common.cancel') }}</button></div></template>
            <template v-else><p>{{ item.value }}</p><div class="memory-meta"><span v-if="item.topic && item.topic !== 'general'">{{ item.topic }}</span><span v-if="item.useCount">{{ t('memories.usedCount', { count: item.useCount }) }}</span></div><footer><small>{{ formatDate(item.updatedAt) }}</small><div><button @click="toggleTier(item)">{{ item.tier === 'core' ? t('memories.demote') : t('memories.promote') }}</button><button @click="edit(item)">{{ t('common.edit') }}</button><button @click="remove(item.id)">{{ t('common.delete') }}</button></div></footer></template>
          </article>
          <div v-if="!items.length" class="group-empty">{{ t('memories.groupEmpty') }}</div>
        </div>
      </section>
    </div>
    <div v-else class="empty card"><AppIcon name="memory" :size="30" /><strong>{{ t('memories.emptyTitle') }}</strong>{{ t('memories.emptyBody') }}</div>
  </div>
</template>
<style scoped>.core-count{font-size:11px;color:var(--green);font-weight:750}.memory-error{padding:10px 12px;border-radius:9px;background:#f7e9e6;color:var(--red);font-size:11px;margin:0 0 20px}.memory-groups{display:grid;gap:35px}.memory-section{display:grid;grid-template-columns:230px 1fr;gap:28px}.memory-title{display:flex;gap:11px}.memory-title>span{font-size:11px;color:var(--green);font-weight:800;margin-top:4px}.memory-title h2{font-size:16px}.memory-title p{font-size:11px;color:var(--muted);line-height:1.5}.memory-list{display:grid;grid-template-columns:1fr 1fr;gap:10px}.memory-list article{padding:15px}.memory-list article>span{font-size:11px;color:var(--green);letter-spacing:.08em}.memory-list article>span.sensitive{color:var(--red)}.memory-list b{display:block;font-size:11px;margin:7px 0 3px}.memory-list p{font-size:12px;margin:0 0 9px}.memory-meta{display:flex;gap:7px;min-height:16px;margin-bottom:8px}.memory-meta span{font-size:10px;color:var(--muted);padding:2px 5px;border-radius:5px;background:rgba(50,104,90,.06)}.memory-list footer{display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px;gap:8px}.memory-list small{font-size:11px;color:var(--muted)}.memory-list footer div{display:flex;flex-wrap:wrap;justify-content:flex-end}.memory-list footer button{border:0;background:transparent;font-size:11px;color:var(--muted)}.memory-list footer button:first-child{color:var(--green)}.memory-list footer button:last-child{color:var(--red)}.memory-list input{height:36px;border:1px solid var(--line);border-radius:8px;width:100%;padding:0 9px;margin:5px 0 8px}.group-empty{grid-column:1/-1;border:1px dashed var(--line);border-radius:11px;padding:22px;text-align:center;font-size:11px;color:var(--muted)}.empty svg{margin-bottom:12px}@media(max-width:800px){.memory-section{display:block}.memory-title{margin-bottom:13px}.memory-list{grid-template-columns:1fr}}</style>
