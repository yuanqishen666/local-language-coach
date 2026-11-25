import type { ConversationMaterial } from '../types.js'
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
import type { ConversationPresetDefinition } from '../../shared/conversation-presets.js'
import { levelName, materialDifficultyRule, replyDifficultyRules } from './level.js'
import { normalizeRegister, variantPromptName } from '../../shared/variants.js'
import { BEDTIME_CATEGORY, BEDTIME_RULE } from '../../shared/quick-talk.js'

function uiLanguage(config: AppConfig) {
  return localeMeta(config.ui.locale).promptName
}

function nativeStyle(language: string) {
  return 'Write in contemporary, idiomatic ' + language + ' that a native speaker would naturally use here. Prefer direct everyday phrasing. Do not translate sentence structure word for word, pad the text with generic filler, or use formal prose unless the situation calls for it.'
}

function registerRule(config: AppConfig) {
  const register = normalizeRegister(config.learning.register)
  if (register === 'casual') return ' The learner is after everyday spoken language: use the informal register and informal forms of address wherever people who know each other would.'
  if (register === 'formal') return ' The learner is after polite, formal language: use the polite register and formal forms of address unless the scene plainly calls for another.'
  return ''
}

function targetLanguageStyle(config: AppConfig) {
  const variety = variantPromptName(config.learning.targetLanguageCode, config.learning.variant)
  return nativeStyle(config.learning.targetLanguage) + (variety
    ? ' Use ' + variety + ': its vocabulary, spelling, grammar and usual forms of address.'
    : ' Use a broadly understood standard variety unless the conversation establishes a region.') + registerRule(config)
}

