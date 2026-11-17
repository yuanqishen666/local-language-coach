<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import MessageBubble from '../components/MessageBubble.vue'
import LookupDrawer from '../components/LookupDrawer.vue'
import SpeakButton from '../components/SpeakButton.vue'
import type { Conversation, Message, MessageMeta } from '../types'
import { beginOptimisticTurn, completeOptimisticTurn, failOptimisticTurn, type OptimisticTurn } from '../conversation-turn'
import { guideToModelSettings, needsModelConfiguration } from '../model-access'
import { shouldSubmitComposer } from '../composer-keydown'
import { textLookupDirective as vTextLookup } from '../text-lookup'
import {
  clearConversationTurn,
  readConversationTurn,
  saveConversationTurn,
  updateConversationTurnPhase,
  type StoredConversationTurn,
} from '../conversation-turn-storage'
import {
  conversationTurnRecoveryAction,
  conversationTurnStatus,
  type ConversationTurnStatusResponse,
} from '../conversation-turn-recovery'

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const { t, locale } = useI18n()
const conversation = ref<Conversation | null>(null)
const input = ref('')
const sending = ref(false)
const compositionActive = ref(false)
const chat = ref<HTMLElement | null>(null)
const error = ref('')
const lookup = ref({ open: false, term: '', sentence: '' })
const partnerInitial = computed(() => {
  const name = conversation.value?.setup?.partnerName || conversation.value?.setup?.partnerRole || t('product.name')
  return [...name.trim()][0] || '•'
})
const targetLanguageCode = computed(() => store.settings?.learning.targetLanguageCode || 'en')
const setupMatchesLocale = computed(() => !conversation.value?.setup ||
  conversation.value.interfaceLocale === String(locale.value))
const conversationTitle = computed(() => {
  if (!conversation.value) return ''
  if (conversation.value.interfaceLocale === String(locale.value)) return conversation.value.title
  return conversation.value.setup ? t('history.scene') : t('history.direct')
})
const hasLearningRailContent = computed(() => {
  if (!conversation.value) return false
  if (conversation.value.setup && setupMatchesLocale.value) return true
  return conversation.value.messages.some((message) => {
    if (message.role !== 'assistant') return false
    const metaMatchesLocale = message.meta.interfaceLocale === String(locale.value)
    const coachingAvailable = metaMatchesLocale && Boolean(message.meta.reconstruction || message.meta.corrections?.length)
    const memoriesAvailable = (!message.meta.interfaceLocale || metaMatchesLocale) && Boolean(message.meta.memoryCandidates?.length)
    return coachingAvailable || memoriesAvailable
  })
})
let loadVersion = 0
let componentActive = true
let activeSubmissionId = ''

interface TurnResult {
  userMessage: Message
  assistantMessage: Message
  status: 'active'
}

onMounted(async () => {
  await openConversation(String(route.params.id))
})

watch(locale, async () => {
  lookup.value.open = false
  await openConversation(String(route.params.id), { preserveInput: true })
})

watch(() => route.params.id, async (next, previous) => {
  if (next && next !== previous) await openConversation(String(next))
})

onUnmounted(() => {
  componentActive = false
  loadVersion += 1
})

function isCurrentConversation(conversationId: string) {
  return componentActive && String(route.params.id) === conversationId
}

async function openConversation(conversationId: string, options: { preserveInput?: boolean } = {}) {
  if (!options.preserveInput) input.value = ''
  error.value = ''
  sending.value = false
  activeSubmissionId = ''
  const loaded = await load(conversationId)
  if (loaded) await reconcileStoredTurn(conversationId, loaded)
}

async function load(conversationId = String(route.params.id)) {
  const version = ++loadVersion
  const requestedLocale = String(locale.value)
  const loaded = await api.get<Conversation>(`/conversations/${encodeURIComponent(conversationId)}?interfaceLocale=${encodeURIComponent(requestedLocale)}`)
  if (version !== loadVersion || requestedLocale !== String(locale.value) || !isCurrentConversation(conversationId)) return
  conversation.value = loaded
  await scrollEnd()
  return loaded
}

