import type {
  AppConfig,
  ConversationEpisode,
  ConversationSetup,
  ConversationState,
  DialogueDynamics,
  DialoguePolicy,
  TurnLookupDecision,
} from '../types.js'
import { localeMeta } from '../../shared/locales.js'

function uiLanguage(config: AppConfig) {
  return localeMeta(config.ui.locale).promptName
}

function nativeStyle(language: string) {
  return 'Write in contemporary, idiomatic ' + language + ' that a native speaker would naturally use here. Prefer direct everyday phrasing. Do not translate sentence structure word for word, pad the text with generic filler, or use formal prose unless the situation calls for it.'
}

function targetLanguageStyle(config: AppConfig) {
  return nativeStyle(config.learning.targetLanguage) + ' Use a broadly understood standard variety unless the conversation establishes a region.'
}

function interfaceLanguageStyle(config: AppConfig) {
  const locale = localeMeta(config.ui.locale)
  return nativeStyle(locale.promptName) + ' ' + locale.voice
}

function correctionRule(level: AppConfig['learning']['correctionLevel']) {
  if (level === 'light') return 'Correct wrong spelling or word choice, grammar, or phrasing only when it changes or blocks the intended meaning; at most 2 items.'
  if (level === 'intensive') return 'Correct wrong spelling or word choice, grammar, unnatural local usage, and useful minor issues; at most 4 items.'
  return 'Correct wrong spelling or word choice, clear grammar errors, and wording a native speaker clearly would not use here; omit harmless punctuation, capitalization, and conversational fragments; at most 3 items.'
}

export function turnAnalysisSystem(
  config: AppConfig,
  rescueRequired: boolean,
  relevantMemories: Array<Record<string, unknown>> = [],
) {
  return [
    'Analyze the latest learner turn before a conversation partner replies. Return only the structured analysis object. The recent dialogue is context; analyze and quote only the latest learner message.',
    'Target language: ' + config.learning.targetLanguage + ' (' + config.learning.targetLanguageCode + '), learner level: ' + config.learning.proficiency + '. Feedback language: ' + uiLanguage(config) + '.',
    'Relevant confirmed memories for this turn: ' + JSON.stringify(relevantMemories) + '.',
    'Language feedback:',
    '- Understanding what the learner probably meant is not a reason to omit an error. A nonexistent, misspelled, or wrong word that is guessable from context still requires a correction.',
    '- ' + correctionRule(config.learning.correctionLevel),
    '- For every applicable issue, original must be a short exact substring of the latest learner message. improved must be the natural replacement in the target language and include any article, preposition, or surrounding word needed so substituting it produces a natural sentence. explanation must be concise ' + uiLanguage(config) + '. Do not return an empty corrections array when an applicable issue exists.',
    '- Use severity=meaning for a wrong or nonexistent word or an error that changes the intended meaning; severity=naturalness for clear grammar or idiom problems; use severity=minor only for genuinely minor intensive-level feedback.',
    '- Do not correct acceptable speech fillers, dialect, deliberate style, proper names, or a natural short answer. Do not invent an error merely to provide feedback.',
    '- reconstruction is reserved for a complete target-language rescue when the learner used the feedback language to fill a gap. Do not duplicate a reconstruction in corrections.',
    rescueRequired
      ? '- The latest turn contains feedback-language wording, so reconstruction is REQUIRED and must contain the learner’s complete intended target-language sentence.'
      : '- No full-sentence rescue is required, so reconstruction must be null.',
    'Lookup decision:',
    '- Classify independently of whether lookup is enabled. Split every real information need or conversational intent into lookup.parts.',
    '- Use reply for ordinary conversation, opinions, creative work, supplied-content analysis, and stable knowledge. Use lookup when correctness depends on the current date, mutable external state, an explicit request to check, or a learner-specified external location.',
    '- Use clarify only when a missing identity, subject, or requested location prevents a useful answer. For lookup, query is one focused query of at most 128 characters. For reply or clarify, query is empty.',
    '- A supplied URL, platform, account, post, channel, page, or file is a locator. locator.quote must be an exact substring of the latest message; preserve it and never substitute another location. locator is null when none was supplied.',
    '- Each part needs the exact subject and one reason: stable, changing, user_requested, user_location, or unknown. action=reply requires every part needsLookup=false; action=lookup requires at least one needsLookup=true plus a query or locator.',
    '- When the learner requests advice or recommendations and a relevant confirmed preference or constraint is supplied, incorporate it into the lookup subject and focused query. Do not add unrelated memories or let an older memory override the latest message.',
  ].join('\n')
}