/** Wording that is right somewhere else, or in another register, is not a mistake; and the model says how sure it is. */
function certaintyRule(config: AppConfig) {
  const variety = variantPromptName(config.learning.targetLanguageCode, config.learning.variant)
  const register = normalizeRegister(config.learning.register)
  return [
    variety ? 'The learner is learning ' + variety + '.' : '',
    'Wording, spelling or grammar that is correct in another regional variety of the language is not an error' + (variety
      ? ': leave it alone, or, when the difference would stand out where the chosen variety is spoken, report it with certainty=either and say that both are right and which is usual where.'
      : '; never report it as one.'),
    register === 'neutral' ? '' : 'A correct sentence in a different register is not an error either; report it only with certainty=either.',
    'certainty is sure when the original is wrong for native speakers everywhere; either when the original is also correct and improved is only the more usual wording here; unsure when it may not be a mistake at all, for example because it depends on what the learner meant. Never use either or unsure to add feedback that would otherwise be left out.',
  ].filter(Boolean).join(' ')
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
  nonTargetDetected: boolean,
  relevantMemories: Array<Record<string, unknown>> = [],
  learningFocus: LearningFocus[] = [],
) {
  return [
    'Analyze the latest learner turn before a conversation partner replies. Return only the structured analysis object. The recent dialogue is context; analyze and quote only the latest learner message.',
    'Target language: ' + config.learning.targetLanguage + ' (' + config.learning.targetLanguageCode + '), learner level: ' + levelName(config) + '. Feedback language: ' + uiLanguage(config) + '.',
    'Relevant confirmed memories for this turn: ' + JSON.stringify(relevantMemories) + '.',
    'Language classification and feedback:',
    '- Set languageMatch=target only when all meaningful learner-written wording is in the target language. Ignore URLs, code, proper names, and established loanwords when classifying.',
    '- Set languageMatch=non_target when the learner mainly wrote in any other language. Set languageMatch=mixed when meaningful wording from any other language appears inside an otherwise target-language turn. This applies to every language, not only the feedback language.',
    '- For languageMatch=non_target or mixed, reconstruction is REQUIRED: translate the learner’s complete intended message into one natural target-language sentence or turn. original must be the complete latest learner message. Do not duplicate that full reconstruction in corrections.',
    '- For languageMatch=target, reconstruction must be null; use corrections only for applicable target-language errors.',
    nonTargetDetected
      ? '- A deterministic precheck found strong non-target-language evidence. languageMatch cannot be target, and reconstruction is required.'
      : '- The deterministic precheck was inconclusive. Classify the language from the full message; short words and same-script languages still require semantic judgment.',
    '- Understanding what the learner probably meant is not a reason to omit an error. A nonexistent, misspelled, or wrong word that is guessable from context still requires a correction.',
    '- ' + correctionRule(config.learning.correctionLevel),
    '- ' + certaintyRule(config),
    '- For every applicable issue, original must be a short exact substring of the latest learner message. improved must be the natural replacement in the target language and include any article, preposition, or surrounding word needed so substituting it produces a natural sentence. explanation must be concise ' + uiLanguage(config) + '. Do not return an empty corrections array when an applicable issue exists.',
    '- Use severity=meaning for a wrong or nonexistent word or an error that changes the intended meaning; severity=naturalness for clear grammar or idiom problems; use severity=minor only for genuinely minor intensive-level feedback.',
    '- category says what each correction is about: tense (tense or aspect), agreement (person, number, gender, case or other agreement), article (articles and determiners), particle (prepositions, postpositions and particles), word_order, word_choice (a wrong or nonexistent word), collocation (words that do not go together), word_form (spelling, conjugation, inflection or another wrong form of the right word), register (formality or politeness level), phrasing (understandable, but not how a native speaker would put it), or other.',
    '- Do not correct acceptable speech fillers, dialect, deliberate style, proper names, or a natural short answer. Do not invent an error merely to provide feedback.',
    ...(learningFocus.length
      ? ['- This learner has recently been corrected more than once on: ' + JSON.stringify(learningFocus) + '. When the latest message makes one of these mistakes again, list that correction first and say in its explanation, briefly and without reproach, that it keeps coming back. Never report such a mistake when the latest message does not contain it.']
      : []),
    'Lookup decision:',
    '- Classify independently of whether lookup is enabled. Split every real information need or conversational intent into lookup.parts.',
    '- Use reply for ordinary conversation, opinions, creative work, supplied-content analysis, and stable knowledge. Use lookup when correctness depends on the current date, mutable external state, an explicit request to check, or a learner-specified external location.',
    '- Use clarify only when a missing identity, subject, or requested location prevents a useful answer. For lookup, query is one focused query of at most 128 characters. For reply or clarify, query is empty.',
    '- A supplied URL, platform, account, post, channel, page, or file is a locator. locator.quote must be an exact substring of the latest message; preserve it and never substitute another location. locator is null when none was supplied.',
    '- Each part needs the exact subject and one reason: stable, changing, user_requested, user_location, or unknown. action=reply requires every part needsLookup=false; action=lookup requires at least one needsLookup=true plus a query or locator.',
    '- When the learner requests advice or recommendations and a relevant confirmed preference or constraint is supplied, incorporate it into the lookup subject and focused query. Do not add unrelated memories or let an older memory override the latest message.',
  ].join('\n')
}

export interface MemoryAnalysisFrame {
  /** The scene the learner is playing in, or null when they are talking as themselves. */
  setup: ConversationSetup | null
  /** YYYY-MM-DD, so a plan can be given an end. */
  today: string
}

export interface LearningFocus {
  category: string
  count: number
  example?: string
}

function frameLines(frame: MemoryAnalysisFrame | undefined) {
  const today = frame?.today ? ['Today is ' + frame.today + '.'] : []
  if (!frame?.setup) return ['This conversation is not a scene. The learner is talking as themselves.', ...today]
  const setup = frame.setup
  return [
    'This conversation is a role-play scene, and the learner is playing a part in it: ' + JSON.stringify({
      title: setup.title,
      setting: setup.setting,
      partner: [setup.partnerName, setup.partnerRole].filter(Boolean).join(', '),
      relationship: setup.relationship,
      situation: setup.encounterSummary || setup.topicSeed,
    }) + '. What the learner says here is said inside the scene unless they plainly step out of it.',
    ...today,
  ]
}

