import {
  MEMORY_KIND_RULES, isMemoryKind, memoryLayerForKind,
  type MemoryAbout, type MemoryDurability, type MemoryFrame, type MemoryKind, type MemoryLayer,
} from '../shared/memory.js'
import type { MemoryFact } from './types.js'

export { memoryLayerForKind }

/** A conversation with a scene setup is role-play; one without is the learner talking as themselves. */
export function memoryFrame(setup: unknown): MemoryFrame {
  return setup ? 'scene' : 'direct'
}

export function memoryKindOf(value: unknown): MemoryKind {
  if (isMemoryKind(value)) return value
  // Kinds from before the layers existed.
  if (value === 'episodic') return 'plan'
  return 'preference'
}

/** The model names a kind; how long the statement holds decides whether it is a plan. */
export function settleMemoryKind(kind: MemoryKind, durability: MemoryDurability): MemoryKind {
  if (kind === 'learning') return 'learning'
  if (durability === 'temporary') return 'plan'
  return kind
}

/**
 * What happens to something the learner said about themselves.
 * - conversation: kept with this conversation only, without asking
 * - ask: also offered as a long-term memory, which the learner decides
 * - save: stored as a long-term memory at once, because the learner asked for it in so many words
 * - drop: not about the learner at all
 */
export type MemoryDestination = 'conversation' | 'ask' | 'save' | 'drop'

const rememberRequest = /记住|记一下|记得我|别忘了|請記住|remember|don'?t forget|keep in mind|recuerda|no olvides|souviens|retiens|n'oublie|覚えて|忘れないで|merk dir|merke dir|vergiss nicht|기억해|잊지 마|ricorda|non dimenticare|lembr[ae]|não esqueça|याद रख/iu

/** Whether the learner's own words ask for something to be remembered. Checked by the program, not taken from the model. */
export function asksToRemember(message: string) {
  return rememberRequest.test(message)
}

/**
 * The model only supplies its reading of who the statement is about and how long it holds.
 * Where the statement goes is decided here, and nothing said inside a scene becomes a
 * long-term memory unless the learner confirms it.
 */
export function memoryDestination(input: {
  frame: MemoryFrame
  about: MemoryAbout
  durability: MemoryDurability
  explicit: boolean
}): MemoryDestination {
  if (input.about === 'other') return 'drop'
  if (input.about !== 'user' || input.durability === 'momentary') return 'conversation'
  return input.frame === 'direct' && input.explicit ? 'save' : 'ask'
}

const DAY = 24 * 60 * 60 * 1000

/** When a memory stops being used. Undefined for the kinds that do not expire. */
export function memoryValidTo(kind: MemoryKind, durability: MemoryDurability, validDays: number | undefined, now = new Date()) {
  const fallback = MEMORY_KIND_RULES[kind].defaultDays
  if (durability !== 'temporary' && !fallback) return undefined
  const stated = Number.isFinite(validDays) && Number(validDays) > 0 ? Number(validDays) : 0
  const days = Math.max(1, Math.min(730, Math.round(stated || fallback || 30)))
  return new Date(now.getTime() + days * DAY).toISOString()
}

export function memoryExpired(validTo: unknown, now = new Date()) {
  return typeof validTo === 'string' && validTo !== '' && validTo <= now.toISOString()
}

export function tierForExtractedFact(
  fact: Pick<MemoryFact, 'memoryType' | 'importance' | 'suggestedTier'>,
  existingTier?: unknown,
) {
  if (existingTier === 'core') return 'core' as const
  if (fact.suggestedTier !== 'core') return 'long_term' as const
  const kind = memoryKindOf(fact.memoryType)
  if (!MEMORY_KIND_RULES[kind].core) return 'long_term' as const
  if (kind === 'constraint' || kind === 'style' || kind === 'learning') return 'core' as const
  if (kind === 'profile' && (fact.importance ?? 0) >= 0.9) return 'core' as const
  return 'long_term' as const
}

export interface ScopedMemory {
  memoryType?: unknown
  targetLanguageCode?: unknown
}

/**
 * The memories a conversation is allowed to see at all. This runs before any scoring:
 * a scene partner has no business knowing the learner's job, however relevant it looks.
 */
export function memoriesInScope<T extends ScopedMemory>(memories: T[], scope: { frame: MemoryFrame; targetLanguageCode: string }): T[] {
  return memories.filter((memory) => {
    const rule = MEMORY_KIND_RULES[memoryKindOf(memory.memoryType)]
    if (scope.frame === 'scene' && !rule.scenes) return false
    if (!rule.perLanguage) return true
    const language = typeof memory.targetLanguageCode === 'string' ? memory.targetLanguageCode : ''
    return !language || language === scope.targetLanguageCode
  })
}

/** Learning memories are kept per language, so the same goal in two languages is two memories. */
export function scopedSemanticSlot(slot: string, kind: MemoryKind, targetLanguageCode: string) {
  if (!slot || !MEMORY_KIND_RULES[kind].perLanguage || !targetLanguageCode) return slot
  const suffix = `:${targetLanguageCode.toLowerCase()}`
  return slot.endsWith(suffix) ? slot : `${slot}${suffix}`
}

export function layerOf(memoryType: unknown): MemoryLayer {
  return memoryLayerForKind(memoryKindOf(memoryType))
}
