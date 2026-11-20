// Generated from src/pages/HomePage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { api } from '../../api'
import { useAppStore } from '../../stores/app'
import { guideToModelSettings, needsModelConfiguration } from '../../model-access'
import { displayTargetLanguage } from '../../../shared/locales'
import { conversationDisplayTitle, type ConversationListItem } from '../../conversation-list'
import { levelOverview, levelPrompted, stepName } from '../../level'
import { modelErrorKey } from '../../provider-error-copy'
import type { LearningPath, PathItem } from '../../../shared/wordbook'

export function useHomePage() {
const store = useAppStore()
const router = useRouter()
const { t, locale } = useI18n()
const history = ref<ConversationListItem[]>([])
const creating = ref(false)
const startError = ref('')
// A language that has no level yet is pointed to the test, until the learner has opened it once.
const levelLanguageCode = computed(() => store.settings?.learning.targetLanguageCode || 'en')
const levelLanguage = computed(() => displayTargetLanguage(levelLanguageCode.value, locale.value))
const askLevel = computed(() => {
  const overview = levelOverview(levelLanguageCode.value)
  return Boolean(overview && !overview.profile && !levelPrompted(levelLanguageCode.value))
})
const directTitleParts = computed(() => {
  const title = t('home.openTitle')
  return String(locale.value).startsWith('zh') ? [title.slice(0, 2), title.slice(2)] : [title]
})

let loadVersion = 0
async function loadHistory() {
  const version = ++loadVersion
  const requestedLocale = String(locale.value)
  const loaded = await api.get<ConversationListItem[]>(`/conversations?interfaceLocale=${encodeURIComponent(requestedLocale)}`)
  if (version === loadVersion && requestedLocale === String(locale.value)) history.value = loaded
}
onMounted(loadHistory)
watch(locale, loadHistory)

async function startConversation() {
  startError.value = ''
  if (!store.settings?.modelReady) {
    await guideToModelSettings(router, '/')
    return
  }
  creating.value = true
  try {
    const data = await api.post<{ id: string }>('/conversations', { title: t('home.openTitle'), setup: null, interfaceLocale: String(locale.value) })
    await router.push(`/conversation/${data.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/')
    else startError.value = t('home.startError')
  } finally {
    creating.value = false
  }
}

// What to talk about next: asked for with a click, kept for a day, and never started on its own.
const path = ref<LearningPath | null>(null)
const pathWriting = ref(false)
const pathError = ref('')
const pathStarting = ref('')
let pathVersion = 0
async function loadPath() {
  const version = ++pathVersion
  const requestedLocale = String(locale.value)
  try {
    const found = await api.get<{ path: LearningPath | null }>(`/path?interfaceLocale=${encodeURIComponent(requestedLocale)}`)
    if (version === pathVersion && requestedLocale === String(locale.value)) path.value = found.path
  } catch {
    if (version === pathVersion) path.value = null
  }
}
onMounted(loadPath)
watch(locale, loadPath)

async function suggestPath() {
  if (pathWriting.value) return
  pathError.value = ''
  if (!store.settings?.modelReady) {
    await guideToModelSettings(router, '/')
    return
  }
  const version = ++pathVersion
  pathWriting.value = true
  try {
    const result = await api.post<{ path: LearningPath }>('/path', { interfaceLocale: String(locale.value) })
    if (version === pathVersion) path.value = result.path
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/')
    else pathError.value = t(modelErrorKey(error) || 'path.failed')
  } finally {
    pathWriting.value = false
  }
}

async function startPathItem(item: PathItem) {
  if (pathStarting.value) return
  if (item.conversationId) {
    await router.push(`/conversation/${item.conversationId}`)
    return
  }
  pathStarting.value = item.id
  pathError.value = ''
  try {
    const created = await api.post<{ id: string }>(`/path/${encodeURIComponent(item.id)}/start`, { interfaceLocale: String(locale.value) })
    await router.push(`/conversation/${created.id}`)
  } catch (error) {
    if (needsModelConfiguration(error)) await guideToModelSettings(router, '/')
    else pathError.value = t('home.startError')
  } finally {
    pathStarting.value = ''
  }
}
function pathLevel(item: PathItem) {
  return stepName(item.step)
}
function mistakeLabel(category: string) {
  return t(`learning.error.${category}`)
}


function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium' }).format(new Date(value))
}
function displayTitle(item: ConversationListItem) {
  return conversationDisplayTitle(item, t('home.openTitle'), t('history.scene'), String(locale.value))
}

  return { store, router, t, locale, history, creating, startError, levelLanguageCode, levelLanguage, askLevel, directTitleParts, loadHistory, startConversation, path, pathWriting, pathError, pathStarting, loadPath, suggestPath, startPathItem, pathLevel, mistakeLabel, formatDate, displayTitle }
}
