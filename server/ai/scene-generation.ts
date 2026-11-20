import { createHash } from 'node:crypto'
import { getConfig } from '../services/config.js'
import type { ConversationPresetDefinition } from '../../shared/conversation-presets.js'
import type { ConversationSetup } from '../types.js'
import { normalizeUiLocale } from '../../shared/locales.js'
import { getModelClient } from './provider.js'
import { generateListInSteps, generateStructured, listBatchSize, listFromAnswer, listRequestSteps, openingLanguageError, withOutputLimitDetails } from './engine.js'
import { matchesExpectedConversationLanguage, joinedLanguageMatches } from './language.js'
import { openerSimilarity } from './dialogue-policy.js'
import { sceneBackgroundSeedsSchema, sceneEncounterCandidatesSchema, sceneEncounterCritiqueSchema } from './schemas.js'
import { sceneBackgroundsSystem, sceneEncounterCriticSystem, sceneEncountersSystem } from './prompts.js'
import { levelCode } from './level.js'

export interface SceneBackgroundSeed {
  candidateId: string
  identityKey: string
  title: string
  setting: string
  partnerRole: string
  relationship: string
  sharedContext: string
  registerHint: string
  openAffordances: string[]
  destinationSpecificity: 'not_applicable' | 'generic' | 'local'
  participants: Array<{ name: string; role: string; relationship: string }>
  localStyle: {
    locale: string
    register: string
    relationshipDistance: string
    addressNorms: string[]
    turnTaking: string[]
    pragmaticNotes: string[]
    avoidPhrases: string[]
  }
  factPolicy: { stableFacts: string[]; doNotAssert: string[]; asOf: string }
  safetyClass: 'normal' | 'sensitive-expression-only'
}
export interface SceneEncounterCandidate {
  candidateId: string
  transientState: string
  socialEnergy: string
  openingAct: string
  initialAffordance: string
  initiativeMode: 'FOLLOW' | 'CO_LEAD' | 'LEAD'
  dynamicSummary: string
  setup: ConversationSetup
}

export interface SceneRunHistory {
  dynamicSummary: string
  openingLine: string
  openingAct: string
  socialEnergy: string
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function strings(value: unknown, limit = 8) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean).slice(0, limit) : []
}

function participants(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 3).map((item) => {
    const source = record(item)
    return { name: text(source.name), role: text(source.role), relationship: text(source.relationship) }
  }).filter((item) => item.name || item.role) : []
}

function normalizeStyle(value: unknown) {
  const source = record(value)
  return {
    locale: text(source.locale),
    register: text(source.register),
    relationshipDistance: text(source.relationshipDistance),
    addressNorms: strings(source.addressNorms, 5),
    turnTaking: strings(source.turnTaking, 5),
    pragmaticNotes: strings(source.pragmaticNotes, 6),
    avoidPhrases: strings(source.avoidPhrases, 6),
  }
}

function normalizeFactPolicy(value: unknown) {
  const source = record(value)
  return {
    stableFacts: strings(source.stableFacts, 6),
    doNotAssert: strings(source.doNotAssert, 8),
    asOf: text(source.asOf, new Date().toISOString().slice(0, 10)),
  }
}

function requestConfig(interfaceLocale?: string, difficultyStep?: number) {
  return getConfig().then((config) => {
    config.ui.locale = normalizeUiLocale(interfaceLocale, config.ui.locale)
    if (typeof difficultyStep === 'number') config.learning.difficultyStep = difficultyStep
    return config
  })
}
function selectedProvider<T extends Awaited<ReturnType<typeof getConfig>>>(config: T) {
  const provider = config.providers.find((item) => item.id === config.llm.defaultProvider)
  if (!provider) throw Object.assign(new Error('Provider not found'), { statusCode: 409 })
  return provider
}

export function normalizedSceneText(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
}

function sceneTokens(value: string) {
  const normalized = normalizedSceneText(value)
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || []
  const compactCjk = [...normalized].filter((character) => /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character))
  const bigrams = compactCjk.map((_, index) => compactCjk.slice(index, index + 2).join('')).filter((item) => item.length === 2)
  return [...new Set([...words, ...bigrams])]
}

export function sceneSimilarity(left: string, right: string) {
  const a = new Set(sceneTokens(left))
  const b = new Set(sceneTokens(right))
  if (!a.size || !b.size) return 0
  const shared = [...a].filter((item) => b.has(item)).length
  return (2 * shared) / (a.size + b.size)
}

function fingerprint(value: string) {
  return createHash('sha256').update(normalizedSceneText(value)).digest('hex').slice(0, 24)
}