export function memoryAnalysisSystem(config: AppConfig, memories: Array<Record<string, unknown>>, state?: ConversationState, episodes: ConversationEpisode[] = [], frame?: MemoryAnalysisFrame) {
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
    ...frameLines(frame),
    'Recent conversation strategy state: ' + JSON.stringify({ recentMoves: state?.recentMoves || [], topicMomentum: state?.topicMomentum || [] }) + '.',
    'Recent consolidated interaction evidence: ' + JSON.stringify(episodes.slice(-3).map((episode) => ({ topicArcs: episode.topicArcs, interactionSignals: episode.interactionSignals }))) + '.',
    '- Set disposition=remember when the latest learner message states something about themselves, or about the part they are playing, that is worth keeping at least for the rest of this conversation: a preference, a constraint, background, a plan, a goal, or an answer to the partner’s question. Words such as like, dislike, love, hate, prefer, usually, always, or their equivalents normally express a preference.',
    '- A direct answer that chooses among options proposed by the partner is explicit. Use recent dialogue to resolve references such as “the quiet one”, but never copy a preference from the partner unless the learner actually adopts it.',
    '- Grammar or spelling mistakes do not make a fact ineligible. A statement that the learner prefers quiet, uncrowded beaches with clear water MUST be disposition=remember with a non-empty userFacts array.',
    '- Set disposition=ignore when the message states nothing of the kind: small talk, questions, reactions, facts about other people, or implications the learner did not state. disposition=remember requires at least one fact; disposition=ignore requires no facts.',
    '- Every userFact carries three separate judgements. The program, not you, decides where the fact is kept; judge plainly and do not adjust one judgement to steer another.',
    '- about=user when the statement is about the real learner’s own life. about=persona when it belongs to the part they are playing or to the story of the scene (the trip this scene gave them, what they order here, the job the scene assigned), or when it is a hypothetical or a joke. about=other when it is about someone else. In a scene choose persona unless the learner plainly steps out of the scene or says something that cannot be part of the role: “in real life I…”, an allergy stated as real, how they want to be corrected or addressed, why they are learning the language. When unsure in a scene, choose persona. Outside a scene a first-person statement is about the user unless it is clearly hypothetical or a joke.',
    '- durability=lasting when it holds from now on: identity, background, standing preferences, hard constraints, how they want to be spoken to or corrected, long-term goals. durability=temporary when it holds for a limited time: a trip next month, an interview next week, an exam being prepared for, a current project. durability=momentary when it is about this moment only: a mood, what they want right now, a one-off action.',
    '- validDays is for durability=temporary: the number of days from today until it stops being true, counted to the date of the trip or exam plus a few days. Use 0 for anything else, or when no end can be estimated.',
    '- explicit=true only when the learner asks, in so many words, for this to be remembered.',
    '- For each userFact, quote is a short exact substring of the latest message. Write key and value entirely in ' + uiLanguage(config) + ', including job titles and category labels. key names one stable semantic dimension and value combines compatible facets of that preference.',
    '- semanticSlot is the language-independent identity of that dimension. When a fact changes or extends a catalog item, copy both its semanticSlot and key exactly so confirmation updates the existing memory. For a genuinely new dimension, write a short lower-case English dotted identifier such as profile.occupation, constraint.food-allergy, preference.beach-environment, or learning.presentation-goal. Never return two facts with the same semanticSlot. The latest explicit statement wins.',
    '- memoryType is profile for background or identity, preference for likes and choices, constraint for hard requirements or prohibitions, style for how the learner wants to be spoken to, addressed or corrected, plan for a dated plan or a current situation, and learning for a language-learning goal or need.',
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

/** How a text both have just read is talked about. */
export const SHARED_MATERIAL_RULE = 'You and the learner have both just read it. Talk about it the way two people who read the same thing do: react to it, give a view, ask what they made of it. Do not retell it, quiz them on it, or treat it as a lesson; when the conversation moves away from it, follow.'

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
  reviewWords: Array<{ term: string; meaning: string }> = [],
  material: ConversationMaterial | null = null,
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
        participants: setup.participants,
        localStyle: setup.localStyle,
        factPolicy: setup.factPolicy,
        initiativeMode: setup.initiativeMode,
        openingAct: setup.openingAct,
        encounterSummary: setup.encounterSummary,
        safetyClass: setup.safetyClass,
      }
    : { role: 'a friendly conversation partner', relationship: 'new acquaintance', tone: 'warm and natural' }

  return [
    'You are the learner’s conversation partner for open-ended adult language practice. This conversation has no task, progress, required next step, success condition, or automatic ending.',
    'Target language: ' + config.learning.targetLanguage + ' (' + config.learning.targetLanguageCode + '). Feedback language: ' + uiLanguage(config) + '.',
    ...replyDifficultyRules(config),
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
    ...(material
      ? ['Shared material: ' + JSON.stringify(material) + '. ' + SHARED_MATERIAL_RULE]
      : []),
    ...(reviewWords.length
      ? ['Saved words: ' + JSON.stringify(reviewWords) + '. The learner saved these and has not used them for a while. When the topic allows, leave an opening where one of them is the natural thing for the learner to say: a question or remark whose answer calls for it. Prefer leaving the word for them; saying it yourself once is fine when that is what a person would do. Never ask them to use a word, never mention saved words, review, or practice, keep to the question budget, and drop it when it does not fit: the conversation comes first.']
      : []),
    ...(setup?.category === BEDTIME_CATEGORY ? [BEDTIME_RULE] : []),
    'Conversation rules:',
    '- Uptake: first respond to the learner’s latest actual meaning identified by dialoguePlan.anchorQuote. If they change topic, follow naturally. Do not open with generic praise or merely paraphrase what they said.',
    '- Contribution: add one relevant observation, view, association, contrast, or scene-grounded disclosure using only dialoguePlan.branch. Do not enumerate several possible directions. The reply must remain worthwhile if its question is removed.',
    '- Opening: ask a question only when the local dialogue policy gives a questionBudget of 1. Never exceed that budget. Do not ask for information already present in recent dialogue or memory.',
    '- Stay in the partner identity when one exists, but behave like a real person rather than a teacher, examiner, guide, or task manager.',
    '- When localStyle is supplied, follow its register, relationship distance, forms of address, turn-taking, pragmatics, and avoidPhrases. Natural local usage has priority over literal translation or textbook phrasing.',
    '- Treat factPolicy.stableFacts as scene truth and never assert anything listed in factPolicy.doNotAssert. Do not invent current local facts that would require verification.',
    '- If safetyClass is sensitive-expression-only, practice only describing, clarifying, confirming understanding, or asking for qualified human help; never give medical, legal, immigration, financial, or other professional conclusions.',
    '- In a direct chat without a defined partner, never invent a personal life, job, possessions, memories, or real-world experiences. Offer an observation or opinion instead. In a defined scene, share only details consistent with the supplied character and scene.',
    '- Match the natural amount of speech to the moment, inside the length limit above. A greeting can be brief; a story, opinion, or explanation may need several conversational sentences. Never turn it into a lecture or checklist.',
    '- Do not merely agree with everything. A support turn responds to the feeling before any new direction; a task turn completes the task without engagement bait; a story turn follows its people and events before changing topic.',
    '- When the learner asks for an opinion, take a plausible in-character position. When they ask a clear question, answer it before asking anything back.',
    rescueRequired
      ? '- The learner did not write this turn in ' + config.learning.targetLanguage + '. If it asks something they need answered to go on — what a word or one of your lines meant, how to say something — answer that in aside, in the language they wrote in, in one or two short sentences, the way a patient friend steps out of the conversation for a moment. When they asked nothing of that kind, aside is an empty string. roleReply is still written only in ' + config.learning.targetLanguage + ' and carries the conversation on.'
      : '- aside is an empty string.',
    '- Never mention goals, steps, progress, completion, exercises, or what the learner should say next.',
    '- ' + targetLanguageStyle(config),
    '- Treat recent user statements as more authoritative than old summaries. If context is missing or conflicting, ask a short natural clarification instead of inventing a memory.',
    '- Supplied memories are selected evidence, not material that must be mentioned. An item with scope=this-conversation was said by the learner earlier in this conversation and holds only here; in a scene it belongs to the part the learner plays. Obey applicable hard constraints, use other memories silently unless dialoguePlan explicitly selects a callback, and never awkwardly repeat profile facts. The latest learner statement always overrides an older memory. Never mention the memory system.',
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
    '- Mandatory rescue: if authoritative analysis sets languageMatch to non_target or mixed, reconstruction must give the learner’s complete intended sentence in the target language. This applies no matter which other language they used. roleReply then answers that intent.',
    ...(rescueRequired ? ['- This turn contains meaningful wording outside the target language. reconstruction is REQUIRED, not null.'] : []),
    '- Feedback is separate UI metadata, never spoken by the conversation partner. ' + correctionRule(config.learning.correctionLevel) + ' ' + certaintyRule(config) + ' Explanations use ' + uiLanguage(config) + '. ' + interfaceLanguageStyle(config) + ' Do not duplicate a full-sentence rescue as a correction.',
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
    '- If a supplied page could not be opened, use the outcome note to state the known reason accurately (for example timeout, HTTP status, safety block, size limit, unsupported type, or network failure). Do not replace it with a generic claim that you lack browsing ability, speculate that a public page is private, or claim the information does not exist.',
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
    ...replyDifficultyRules(config),
    'Set lookup to action=reply, parts=[], query="", locator=null.',
    targetLanguageStyle(config),
  ].join('\n')
}

