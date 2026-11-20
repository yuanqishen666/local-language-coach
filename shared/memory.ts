/** The layers a remembered thing can live in. Conversation memory is the fourth layer and is stored with its conversation. */
export const MEMORY_LAYERS = ['about', 'plan', 'learning'] as const
export type MemoryLayer = (typeof MEMORY_LAYERS)[number]

export const MEMORY_KINDS = ['profile', 'preference', 'constraint', 'style', 'plan', 'learning'] as const
export type MemoryKind = (typeof MEMORY_KINDS)[number]

export interface MemoryKindRule {
  /** Where the memory page lists it. */
  layer: MemoryLayer
  /** Whether a scene conversation may use it. Direct conversations use every kind. */
  scenes: boolean
  /** Days it stays valid when nothing more exact is known; 0 means it does not expire. */
  defaultDays: number
  /** Whether it may be marked core, which sends it with every turn. */
  core: boolean
  /** Whether it belongs to one learning language. */
  perLanguage: boolean
}

/**
 * The one place a kind of long-term memory is described. Adding a kind is adding a row here;
 * scope, expiry and the memory page all read it.
 */
export const MEMORY_KIND_RULES: Record<MemoryKind, MemoryKindRule> = {
  profile: { layer: 'about', scenes: false, defaultDays: 0, core: true, perLanguage: false },
  preference: { layer: 'about', scenes: false, defaultDays: 0, core: true, perLanguage: false },
  constraint: { layer: 'about', scenes: true, defaultDays: 0, core: true, perLanguage: false },
  style: { layer: 'about', scenes: true, defaultDays: 0, core: true, perLanguage: false },
  plan: { layer: 'plan', scenes: false, defaultDays: 30, core: false, perLanguage: false },
  learning: { layer: 'learning', scenes: true, defaultDays: 0, core: true, perLanguage: true },
}

/** How many memories of each layer one turn may draw on, besides the core ones. */
export const MEMORY_LAYER_LIMITS: Record<MemoryLayer, number> = { about: 4, plan: 2, learning: 3 }
export const CONVERSATION_MEMORY_PROMPT_LIMIT = 12
export const CONVERSATION_MEMORY_LIMIT = 60
export const CORE_MEMORY_LIMIT = 15

export type MemoryFrame = 'direct' | 'scene'
export type MemoryAbout = 'user' | 'persona' | 'other'
export type MemoryDurability = 'lasting' | 'temporary' | 'momentary'

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === 'string' && (MEMORY_KINDS as readonly string[]).includes(value)
}

export function isMemoryLayer(value: unknown): value is MemoryLayer {
  return typeof value === 'string' && (MEMORY_LAYERS as readonly string[]).includes(value)
}

export function memoryLayerForKind(kind: MemoryKind): MemoryLayer {
  return MEMORY_KIND_RULES[kind].layer
}

/** What a correction was about. The learning record counts corrections by these. */
export const ERROR_CATEGORIES = [
  'tense', 'agreement', 'article', 'particle', 'word_order', 'word_choice', 'collocation', 'word_form', 'register', 'phrasing', 'other',
] as const
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

export function isErrorCategory(value: unknown): value is ErrorCategory {
  return typeof value === 'string' && (ERROR_CATEGORIES as readonly string[]).includes(value)
}