export function backgroundFingerprint(background: SceneBackgroundSeed) {
  return fingerprint([
    background.identityKey,
    background.setting,
    background.partnerRole,
    background.relationship,
    background.sharedContext,
    background.registerHint,
    background.localStyle.locale,
    background.localStyle.register,
  ].join('|'))
}

export function dynamicFingerprint(encounter: SceneEncounterCandidate) {
  return fingerprint([
    encounter.transientState,
    encounter.socialEnergy,
    encounter.openingAct,
    encounter.initialAffordance,
    encounter.initiativeMode,
    encounter.dynamicSummary,
  ].join('|'))
}

export function openingFingerprint(openingLine: string) {
  return fingerprint(openingLine)
}

export function filterNovelEncounters(candidates: SceneEncounterCandidate[], history: SceneRunHistory[]) {
  const accepted: SceneEncounterCandidate[] = []
  for (const candidate of candidates) {
    const repeatedOpening = history.some((item) => openerSimilarity(candidate.setup.openingLine, item.openingLine) >= 0.72) ||
      accepted.some((item) => openerSimilarity(candidate.setup.openingLine, item.setup.openingLine) >= 0.78)
    const repeatedDynamic = history.some((item) => sceneSimilarity(candidate.dynamicSummary, item.dynamicSummary) >= 0.8) ||
      accepted.some((item) => sceneSimilarity(candidate.dynamicSummary, item.dynamicSummary) >= 0.86)
    if (!repeatedOpening && !repeatedDynamic) accepted.push(candidate)
  }
  return accepted
}

export function softPickRanked(
  candidates: SceneEncounterCandidate[],
  rankedCandidateIds: string[],
  random: () => number = Math.random,
) {
  const byId = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]))
  const ranked = rankedCandidateIds.map((id) => byId.get(id)).filter((item): item is SceneEncounterCandidate => Boolean(item))
  const pool = ranked.length ? ranked : candidates
  if (!pool.length) return undefined
  if (pool.length === 1) return pool[0]
  return random() < 0.68 ? pool[0] : pool[1]
}

// Pessimistic output cost of one generated item, in tokens. A background carries nested
// style and fact cards, so it is the heaviest thing this feature asks a model to write.
const BACKGROUND_OUTPUT_TOKENS = 560
const ENCOUNTER_OUTPUT_TOKENS = 400
export const SCENE_BACKGROUND_POOL = 4
const MOST_ENCOUNTERS = 4