async function scrollEnd() {
  await nextTick()
  if (chat.value) chat.value.scrollTop = chat.value.scrollHeight
}

function newClientMessageId() {
  return globalThis.crypto?.randomUUID?.() || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function readStoredTurn(conversationId: string) {
  return readConversationTurn(sessionStorage, conversationId, {
    createId: newClientMessageId,
    interfaceLocale: String(locale.value),
  })
}

async function serverTurnStatus(turn: StoredConversationTurn) {
  return api.get<ConversationTurnStatusResponse>(
    `/conversations/${encodeURIComponent(turn.conversationId)}/turns/${encodeURIComponent(turn.clientMessageId)}`,
  )
}

function finishSubmission(turn: StoredConversationTurn) {
  if (activeSubmissionId !== turn.clientMessageId || !isCurrentConversation(turn.conversationId)) return
  activeSubmissionId = ''
  sending.value = false
}

async function completeStoredTurn(turn: StoredConversationTurn, result?: TurnResult, optimisticTurn?: OptimisticTurn) {
  clearConversationTurn(sessionStorage, turn.conversationId, turn.clientMessageId)
  if (!isCurrentConversation(turn.conversationId)) return
  input.value = ''
  error.value = ''
  if (result && optimisticTurn && conversation.value?.id === turn.conversationId) {
    completeOptimisticTurn(conversation.value.messages, {
      localId: optimisticTurn.localId,
      clientMessageId: turn.clientMessageId,
    }, result.userMessage, result.assistantMessage)
    conversation.value.status = 'active'
    await scrollEnd().catch(() => undefined)
  } else {
    await load(turn.conversationId).catch(() => undefined)
  }
  finishSubmission(turn)
}

async function restoreStoredTurn(turn: StoredConversationTurn, value: unknown, optimisticTurn?: OptimisticTurn) {
  updateConversationTurnPhase(sessionStorage, turn, 'retryable')
  if (!isCurrentConversation(turn.conversationId)) return
  input.value = turn.content
  if (optimisticTurn) failOptimisticTurn(optimisticTurn.message)
  if (needsModelConfiguration(value)) await guideToModelSettings(router, route.fullPath)
  else error.value = turnErrorMessage(value)
  finishSubmission(turn)
}

async function reconcileSubmissionError(turn: StoredConversationTurn, value: unknown, optimisticTurn: OptimisticTurn | undefined, allowReattach: boolean) {
  let state: ConversationTurnStatusResponse | null = null
  try { state = await serverTurnStatus(turn) }
  catch { /* The original failure remains authoritative when status cannot be read. */ }

  if (state?.status === 'complete') {
    await completeStoredTurn(turn)
    return
  }
  if (state?.status === 'pending' && allowReattach) {
    await submitStoredTurn(turn, optimisticTurn, false)
    return
  }
  await restoreStoredTurn(turn, value, optimisticTurn)
}

async function submitStoredTurn(turn: StoredConversationTurn, optimisticTurn?: OptimisticTurn, allowReattach = true) {
  let result: TurnResult
  try {
    result = await api.post<TurnResult>(`/conversations/${encodeURIComponent(turn.conversationId)}/messages`, {
      content: turn.content,
      clientMessageId: turn.clientMessageId,
      interfaceLocale: turn.interfaceLocale,
    })
  } catch (value: unknown) {
    await reconcileSubmissionError(turn, value, optimisticTurn, allowReattach)
    return
  }
  await completeStoredTurn(turn, result, optimisticTurn)
}

async function reconcileStoredTurn(conversationId: string, loaded: Conversation) {
  const stored = readStoredTurn(conversationId)
  if (!stored) return

  let status = conversationTurnStatus(loaded.messages, stored.clientMessageId)
  if (status === 'missing') {
    try { status = (await serverTurnStatus(stored)).status }
    catch { status = 'missing' }
  }

  const action = conversationTurnRecoveryAction(status)
  if (action === 'clear') {
    clearConversationTurn(sessionStorage, conversationId, stored.clientMessageId)
    input.value = ''
    return
  }
  if (action === 'restore') {
    updateConversationTurnPhase(sessionStorage, stored, 'retryable')
    input.value = stored.content
    return
  }

  input.value = ''
  sending.value = true
  activeSubmissionId = stored.clientMessageId
  const existing = loaded.messages.find((message) => message.role === 'user' && message.clientMessageId === stored.clientMessageId)
  const optimisticTurn = existing
    ? { localId: `local:${stored.clientMessageId}`, message: existing }
    : beginOptimisticTurn(loaded.messages, stored.content, stored.clientMessageId, stored.createdAt)
  await submitStoredTurn(stored, optimisticTurn)
}

function turnErrorMessage(value: unknown) {
  const messages: Record<string, string> = {
    PROVIDER_RATE_LIMITED: 'error.turnBusy',
    PROVIDER_TIMEOUT: 'error.turnTimeout',
    PROVIDER_NETWORK_ERROR: 'error.turnNetwork',
    PROVIDER_UNAVAILABLE: 'error.turnUnavailable',
    PROVIDER_EMPTY_RESPONSE: 'error.turnIncomplete',
    PROVIDER_INVALID_RESPONSE: 'error.turnIncomplete',
    PROVIDER_TRUNCATED_RESPONSE: 'error.turnTruncated',
    PROVIDER_CONTEXT_LIMIT: 'error.turnContextOpen',
    PROVIDER_REFUSAL: 'error.turnRefusal',
    PROVIDER_AUTH_FAILED: 'error.turnAuth',
    PROVIDER_BALANCE_REQUIRED: 'error.turnBalance',
    PROVIDER_NOT_FOUND: 'error.turnModel',
    PROVIDER_INVALID_REQUEST: 'error.turnInvalidRequest',
    PROVIDER_ERROR: 'error.turnProvider',
    MODEL_CONFIGURATION_REQUIRED: 'error.turnModel',
    FST_ERR_CTP_BODY_TOO_LARGE: 'error.turnTooLarge',
  }
  if (value instanceof ApiError && value.code && messages[value.code]) return t(messages[value.code])
  return t('error.turnFallback')
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value || !conversation.value) return
  const conversationId = conversation.value.id
  const requestedLocale = String(locale.value)
  const returnTo = route.fullPath
  const previous = readStoredTurn(conversationId)
  const clientMessageId = previous?.content === text ? previous.clientMessageId : newClientMessageId()
  const storedTurn: StoredConversationTurn = {
    version: 1,
    conversationId,
    clientMessageId,
    content: text,
    interfaceLocale: requestedLocale,
    phase: store.settings?.modelReady ? 'submitting' : 'retryable',
    createdAt: previous?.content === text ? previous.createdAt : new Date().toISOString(),
  }
  saveConversationTurn(sessionStorage, storedTurn)
  if (!store.settings?.modelReady) {
    await guideToModelSettings(router, returnTo)
    return
  }
  input.value = ''
  sending.value = true
  activeSubmissionId = clientMessageId
  error.value = ''
  const optimisticTurn = beginOptimisticTurn(conversation.value.messages, text, clientMessageId)
  await scrollEnd().catch(() => undefined)
  await submitStoredTurn(storedTurn, optimisticTurn)
}