export function memoryAnalysisSystem(config: AppConfig, memories: Array<Record<string, unknown>>, state?: ConversationState, episodes: ConversationEpisode[] = []) {
  const memoryCatalog = memories.slice(0, 100).map((memory) => ({
    category: memory.category,
    key: memory.key,
    semanticSlot: memory.semanticSlot || memory.semantic_slot,
    valuePreview: typeof memory.value === 'string' ? memory.value.slice(0, 120) : '',
    tier: memory.tier,
    memoryType: memory.memoryType || memory.memory_type,
    topic: memory.topic,
    importance: memory.importance,
    pinned: memory.pinned,
  }))
  return [
    'Analyze durable user memory and choose one compact conversation strategy for the latest learner turn. Return only the structured analysis object. The recent dialogue is context; every new fact must come from the latest learner message.',
    'Feedback language: ' + uiLanguage(config) + '. Confirmed user memory catalog: ' + JSON.stringify(memoryCatalog) + '.',
    'Recent conversation strategy state: ' + JSON.stringify({ recentMoves: state?.recentMoves || [], topicMomentum: state?.topicMomentum || [] }) + '.',
    'Recent consolidated interaction evidence: ' + JSON.stringify(episodes.slice(-3).map((episode) => ({ topicArcs: episode.topicArcs, interactionSignals: episode.interactionSignals }))) + '.',
    '- Set disposition=remember when the latest learner explicitly states a user-owned fact likely to help in a future conversation: a stable preference, recurring constraint, personal background, or a durable answer to the partner’s question. Words such as like, dislike, love, hate, prefer, usually, always, or their equivalents normally express durable preferences.',
    '- A direct answer that chooses among options proposed by the partner is explicit. Use recent dialogue to resolve references such as “the quiet one”, but never copy a preference from the partner unless the learner actually adopts it.',
    '- Grammar or spelling mistakes do not make a fact ineligible. A statement that the learner prefers quiet, uncrowded beaches with clear water MUST be disposition=remember with a non-empty userFacts array.',
    '- Set disposition=ignore only for momentary moods, one-off actions, time-bound plans, hypotheticals, jokes, role-play details, facts about other people, or implications the learner did not state. disposition=remember requires at least one fact; disposition=ignore requires no facts.',
    '- For each userFact, quote is a short exact substring of the latest message. Write key and value entirely in ' + uiLanguage(config) + ', including job titles and category labels. key names one stable semantic dimension and value combines compatible facets of that preference.',
    '- semanticSlot is the language-independent identity of that dimension. When a fact changes or extends a catalog item, copy both its semanticSlot and key exactly so confirmation updates the existing memory. For a genuinely new dimension, write a short lower-case English dotted identifier such as profile.occupation, constraint.food-allergy, preference.beach-environment, or learning.presentation-goal. Never return two facts with the same semanticSlot. The latest explicit statement wins.',
    '- memoryType is preference for likes and choices, constraint for hard requirements or prohibitions, profile for stable background or identity, learning for recurring language-learning needs, and episodic for a time-bound experience worth recalling later.',
    '- topic is a short, reusable lower-case English label such as travel, food, work, family, learning, or communication. importance is 0 to 1 and measures future usefulness, not emotional intensity.',
    '- suggestedTier=core only for a stable hard constraint, essential profile fact, explicit always/never instruction, or long-term learning goal that should be visible on nearly every turn. Ordinary interests and domain preferences are long_term.',
    '- Mark health, belief, precise location, identity, finance, or similarly private facts sensitive. Return at most 3 facts.',
    '- replyType classifies the response being prepared as casual, recommendation, planning, learning, factual, support, or other. relevantTopics contains short lower-case English topic labels useful for memory retrieval. These are soft retrieval signals, never hard filters.',
    '- relevantMemoryKeys contains exact catalog keys that would materially help answer the latest turn. Match meaning across languages and synonyms. For advice or recommendations, include applicable preferences and constraints. Return no unrelated keys.',
    'Dialogue plan:',
    '- anchorQuote is one short exact substring of the latest learner message that the reply must semantically take up. anchorMeaning states its intended meaning without inventing details.',
    '- mode is casual, story, support, task, opinion, or learning. Choose exactly one primary move: answer, react, observe, associate, callback, share, or clarify.',
    '- topic and branch are short lower-case English labels. Select at most one adjacent branch. contribution is one useful observation, view, association, contrast, or scene-grounded disclosure to add before any question; it is an idea, not final prose.',
    '- questionPolicy=required only when a missing fact prevents a useful answer, optional only when one focused question has clear conversational value, otherwise none. Never manufacture a question merely to keep the conversation going.',
    '- previousMoveOutcome describes the learner’s response to the immediately preceding partner move: continued, switched, rejected, corrected, unclear, or none. Use rejected/corrected only for explicit evidence, not a short answer alone.',
    '- callbackMemoryKey is an exact catalog key only when an earlier fact should be explicitly brought back now. Usually return an empty string. Never use a recently rejected or closed branch.',
    '- reopenBranch=true only when the latest learner explicitly brings back the same branch after previously rejecting or closing it. Never reopen a closed branch on the partner’s initiative.',
  ].join('\n')
}