export async function generateSceneBackgrounds(input: {
  preset: ConversationPresetDefinition
  anchorValue: string
  existing: Array<{ identityKey: string; summary: string }>
  interfaceLocale?: string
  /** How many more backgrounds the pool can take. One is enough to start a conversation. */
  wanted?: number
}): Promise<SceneBackgroundSeed[]> {
  const config = await requestConfig(input.interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const wanted = Math.max(1, Math.min(SCENE_BACKGROUND_POOL, input.wanted ?? SCENE_BACKGROUND_POOL))
  const normalize = (value: unknown) => {
    const backgrounds = listFromAnswer(value, 'backgrounds')
    const seeds = backgrounds.slice(0, 6).map((item, index) => {
      const background = record(item)
      const registerHint = text(background.registerHint)
      const localStyle = normalizeStyle(background.localStyle)
      return {
        candidateId: text(background.candidateId, `bg-${index + 1}`),
        identityKey: text(background.identityKey, `background-${index + 1}`),
        title: text(background.title),
        setting: text(background.setting),
        partnerRole: text(background.partnerRole),
        relationship: text(background.relationship),
        sharedContext: text(background.sharedContext),
        registerHint,
        openAffordances: strings(background.openAffordances, 6),
        destinationSpecificity: ['not_applicable', 'generic', 'local'].includes(text(background.destinationSpecificity))
          ? text(background.destinationSpecificity) as 'not_applicable' | 'generic' | 'local'
          : input.preset.id === 'destination' ? 'generic' as const : 'not_applicable' as const,
        participants: participants(background.participants),
        localStyle: {
          ...localStyle,
          locale: localStyle.locale || config.learning.targetLanguageCode,
          register: localStyle.register || registerHint,
        },
        factPolicy: normalizeFactPolicy(background.factPolicy),
        safetyClass: input.preset.safetyClass,
      }
    })
    // One incomplete seed is dropped on its own; it no longer discards the others.
    return {
      backgrounds: seeds.filter((background) => Boolean(
        background.title && background.setting && background.partnerRole && background.relationship && background.sharedContext,
      )),
    }
  }
  try {
    return await generateListInSteps({
      steps: listRequestSteps(listBatchSize(provider.maxOutputTokens, BACKGROUND_OUTPUT_TOKENS, wanted)),
      request: async (step) => (await generateStructured(client, [
        { role: 'system', content: sceneBackgroundsSystem(config, input.preset, step) },
        { role: 'user', content: JSON.stringify({ anchor: input.anchorValue, avoidExistingBackgrounds: input.existing.slice(-20) }) },
      ], {
        name: 'scene_background_seeds',
        schema: sceneBackgroundSeedsSchema,
        hint: '{"backgrounds":[{"candidateId":"bg-1","identityKey":"semantic-key","title":"","setting":"","partnerRole":"","relationship":"","sharedContext":"","registerHint":"","openAffordances":[],"destinationSpecificity":"not_applicable","participants":[],"localStyle":{"locale":"","register":"","relationshipDistance":"","addressNorms":[],"turnTaking":[],"pragmaticNotes":[],"avoidPhrases":[]},"factPolicy":{"stableFacts":[],"doNotAssert":[],"asOf":"YYYY-MM-DD"},"safetyClass":"normal"}]}',
        temperature: 0.78,
        maxOutputTokens: provider.maxOutputTokens,
        normalize,
        listKey: 'backgrounds',
        usable: (value) => value.backgrounds.length > 0,
      })).backgrounds,
      preferred: (background) => joinedLanguageMatches(config.ui.locale, [
        background.title, background.setting, background.partnerRole, background.relationship, background.sharedContext, background.registerHint,
      ]),
      // A description that mixes languages is a blemish, not a reason to refuse the conversation.
      acceptable: () => true,
    })
  } catch (error) {
    throw withOutputLimitDetails(error, provider.maxOutputTokens)
  }
}

export async function generateSceneEncounters(input: {
  preset: ConversationPresetDefinition
  anchorValue: string
  background: SceneBackgroundSeed
  history: SceneRunHistory[]
  interfaceLocale?: string
  /** The difficulty the opening is written at. */
  difficultyStep?: number
  retryAvoid?: Array<{ dynamicSummary: string; openingLine: string }>
}): Promise<SceneEncounterCandidate[]> {
  const config = await requestConfig(input.interfaceLocale, input.difficultyStep)
  const level = levelCode(config)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  // Text copied from the background or the preset says nothing about how this answer was written.
  // category is left out of the language check as well: it is a short label that falls back to the preset id.
  const inherited = new Set([
    input.background.title, input.background.setting, input.background.partnerRole, input.background.relationship,
    input.background.registerHint, config.learning.proficiency, level,
  ].filter(Boolean))
  const written = (values: string[]) => values.filter((value) => !inherited.has(value))
  const normalize = (value: unknown) => {
    const encounters = listFromAnswer(value, 'encounters')
    const candidates = encounters.slice(0, MOST_ENCOUNTERS).map((item, index) => {
      const encounter = record(item)
      const setup = record(encounter.setup)
      const openingAct = text(encounter.openingAct)
      const initialAffordance = text(encounter.initialAffordance)
      const dynamicSummary = text(encounter.dynamicSummary) || text(encounter.transientState) || initialAffordance
      const initiativeMode = ['FOLLOW', 'CO_LEAD', 'LEAD'].includes(text(encounter.initiativeMode))
        ? text(encounter.initiativeMode) as 'FOLLOW' | 'CO_LEAD' | 'LEAD'
        : 'CO_LEAD' as const
      return {
        candidateId: text(encounter.candidateId, `run-${index + 1}`),
        transientState: text(encounter.transientState) || dynamicSummary,
        socialEnergy: text(encounter.socialEnergy),
        openingAct,
        initialAffordance,
        initiativeMode,
        dynamicSummary,
        setup: {
          title: text(setup.title, input.background.title),
          category: text(setup.category, input.preset.id),
          setting: text(setup.setting, input.background.setting),
          partnerName: text(setup.partnerName),
          partnerRole: text(setup.partnerRole, input.background.partnerRole),
          relationship: text(setup.relationship, input.background.relationship),
          tone: text(setup.tone, input.background.registerHint),
          personalityCues: strings(setup.personalityCues, 3),
          interests: strings(setup.interests, 3),
          currentMood: text(setup.currentMood, text(encounter.socialEnergy)),
          topicSeed: text(setup.topicSeed, initialAffordance),
          openingLine: text(setup.openingLine),
          difficulty: level,
          participants: input.background.participants,
          localStyle: input.background.localStyle,
          factPolicy: input.background.factPolicy,
          initiativeMode,
          openingAct,
          encounterSummary: dynamicSummary,
          safetyClass: input.background.safetyClass,
        },
      }
    })
    // A candidate needs something to say and something that tells it apart; the rest has defaults.
    return { encounters: candidates.filter((encounter) => Boolean(encounter.setup.openingLine && encounter.dynamicSummary)) }
  }
  try {
    return await generateListInSteps({
      steps: listRequestSteps(listBatchSize(provider.maxOutputTokens, ENCOUNTER_OUTPUT_TOKENS, MOST_ENCOUNTERS)),
      request: async (step) => (await generateStructured(client, [
        { role: 'system', content: sceneEncountersSystem(config, step) },
        { role: 'user', content: JSON.stringify({
          presetIntent: input.preset.promptBrief,
          anchor: input.anchorValue,
          background: input.background,
          recentRuntimeHistory: input.history.slice(-12),
          rejectedThisAttempt: input.retryAvoid || [],
        }) },
      ], {
        name: 'scene_runtime_encounters',
        schema: sceneEncounterCandidatesSchema,
        hint: '{"encounters":[{"candidateId":"run-1","transientState":"","socialEnergy":"","openingAct":"","initialAffordance":"","initiativeMode":"CO_LEAD","dynamicSummary":"","setup":{"title":"","category":"","setting":"","partnerName":"","partnerRole":"","relationship":"","tone":"","personalityCues":[],"interests":[],"currentMood":"","topicSeed":"","openingLine":"","difficulty":""}}]}',
        temperature: 0.82,
        maxOutputTokens: provider.maxOutputTokens,
        normalize,
        listKey: 'encounters',
        usable: (value) => value.encounters.length > 0,
      })).encounters,
      preferred: (encounter) => joinedLanguageMatches(config.ui.locale, written([
        encounter.transientState, encounter.socialEnergy, encounter.openingAct, encounter.initialAffordance,
        encounter.dynamicSummary, encounter.setup.title, encounter.setup.setting,
        encounter.setup.partnerRole, encounter.setup.relationship, encounter.setup.tone, encounter.setup.currentMood,
        encounter.setup.topicSeed,
      ])) && matchesExpectedConversationLanguage(encounter.setup.openingLine, config.learning.targetLanguageCode),
      // The opening line must be in the language being practised; nothing else is worth failing for.
      acceptable: (encounter) => matchesExpectedConversationLanguage(encounter.setup.openingLine, config.learning.targetLanguageCode),
      rejection: () => openingLanguageError(config),
    })
  } catch (error) {
    throw withOutputLimitDetails(error, provider.maxOutputTokens)
  }
}

export async function critiqueSceneEncounters(input: {
  background: SceneBackgroundSeed
  candidates: SceneEncounterCandidate[]
  history: SceneRunHistory[]
  interfaceLocale?: string
}) {
  const config = await requestConfig(input.interfaceLocale)
  const client = await getModelClient()
  const provider = selectedProvider(config)
  const candidateIds = new Set(input.candidates.map((candidate) => candidate.candidateId))
  return generateStructured(client, [
    { role: 'system', content: sceneEncounterCriticSystem(config) },
    { role: 'user', content: JSON.stringify({ background: input.background, candidates: input.candidates, recentRuntimeHistory: input.history.slice(-12) }) },
  ], {
    name: 'scene_locale_novelty_critic',
    schema: sceneEncounterCritiqueSchema,
    hint: '{"evaluations":[{"candidateId":"run-1","eligible":true,"issues":[]}],"rankedCandidateIds":["run-1"]}',
    temperature: 0.05,
    attempts: 2,
    maxOutputTokens: Math.min(provider.maxOutputTokens, 1_200),
    retryHint: 'Evaluate every supplied candidate exactly once. rankedCandidateIds may contain eligible candidate IDs only.',
    normalize(value) {
      const source = record(value)
      const evaluations = Array.isArray(source.evaluations) ? source.evaluations : []
      return {
        evaluations: evaluations.map((item) => {
          const evaluation = record(item)
          return {
            candidateId: text(evaluation.candidateId),
            eligible: evaluation.eligible === true,
            issues: strings(evaluation.issues, 6),
          }
        }).filter((item) => candidateIds.has(item.candidateId)),
        rankedCandidateIds: strings(source.rankedCandidateIds, input.candidates.length).filter((id) => candidateIds.has(id)),
      }
    },
    usable: (value) => value.evaluations.length === input.candidates.length &&
      value.rankedCandidateIds.every((id) => value.evaluations.some((evaluation) => evaluation.candidateId === id && evaluation.eligible)) &&
      joinedLanguageMatches(config.ui.locale, value.evaluations.flatMap((evaluation) => evaluation.issues)),
    // The issue notes are never shown; the verdicts are what the choice depends on.
    acceptable: (value) => value.evaluations.length === input.candidates.length &&
      value.rankedCandidateIds.every((id) => value.evaluations.some((evaluation) => evaluation.candidateId === id && evaluation.eligible)),
  })
}