/** How much one answer may hold. `compact` is the smallest request, used after a cut-off or malformed answer. */
export interface ListRequestSize {
  count: number
  compact: boolean
  /** An earlier answer arrived whole and was turned down, which in practice means it used the wrong language. */
  rejected?: boolean
}

function languageCorrectionRule(config: AppConfig, size: ListRequestSize) {
  return size.rejected
    ? [`An earlier answer was turned down because of the language it was written in. This time, write every spoken line (openingLine) only in ${config.learning.targetLanguage}, in its normal script, and write every title and description only in ${uiLanguage(config)}. The language of the request, of the background, and of this instruction does not change either rule.`]
    : []
}

function conciseOutputRule(size: ListRequestSize, listLimit: number, compactListLimit: number) {
  return size.compact
    ? `The previous answer was cut off or incomplete. Write the shortest complete answer: descriptive fields are a few words each, every list has at most ${compactListLimit} item${compactListLimit === 1 ? '' : 's'}, spoken lines are one or two short sentences, and every required field is present exactly once. This limit overrides any larger count mentioned below.`
    : `Be economical: descriptive fields are one short phrase or one short sentence each, and every list has at most ${listLimit} items. Spoken lines stay natural. A long answer will be cut off, so a complete short one is required.`
}

/** What is known about the learner that may steer which situations are worth offering. */
export interface SetupLearnerProfile { plans: string[]; goals: string[]; weakSpots: string[]; restingTopics: string[] }

