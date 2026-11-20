// Generated from src/pages/ConversationPage.vue by src/lab/logic/generate.mjs. Do not edit; change the page and regenerate.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ApiError, api } from '../../api'
import { useAppStore } from '../../stores/app'
import type { Conversation, ConversationMemory, MemoryCandidate, Message, MessageMeta } from '../../types'
import { beginOptimisticTurn, completeOptimisticTurn, failOptimisticTurn, type OptimisticTurn } from '../../conversation-turn'
import { guideToModelSettings, needsModelConfiguration, sceneDraftKey } from '../../model-access'
import { shouldSubmitComposer } from '../../composer-keydown'
import { loadLevel, speechPace, spokenRate, stepName, type LevelAfterHelp } from '../../level'
import { browserSpeech } from '../../speech'
import { CALL_PAUSE_MS } from '../../../shared/voice'
import { displayTargetLanguage } from '../../../shared/locales'
import { appendSpoken, type SpeakingStats } from '../../voice-input'
import { cancelVoice, loadSpeechCapabilities, releaseVoice, startVoice, stopVoice, voice, voiceIssueText, voiceRouteFor, type VoiceIssue } from '../../voice'
import { holdText, listeningFirst, showAllText } from '../../listening'
import { RECAP_MIN_TURNS } from '../../../shared/recap'
import { conversationMarkdown, downloadText, fileName } from '../../export-files'
import { clearConversationTurn, readConversationTurn, saveConversationTurn, updateConversationTurnPhase, type StoredConversationTurn } from '../../conversation-turn-storage'
import { conversationTurnRecoveryAction, conversationTurnStatus, type ConversationTurnStatusResponse } from '../../conversation-turn-recovery'