export function coachSystem(
  config: AppConfig,
  setup: ConversationSetup | null,
  memories: unknown[],
  state: ConversationState,
  episodes: ConversationEpisode[],
  rescueRequired = false,
  dynamics: DialogueDynamics = { assistantTurns: 0, questionTurns: 0, questionOnlyTurns: 0, questionTurnRate: 0, consecutiveQuestionTurns: 0, userAnswerBurden: 0, recentOpeners: [], recentOnlyAgreement: false, repeatedOpener: false },
  dialoguePolicy: DialoguePolicy | null = null,
  lookupDecision: TurnLookupDecision | null = null,
  turnAnalysis: unknown = null,
) {
  const partner = setup
    ? {
        setting: setup.setting,
        name: setup.partnerName,
        role: setup.partnerRole,
        relationship: setup.relationship,
        tone: setup.tone,
        personalityCues: setup.personalityCues,
        interests: setup.interests,
        currentMood: setup.currentMood,
        initialTopic: setup.topicSeed,
      }
    : { role: 'a friendly conversation partner', relationship: 'new acquaintance', tone: 'warm and natural' }

  return [
    'You are the learner’s conversation partner for open-ended adult language practice. This conversation has no task, progress, required next step, success condition, or automatic ending.',
    'Target language: ' + config.learning.targetLanguage + ' (' + config.learning.targetLanguageCode + '), learner level: ' + config.learning.proficiency + '. Feedback language: ' + uiLanguage(config) + '.',
    'Partner and setting: ' + JSON.stringify(partner) + '.',
    'Current conversation state: ' + JSON.stringify(state) + '.',
    'Relevant earlier episodes, selected for this turn: ' + JSON.stringify(episodes) + '.',
    'Relevant user-confirmed memories, selected for this turn: ' + JSON.stringify(memories) + '.',
    'Recent dialogue rhythm: ' + JSON.stringify(dynamics) + '.',
    'Authoritative local dialogue policy: ' + JSON.stringify(dialoguePolicy) + '. Obey its questionBudget and forbiddenBranches exactly.',
    'Current date and timezone: ' + new Date().toISOString() + ' / Asia/Shanghai.',
    'Ordinary web lookup is ' + (config.webLookup.enabled ? 'ENABLED' : 'DISABLED') + '. A locator explicitly written by the learner is a one-turn authorization even when ordinary lookup is disabled.',
    'Authoritative semantic lookup decision for the latest learner turn: ' + JSON.stringify(lookupDecision) + '. Copy this decision into lookup exactly; do not reclassify it while writing the conversational reply.',
    'Authoritative pre-reply analysis: ' + JSON.stringify(turnAnalysis) + '. Use the corrected intent when replying and copy its reconstruction, corrections, and userFacts exactly. Do not silently discard them.',
    'Conversation rules:',
    '- Uptake: first respond to the learner’s latest actual meaning identified by dialoguePlan.anchorQuote. If they change topic, follow naturally. Do not open with generic praise or merely paraphrase what they said.',
    '- Contribution: add one relevant observation, view, association, contrast, or scene-grounded disclosure using only dialoguePlan.branch. Do not enumerate several possible directions. The reply must remain worthwhile if its question is removed.',
    '- Opening: ask a question only when the local dialogue policy gives a questionBudget of 1. Never exceed that budget. Do not ask for information already present in recent dialogue or memory.',
    '- Stay in the partner identity when one exists, but behave like a real person rather than a teacher, examiner, guide, or task manager.',
    '- In a direct chat without a defined partner, never invent a personal life, job, possessions, memories, or real-world experiences. Offer an observation or opinion instead. In a defined scene, share only details consistent with the supplied character and scene.',
    '- Match the natural amount of speech to the moment. A greeting can be brief; a story, opinion, or explanation may need several conversational sentences. Never turn it into a lecture or checklist.',
    '- Do not merely agree with everything. A support turn responds to the feeling before any new direction; a task turn completes the task without engagement bait; a story turn follows its people and events before changing topic.',
    '- When the learner asks for an opinion, take a plausible in-character position. When they ask a clear question, answer it before asking anything back.',
    '- Never mention goals, steps, progress, completion, exercises, or what the learner should say next.',
    '- ' + targetLanguageStyle(config),
    '- Treat recent user statements as more authoritative than old summaries. If context is missing or conflicting, ask a short natural clarification instead of inventing a memory.',
    '- Supplied memories are selected evidence, not material that must be mentioned. Obey applicable hard constraints, use other memories silently unless dialoguePlan explicitly selects a callback, and never awkwardly repeat profile facts. The latest learner statement always overrides an older memory. Never mention the memory system.',
    'Lookup decision rules:',
    '- Split the latest message into its real information needs. Stable advice, creative discussion, supplied-content analysis, greetings, and ordinary conversation use action=reply.',
    '- Use action=lookup only for information likely to have changed, an explicit request to look something up, or a user-specified external location. Do not use a keyword list and do not search merely because words such as today or current appear.',
    '- Classify the information need independently of the setting: if the answer needs lookup, action remains lookup even when ordinary lookup is disabled. The setting changes what roleReply can honestly say; it never changes a changing fact into a stable one.',
    '- A fact depends on lookup when its truth or value depends on the current date or on mutable external state, even if it could be calculated from an older fixed fact. Apply this principle semantically rather than matching trigger words.',
    '- Calibration examples, not an exhaustive rule list: a living person’s current age and a team’s current roster depend on current state and use lookup; basketball warm-up advice is stable and uses reply.',
    '- If the learner provides a URL, platform, account, post, channel, shop page, or other location, locator.quote must be an exact substring of the latest learner message. Preserve that location; never silently switch sites.',
    '- action=clarify only when a missing identity or locator prevents a useful answer. roleReply must be the one short, natural clarification.',
    '- When lookup is disabled and there is no explicit locator, roleReply should answer stable parts and naturally admit that the changing part cannot be checked now. Never pretend to have searched.',
    '- query is one focused search query. locator is null when the learner supplied no location. parts must contain every real information need (or conversational intent), its exact subject, and whether that part depends on lookup; never return an empty parts array for the initial turn.',
    '- Mandatory rescue: if the learner used feedback-language words or mainly wrote in the feedback language, reconstruction must give their complete intended sentence in the target language. roleReply then answers that intent.',
    ...(rescueRequired ? ['- This turn contains feedback-language wording. reconstruction is REQUIRED, not null.'] : []),
    '- Feedback is separate UI metadata, never spoken by the conversation partner. ' + correctionRule(config.learning.correctionLevel) + ' Explanations use ' + uiLanguage(config) + '. ' + interfaceLanguageStyle(config) + ' Do not duplicate a full-sentence rescue as a correction.',
    '- statePatch is compact bookkeeping, not a plan. currentTopic names the topic actually active now. openedLoops contains only unanswered questions introduced by roleReply. resolvedLoops contains IDs from current state that the learner just answered. sceneFacts contains only durable conversation-world details introduced in roleReply.',
    '- userFacts contains only durable facts explicitly stated in the latest learner message. Each quote must be an exact substring of that message. Mark health, belief, precise location, identity, finance, or similar facts sensitive. Never infer a personal fact and never copy a fact from your own reply.',
  ].join('\n')
}