/** What suggestions for the next conversations also draw on. */
export interface SetupPathInput {
  /** Saved words whose review has come. */
  savedWords: string[]
  /** What the learner has talked about most lately. */
  usualTopics: string[]
}

export function setupCandidatesSystem(config: AppConfig, size: ListRequestSize = { count: 3, compact: false }, learner?: SetupLearnerProfile, path?: SetupPathInput) {
  const steered = Boolean(learner && (learner.plans.length || learner.goals.length || learner.weakSpots.length || learner.restingTopics.length))
  return [
    (size.count === 1 ? 'Create exactly 1 opening' : `Create up to ${size.count} distinct openings`) + ' for an open-ended adult conversation in ' + config.learning.targetLanguage + ' at ' + levelName(config) + '.',
    materialDifficultyRule(config, 'openingLine'),
    conciseOutputRule(size, 3, 2),
    interfaceLanguageStyle(config),
    'Titles and setup descriptions use the interface language (' + uiLanguage(config) + '). openingLine uses the target language (' + config.learning.targetLanguage + '). ' + targetLanguageStyle(config),
    'The request may be typed in any language. Read it for meaning only: its language never decides the language of openingLine or of the descriptions.',
    'The request has three parts. domain is the kind of conversation. place says where it happens and who the learner is talking with. detail says what the learner wants to talk about. An empty part is yours to choose. When place names a person or a role, that is the partner. When detail is given, openingLine leads toward it naturally and does not announce it.',
    ...languageCorrectionRule(config, size),
    'Each option defines a setting and a natural person to talk with. The learner is always themselves; do not assign them a role.',
    'Give each person 2-3 concise personalityCues, 1-3 interests, and one currentMood so they can hold a consistent but not exaggerated point of view.',
    'There is no task, objective, milestone, success condition, progress, or ending. topicSeed is only a loose starting point and the partner must allow the conversation to move elsewhere.',
    'openingLine starts the real interaction in character. It may be a statement, observation, disclosure, greeting, offer, reaction, or a genuinely necessary question. Do not default every opening to a question and never ask what the learner wants to practice, accomplish, or complete.',
    'Treat avoidRecent as semantic exclusions. Do not produce synonym-only rewrites of those settings, partner relationships, immediate hooks, opening acts, or opening meanings.',
    'Normal friendly conversation, quiet everyday moments, and topic wandering are first-class outcomes. Never add friction, urgency, embarrassment, conflict, or a service failure merely to create variety.',
    ...(steered ? [
      'learner describes the person these openings are for. plans are things coming up in their life. goals are what they are learning the language for. weakSpots are kinds of mistake they keep making. restingTopics are situations they practised before but not lately.',
      'What the request states always comes first. Where the request leaves a part empty, let learner decide which situations are worth offering: one may be a situation a plan or goal will put them in, one may be a situation that naturally calls for a weakSpot (a past-time story for tense, giving directions for word order, and so on), one may return to a restingTopic from a new angle. Do not bend every option toward learner.',
      'learner only decides which situation is offered. The partner is a stranger to these facts: the title, descriptions, and openingLine never state, hint at, or ask about a plan, a goal, a weakSpot, or past practice, and nothing in the option tests the learner.',
    ] : []),
    ...(path ? [
      'path.usualTopics are what the learner has talked about most lately. Let one option step just outside them: a neighbouring situation that reuses what they can already say in a new place (someone who often talks about cooking could bargain at a market). Never a leap to something unrelated. The other options need not relate to usualTopics.',
      'path.savedWords are words the learner saved and is due to use again. For each option, practiceWords lists the one or two savedWords that would naturally come up in that situation, copied exactly; leave it empty when none would. Spread different words over the options where the situations allow. Never build an option around a word, and keep savedWords out of the title, the descriptions and openingLine: the learner is the one who should get to say them.',
      'weakSpot names the one entry of learner.weakSpots the option naturally calls for, copied exactly, or is an empty string.',
    ] : []),
  ].join('\n')
}

