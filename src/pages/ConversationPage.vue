<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../api'
import { useAppStore } from '../stores/app'
import AppIcon from '../components/AppIcon.vue'
import MessageBubble from '../components/MessageBubble.vue'
import LookupDrawer from '../components/LookupDrawer.vue'
import type { Conversation, Message, MessageMeta } from '../types'
import { beginOptimisticTurn, completeOptimisticTurn, failOptimisticTurn } from '../conversation-turn'
import { conversationDraftPrefix, guideToModelSettings, needsModelConfiguration } from '../model-access'

const route = useRoute()
const router = useRouter()
const store = useAppStore()
const { t, locale } = useI18n()
const conversation = ref<Conversation | null>(null)
const input = ref('')
const sending = ref(false)
const chat = ref<HTMLElement | null>(null)
const error = ref('')
const lookup = ref({ open: false, term: '', sentence: '' })
const draftKey = computed(() => `${conversationDraftPrefix}${String(route.params.id)}`)
const messageIdKey = computed(() => draftKey.value + '-message-id')
const partnerInitial = computed(() => {
  const name = conversation.value?.setup?.partnerName || conversation.value?.setup?.partnerRole || t('product.name')
  return [...name.trim()][0] || '•'
})
const setupMatchesLocale = computed(() => !conversation.value?.setup ||
  conversation.value.interfaceLocale === String(locale.value))
const conversationTitle = computed(() => {
  if (!conversation.value) return ''
  if (conversation.value.interfaceLocale === String(locale.value)) return conversation.value.title
  return conversation.value.setup ? t('history.scene') : t('history.direct')
})
let loadVersion = 0

onMounted(async () => {
  input.value = sessionStorage.getItem(draftKey.value) || ''
  await load()
})

watch(locale, async () => {
  lookup.value.open = false
  await load()
})

async function load() {
  const version = ++loadVersion
  const requestedLocale = String(locale.value)
  const loaded = await api.get<Conversation>(`/conversations/${route.params.id}?interfaceLocale=${encodeURIComponent(requestedLocale)}`)
  if (version !== loadVersion || requestedLocale !== String(locale.value)) return
  conversation.value = loaded
  await scrollEnd()
}

async function scrollEnd() {
  await nextTick()
  if (chat.value) chat.value.scrollTop = chat.value.scrollHeight
}

