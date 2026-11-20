// Generated from src/pages/HistoryPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../../api'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../../stores/app'
import { conversationDisplayTitle, type ConversationKind, type ConversationListItem } from '../../conversation-list'

export function useHistoryPage() {
const store = useAppStore()
const { t, locale } = useI18n()
const items = ref<ConversationListItem[]>([])
const kindFilter = ref<ConversationKind>('direct')
const statusFilter = ref<'all' | 'active' | 'archived'>('all')
const pendingDelete = ref<ConversationListItem | null>(null)
const deleting = ref(false)
const loadError = ref('')

async function load() {
  const requestedLocale = String(locale.value)
  loadError.value = ''
  try {
    const loaded = await api.get<ConversationListItem[]>(`/conversations?interfaceLocale=${encodeURIComponent(requestedLocale)}`)
    if (requestedLocale === String(locale.value)) items.value = loaded
  }
  catch { if (requestedLocale === String(locale.value)) loadError.value = t('common.operationFailed') }
}
onMounted(load)
watch(locale, load)
const kindCounts = computed(() => ({
  direct: items.value.filter((item) => item.kind === 'direct').length,
  scene: items.value.filter((item) => item.kind === 'scene').length,
}))
const shown = computed(() => items.value.filter((item) =>
  item.kind === kindFilter.value && (statusFilter.value === 'all' || item.status === statusFilter.value),
))
const emptyTitle = computed(() => kindFilter.value === 'direct' ? t('history.emptyDirectTitle') : t('history.emptySceneTitle'))

function kindLabel(kind: ConversationKind) {
  return kind === 'direct' ? t('history.direct') : t('history.scene')
}
function displayTitle(item: ConversationListItem) {
  return conversationDisplayTitle(item, t('home.openTitle'), t('history.scene'), String(locale.value))
}

async function toggleArchive(item: ConversationListItem) {
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

  return { store, t, locale, items, kindFilter, statusFilter, pendingDelete, deleting, loadError, load, kindCounts, shown, emptyTitle, kindLabel, displayTitle, toggleArchive, removeConversation, day, month, dateTime }
}