export function sceneBackgroundsSystem(config: AppConfig, preset: ConversationPresetDefinition, size: ListRequestSize = { count: 4, compact: false }) {
  return [
    (size.count === 1 ? 'Generate exactly 1 reusable background seed' : `Generate exactly ${size.count} reusable background seeds`) + ' for an open-ended adult conversation feature. Return only the structured object.',
    size.compact
      ? 'The previous answer was cut off or incomplete. Write the shortest complete seed: every text field is a few words, every list has at most 1 item, participants is empty unless a second person is essential, and every required field is present exactly once. This limit overrides any larger count mentioned below.'
      : 'Be economical: title, partnerRole, relationship, and registerHint are short phrases; setting and sharedContext are one short sentence each; openAffordances has at most 3 items; addressNorms, turnTaking, pragmaticNotes, avoidPhrases, stableFacts, and doNotAssert have at most 2 short items each. A long answer will be cut off, so a complete short one is required.',
    'Preset intent: ' + preset.promptBrief,
    'Safety class: ' + preset.safetyClass + '.',
    'Interface descriptions use ' + uiLanguage(config) + '. ' + interfaceLanguageStyle(config),
    'A background seed is stable context only: a believable setting, partner role, relationship, shared context, local register, and open affordances that can support many different conversations.',
    'STRICTLY FORBIDDEN in a background: a fixed topic, opening line, task, goal, problem, conflict, information gap, decision, outcome, plot, success condition, lesson target, or ending.',
    'Do not start from airport / hotel / restaurant / shopping categories. Discover backgrounds from the supplied reality anchor and include ordinary social life, shared interests, relationships, and calm moments when plausible.',
    'identityKey is a short lower-case English semantic identity. It must stay the same if only a title, person name, wording, difficulty, or temporary mood changes.',
    'openAffordances are broad things the people could naturally do or notice; they are not required beats and must not constrain the later dialogue.',
    'participants may contain zero to three people when a small group is genuinely natural. Never add a group merely for novelty.',
    'localStyle describes pragmatic constraints, not phrases to copy. addressNorms, turnTaking, pragmaticNotes, and avoidPhrases must be concise and situation-specific.',
    'factPolicy may contain only stable, high-confidence context. Put prices, schedules, live events, current rules, operating status, and any uncertain local claim in doNotAssert. asOf is today’s date.',
    'For destination anchors, set destinationSpecificity=local only when changing the destination would materially change the background or local pragmatic behavior. Generic necessary exchanges remain useful but must be labeled generic. Otherwise use not_applicable.',
    'Use safetyClass=sensitive-expression-only exactly when supplied. In that class, backgrounds may support describing, clarifying, confirming understanding, requesting a qualified interpreter, or switching to human help; never professional conclusions or advice.',
    'Prefer genuine differences in relationship, setting, and social context. Do not manufacture friction, rejection, mistakes, urgency, or embarrassment to make candidates look different.',
  ].join('\n')
}