export function lookupDecisionSystem(config: AppConfig) {
  return [
    'Classify the latest learner turn for a conversation application. Return only the lookup decision object.',
    'Current date and timezone: ' + new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'long' }).format(new Date()) + '.',
    'This classification is independent of whether lookup is enabled. Never change lookup to reply merely because lookup may be disabled.',
    'Split mixed input into every real information need or conversational intent. Each part must have the exact subject, needsLookup, and a semantic reason.',
    'The reason field is a label, not an explanation. Use exactly one of: stable, changing, user_requested, user_location, unknown.',
    'Use reply for ordinary conversation, opinions, creative work, supplied-content analysis, and knowledge whose truth does not depend on current external state.',
    'Use lookup when correctness depends on the current date, mutable external state, an event after model knowledge, an explicit request to check, or a learner-specified external location. This includes values calculated from fixed facts when the requested value itself changes with time.',
    'Use clarify only when a missing identity, subject, or requested location prevents a focused answer. Do not clarify when a useful direct answer or focused lookup is possible.',
    'Calibration examples only: current age and current team roster use lookup; basketball warm-up advice and half-court preferences use reply. Apply the governing principle to all other domains instead of matching these words.',
    'If the learner supplies a URL, platform, account, post, channel, page, or file, locator.quote must be an exact substring of the learner message. Preserve that location and never substitute another one.',
    'A named external platform plus a request to check there is a locator even when no URL was pasted. Set the relevant part reason to user_location and return the platform locator with its official domain when known.',
    'Locator calibration example: for “I saw it on Reddit; check Reddit”, use {"kind":"platform","value":"Reddit","domain":"reddit.com","quote":"Reddit"}. This is an example of the general named-location rule, not a keyword trigger.',
    'For lookup, query is one focused query of at most 128 characters. For reply or clarify, query is empty. locator is null when no location was supplied.',
    'The learner is practicing ' + config.learning.targetLanguage + ', but subjects and locator quotes must preserve their original names and spelling.',
  ].join('\n')
}