function openLookup(term: string, sentence: string) { lookup.value = { open: true, term, sentence } }
function lookupText(context: string) { return { context, onLookup: openLookup } }
async function saveMemory(item: NonNullable<MessageMeta['memoryCandidates']>[number]) {
  await api.post('/memories', { ...item, status: 'confirmed', sourceConversationId: route.params.id, interfaceLocale: String(locale.value) })
  for (const message of conversation.value?.messages || []) {
    if (!message.meta.memoryCandidates) continue
    message.meta.memoryCandidates = message.meta.memoryCandidates.filter((candidate) => {
      if (item.semanticSlot && candidate.semanticSlot === item.semanticSlot) return false
      return !(candidate.category === item.category && candidate.key === item.key && candidate.value === item.value)
    })
  }
  store.notify(t('conversation.memorySaved'))
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function handleComposerKeydown(event: KeyboardEvent) {
  if (!shouldSubmitComposer(event, compositionActive.value)) return
  event.preventDefault()
  void send()
}
function handleCompositionStart() { compositionActive.value = true }
function handleCompositionEnd() { compositionActive.value = false }
function feedbackFor(index: number): MessageMeta | undefined {
  if (!conversation.value || conversation.value.messages[index]?.role !== 'user') return undefined
  const next = conversation.value.messages[index + 1]
  return next?.role === 'assistant' ? next.meta : undefined
}
</script>

<template>
  <div v-if="conversation" class="conversation-shell" data-qs-id="qs-conversation-page">
    <header class="conversation-head" data-qs-id="qs-conversation-header">
      <button :aria-label="t('common.close')" @click="router.push('/')"><AppIcon name="close" /></button>
      <div class="head-title">
        <span>{{ setupMatchesLocale ? conversation.setup?.partnerName || conversation.setup?.partnerRole || t('conversation.openLabel') : t('conversation.openLabel') }}</span>
        <b>{{ conversationTitle }}</b>
      </div>
      <span class="always-open"><i></i>{{ t('conversation.alwaysOpen') }}</span>
    </header>

    <main class="conversation-layout" :class="{ 'has-learning-rail': hasLearningRailContent }" :aria-busy="sending" data-qs-id="qs-conversation-layout">
      <section class="chat-column" data-qs-id="qs-conversation-stream">
        <div ref="chat" class="message-list" data-qs-id="qs-message-list">
          <div class="session-start"><span>{{ formatDate(conversation.createdAt) }}</span></div>
          <section v-if="conversation.setup && setupMatchesLocale" class="conversation-context">
            <div class="partner-avatar">{{ (conversation.setup.partnerName || conversation.setup.partnerRole).slice(0, 1) }}</div>
            <div><b>{{ conversation.setup.partnerName || conversation.setup.partnerRole }}</b><span>{{ conversation.setup.partnerRole }} · {{ conversation.setup.setting }}</span></div>
            <p>{{ conversation.setup.topicSeed }}</p>
          </section>
          <div v-if="!conversation.messages.length" class="empty-chat">
            <span><AppIcon name="spark" :size="23" /></span>
            <h2>{{ t('conversation.sayAnything') }}</h2>
            <p><AppIcon name="book" :size="15" />{{ t('conversation.wordTipBody') }}</p>
          </div>
          <MessageBubble v-for="(message, index) in conversation.messages" :key="message.id" :data-qs-id="`qs-message-${index}`" :message="message" :feedback="feedbackFor(index)" :partner-initial="partnerInitial" :target-language-code="targetLanguageCode" @lookup="openLookup" @remember="saveMemory" />
          <div v-if="sending" class="reply-pending" role="status" aria-live="polite">
            <div class="pending-avatar" aria-hidden="true">{{ partnerInitial }}</div>
            <div class="typing-bubble"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{{ t('conversation.partnerTyping') }}</span></div>
          </div>
        </div>
        <div class="composer" data-qs-id="qs-conversation-composer">
          <div v-if="conversation.status === 'archived'" class="archived-note">{{ t('conversation.archivedContinue') }}</div>
          <div v-if="error" class="send-error" role="alert">{{ error }}</div>
          <label class="composer-label" for="conversation-message">{{ t('conversation.openPlaceholder') }}</label>
          <textarea id="conversation-message" v-model="input" :disabled="sending" :placeholder="sending ? t('conversation.waitPlaceholder') : t('conversation.openPlaceholder')" @compositionstart="handleCompositionStart" @compositionend="handleCompositionEnd" @keydown="handleComposerKeydown"></textarea>
          <footer><span>{{ t('conversation.sendHint') }}</span><button :disabled="!input.trim() || sending" @click="send"><AppIcon name="send" /></button></footer>
        </div>
      </section>

      <aside v-if="hasLearningRailContent" class="learning-rail" data-qs-id="qs-learning-rail">
        <section v-if="conversation.setup && setupMatchesLocale" class="rail-section rail-context" data-qs-id="qs-learning-rail-context">
          <div class="rail-partner-avatar">{{ (conversation.setup.partnerName || conversation.setup.partnerRole).slice(0, 1) }}</div>
          <div><b>{{ conversation.setup.partnerName || conversation.setup.partnerRole }}</b><span>{{ conversation.setup.partnerRole }} · {{ conversation.setup.setting }}</span></div>
          <p>{{ conversation.setup.topicSeed }}</p>
        </section>

        <div class="rail-coaching" data-qs-id="qs-learning-rail-coaching">
          <template v-for="(message, messageIndex) in conversation.messages" :key="`coaching-${message.id}`">
            <template v-if="message.role === 'assistant' && message.meta.interfaceLocale === locale">
              <section v-if="message.meta.reconstruction" class="rail-section rail-note" :data-qs-id="`qs-learning-note-${messageIndex}-reconstruction`">
                <small data-content-repeat-ok="responsive-alternative"><AppIcon name="spark" :size="13" />{{ message.meta.reconstruction.type === 'optional' ? t('message.moreNatural') : t('message.howToSay') }}</small>
                <s v-text-lookup="lookupText(message.meta.reconstruction.original)">{{ message.meta.reconstruction.original }}</s>
                <div class="rail-spoken-phrase"><strong v-text-lookup="lookupText(message.meta.reconstruction.improved)" data-content-repeat-ok="responsive-alternative">{{ message.meta.reconstruction.improved }}</strong><SpeakButton :speech-id="`rail-${message.id}-reconstruction`" :text="message.meta.reconstruction.improved" :language-code="targetLanguageCode" compact /></div>
                <p v-text-lookup="lookupText(message.meta.reconstruction.explanation)" data-content-repeat-ok="responsive-alternative">{{ message.meta.reconstruction.explanation }}</p>
              </section>
              <section v-for="(correction, correctionIndex) in message.meta.corrections || []" :key="correction.original + correction.improved" class="rail-section rail-note" :data-qs-id="`qs-learning-note-${messageIndex}-${correctionIndex}`">
                <small data-content-repeat-ok="orientation">{{ correction.severity === 'meaning' ? t('message.meaningFix') : t('message.naturalPhrasing') }}</small>
                <s v-text-lookup="lookupText(correction.original)">{{ correction.original }}</s>
                <div class="rail-spoken-phrase"><strong v-text-lookup="lookupText(correction.improved)" data-content-repeat-ok="responsive-alternative">{{ correction.improved }}</strong><SpeakButton :speech-id="`rail-${message.id}-${correctionIndex}`" :text="correction.improved" :language-code="targetLanguageCode" compact /></div>
                <p v-text-lookup="lookupText(correction.explanation)" data-content-repeat-ok="responsive-alternative">{{ correction.explanation }}</p>
              </section>
            </template>
          </template>
        </div>

        <div class="rail-memories" data-qs-id="qs-learning-rail-memories">
          <template v-for="(message, messageIndex) in conversation.messages" :key="`memories-${message.id}`">
            <template v-if="message.role === 'assistant' && (!message.meta.interfaceLocale || message.meta.interfaceLocale === locale)">
              <section v-for="(memory, memoryIndex) in message.meta.memoryCandidates || []" :key="memory.key + memory.value" class="rail-section rail-memory" :data-qs-id="`qs-memory-candidate-${messageIndex}-${memoryIndex}`">
                <small data-content-repeat-ok>{{ memory.action === 'update' ? t('conversation.memoryUpdateTitle') : t('conversation.memoriesTitle') }}</small>
                <s v-if="memory.action === 'update' && memory.previousValue">{{ memory.previousValue }}</s>
                <b>{{ memory.value }}</b>
                <button data-content-repeat-ok @click="saveMemory(memory)"><AppIcon name="plus" :size="13" />{{ memory.action === 'update' ? t('conversation.confirmMemoryUpdate') : t('conversation.confirmRemember') }}</button>
              </section>
            </template>
          </template>
        </div>
      </aside>
    </main>

    <LookupDrawer :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" @close="lookup.open = false" />
  </div>
  <div v-else class="app-loading">{{ t('conversation.opening') }}</div>
</template>

<style scoped>
.conversation-shell{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden;background:#f4f1ea}.conversation-head{height:72px;flex:0 0 72px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:20px;padding:0 28px;border-bottom:1px solid var(--line);background:rgba(247,245,239,.96);z-index:5}.conversation-head>button{justify-self:start;width:38px;height:38px;border:1px solid var(--line);border-radius:11px;background:transparent;display:grid;place-items:center;color:var(--muted)}.head-title{text-align:center;min-width:0}.head-title span,.head-title b{display:block}.head-title span{font-size:11px;color:var(--muted);margin-bottom:3px}.head-title b{max-width:420px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.always-open{justify-self:end;display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted)}.always-open i{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 4px rgba(49,88,216,.09)}
.conversation-layout{min-height:0;flex:1;display:grid;grid-template-columns:minmax(680px,820px);justify-content:center;gap:36px;padding:0 42px}.conversation-layout.has-learning-rail{grid-template-columns:minmax(680px,820px) 310px}.chat-column{min-width:0;min-height:0;display:flex;flex-direction:column}.message-list{min-height:0;flex:1;overflow:auto;padding:28px 18px 22px;scroll-behavior:smooth;scrollbar-gutter:stable}.session-start{display:flex;align-items:center;gap:13px;margin-bottom:24px;color:var(--muted)}.session-start::before,.session-start::after{content:"";height:1px;flex:1;background:rgba(32,33,30,.08)}.session-start span{font-size:11px}.session-start p{font-size:11px;margin:5px 0}.conversation-context{max-width:760px;margin:0 auto 22px;padding:13px 15px;border:1px solid var(--line);border-radius:14px;background:rgba(251,250,246,.72);display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:11px}.partner-avatar{width:36px;height:36px;border-radius:10px;background:#e7ebf8;color:var(--green);display:grid;place-items:center;font-weight:800}.conversation-context b,.conversation-context span{display:block}.conversation-context b{font-size:11px}.conversation-context span{font-size:11px;color:var(--muted);margin-top:2px}.conversation-context p{max-width:250px;font-size:11px;color:var(--muted);text-align:right;margin:0}.empty-chat{text-align:center;max-width:540px;margin:40px auto;color:var(--muted)}.empty-chat>span{width:48px;height:48px;border-radius:14px;background:#e7ebf8;color:var(--green);display:grid;place-items:center;margin:0 auto 14px}.empty-chat h2{font-size:18px;color:var(--ink)}.empty-chat p{display:flex;align-items:center;justify-content:center;gap:6px;font-size:11px;line-height:1.7}.reply-pending{display:flex;gap:11px;max-width:760px;margin:0 auto 22px}.pending-avatar{width:30px;height:30px;border-radius:9px;background:var(--green);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:800}.typing-bubble{min-height:42px;border:1px solid var(--line);border-radius:4px 15px 15px 15px;background:var(--paper);padding:11px 14px;display:flex;align-items:center;gap:9px;color:var(--muted);font-size:11px}.typing-dots{display:flex;gap:3px}.typing-dots i{width:4px;height:4px;border-radius:50%;background:var(--green-2);animation:typing 1s infinite}.typing-dots i:nth-child(2){animation-delay:.15s}.typing-dots i:nth-child(3){animation-delay:.3s}@keyframes typing{50%{transform:translateY(-3px)}}
.composer{position:relative;padding:14px 18px 20px;border-top:1px solid rgba(32,33,30,.08);background:linear-gradient(to bottom,rgba(247,245,239,.76),#f7f5ef 22%)}.composer-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.composer textarea{display:block;width:100%;min-height:72px;max-height:160px;resize:none;border:1px solid var(--line);border-bottom:0;border-radius:16px 16px 0 0;background:#fffefa;padding:14px 16px;color:var(--ink);outline:none;line-height:1.6;box-shadow:0 14px 38px rgba(36,35,30,.07)}.composer textarea:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(49,88,216,.08),0 14px 38px rgba(36,35,30,.07)}.composer footer{height:40px;border:1px solid var(--line);border-top:0;border-radius:0 0 16px 16px;background:#fffefa;padding:0 8px 0 15px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 14px 38px rgba(36,35,30,.07)}.composer footer span{font-size:11px;color:var(--muted)}.composer footer button{width:31px;height:31px;border:0;border-radius:9px;background:var(--green);color:white;display:grid;place-items:center}.composer footer button:disabled{opacity:.35}.send-error,.archived-note{max-width:820px;margin:0 auto 8px;padding:9px 11px;border-radius:8px;font-size:11px}.send-error{padding:0 2px;border-radius:0;background:transparent;color:var(--red)}.archived-note{background:#edf1e9;color:var(--green)}
.learning-rail{min-width:0;min-height:0;overflow:auto;padding:28px 0 28px 32px;border-left:1px solid var(--line);scrollbar-gutter:stable}.rail-section{padding:18px 0;border-top:1px solid var(--line)}.rail-context{display:grid;grid-template-columns:36px 1fr;gap:10px;align-items:center;border-top:0}.rail-partner-avatar{width:34px;height:34px;border-radius:10px;background:#e7ebf8;color:var(--green);display:grid;place-items:center;font-size:11px;font-weight:800}.rail-context b,.rail-context span{display:block}.rail-context b{font-size:12px}.rail-context span{margin-top:3px;color:var(--muted);font-size:10px}.rail-context p{grid-column:1/-1;margin:4px 0 0;color:var(--muted);font-size:11px;line-height:1.6}.rail-note small{display:flex;align-items:center;gap:5px;margin-bottom:10px;color:#7c672e;font-size:10px;font-weight:800;letter-spacing:.03em}.rail-note s{display:block;margin-bottom:5px;color:#9a8478;font-size:11px;line-height:1.5}.rail-note strong{display:block;color:var(--green);font-size:13px;line-height:1.5}.rail-spoken-phrase{display:flex;align-items:center;gap:5px}.rail-spoken-phrase strong{min-width:0;flex:1}.rail-spoken-phrase :deep(.speak-button){color:var(--green)}.rail-note p{margin:7px 0 0;color:var(--muted);font-size:11px;line-height:1.55}.rail-memory{margin:18px 0;padding:15px;border:0;border-radius:15px;background:var(--paper);box-shadow:0 10px 28px rgba(40,39,34,.06)}.rail-memory small,.rail-memory b,.rail-memory s{display:block}.rail-memory small{color:var(--muted);font-size:10px}.rail-memory s{margin-top:5px;color:#9a8478;font-size:10px}.rail-memory b{margin-top:6px;font-size:13px}.rail-memory button{width:100%;min-height:36px;margin-top:13px;border:0;border-radius:10px;background:#e7ebfb;color:var(--green-2);display:flex;align-items:center;justify-content:center;gap:5px;font-size:11px;font-weight:800}
@media(min-width:1181px){.message-list>.conversation-context{display:none}.chat-column :deep(.message .coach-note),.chat-column :deep(.message .memory-candidate){display:none}}
@media(max-width:1180px){.conversation-layout,.conversation-layout.has-learning-rail{grid-template-columns:minmax(0,1fr);padding:0}.learning-rail{display:none}.message-list{padding:28px max(20px,calc((100vw - 820px)/2)) 22px}.composer{padding:13px max(20px,calc((100vw - 820px)/2)) 18px}}
@media(max-width:820px){.conversation-head{height:64px;flex-basis:64px;grid-template-columns:44px minmax(0,1fr) auto;padding:0 14px;gap:10px}.head-title{text-align:left}.head-title b{max-width:55vw}.always-open{font-size:0}.always-open i{display:block}.message-list,.composer{padding-left:14px;padding-right:14px}.conversation-context{grid-template-columns:36px 1fr}.conversation-context p{grid-column:1/-1;text-align:left;max-width:none}}
@media(prefers-reduced-motion:reduce){.message-list{scroll-behavior:auto}.typing-dots i{animation:none}}
</style>