export function sceneEncountersSystem(config: AppConfig, size: ListRequestSize = { count: 4, compact: false }) {
  return [
    (size.count === 1 ? 'Create exactly 1 runtime encounter candidate' : `Create exactly ${size.count} distinct runtime encounter candidates`) + ' for one approved conversation background. Return only the structured object.',
    size.compact
      ? 'The previous answer was cut off or incomplete. Write the shortest complete candidate: descriptive fields are a few words each, personalityCues and interests have at most 1 item each, openingLine is one or two short sentences, and every required field is present exactly once.'
      : 'Be economical: transientState, socialEnergy, openingAct, initialAffordance, and dynamicSummary are one short phrase or sentence each; setup descriptions are short phrases; personalityCues and interests have at most 2 items each. openingLine stays natural speech. A long answer will be cut off, so a complete short one is required.',
    'Target language: ' + config.learning.targetLanguage + ' (' + config.learning.targetLanguageCode + '), learner level: ' + levelName(config) + '. Interface descriptions use ' + uiLanguage(config) + '.',
    materialDifficultyRule(config, 'openingLine'),
    'openingLine is always written in ' + config.learning.targetLanguage + ', whatever language the background, the anchor, or the descriptions are written in.',
    ...languageCorrectionRule(config, size),
    'Each candidate is a one-time present moment. Generate transientState, socialEnergy, openingAct, initialAffordance, dynamicSummary, and a complete ConversationSetup.',
    'The stable background may repeat; the dynamic delta must not. Vary what is happening now, social energy, initiative, and what the other person naturally contributes before the learner says anything.',
    'openingLine must be direct, idiomatic target-language speech in character. It may be a statement, observation, disclosure, greeting, offer, suggestion, reaction, or a naturally necessary question. Do not use fixed quotas or make every opening a question.',
    'The opening must be easy to answer in more than one way and must not ask what the learner wants to practice, what topic they chose, or whether they are ready.',
    'There is no task, learning objective, progress, success condition, required topic, fixed number of turns, plot, or automatic ending. topicSeed is only the incidental present hook and must be safe to abandon immediately.',
    'Keep a real-person identity rather than teacher, examiner, tour guide, customer-service bot, or task manager. Normal friendly conversation is a first-class outcome; no conflict is required.',
    'Use the supplied LocalStyleCard as pragmatic constraints, not text to imitate. Generate target-language speech directly instead of translating an interface-language draft.',
    'Use only stableFacts from factPolicy. Never assert anything listed in doNotAssert, and do not invent current prices, schedules, rules, opening status, or live events.',
    'For sensitive-expression-only, the partner can help the learner express, clarify, confirm, or reach qualified human help, but cannot diagnose, decide, interpret law, or claim official rules.',
    'initiativeMode is system routing only: FOLLOW when the moment mainly receives the learner, CO_LEAD when the person contributes an open hook, and LEAD when the person naturally brings the first piece of content. It does not prescribe sentence form.',
    targetLanguageStyle(config),
  ].join('\n')
}