function newClientMessageId() {
  return globalThis.crypto?.randomUUID?.() || `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
    FST_ERR_CTP_BODY_TOO_LARGE: 'error.turnTooLarge',
  }
  if (value instanceof ApiError && value.code && messages[value.code]) return t(messages[value.code])
  return t('error.turnFallback')
}

async function send() {
  const text = input.value.trim()
  if (!text || sending.value || !conversation.value) return
  if (!store.settings?.modelReady) {
    sessionStorage.setItem(draftKey.value, text)
    await guideToModelSettings(router, route.fullPath)
    return
  }
  const clientMessageId = sessionStorage.getItem(messageIdKey.value) || newClientMessageId()
  sessionStorage.setItem(draftKey.value, text)
  sessionStorage.setItem(messageIdKey.value, clientMessageId)
  input.value = ''
  sending.value = true
  error.value = ''
  const optimisticTurn = beginOptimisticTurn(conversation.value.messages, text, clientMessageId)
  await scrollEnd().catch(() => undefined)
  let result: { userMessage: Message; assistantMessage: Message; status: 'active' }
  try {
    result = await api.post<{ userMessage: Message; assistantMessage: Message; status: 'active' }>(`/conversations/${route.params.id}/messages`, {
      content: text,
      clientMessageId,
      interfaceLocale: String(locale.value),
    })
  } catch (value: unknown) {
    input.value = text
    failOptimisticTurn(optimisticTurn.message)
    if (needsModelConfiguration(value)) await guideToModelSettings(router, route.fullPath)
    else error.value = turnErrorMessage(value)
    sending.value = false
    return
  }

  // The server has accepted the turn. From this point on, never restore the
  // submitted text as a draft even if a local rendering step fails.
  sessionStorage.removeItem(draftKey.value)
  sessionStorage.removeItem(messageIdKey.value)
  input.value = ''
  try {
    completeOptimisticTurn(conversation.value.messages, { localId: optimisticTurn.localId, clientMessageId }, result.userMessage, result.assistantMessage)
    conversation.value.status = 'active'
    await scrollEnd()
  } catch {
    // Recover the visible conversation from the committed server state without
    // turning an already-sent message back into editable input.
    await load().catch(() => undefined)
  } finally {
    sending.value = false
  }
}

function openLookup(term: string, sentence: string) { lookup.value = { open: true, term, sentence } }
async function saveMemory(item: NonNullable<MessageMeta['memoryCandidates']>[number]) {
  await api.post('/memories', { ...item, status: 'confirmed', sourceConversationId: route.params.id, interfaceLocale: String(locale.value) })
  for (const message of conversation.value?.messages || []) {
    if (!message.meta.memoryCandidates) continue
    message.meta.memoryCandidates = message.meta.memoryCandidates.filter((candidate) => candidate !== item)
  }
  store.notify(t('conversation.memorySaved'))
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
function feedbackFor(index: number): MessageMeta | undefined {
  if (!conversation.value || conversation.value.messages[index]?.role !== 'user') return undefined
  const next = conversation.value.messages[index + 1]
  return next?.role === 'assistant' ? next.meta : undefined
}
</script>

<template>
  <div v-if="conversation" class="conversation-shell">
    <header class="conversation-head">
      <button :aria-label="t('common.close')" @click="router.push('/')"><AppIcon name="close" /></button>
      <div class="head-title">
        <span>{{ setupMatchesLocale ? conversation.setup?.partnerName || conversation.setup?.partnerRole || t('conversation.openLabel') : t('conversation.openLabel') }}</span>
        <b>{{ conversationTitle }}</b>
      </div>
      <span class="always-open"><i></i>{{ t('conversation.alwaysOpen') }}</span>
    </header>

    <main class="chat-column" :aria-busy="sending">
      <div ref="chat" class="message-list">
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
        <MessageBubble v-for="(message, index) in conversation.messages" :key="message.id" :message="message" :feedback="feedbackFor(index)" :partner-initial="partnerInitial" @lookup="openLookup" @remember="saveMemory" />
        <div v-if="sending" class="reply-pending" role="status" aria-live="polite">
          <div class="pending-avatar" aria-hidden="true">{{ partnerInitial }}</div>
          <div class="typing-bubble"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>{{ t('conversation.partnerTyping') }}</span></div>
        </div>
      </div>
      <div class="composer">
        <div v-if="conversation.status === 'archived'" class="archived-note">{{ t('conversation.archivedContinue') }}</div>
        <div v-if="error" class="send-error" role="alert">{{ error }}</div>
        <textarea v-model="input" :disabled="sending" :placeholder="sending ? t('conversation.waitPlaceholder') : t('conversation.openPlaceholder')" @keydown.enter.exact.prevent="send"></textarea>
        <footer><span>{{ t('conversation.sendHint') }}</span><button :disabled="!input.trim() || sending" @click="send"><AppIcon name="send" /></button></footer>
      </div>
    </main>

    <LookupDrawer :open="lookup.open" :term="lookup.term" :sentence="lookup.sentence" :setup="conversation.setup" :conversation-id="conversation.id" @close="lookup.open = false" />
  </div>
  <div v-else class="app-loading">{{ t('conversation.opening') }}</div>
</template>

<style scoped>
.conversation-shell{height:100vh;display:flex;flex-direction:column;background:#f4f1ea}.conversation-head{height:68px;display:grid;grid-template-columns:44px 1fr auto;align-items:center;gap:15px;padding:0 21px;border-bottom:1px solid var(--line);background:#f7f5ef;z-index:5}.conversation-head>button{width:35px;height:35px;border:1px solid var(--line);border-radius:9px;background:transparent;display:grid;place-items:center;color:var(--muted)}.head-title span,.head-title b{display:block}.head-title span{font-size:11px;letter-spacing:.08em;color:var(--muted);margin-bottom:3px}.head-title b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.always-open{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted)}.always-open i{width:7px;height:7px;border-radius:50%;background:var(--green-2);box-shadow:0 0 0 4px rgba(50,104,90,.1)}.chat-column{min-height:0;flex:1;display:flex;flex-direction:column}.message-list{flex:1;overflow:auto;padding:28px max(20px,calc((100vw - 232px - 820px)/2)) 22px;scroll-behavior:smooth}.session-start{text-align:center;margin-bottom:20px;color:var(--muted)}.session-start span{font-size:11px;letter-spacing:.08em}.session-start p{font-size:11px;margin:5px 0}.conversation-context{max-width:760px;margin:0 auto 22px;padding:13px 15px;border:1px solid var(--line);border-radius:14px;background:rgba(251,250,246,.72);display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:11px}.partner-avatar{width:36px;height:36px;border-radius:10px;background:#dfe8df;color:var(--green);display:grid;place-items:center;font-weight:800}.conversation-context b,.conversation-context span{display:block}.conversation-context b{font-size:11px}.conversation-context span{font-size:11px;color:var(--muted);margin-top:2px}.conversation-context p{max-width:250px;font-size:11px;color:var(--muted);text-align:right;margin:0}.empty-chat{text-align:center;max-width:540px;margin:40px auto;color:var(--muted)}.empty-chat>span{width:48px;height:48px;border-radius:14px;background:#e5ebe5;color:var(--green);display:grid;place-items:center;margin:0 auto 14px}.empty-chat h2{font-size:18px;color:var(--ink)}.empty-chat p{font-size:11px;line-height:1.7}.reply-pending{display:flex;gap:11px;max-width:760px;margin:0 auto 22px}.pending-avatar{width:30px;height:30px;border-radius:9px;background:var(--green);color:#fff;display:grid;place-items:center;font-size:11px;font-weight:800}.typing-bubble{min-height:42px;border:1px solid var(--line);border-radius:4px 15px 15px 15px;background:var(--paper);padding:11px 14px;display:flex;align-items:center;gap:9px;color:var(--muted);font-size:11px}.typing-dots{display:flex;gap:3px}.typing-dots i{width:4px;height:4px;border-radius:50%;background:var(--green-2);animation:typing 1s infinite}.typing-dots i:nth-child(2){animation-delay:.15s}.typing-dots i:nth-child(3){animation-delay:.3s}@keyframes typing{50%{transform:translateY(-3px)}}.composer{padding:13px max(20px,calc((100vw - 232px - 820px)/2));border-top:1px solid var(--line);background:#f7f5ef}.composer textarea{display:block;width:100%;min-height:76px;max-height:160px;resize:none;border:1px solid var(--line);border-bottom:0;border-radius:14px 14px 0 0;background:#fffefa;padding:14px 15px;color:var(--ink);outline:none;line-height:1.6}.composer textarea:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(50,104,90,.08)}.composer footer{height:40px;border:1px solid var(--line);border-top:0;border-radius:0 0 14px 14px;background:#fffefa;padding:0 8px 0 14px;display:flex;align-items:center;justify-content:space-between}.composer footer span{font-size:11px;color:var(--muted)}.composer footer button{width:31px;height:31px;border:0;border-radius:9px;background:var(--green);color:white;display:grid;place-items:center}.composer footer button:disabled{opacity:.35}.send-error,.archived-note{max-width:820px;margin:0 auto 8px;padding:9px 11px;border-radius:8px;font-size:11px}.send-error{background:#f7e9e6;color:var(--red)}.archived-note{background:#edf1e9;color:var(--green)}
.head-title span{font-size:11px;letter-spacing:0}.head-title b{font-size:13px}.always-open{font-size:11px}.session-start span{font-size:11px;letter-spacing:0}.empty-chat p{display:flex;align-items:center;justify-content:center;gap:6px}.typing-bubble{font-size:11px}.composer footer span{font-size:11px}.send-error,.archived-note{font-size:11px}
@media(max-width:820px){.message-list,.composer{padding-left:14px;padding-right:14px}.conversation-context{grid-template-columns:36px 1fr}.conversation-context p{grid-column:1/-1;text-align:left;max-width:none}.always-open{font-size:0}.always-open i{display:block}}
</style>
