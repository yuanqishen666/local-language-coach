<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { api, ApiError } from '../api'
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
  const requestedLocale = String(locale.value)
  error.value = ''
  const loaded = await api.get<any[]>('/memories')
  if (requestedLocale !== String(locale.value)) return
  if (!loaded.some((item) => item.interfaceLocale !== requestedLocale)) {
    memories.value = loaded.filter((item) => item.interfaceLocale === requestedLocale)
    return
  }
  try {
    const localized = await api.post<any[]>('/memories/localize', { interfaceLocale: requestedLocale })
    if (requestedLocale === String(locale.value)) {
      memories.value = localized.filter((item) => item.interfaceLocale === requestedLocale)
    }
  } catch {
    if (requestedLocale === String(locale.value)) {
      memories.value = loaded
      error.value = t('memories.updateError')
    }
  }
}
onMounted(load)
watch(locale, () => {
  cancelEdit()
  memories.value = []
  void load()
})

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
  await api.put(`/memories/${item.id}`, { value: value.value.trim(), interfaceLocale: String(locale.value) })
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
      : t('memories.updateError')
  }
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), {
    dateStyle: 'medium',
  }).format(new Date(value))
}
</script>
<template>
  <div class="page" data-qs-id="qs-memories-page">
    <header class="page-head" data-qs-id="qs-memories-header"><div><h1>{{ t('memories.title') }}</h1><p class="subhead">{{ t('memories.subtitle') }}</p></div><span v-if="memories.length" class="core-count" data-content-repeat-ok="orientation">{{ t('memories.coreCount', { count: coreCount }) }}</span></header>
    <p v-if="error" class="memory-error" role="alert">{{ error }}</p>
    <div class="memory-groups" data-qs-id="qs-memory-groups">
      <section v-for="(items, key) in groups" :key="key" class="memory-section" :data-qs-id="`qs-memory-section-${key}`">
        <div class="memory-title"><div><h2 data-content-source-exempt="existing-product-memory-taxonomy">{{ t(`memory.category.${key}`) }}</h2><div class="memory-help" :data-content-key="`memories.${key}Help`" data-content-source-exempt="existing-product-memory-taxonomy">{{ t(`memories.${key}Help`) }}</div></div></div>
        <div class="memory-list" :class="{ 'is-empty': !items.length }" :data-qs-id="`qs-memory-list-${key}`">
          <article v-for="item in items" :key="item.id" class="memory-row" :data-qs-id="`qs-memory-item-${String(item.id).toLowerCase()}`">
            <template v-if="editing === item.id">
              <div class="memory-edit"><input v-model="value" @keydown.enter="save(item)" /><div class="memory-edit-actions"><button class="btn small primary" :disabled="!memoryDirty" @click="save(item)">{{ t('common.save') }}</button><button class="btn small" @click="cancelEdit">{{ t('common.cancel') }}</button></div></div>
            </template>
            <template v-else>
              <div class="memory-content">
                <div class="memory-value"><span v-if="item.sensitive" class="memory-label sensitive">{{ t('memories.sensitive') }}</span><span v-else-if="item.tier === 'core'" class="memory-label">{{ t('memory.category.core') }}</span><span class="memory-text">{{ item.value }}</span></div>
                <div class="memory-meta"><small>{{ formatDate(item.updatedAt) }}</small><span v-if="item.useCount" data-content-source-exempt="server-context-selection-count">{{ t('memories.usedCount', item.useCount) }}</span></div>
              </div>
              <footer :data-qs-id="`qs-memory-actions-${String(item.id).toLowerCase()}`"><button @click="toggleTier(item)">{{ item.tier === 'core' ? t('memories.demote') : t('memories.promote') }}</button><button @click="edit(item)">{{ t('common.edit') }}</button><button @click="remove(item.id)">{{ t('common.delete') }}</button></footer>
            </template>
          </article>
          <p v-if="!items.length" class="group-empty" data-content-source-exempt="existing-product-memory-empty-state" data-content-repeat-ok="orientation">{{ t('memories.groupEmpty') }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
<style scoped>
.core-count{font-size:11px;color:var(--green);font-weight:750}.memory-error{padding:10px 12px;border-radius:9px;background:#f7e9e6;color:var(--red);font-size:11px;margin:0 0 20px}.memory-groups{display:grid;gap:24px}.memory-section{display:grid;grid-template-columns:210px minmax(0,1fr);gap:24px;align-items:start}.memory-title h2{font-size:16px}.memory-help{max-width:200px;font-size:11px;color:var(--muted);line-height:1.5}.memory-list{width:min(100%,760px);overflow:hidden;border:1px solid var(--line);border-radius:12px;background:rgba(255,253,247,.56)}.memory-list.is-empty{border-style:dashed;background:transparent}.memory-row{min-height:52px;padding:8px 10px;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;border-bottom:1px solid var(--line)}.memory-row:last-of-type{border-bottom:0}.memory-content{min-width:0;display:flex;align-items:center;gap:10px}.memory-value{min-width:0;display:flex;align-items:center;gap:7px}.memory-text{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:640}.memory-label{flex:0 0 auto;color:var(--green);font-size:9px;font-weight:750;letter-spacing:.06em}.memory-label.sensitive{color:var(--red)}.memory-meta{flex:0 0 auto;display:flex;align-items:center;gap:6px;color:var(--muted)}.memory-meta small{font-size:10px}.memory-meta span{padding:2px 5px;border-radius:5px;background:rgba(49,88,216,.06);font-size:9px}.memory-row footer{display:flex;align-items:center;justify-content:flex-end;gap:1px}.memory-row footer button{height:26px;padding:0 6px;border:0;border-radius:6px;background:transparent;color:var(--muted);font-size:10px}.memory-row footer button:hover{background:rgba(32,33,30,.05);color:var(--ink)}.memory-row footer button:first-child{color:var(--green)}.memory-row footer button:last-child{color:var(--red)}.memory-edit{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px}.memory-edit input{height:34px;width:100%;padding:0 9px;border:1px solid var(--line);border-radius:8px;background:var(--paper)}.memory-edit-actions{display:flex;gap:5px}.group-empty{min-height:50px;padding:0 12px;display:flex;align-items:center;color:var(--muted);font-size:10px}@media(max-width:900px){.memory-content{display:grid;gap:4px}.memory-meta{justify-self:start}}@media(max-width:800px){.memory-section{display:block}.memory-title{margin-bottom:10px}.memory-help{max-width:none}.memory-row{grid-template-columns:minmax(0,1fr);gap:6px}.memory-row footer{justify-content:flex-start}.memory-edit{grid-template-columns:1fr}.memory-edit-actions{justify-content:flex-end}.memory-list{width:100%}}
</style>
