import { conversationDraftPrefix } from './model-access'

export type ConversationTurnPhase = 'submitting' | 'retryable'

export interface StoredConversationTurn {
  version: 1
  conversationId: string
  clientMessageId: string
  content: string
  interfaceLocale: string
  phase: ConversationTurnPhase
  createdAt: string
}

export interface TurnStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export const conversationTurnPrefix = 'local-language-coach:conversation-turn:'

export function conversationTurnKey(conversationId: string) {
  return `${conversationTurnPrefix}${conversationId}`
}

function legacyKeys(conversationId: string) {
  const draft = `${conversationDraftPrefix}${conversationId}`
  return { draft, messageId: `${draft}-message-id` }
}

function readItem(storage: TurnStorage, key: string) {
  try { return storage.getItem(key) }
  catch { return null }
}

function removeItem(storage: TurnStorage, key: string) {
  try { storage.removeItem(key) }
  catch { /* Storage can be unavailable in restricted browser contexts. */ }
}

function parsedTurn(value: string | null, conversationId: string): StoredConversationTurn | null {
  if (!value) return null
  try {
    const candidate = JSON.parse(value) as Partial<StoredConversationTurn>
    if (candidate.version !== 1 || candidate.conversationId !== conversationId ||
      typeof candidate.clientMessageId !== 'string' || !candidate.clientMessageId ||
      typeof candidate.content !== 'string' || !candidate.content.trim() ||
      typeof candidate.interfaceLocale !== 'string' || !candidate.interfaceLocale ||
      !['submitting', 'retryable'].includes(String(candidate.phase)) ||
      typeof candidate.createdAt !== 'string' || !candidate.createdAt) return null
    return candidate as StoredConversationTurn
  } catch { return null }
}

export function saveConversationTurn(storage: TurnStorage, turn: StoredConversationTurn) {
  try {
    storage.setItem(conversationTurnKey(turn.conversationId), JSON.stringify(turn))
  } catch { return false }
  const legacy = legacyKeys(turn.conversationId)
  removeItem(storage, legacy.draft)
  removeItem(storage, legacy.messageId)
  return true
}

export function readConversationTurn(
  storage: TurnStorage,
  conversationId: string,
  fallback: { createId: () => string; interfaceLocale: string; now?: () => string },
) {
  const stored = parsedTurn(readItem(storage, conversationTurnKey(conversationId)), conversationId)
  if (stored) return stored

  const legacy = legacyKeys(conversationId)
  const content = readItem(storage, legacy.draft)?.trim()
  if (!content) return null
  const clientMessageId = readItem(storage, legacy.messageId)?.trim() || fallback.createId()
  const migrated: StoredConversationTurn = {
    version: 1,
    conversationId,
    clientMessageId,
    content,
    interfaceLocale: fallback.interfaceLocale,
    phase: 'retryable',
    createdAt: (fallback.now || (() => new Date().toISOString()))(),
  }
  saveConversationTurn(storage, migrated)
  return migrated
}

export function updateConversationTurnPhase(storage: TurnStorage, turn: StoredConversationTurn, phase: ConversationTurnPhase) {
  const current = parsedTurn(readItem(storage, conversationTurnKey(turn.conversationId)), turn.conversationId)
  if (!current || current.clientMessageId !== turn.clientMessageId) return false
  return saveConversationTurn(storage, { ...current, phase })
}

export function clearConversationTurn(storage: TurnStorage, conversationId: string, clientMessageId: string) {
  const current = parsedTurn(readItem(storage, conversationTurnKey(conversationId)), conversationId)
  if (current && current.clientMessageId !== clientMessageId) return false

  const legacy = legacyKeys(conversationId)
  const legacyMessageId = readItem(storage, legacy.messageId)?.trim()
  if (!current && legacyMessageId && legacyMessageId !== clientMessageId) return false

  removeItem(storage, conversationTurnKey(conversationId))
  removeItem(storage, legacy.draft)
  removeItem(storage, legacy.messageId)
  return true
}