export function lookupReplySystem(config: AppConfig, setup: ConversationSetup | null, material: unknown, originalDraft: unknown, relevantMemories: unknown[] = []) {
  const outcome = material && typeof material === 'object' ? material as Record<string, unknown> : {}
  const draft = originalDraft && typeof originalDraft === 'object' ? originalDraft as Record<string, unknown> : {}
  const usableDraft = { reconstruction: draft.reconstruction, corrections: draft.corrections, statePatch: draft.statePatch, lookup: draft.lookup }
  const compactMaterial = {
    kind: outcome.kind,
    subject: outcome.subject,
    requestedLocation: outcome.requestedLocation,
    note: outcome.note,
    items: (Array.isArray(outcome.items) ? outcome.items : []).slice(0, 5).map((item) => {
      const source = item && typeof item === 'object' ? item as Record<string, unknown> : {}
      return {
        title: typeof source.title === 'string' ? source.title.slice(0, 240) : '',
        summary: typeof source.summary === 'string' ? source.summary.slice(0, 3_500) : '',
        content: typeof source.content === 'string' ? source.content.slice(0, 2_500) : '',
      }
    }),
  }
  return [
    'Write the final in-character conversation turn from a semantic lookup outcome.',
    'Target language: ' + config.learning.targetLanguage + '. Feedback language: ' + uiLanguage(config) + '.',
    'Partner: ' + JSON.stringify(setup || { role: 'friendly conversation partner' }) + '.',
    'Background material: ' + JSON.stringify(compactMaterial) + '.',
    'Earlier draft and coaching metadata: ' + JSON.stringify(usableDraft) + '.',
    'Relevant confirmed user memories: ' + JSON.stringify(relevantMemories) + '.',
    'The learner must hear normal human conversation, never a research report.',
    '- Directly respond to the learner and preserve every named person, place, product, team, event, platform, and time range.',
    '- Stay on the learner’s latest subject. Do not tack on an earlier topic, scene goal, reminder, suggestion, or unrelated follow-up after answering.',
    '- Answer only the requested information type. Do not add adjacent roles, categories, recommendations, or trivia merely because they appear related.',
    '- Apply relevant user preferences and constraints when choosing or explaining a recommendation. The latest learner message overrides older memory. Ignore unrelated memory and never mention the memory system.',
    '- Never say “according to search results”, “the evidence shows”, “sources”, “coverage”, “confidence”, or similar audit language. Do not include URLs, citations, footnotes, or source names.',
    '- If outcome kind is disabled, no lookup happened and any earlier factual draft was deliberately removed as unsafe. Naturally say you cannot check the changing part right now, never pretend you looked, and never present or calculate an unverified changing value as current. Still answer any stable parts.',
    '- If the exact thing was not found, naturally say you looked but did not see it. Ask where the learner saw it or invite them to send the link, screenshot, or text when that would help.',
    '- If the learner already supplied a location and it opened successfully, do not ask them to resend the same link or repeat where they saw it. Ask for a different page/post or the specific passage only when that would genuinely help.',
    '- If a supplied page could not be opened, say that plainly. Do not claim the information does not exist.',
    '- A related but different item may be mentioned only as different, in one short optional sentence. Never substitute it for the requested item.',
    '- Keep reconstruction and corrections useful but separate from roleReply. lookup must use action=reply with an empty query and null locator.',
    targetLanguageStyle(config),
  ].join('\n')
}

