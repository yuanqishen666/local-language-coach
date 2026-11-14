import { z } from 'zod'

const correctionSchema = z.object({
  original: z.string(),
  improved: z.string(),
  explanation: z.string(),
  severity: z.enum(['meaning', 'naturalness', 'minor']),
})

const reconstructionSchema = z.object({
  type: z.enum(['completion', 'translation', 'correction', 'optional']),
  original: z.string(),
  improved: z.string(),
  explanation: z.string(),
})

export const lookupDecisionSchema = z.object({
  action: z.enum(['reply', 'clarify', 'lookup']),
  parts: z.array(z.object({
    text: z.string(),
    needsLookup: z.boolean(),
    reason: z.enum(['stable', 'changing', 'user_requested', 'user_location', 'unknown']),
    subject: z.string(),
  })),
  query: z.string(),
  locator: z.object({
    kind: z.enum(['url', 'domain', 'platform', 'account', 'post', 'file']),
    value: z.string(),
    domain: z.string(),
    quote: z.string(),
  }).nullable(),
})

/** Analysis that must happen before the model writes the conversational reply.
 * Keeping this separate prevents reply fluency from crowding out language
 * feedback and durable-memory extraction. */
export const turnAnalysisSchema = z.object({
  lookup: lookupDecisionSchema,
  reconstruction: reconstructionSchema.nullable(),
  corrections: z.array(correctionSchema),
})

export const dialoguePlanSchema = z.object({
  mode: z.enum(['casual', 'story', 'support', 'task', 'opinion', 'learning']),
  anchorQuote: z.string(),
  anchorMeaning: z.string(),
  move: z.enum(['answer', 'react', 'observe', 'associate', 'callback', 'share', 'clarify']),
  topic: z.string(),
  branch: z.string(),
  contribution: z.string(),
  questionPolicy: z.enum(['none', 'optional', 'required']),
  questionPurpose: z.string(),
  previousMoveOutcome: z.enum(['continued', 'switched', 'rejected', 'corrected', 'unclear', 'none']),
  callbackMemoryKey: z.string(),
  reopenBranch: z.boolean(),
})

export const memoryAnalysisSchema = z.object({
  disposition: z.enum(['remember', 'ignore']),
  userFacts: z.array(z.object({
    key: z.string(),
    semanticSlot: z.string(),
    value: z.string(),
    quote: z.string(),
    sensitive: z.boolean(),
    memoryType: z.enum(['preference', 'constraint', 'profile', 'learning', 'episodic']),
    topic: z.string(),
    importance: z.number(),
    suggestedTier: z.enum(['core', 'long_term']),
  })),
  replyType: z.enum(['casual', 'recommendation', 'planning', 'learning', 'factual', 'support', 'other']),
  relevantTopics: z.array(z.string()),
  relevantMemoryKeys: z.array(z.string()),
  dialoguePlan: dialoguePlanSchema,
})

/** The only synchronous contract used for a conversation turn. */
export const coachTurnSchema = z.object({
  roleReply: z.string(),
  reconstruction: reconstructionSchema.nullable(),
  corrections: z.array(correctionSchema),
  lookup: lookupDecisionSchema,
  statePatch: z.object({
    currentTopic: z.string(),
    openedLoops: z.array(z.string()),
    resolvedLoops: z.array(z.string()),
    sceneFacts: z.array(z.string()),
    userFacts: z.array(z.object({
      key: z.string(),
      value: z.string(),
      quote: z.string(),
      sensitive: z.boolean(),
    })),
  }),
})

export const setupCandidateSchema = z.object({
  title: z.string(),
  category: z.string(),
  setting: z.string(),
  partnerName: z.string(),
  partnerRole: z.string(),
  relationship: z.string(),
  tone: z.string(),
  personalityCues: z.array(z.string()),
  interests: z.array(z.string()),
  currentMood: z.string(),
  topicSeed: z.string(),
  openingLine: z.string(),
  difficulty: z.string(),
})

export const providerCertificationSchema = z.object({
  cases: z.array(z.object({
    id: z.string(),
    reply: z.string(),
    lookupAction: z.enum(['reply', 'clarify', 'lookup']),
    locatorDomain: z.string().nullable(),
  })),
})

export const setupCandidatesSchema = z.object({
  setups: z.array(setupCandidateSchema),
})

export const episodeSummarySchema = z.object({
  thread: z.string(),
  summary: z.string(),
  facts: z.array(z.object({
    value: z.string(),
    quote: z.string(),
    source: z.enum(['user', 'partner', 'scene']),
    sourceMessageId: z.string(),
  })),
  openLoops: z.array(z.string()),
  keywords: z.array(z.string()),
  topicArcs: z.array(z.object({
    topic: z.string(),
    status: z.enum(['active', 'dormant', 'closed']),
    sourceMessageIds: z.array(z.string()),
  })),
  interactionSignals: z.array(z.object({
    kind: z.enum(['engaged', 'topic_switch', 'topic_rejected', 'assistant_corrected', 'style_preference']),
    value: z.string(),
    sourceMessageId: z.string(),
    quote: z.string(),
  })),
})

export const translationSchema = z.object({ translation: z.string() })

export const memoryLocalizationSchema = z.object({
  items: z.array(z.object({ id: z.string(), value: z.string() })),
})

export const termLookupSchema = z.object({
  term: z.string(),
  lemma: z.string(),
  partOfSpeech: z.string(),
  pronunciation: z.string(),
  contextMeaning: z.string(),
  forms: z.array(z.object({ label: z.string(), value: z.string() })),
  senses: z.array(z.object({ meaning: z.string(), example: z.string(), translation: z.string() })),
  collocations: z.array(z.string()),
  register: z.string(),
  regionalNotes: z.string(),
})

const unsupportedPortableKeywords = new Set([
  '$schema', 'exclusiveMaximum', 'exclusiveMinimum', 'maxItems', 'maxLength',
  'maxProperties', 'maximum', 'minItems', 'minLength', 'minProperties',
  'minimum', 'multipleOf', 'pattern', 'uniqueItems',
])

function makePortable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(makePortable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !unsupportedPortableKeywords.has(key))
    .map(([key, child]) => [key, makePortable(child)]))
}

export function responseJsonSchema(schema: z.ZodType) {
  return makePortable(z.toJSONSchema(schema)) as Record<string, unknown>
}