export function sceneEncounterCriticSystem(config: AppConfig) {
  return [
    'Act as a Locale/Register Critic and novelty gate for runtime conversation openings. Return only the structured evaluation object.',
    'Judge each candidate independently before ranking. eligible requires every hard condition to pass.',
    'Hard conditions: the opening is idiomatic ' + config.learning.targetLanguage + '; it fits the supplied locale, relationship, role, register, and present moment; the learner remains themselves; it is immediately answerable; it contains no teacher or AI meta-talk; it asserts no forbidden or mutable fact; it creates no hidden task, forced conflict, success condition, or ending.',
    'Reject mechanical service phrases when the role and situation would not naturally use them. Do not reject a genuine service-register phrase merely because it is formal.',
    'Compare only the runtime delta, opening meaning, and likely first-turn topology with recent history. The stable background is intentionally shared and is not repetition.',
    'Reject synonym-only rewrites and candidates that recreate the same social energy, opening act, topic hook, and expected response as a recent run.',
    'Do not reward novelty over naturalness. A calm ordinary encounter is better than an implausible surprise. Questions, statements, and other speech acts are all valid; never enforce a quota.',
    'rankedCandidateIds contains eligible IDs only, best natural fit first. issues use concise ' + uiLanguage(config) + '. If every candidate fails, return an empty ranking.',
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
  return 'Explain a selected ' + config.learning.targetLanguage + ' word or phrase in ' + uiLanguage(config) + ', prioritizing its meaning in the supplied sentence. ' + interfaceLanguageStyle(config) + ' Give a useful lemma, reading when relevant, at least one natural example with translation, common forms or senses when helpful, and concise usage notes. Every item in collocations must contain a natural target-language phrase and its concise meaning in the interface language; never return a collocation without its meaning. Empty auxiliary fields are allowed.'
}

export function translationSystem(config: AppConfig) {
  return 'Translate the supplied ' + config.learning.targetLanguage + ' message into ' + uiLanguage(config) + ' as a native speaker would say it in this conversation. Preserve meaning and tone. ' + interfaceLanguageStyle(config) + ' Return only the translation field.'
}

export function interfaceValuesLocalizationSystem(config: AppConfig) {
  return 'Translate each supplied interface-text value into ' + uiLanguage(config) + '. Preserve its exact meaning, names, numbers, corrections, preferences, constraints, and level of certainty. ' + interfaceLanguageStyle(config) + ' Return every supplied ID exactly once and no additional items.'
}

export function memoryConsolidationSystem(
  config: AppConfig,
  input: {
    scene: string
    today: string
    conversationMemories: Array<{ id: string; value: string; quote: string; about: string; durability: string }>
    saidElsewhere: Array<{ conversation: string; value: string; about: string }>
    memories: Array<{ id: string; layer: string; value: string; validTo: string }>
  },
) {
  return [
    'Tidy up a learner’s memory after one conversation has ended. Return only the structured object. You only propose; the learner decides every item, so propose little and only what is clearly supported.',
    'Write value and note in ' + uiLanguage(config) + '. Today is ' + input.today + '.',
    input.scene
      ? 'The conversation was a role-play scene: ' + input.scene + '. Statements marked about=persona belong to the part the learner played and say nothing about their real life.'
      : 'The conversation was not a scene; the learner spoke as themselves.',
    'Kept with this conversation only: ' + JSON.stringify(input.conversationMemories) + '.',
    'Kept with other recent conversations, for comparison only: ' + JSON.stringify(input.saidElsewhere) + '.',
    'Long-term memories the learner has confirmed: ' + JSON.stringify(input.memories) + '.',
    '- promotions: an item kept with this conversation that is about the real learner (about=user) and would stay true and useful in other conversations. Copy its id to conversationMemoryId. value is the memory as it should be stored. memoryType is profile, preference, constraint, style, plan or learning. durability is lasting or temporary; for temporary give validDays, otherwise 0. note says in one short sentence why it is worth keeping. Do not propose an item marked about=persona, with one exception: when the same interest also shows up in other, unrelated conversations, it may be proposed once as a possible real interest, and the note must say that it came up in several conversations. Never propose something that only repeats a long-term memory.',
    '- conflicts: a long-term memory that something said in this conversation by the real learner contradicts. Copy the memory id and the id of the conversation item. value is what the memory should say now. note states the contradiction in one short sentence.',
    '- stale: a long-term memory that, going by its content, its end date and today’s date, no longer holds, such as a plan whose date has passed. note says why in one short sentence.',
    '- Return empty arrays when nothing qualifies. At most 3 items in each array.',
  ].join('\n')
}