export function useConversationPage() {
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
const sceneStarting = ref(false)
// What this conversation remembers. It stays here: no other conversation is given it.
const conversationMemories = ref<ConversationMemory[]>([])
const partnerInitial = computed(() => {
  const name = conversation.value?.setup?.partnerName || conversation.value?.setup?.partnerRole || t('product.name')
  return [...name.trim()][0] || '•'
})
// A conversation keeps the learning language it started in; older ones recorded none and follow the setting.
const targetLanguageCode = computed(() => conversation.value?.targetLanguageCode || store.settings?.learning.targetLanguageCode || 'en')
const setupMatchesLocale = computed(() => !conversation.value?.setup ||
  conversation.value.interfaceLocale === String(locale.value))
const conversationTitle = computed(() => {
  if (!conversation.value) return ''
  if (conversation.value.interfaceLocale === String(locale.value)) return conversation.value.title
  return conversation.value.setup ? t('history.scene') : t('history.direct')
})
// The difficulty this conversation is written at. Said once at the top when it starts harder than the last one.
const levelLine = computed(() => {
  const level = conversation.value?.level
  if (!level?.raised || level.previousStep === null) return ''
  return t('level.change.difficulty', { from: stepName(level.previousStep), to: stepName(level.step) })
})
const learnerTurns = computed(() => (conversation.value?.messages || []).filter((message) => message.role === 'user' && message.status !== 'failed' && message.status !== 'pending').length)
const canRecap = computed(() => learnerTurns.value >= RECAP_MIN_TURNS)
// Lines are read aloud at the pace of the level the replies are written at.
watch(() => conversation.value?.level?.speechRateFactor, (factor) => { speechPace.value = factor || 1 }, { immediate: true })

/** The difficulty moved while the conversation is open: after a turn, or because the learner needed help with a line. */
function levelMoved(next: LevelAfterHelp) {
  const level = conversation.value?.level
  if (!level) return
  if (next.lowered && next.replyStep < level.replyStep) store.notify(t('level.change.difficulty', { from: stepName(level.replyStep), to: stepName(next.replyStep) }))
  level.replyStep = next.replyStep
  level.speechRateFactor = next.speechRateFactor
}

/** The conversation as a Markdown file, with each correction under the line it was made to. */
function exportMarkdown() {
  const current = conversation.value
  if (!current) return
  const day = new Intl.DateTimeFormat(String(locale.value), { dateStyle: 'long' }).format(new Date(current.createdAt))
  const text = conversationMarkdown({ ...current, title: conversationTitle.value }, {
    you: t('export.you'),
    partner: t('export.partner'),
    subtitle: `${day} · ${displayTargetLanguage(targetLanguageCode.value, locale.value)}`,
  })
  downloadText(fileName(conversationTitle.value, 'md'), text, 'text/markdown')
}

function openRecap() {
  if (!conversation.value) return
  void router.push(`/conversation/${encodeURIComponent(conversation.value.id)}/recap`)
}

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
let openedConversationId = ''
let turnsThisVisit = 0

interface TurnResult {
  userMessage: Message
  assistantMessage: Message
  status: 'active'
  level?: LevelAfterHelp
}

onMounted(async () => {
  void loadSpeechCapabilities(true)
  await openConversation(String(route.params.id))
})

watch(locale, async () => {
  lookup.value.open = false
  await openConversation(String(route.params.id), { preserveInput: true })
})

watch(() => route.params.id, async (next, previous) => {
  if (next && next !== previous) {
    leaveVoice()
    tidyUp()
    await openConversation(String(next))
  }
})

onUnmounted(() => {
  componentActive = false
  loadVersion += 1
  leaveVoice()
  tidyUp()
  speechPace.value = 1
})

/** Leaving a conversation that moved on: what it showed about the level is weighed, and its memories too when the learner has switched that on. */
function tidyUp() {
  const conversationId = openedConversationId
  if (!conversationId || !turnsThisVisit) return
  turnsThisVisit = 0
  const languageCode = targetLanguageCode.value
  // Weighed from what was counted during the conversation; no model is asked.
  void api.post(`/conversations/${encodeURIComponent(conversationId)}/assess`, {})
    .then(() => loadLevel(languageCode))
    .catch(() => undefined)
  if (!store.settings?.memory?.consolidate) return
  void api.post(`/conversations/${encodeURIComponent(conversationId)}/consolidate`, { interfaceLocale: String(locale.value) }).catch(() => undefined)
}
function isCurrentConversation(conversationId: string) {
  return componentActive && String(route.params.id) === conversationId
}

async function openConversation(conversationId: string, options: { preserveInput?: boolean } = {}) {
  if (!options.preserveInput) input.value = ''
  error.value = ''
  sending.value = false
  activeSubmissionId = ''
  if (openedConversationId !== conversationId) {
    openedConversationId = conversationId
    turnsThisVisit = 0
    conversationMemories.value = []
  }
  const loaded = await load(conversationId)
  void loadConversationMemories(conversationId)
  if (loaded) await reconcileStoredTurn(conversationId, loaded)
}

async function loadConversationMemories(conversationId = String(route.params.id)) {
  try {
    const loaded = await api.get<ConversationMemory[]>(`/conversations/${encodeURIComponent(conversationId)}/memories`)
    if (isCurrentConversation(conversationId)) conversationMemories.value = loaded
  } catch {
    // The conversation goes on without the list.
  }
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
    if (result.level) levelMoved(result.level)
    replyArrived(result.assistantMessage)
    await scrollEnd().catch(() => undefined)
  } else {
    await load(turn.conversationId).catch(() => undefined)
  }
  turnsThisVisit += 1
  void loadConversationMemories(turn.conversationId)
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
  // Sent while the microphone is on: what has been heard so far is the message.
  if (micOn.value) cancelVoice()
  const text = input.value.trim()
  if (!text || sending.value || !conversation.value) return
  voiceNote.value = ''
  spoken.value = null
  showAllText()
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
function dropCandidate(item: MemoryCandidate) {
  for (const message of conversation.value?.messages || []) {
    if (!message.meta.memoryCandidates) continue
    message.meta.memoryCandidates = message.meta.memoryCandidates.filter((candidate) => {
      if (item.semanticSlot && candidate.semanticSlot === item.semanticSlot) return false
      return !(candidate.category === item.category && candidate.key === item.key && candidate.value === item.value)
    })
  }
}
/** "Remember from now on": the statement becomes a long-term memory. */
async function saveMemory(item: MemoryCandidate) {
  await api.post('/memories', { ...item, status: 'confirmed', sourceConversationId: route.params.id, interfaceLocale: String(locale.value) })
  dropCandidate(item)
  store.notify(t('conversation.memorySaved'))
  void loadConversationMemories()
}
/** "Only this conversation": the conversation already has it, so only the offer goes away. */
async function dismissMemory(item: MemoryCandidate) {
  await api.post(`/conversations/${encodeURIComponent(String(route.params.id))}/memory-candidates/dismiss`, { semanticSlot: item.semanticSlot, key: item.key })
  dropCandidate(item)
}
/** Takes back something that was stored the moment the learner asked for it. */
async function undoMemory(item: MemoryCandidate) {
  if (item.savedMemoryId) await api.delete(`/memories/${encodeURIComponent(item.savedMemoryId)}`)
  await dismissMemory(item)
  void loadConversationMemories()
}
async function forgetConversationMemory(memory: ConversationMemory) {
  await api.delete(`/conversations/${encodeURIComponent(String(route.params.id))}/memories/${encodeURIComponent(memory.id)}`)
  conversationMemories.value = conversationMemories.value.filter((item) => item.id !== memory.id)
}
async function keepConversationMemory(memory: ConversationMemory) {
  const saved = await api.post<{ id: string }>(`/conversations/${encodeURIComponent(String(route.params.id))}/memories/${encodeURIComponent(memory.id)}/promote`, { interfaceLocale: String(locale.value) })
  memory.promotedMemoryId = saved.id
  for (const message of conversation.value?.messages || []) {
    if (!message.meta.memoryCandidates) continue
    message.meta.memoryCandidates = message.meta.memoryCandidates.filter((candidate) => !(candidate.key === memory.key && candidate.value === memory.value))
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

async function replayScene(mode: 'same_background' | 'new_encounter') {
  if (!conversation.value?.scene || sceneStarting.value) return
  sceneStarting.value = true
  error.value = ''
  try {
    const result = await api.post<{ id: string }>(`/conversations/${encodeURIComponent(conversation.value.id)}/replay`, { mode, interfaceLocale: String(locale.value) })
    await router.push(`/conversation/${result.id}`)
  } catch (value) {
    if (needsModelConfiguration(value)) await guideToModelSettings(router, route.fullPath)
    else error.value = t('conversation.sceneActionError')
  } finally { sceneStarting.value = false }
}

async function toggleSceneSaved() {
  if (!conversation.value?.scene) return
  const saved = !conversation.value.scene.origin.saved
  try {
    await api.patch(`/conversations/${encodeURIComponent(conversation.value.id)}/background`, { saved })
    conversation.value.scene.origin.saved = saved
    store.notify(saved ? t('conversation.backgroundSaved') : t('conversation.backgroundUnsaved'))
  } catch { error.value = t('conversation.sceneActionError') }
}

async function customizeScene() {
  if (!conversation.value?.setup) return
  const setup = conversation.value.setup
  sessionStorage.setItem(sceneDraftKey, JSON.stringify({
    form: { domain: setup.category || 'custom', place: setup.setting, detail: setup.encounterSummary || setup.topicSeed },
    setups: [], showCustom: true, interfaceLocale: String(locale.value),
  }))
  await router.push('/start')
}

// ---------------------------------------------------------------------------------------------
// Speaking instead of typing

/** A press on the microphone this long is holding it to talk; a shorter one is a tap that leaves it on. */
const HOLD_MS = 400
/** Why listening did not work, or what this browser needs. */
const voiceNote = ref('')
/** How the last thing said went. Shown to the learner only, and gone with the next message. */
const spoken = ref<SpeakingStats | null>(null)
const micOn = computed(() => voice.owner.value === 'composer')
const micWriting = computed(() => micOn.value && voice.phase.value === 'writing')
const spokenLine = computed(() => {
  const stats = spoken.value
  if (!stats) return ''
  const formatted = new Intl.NumberFormat(String(locale.value), { style: 'unit', unit: 'second', unitDisplay: 'long' }).format(stats.seconds)
  // Chinese sets a number apart from the unit after it, which the formatter does not.
  const duration = String(locale.value).startsWith('zh') ? formatted.replace(/(\d)(?=[^\d\s])/u, '$1 ') : formatted
  return stats.pauses ? t('voice.stats', { duration, pauses: stats.pauses }) : t('voice.statsNoPause', { duration })
})
let writtenBefore = ''
let pressed = false
let pressedAt = 0

function voiceFailed(issue: VoiceIssue) {
  voiceNote.value = voiceIssueText(issue, t, String(locale.value), targetLanguageCode.value)
}

function startMic() {
  if (sending.value || call.value !== 'off') return
  voiceNote.value = ''
  spoken.value = null
  writtenBefore = input.value
  const languageCode = targetLanguageCode.value
  startVoice({
    owner: 'composer',
    languageCode,
    // What was said goes into the message box to be read and changed. It is never sent by itself.
    onDone(result) {
      input.value = result.silent ? writtenBefore : appendSpoken(writtenBefore, result.text, languageCode)
      if (result.silent) voiceNote.value = t('voice.problem.noSpeech')
      else spoken.value = result.stats.seconds > 0 ? result.stats : null
    },
    onProblem(issue) {
      input.value = writtenBefore
      voiceFailed(issue)
    },
  })
}

// What the browser has heard so far shows in the message box while it listens.
watch(() => voice.heard.value, (heardSoFar) => {
  if (micOn.value) input.value = appendSpoken(writtenBefore, heardSoFar, targetLanguageCode.value)
})

function toggleMic() {
  // The press that started the microphone is followed by this click; it is the same gesture.
  if (pressed) { pressed = false; return }
  if (!micOn.value) startMic()
  else if (voice.phase.value === 'listening') stopVoice()
}

/** Holding the button down to talk. Only a mouse press may open the microphone; a finger has to lift first. */
function pressMic(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || event.button !== 0 || micOn.value) return
  pressed = true
  pressedAt = Date.now()
  startMic()
}

function releaseMic() {
  if (pressed && micOn.value && Date.now() - pressedAt >= HOLD_MS) stopVoice()
}

function leaveMic() {
  releaseMic()
  pressed = false
}

// ---------------------------------------------------------------------------------------------
// Call mode: taking turns out loud. The learner is never cut off; a turn ends on a long pause or a tap.

type CallState = 'off' | 'listening' | 'sending' | 'speaking' | 'paused'
const call = ref<CallState>('off')
const callNote = ref('')
const callHeard = computed(() => (voice.owner.value === 'call' ? voice.heard.value : ''))
const callWriting = computed(() => voice.owner.value === 'call' && voice.phase.value === 'writing')
let callSpeechId = ''
let callTurns = 0
/** This browser only starts listening from a tap, so every turn waits for one. */
let callNeedsTap = false

function callListen() {
  if (call.value === 'off' || call.value === 'sending') return
  const languageCode = targetLanguageCode.value
  callSpeechId = ''
  browserSpeech.stop()
  callNote.value = ''
  call.value = 'listening'
  startVoice({
    owner: 'call',
    languageCode,
    endAfterPauseMs: CALL_PAUSE_MS,
    keepMic: true,
    onDone(result) {
      if (call.value !== 'listening') return
      if (result.silent) {
        call.value = 'paused'
        callNote.value = t('call.noSound')
        return
      }
      callTurns += 1
      void callSay(result.text)
    },
    onProblem(issue) {
      if (call.value !== 'listening') return
      call.value = 'paused'
      if (issue.problem === 'denied' && callTurns > 0) {
        callNeedsTap = true
        callNote.value = t('call.tapEach')
        return
      }
      callNote.value = voiceIssueText(issue, t, String(locale.value), languageCode)
    },
  })
}

async function callSay(text: string) {
  call.value = 'sending'
  input.value = text
  await send()
  // No reply came. The message is back in the box and the reason is shown as for any message.
  if (call.value === 'sending') call.value = 'paused'
}

function callNext() {
  if (call.value === 'off') return
  if (callNeedsTap) {
    call.value = 'paused'
    callNote.value = t('call.tapEach')
    return
  }
  callListen()
}

/** A reply came in. In a call, and when replies are heard before they are seen, it is read aloud. */
function replyArrived(message: Message) {
  const inCall = call.value === 'sending'
  const hearFirst = listeningFirst()
  if (!inCall && !hearFirst) return
  const id = `message-${message.id}`
  const outcome = browserSpeech.speak({
    id,
    text: message.content,
    languageCode: targetLanguageCode.value,
    rate: spokenRate(store.settings?.learning.speechRate),
  })
  if (outcome !== 'started') {
    // Nothing can be read aloud here, so the text stays in view and the call goes on.
    if (inCall) {
      call.value = 'paused'
      callNext()
      if (outcome === 'voice-unavailable' || outcome === 'unsupported') {
        callNote.value = outcome === 'unsupported'
          ? t('speech.unsupported')
          : t('speech.voiceUnavailable', { language: displayTargetLanguage(targetLanguageCode.value, locale.value) })
      }
    }
    return
  }
  if (hearFirst) {
    holdText(message.id)
    void api.post(`/conversations/${encodeURIComponent(String(route.params.id))}/signals`, { messageId: message.id, kind: 'heard' }).catch(() => undefined)
  }
  if (inCall) {
    callSpeechId = id
    call.value = 'speaking'
  }
}

watch(() => browserSpeech.activeId.value, (active) => {
  if (call.value !== 'speaking' || !callSpeechId || active === callSpeechId) return
  callSpeechId = ''
  // Something else being played is the learner's doing; the call waits.
  if (active) { call.value = 'paused'; return }
  callNext()
})

function startCall() {
  if (call.value !== 'off' || sending.value || !conversation.value) return
  voiceNote.value = ''
  if (voiceRouteFor(targetLanguageCode.value) === 'none') {
    voiceFailed({ problem: 'unavailable' })
    return
  }
  spoken.value = null
  callTurns = 0
  callNeedsTap = false
  call.value = 'paused'
  callListen()
}

function endCall() {
  if (call.value === 'off') return
  const speaking = callSpeechId
  call.value = 'off'
  callNote.value = ''
  callSpeechId = ''
  releaseVoice()
  if (speaking && browserSpeech.activeId.value === speaking) browserSpeech.stop()
}

function pauseCall() {
  if (call.value !== 'listening' && call.value !== 'speaking') return
  callSpeechId = ''
  cancelVoice()
  browserSpeech.stop()
  callNote.value = ''
  call.value = 'paused'
}

/** Done speaking: what was heard is sent without waiting for the pause. */
function finishCallTurn() {
  if (call.value === 'listening') stopVoice()
}

/** Ends the call and leaves what was just said in the message box, to be changed before it is sent. */
function typeInstead() {
  const said = callHeard.value
  endCall()
  if (said) input.value = appendSpoken(input.value, said, targetLanguageCode.value)
}

function leaveVoice() {
  endCall()
  if (voice.owner.value === 'composer') cancelVoice()
  voiceNote.value = ''
  spoken.value = null
}

  return { route, router, store, t, locale, conversation, input, sending, compositionActive, chat, error, lookup, sceneStarting, conversationMemories, partnerInitial, targetLanguageCode, setupMatchesLocale, conversationTitle, levelLine, learnerTurns, canRecap, levelMoved, exportMarkdown, openRecap, hasLearningRailContent, tidyUp, isCurrentConversation, openConversation, loadConversationMemories, load, scrollEnd, newClientMessageId, readStoredTurn, serverTurnStatus, finishSubmission, completeStoredTurn, restoreStoredTurn, reconcileSubmissionError, submitStoredTurn, reconcileStoredTurn, turnErrorMessage, send, openLookup, lookupText, dropCandidate, saveMemory, dismissMemory, undoMemory, forgetConversationMemory, keepConversationMemory, formatDate, handleComposerKeydown, handleCompositionStart, handleCompositionEnd, feedbackFor, replayScene, toggleSceneSaved, customizeScene, HOLD_MS, voiceNote, spoken, micOn, micWriting, spokenLine, voiceFailed, startMic, toggleMic, pressMic, releaseMic, leaveMic, call, callNote, callHeard, callWriting, callListen, callSay, callNext, replyArrived, startCall, endCall, pauseCall, finishCallTurn, typeInstead, leaveVoice }
}
