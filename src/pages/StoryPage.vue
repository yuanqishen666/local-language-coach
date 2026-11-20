<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../api'
import { modelErrorKey } from '../provider-error-copy'
import { guideToModelSettings, needsModelConfiguration } from '../model-access'
import { stepName } from '../level'
import { STORY_MIN_WORDS, type Story } from '../../shared/wordbook'

interface StoryListItem { id: string; languageCode: string; title: string; createdAt: string }

const route = useRoute()
const router = useRouter()
const { t, locale } = useI18n()

const storyId = computed(() => String(route.params.id || ''))
const story = ref<Story | null>(null)
const stories = ref<StoryListItem[]>([])
// 'list' is the page with no story open: earlier stories, and the button that writes a new one.
const state = ref<'loading' | 'list' | 'writing' | 'ready' | 'missing'>('loading')
const error = ref('')
const starting = ref(false)
const picked = ref('')
const wordBusy = ref('')
const levelName = computed(() => (story.value ? stepName(story.value.step) : ''))
let version = 0

async function open() {
  const current = ++version
  error.value = ''
  picked.value = ''
  if (!storyId.value) {
    story.value = null
    state.value = 'loading'
    try { stories.value = (await api.get<{ stories: StoryListItem[] }>('/stories')).stories }
    catch { stories.value = [] }
    if (current === version) state.value = 'list'
    return
  }
  if (story.value?.id === storyId.value) { state.value = 'ready'; return }
  state.value = 'loading'
  try {
    const found = await api.get<{ story: Story }>(`/stories/${encodeURIComponent(storyId.value)}?interfaceLocale=${encodeURIComponent(String(locale.value))}`)
    if (current !== version) return
    story.value = found.story
    state.value = 'ready'
  } catch (value) {
    if (current !== version) return
    story.value = null
    state.value = 'missing'
    error.value = value instanceof ApiError && value.code === 'STORY_NOT_FOUND' ? t('story.notFound') : t('common.operationFailed')
  }
}

/** A new story from the saved words whose review has come. Written only when asked for. */
async function write() {
  if (state.value === 'writing' || state.value === 'loading') return
  const before = state.value
  const current = ++version
  state.value = 'writing'
  error.value = ''
  try {
    const result = await api.post<{ story: Story }>('/stories', { interfaceLocale: String(locale.value) })
    if (current !== version) return
    story.value = result.story
    picked.value = ''
    state.value = 'ready'
    await router.push(`/words/story/${encodeURIComponent(result.story.id)}`)
  } catch (value) {
    if (current !== version) return
    state.value = before
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    error.value = value instanceof ApiError && value.code === 'STORY_NEEDS_WORDS'
      ? t('story.needsWords', { count: STORY_MIN_WORDS })
      : t(modelErrorKey(value) || 'story.failed')
  }
}

/** Goes on to talk about the story; the conversation is made once and returned to afterwards. */
async function talk() {
  if (!story.value || starting.value) return
  if (story.value.conversationId) { await router.push(`/conversation/${story.value.conversationId}`); return }
  starting.value = true
  error.value = ''
  try {
    const created = await api.post<{ id: string }>(`/stories/${encodeURIComponent(story.value.id)}/talk`, { interfaceLocale: String(locale.value) })
    await router.push(`/conversation/${created.id}`)
  } catch (value) {
    if (needsModelConfiguration(value)) { await guideToModelSettings(router, route.fullPath); return }
    error.value = t('common.operationFailed')
  } finally { starting.value = false }
}

/** Opens a word of the story. A meaning kept in another interface language is put into this one first. */
async function openWord(wordId: string) {
  picked.value = picked.value === wordId ? '' : wordId
  const word = story.value?.words.find((item) => item.wordId === wordId)
  if (!picked.value || !word || word.meaning || !word.saved || wordBusy.value) return
  wordBusy.value = wordId
  try {
    const localized = await api.post<{ meaning?: string }>(`/words/${encodeURIComponent(wordId)}/localize`, { interfaceLocale: String(locale.value) })
    word.meaning = String(localized.meaning || '')
  } catch {
    // The story reads the same without it.
  } finally { wordBusy.value = '' }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium' }).format(new Date(value))
}

onMounted(open)
watch(storyId, () => { void open() })
watch(locale, () => { story.value = null; void open() })
</script>

<template>
  <main>{{ t('story.title') }}</main>
</template>
