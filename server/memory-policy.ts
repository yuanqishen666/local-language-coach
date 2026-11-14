import type { MemoryFact } from './types.js'

export function memoryCategoryForType(memoryType: MemoryFact['memoryType']) {
  if (memoryType === 'learning') return 'learning' as const
  if (memoryType === 'episodic') return 'scene' as const
  return 'personal' as const
}

/**
 * Core memories are injected into every turn, so model output alone must not
 * be able to promote an ordinary preference or episode into that tier.
 */
export function tierForExtractedFact(
  fact: Pick<MemoryFact, 'memoryType' | 'importance' | 'suggestedTier'>,
  existingTier?: unknown,
) {
  if (existingTier === 'core') return 'core' as const
  if (fact.suggestedTier !== 'core') return 'long_term' as const
  if (fact.memoryType === 'constraint' || fact.memoryType === 'learning') return 'core' as const
  if (fact.memoryType === 'profile' && (fact.importance ?? 0) >= 0.9) return 'core' as const
  return 'long_term' as const
}