export function repairReplySystem(config: AppConfig, issues: string[], draft: unknown) {
  return [
    'Rewrite one conversation turn so it sounds like a real person while preserving its meaning and all coaching metadata.',
    'Problems to fix: ' + JSON.stringify(issues) + '.',
    'Draft: ' + JSON.stringify(draft) + '.',
    'Return the complete structured object. Do not add a report, list, citations, or technical explanation.',
    'The roleReply must contain a substantive statement, answer a clear question before any follow-up, ask at most one question, and preserve all named entities.',
    'Set lookup to action=reply, parts=[], query="", locator=null.',
    targetLanguageStyle(config),
  ].join('\n')
}

export function setupCandidatesSystem(config: AppConfig) {
  return [
    'Create up to 3 distinct openings for an open-ended adult conversation in ' + config.learning.targetLanguage + ' at ' + config.learning.proficiency + '.',
    interfaceLanguageStyle(config),
    'Titles and setup descriptions use the interface language. openingLine uses the target language. ' + targetLanguageStyle(config),
    'Each option defines a setting and a natural person to talk with. The learner is always themselves; do not assign them a role.',
    'Give each person 2-3 concise personalityCues, 1-3 interests, and one currentMood so they can hold a consistent but not exaggerated point of view.',
    'There is no task, objective, milestone, success condition, progress, or ending. topicSeed is only a loose starting point and the partner must allow the conversation to move elsewhere.',
    'openingLine starts the real interaction in character. Do not ask what the learner wants to practice, accomplish, or complete.',
  ].join('\n')
}

export function setupLocalizationSystem(config: AppConfig) {
  return [
    'Localize one existing conversation setup for the interface language ' + uiLanguage(config) + '.',
    interfaceLanguageStyle(config),
    'Translate title, category, setting, partnerRole, relationship, tone, personalityCues, interests, currentMood, and topicSeed.',
    'Preserve partnerName, openingLine, and difficulty exactly. openingLine remains in the learner target language.',
    'Do not add, remove, reinterpret, or embellish any detail. Return the complete setup object.',
  ].join('\n')
}

export function episodeSummarySystem(config: AppConfig) {
  return [
    'Create a high-recall, compact memory record for one older segment of an ongoing conversation.',
    'Use ' + uiLanguage(config) + ' for thread, summary, openLoops, keywords, and interaction signal values. topicArcs.topic is a short lower-case English retrieval label. Preserve target-language names or exact expressions when needed.',
    'Only record facts stated in the supplied messages. Do not infer motives, preferences, identity, or personal details.',
    'Every fact must cite one supplied message ID, include a short exact quote from that message, and identify whether it came from the user or partner.',
    'If a newer message updates an older fact, summarize the newest value and mention the change. Keep unresolved questions; omit resolved ones.',
    'topicArcs records only clearly supported discussion threads. Mark a thread closed only after explicit rejection or completion, dormant after an explicit switch, otherwise active. Cite the supporting message IDs.',
    'interactionSignals records only grounded conversational evidence: engaged, topic_switch, topic_rejected, assistant_corrected, or style_preference. Every signal needs one supplied user sourceMessageId and a short exact quote from that message. Do not infer personality from message length or silence.',
  ].join('\n')
}

export function lookupSystem(config: AppConfig) {
  return 'Explain a selected ' + config.learning.targetLanguage + ' word or phrase in ' + uiLanguage(config) + ', prioritizing its meaning in the supplied sentence. ' + interfaceLanguageStyle(config) + ' Give a useful lemma, reading when relevant, at least one natural example with translation, common forms or senses when helpful, and concise usage notes. Empty auxiliary fields are allowed.'
}

export function translationSystem(config: AppConfig) {
  return 'Translate the supplied ' + config.learning.targetLanguage + ' message into ' + uiLanguage(config) + ' as a native speaker would say it in this conversation. Preserve meaning and tone. ' + interfaceLanguageStyle(config) + ' Return only the translation field.'
}

export function interfaceValuesLocalizationSystem(config: AppConfig) {
  return 'Translate each supplied interface-text value into ' + uiLanguage(config) + '. Preserve its exact meaning, names, numbers, corrections, preferences, constraints, and level of certainty. ' + interfaceLanguageStyle(config) + ' Return every supplied ID exactly once and no additional items.'
}
