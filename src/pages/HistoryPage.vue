<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api } from '../api'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'

interface HistoryItem {
  id: string
  title: string
  status: 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

const store = useAppStore()
const { t, locale } = useI18n()
const items = ref<HistoryItem[]>([])
const filter = ref<'all' | 'active' | 'archived'>('all')
const pendingDelete = ref<HistoryItem | null>(null)
const deleting = ref(false)
const loadError = ref('')

async function load() {
  loadError.value = ''
  try { items.value = await api.get<HistoryItem[]>('/conversations') }
  catch { loadError.value = t('common.operationFailed') }
}
onMounted(load)
const shown = computed(() => filter.value === 'all' ? items.value : items.value.filter((item) => item.status === filter.value))

async function toggleArchive(item: HistoryItem) {
  const archived = item.status !== 'archived'
  try {
    await api.patch(`/conversations/${item.id}/archive`, { archived })
    item.status = archived ? 'archived' : 'active'
    store.notify(archived ? t('history.archivedToast') : t('history.restoredToast'))
  } catch { store.notify(t('common.operationFailed')) }
}

async function removeConversation() {
  if (!pendingDelete.value || deleting.value) return
  deleting.value = true
  try {
    await api.delete(`/conversations/${pendingDelete.value.id}`)
    items.value = items.value.filter((item) => item.id !== pendingDelete.value?.id)
    pendingDelete.value = null
    store.notify(t('history.deleted'))
  } catch { store.notify(t('history.deleteError')) }
  finally { deleting.value = false }
}

function day(value: string) { return new Intl.DateTimeFormat(String(locale.value), { day: 'numeric' }).format(new Date(value)) }
function month(value: string) { return new Intl.DateTimeFormat(String(locale.value), { month: 'short' }).format(new Date(value)) }
function dateTime(value: string) { return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
</script>

<template>
  <div class="page history-page">
    <header class="page-head"><div><h1>{{ t('history.titleOpen') }}</h1><p class="subhead">{{ t('history.subtitleOpen') }}</p></div></header>
    <div class="filters">
      <button v-for="item in [{ id: 'all', key: 'history.all' }, { id: 'active', key: 'history.ongoing' }, { id: 'archived', key: 'history.archived' }]" :key="item.id" :class="{ active: filter === item.id }" @click="filter = item.id as typeof filter">{{ t(item.key) }}</button>
    </div>
    <p v-if="loadError" class="load-error">{{ loadError }}</p>
    <div v-else-if="shown.length" class="history-list">
      <article v-for="item in shown" :key="item.id" class="card history-item">
        <RouterLink :to="`/conversation/${item.id}`" class="history-open" :aria-label="t('history.open', { title: item.title })">
          <div class="history-date"><b>{{ day(item.updatedAt) }}</b><span>{{ month(item.updatedAt) }}</span></div>
          <div><span class="badge" :class="item.status">{{ item.status === 'archived' ? t('history.archived') : t('history.ongoing') }}</span><h2>{{ item.title }}</h2><small>{{ dateTime(item.updatedAt) }}</small></div>
          <span class="continue-label">{{ item.status === 'archived' ? t('history.openAgain') : t('history.continue') }}</span><AppIcon name="arrow" />
        </RouterLink>
        <div class="history-actions">
          <button :aria-label="item.status === 'archived' ? t('history.restore') : t('history.archive')" @click="toggleArchive(item)"><AppIcon name="history" :size="15" /><span>{{ item.status === 'archived' ? t('history.restore') : t('history.archive') }}</span></button>
          <button class="delete-conversation" :aria-label="t('history.deleteLabel', { title: item.title })" @click="pendingDelete = item"><AppIcon name="close" :size="15" /><span>{{ t('common.delete') }}</span></button>
        </div>
      </article>
    </div>
    <div v-else class="empty card"><strong>{{ t('history.emptyOpenTitle') }}</strong>{{ t('history.emptyOpenBody') }}</div>

    <Teleport to="body"><div v-if="pendingDelete" class="confirm-backdrop" @click.self="pendingDelete = null"><section class="confirm-dialog card" role="alertdialog" aria-modal="true" :aria-label="t('history.deleteTitle')"><span class="confirm-icon"><AppIcon name="history" :size="23" /></span><h2>{{ t('history.deleteTitle') }}</h2><p>“{{ pendingDelete.title }}”</p><small>{{ t('history.deleteBody') }}</small><footer><button class="btn" :disabled="deleting" @click="pendingDelete = null">{{ t('common.cancel') }}</button><button class="btn danger solid" :disabled="deleting" @click="removeConversation">{{ deleting ? t('history.deleting') : t('common.delete') }}</button></footer></section></div></Teleport>
  </div>
</template>

<style scoped>
.filters{display:flex;gap:6px;margin-bottom:18px}.filters button{height:33px;padding:0 12px;border:1px solid var(--line);border-radius:9px;background:transparent;color:var(--muted);font-size:11px}.filters button.active{background:var(--green);color:white;border-color:var(--green)}.history-list{display:grid;gap:10px}.history-item{min-height:102px;position:relative;display:grid;grid-template-columns:1fr auto;overflow:hidden;transition:.16s}.history-item:hover{transform:translateX(3px);border-color:#bdc5bc}.history-open{padding:17px 10px 17px 20px;display:grid;grid-template-columns:48px 1fr auto 20px;gap:17px;align-items:center;min-width:0}.history-date{border-right:1px solid var(--line)}.history-date b,.history-date span{display:block}.history-date b{font-size:21px}.history-date span{font-size:11px;text-transform:uppercase;color:var(--muted)}.history-list h2{font-size:14px;margin:7px 0 4px}.history-list small{font-size:11px;color:var(--muted)}.badge.archived{background:#e8e8e3;color:#747870}.continue-label{font-size:11px;color:var(--green);white-space:nowrap}.history-actions{display:flex}.history-actions button{width:62px;border:0;border-left:1px solid var(--line);background:transparent;color:var(--muted);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;font-size:11px}.history-actions button:hover{background:#edf1e9;color:var(--green)}.history-actions .delete-conversation:hover{background:#f8eae6;color:var(--red)}.load-error{padding:12px;border-radius:9px;background:#f8eae6;color:var(--red);font-size:11px}.confirm-backdrop{position:fixed;inset:0;background:rgba(27,31,26,.32);z-index:100;display:grid;place-items:center;padding:20px}.confirm-dialog{width:min(430px,100%);padding:27px}.confirm-icon{width:48px;height:48px;border-radius:14px;background:#f5e7e3;color:var(--red);display:grid;place-items:center;margin-bottom:18px}.confirm-dialog h2{font-size:22px;margin:0}.confirm-dialog>p{font-size:12px;font-weight:700;margin:12px 0 8px}.confirm-dialog>small{display:block;color:var(--muted);font-size:11px;line-height:1.7}.confirm-dialog footer{display:flex;justify-content:flex-end;gap:8px;margin-top:24px}.btn.danger.solid{background:var(--red);border-color:var(--red);color:white}
@media(max-width:680px){.history-open{grid-template-columns:38px 1fr 15px;padding-left:13px}.continue-label{display:none}.history-actions button{width:48px}.history-actions button span{display:none}}
</style>
