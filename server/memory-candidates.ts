export interface MemoryCandidateLike {
  category?: unknown
  key?: unknown
  value?: unknown
  memoryType?: unknown
  topic?: unknown
  semanticSlot?: unknown
  semantic_slot?: unknown
  sourceMessageId?: unknown
}

export interface ConfirmedMemoryLike extends MemoryCandidateLike {
  status?: unknown
  localizedValuesJson?: unknown
}

function normalizedText(value: unknown) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    : ''
}

const semanticSlotAliases = new Map<string, string>([
  ['职业', 'profile.occupation'], ['occupation', 'profile.occupation'], ['profesión', 'profile.occupation'],
  ['profession', 'profile.occupation'], ['職業', 'profile.occupation'], ['beruf', 'profile.occupation'],
  ['직업', 'profile.occupation'], ['professione', 'profile.occupation'], ['profissão', 'profile.occupation'],
  ['पेशा', 'profile.occupation'],
  ['食物过敏', 'constraint.food-allergy'], ['food allergy', 'constraint.food-allergy'],
  ['alergia alimentaria', 'constraint.food-allergy'], ['allergie alimentaire', 'constraint.food-allergy'],
  ['食物アレルギー', 'constraint.food-allergy'], ['lebensmittelallergie', 'constraint.food-allergy'],
  ['음식 알레르기', 'constraint.food-allergy'], ['allergia alimentare', 'constraint.food-allergy'],
  ['alergia alimentar', 'constraint.food-allergy'], ['खाद्य एलर्जी', 'constraint.food-allergy'],
  ['称呼偏好', 'profile.preferred-name'], ['preferred name', 'profile.preferred-name'],
])

export function normalizeMemorySemanticSlot(value: unknown) {
  return normalizedText(value)
    .replace(/[^\p{Letter}\p{Number}._:-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
}

export function memorySemanticSlot(memory: MemoryCandidateLike) {
  const explicit = normalizeMemorySemanticSlot(memory.semanticSlot || memory.semantic_slot)
  if (explicit) return explicit
  const category = normalizedText(memory.category) || 'personal'
  const key = normalizedText(memory.key)
  const aliased = semanticSlotAliases.get(key)
  if (aliased) return aliased
  return key ? `legacy:${category}:${key}` : ''
}

export function dedupeMemoryCandidates<T extends MemoryCandidateLike>(candidates: T[]) {
  const output: T[] = []
  const positions = new Map<string, number>()
  for (const candidate of candidates) {
    const slot = memorySemanticSlot(candidate)
    const identity = slot || [
      normalizedText(candidate.category),
      normalizedText(candidate.memoryType),
      normalizedText(candidate.topic),
      normalizedText(candidate.key),
    ].join(':')
    const previous = positions.get(identity)
    if (previous === undefined) {
      positions.set(identity, output.length)
      output.push(candidate)
    } else {
      output[previous] = candidate
    }
  }
  return output
}

function localizedMemoryValues(memory: ConfirmedMemoryLike) {
  const values = [normalizedText(memory.value)]
  if (typeof memory.localizedValuesJson === 'string' && memory.localizedValuesJson.trim()) {
    try {
      const localized = JSON.parse(memory.localizedValuesJson) as Record<string, unknown>
      values.push(...Object.values(localized).map(normalizedText))
    } catch {}
  }
  return new Set(values.filter(Boolean))
}

export function memoryCandidateIsConfirmed(candidate: MemoryCandidateLike, memory: ConfirmedMemoryLike) {
  if (memory.status && normalizedText(memory.status) !== 'confirmed') return false

  const candidateSource = normalizedText(candidate.sourceMessageId)
  if (candidateSource && candidateSource === normalizedText(memory.sourceMessageId) &&
    normalizedText(candidate.category) === normalizedText(memory.category) &&
    normalizedText(candidate.key) === normalizedText(memory.key)) return true

  const candidateValue = normalizedText(candidate.value)
  if (!candidateValue || !localizedMemoryValues(memory).has(candidateValue)) return false
  if (normalizedText(candidate.category) !== normalizedText(memory.category)) return false
  if (memorySemanticSlot(candidate) === memorySemanticSlot(memory)) return true
  if (normalizedText(candidate.key) === normalizedText(memory.key)) return true

  const memoryType = normalizedText(candidate.memoryType)
  const topic = normalizedText(candidate.topic)
  return Boolean(memoryType && topic &&
    memoryType === normalizedText(memory.memoryType) &&
    topic === normalizedText(memory.topic))
}

export function filterConfirmedMemoryCandidates<T extends MemoryCandidateLike>(
  candidates: T[],
  memories: ConfirmedMemoryLike[],
) {
  return dedupeMemoryCandidates(candidates)
    .filter((candidate) => !memories.some((memory) => memoryCandidateIsConfirmed(candidate, memory)))
}
