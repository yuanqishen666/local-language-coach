import { nanoid } from 'nanoid'
import { conversationPreset, type ConversationPresetDefinition } from '../../shared/conversation-presets.js'
import type { SceneOrigin } from '../../shared/conversation-scenes.js'
import { SCENE_BACKGROUND_POOL, backgroundFingerprint, critiqueSceneEncounters, dynamicFingerprint, filterNovelEncounters, generateSceneBackgrounds, generateSceneEncounters, openingFingerprint, softPickRanked, type SceneBackgroundSeed, type SceneEncounterCandidate, type SceneRunHistory } from '../ai/scene-generation.js'
import type { ConversationSetup } from '../types.js'
import { safeJson } from '../utils/json.js'
import { getConfig } from './config.js'
import { db, row, rows } from './database.js'

interface AnchorRow {
  id: string
  presetId: string
  rawValue: string
  normalizedValue: string
}

interface BackgroundRow {
  id: string
  anchorId: string
  backgroundJson: string
  saved: number
  useCount: number
  lastUsedAt: string | null
}

export interface PreparedSceneConversation {
  setup: ConversationSetup
  anchorId: string
  backgroundId: string
  presetId: string
  encounter: SceneEncounterCandidate
  runMode: 'new_encounter' | 'same_background'
  dynamicFingerprint: string
  openingFingerprint: string
}

function normalizeAnchor(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

function validateAnchor(preset: ConversationPresetDefinition, rawValue: unknown) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : ''
  if (preset.kind === 'instant') return ''
  if (!preset.anchor || !value) throw Object.assign(new Error('Add one detail before starting this scene.'), { statusCode: 400, code: 'SCENE_ANCHOR_REQUIRED' })
  if (value.length > preset.anchor.maxLength) throw Object.assign(new Error('That scene detail is too long.'), { statusCode: 400, code: 'SCENE_ANCHOR_TOO_LONG' })
  return value
}

function getOrCreateAnchor(preset: ConversationPresetDefinition, rawValue: string, targetLanguageCode: string, interfaceLocale: string) {
  const normalizedValue = preset.kind === 'instant' ? '__instant__' : normalizeAnchor(rawValue)
  const existing = row<AnchorRow>(`SELECT id, preset_id AS presetId, raw_value AS rawValue, normalized_value AS normalizedValue
    FROM scene_anchors WHERE preset_id = ? AND target_language_code = ? AND normalized_value = ?`, preset.id, targetLanguageCode, normalizedValue)
  if (existing) return existing
  const id = nanoid()
  const now = new Date().toISOString()
  db.prepare(`INSERT OR IGNORE INTO scene_anchors
    (id, preset_id, target_language_code, raw_value, normalized_value, interface_locale, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, preset.id, targetLanguageCode, rawValue, normalizedValue, interfaceLocale, now, now)
  return row<AnchorRow>(`SELECT id, preset_id AS presetId, raw_value AS rawValue, normalized_value AS normalizedValue
    FROM scene_anchors WHERE preset_id = ? AND target_language_code = ? AND normalized_value = ?`, preset.id, targetLanguageCode, normalizedValue)!
}

function backgroundRows(anchorId: string) {
  return rows<BackgroundRow>(`SELECT id, anchor_id AS anchorId, background_json AS backgroundJson, saved,
    use_count AS useCount, last_used_at AS lastUsedAt
    FROM scene_backgrounds WHERE anchor_id = ? ORDER BY saved DESC, use_count, COALESCE(last_used_at, ''), created_at`, anchorId)
}

function decodeBackground(value: BackgroundRow) {
  return safeJson<SceneBackgroundSeed | null>(value.backgroundJson, null)
}

async function ensureBackgrounds(input: {
  anchor: AnchorRow
  preset: ConversationPresetDefinition
  anchorValue: string
  targetLanguageCode: string
  interfaceLocale: string
}) {
  let existing = backgroundRows(input.anchor.id)
  if (existing.length >= SCENE_BACKGROUND_POOL) return existing
  let generated: SceneBackgroundSeed[]
  try {
    generated = await generateSceneBackgrounds({
      preset: input.preset,
      anchorValue: input.anchorValue,
      interfaceLocale: input.interfaceLocale,
      wanted: SCENE_BACKGROUND_POOL - existing.length,
      existing: existing.map((item) => {
        const background = decodeBackground(item)
        return { identityKey: background?.identityKey || '', summary: [background?.setting, background?.partnerRole, background?.relationship, background?.sharedContext].filter(Boolean).join(' · ') }
      }),
    })
  } catch (error) {
    // The pool grows a little with each start. Failing to add to it must not block a
    // conversation that an existing background can already carry.
    if (existing.length) return existing
    throw error
  }
  const now = new Date().toISOString()
  for (const background of generated) {
    db.prepare(`INSERT OR IGNORE INTO scene_backgrounds
      (id, anchor_id, preset_id, target_language_code, identity_key, stable_fingerprint, background_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      nanoid(), input.anchor.id, input.preset.id, input.targetLanguageCode, background.identityKey,
      backgroundFingerprint(background), JSON.stringify(background), now, now,
    )
  }
  existing = backgroundRows(input.anchor.id)
  if (!existing.length) throw Object.assign(new Error('No usable scene background was generated.'), { statusCode: 502, code: 'SCENE_GENERATION_FAILED' })
  return existing
}

function pickBackground(items: BackgroundRow[], requestedId?: string, excludedId?: string) {
  if (requestedId) {
    const requested = items.find((item) => item.id === requestedId)
    if (!requested) throw Object.assign(new Error('Scene background not found.'), { statusCode: 404 })
    return requested
  }
  const candidates = items.filter((item) => item.id !== excludedId)
  const ordered = [...(candidates.length ? candidates : items)].sort((left, right) => left.useCount - right.useCount || String(left.lastUsedAt || '').localeCompare(String(right.lastUsedAt || '')))
  const pool = ordered.slice(0, Math.min(2, ordered.length))
  return pool[Math.floor(Math.random() * pool.length)]
}

function recentRunHistory(anchorId: string): SceneRunHistory[] {
  return rows<{ encounterJson: string; openingLine: string }>(`SELECT encounter_json AS encounterJson, opening_line AS openingLine
    FROM scene_runs WHERE anchor_id = ? ORDER BY created_at DESC LIMIT 12`, anchorId).map((item) => {
    const encounter = safeJson<Partial<SceneEncounterCandidate>>(item.encounterJson, {})
    return {
      dynamicSummary: encounter.dynamicSummary || '',
      openingLine: item.openingLine,
      openingAct: encounter.openingAct || '',
      socialEnergy: encounter.socialEnergy || '',
    }
  }).reverse()
}

async function chooseEncounter(input: {
  preset: ConversationPresetDefinition
  anchorValue: string
  background: SceneBackgroundSeed
  history: SceneRunHistory[]
  interfaceLocale: string
  difficultyStep?: number
}) {
  const selectApproved = async (candidates: SceneEncounterCandidate[]) => {
    if (!candidates.length) return undefined
    try {
      const critique = await critiqueSceneEncounters({ background: input.background, candidates, history: input.history, interfaceLocale: input.interfaceLocale })
      const eligible = candidates.filter((candidate) => critique.evaluations.some((evaluation) => evaluation.candidateId === candidate.candidateId && evaluation.eligible))
      return softPickRanked(eligible, critique.rankedCandidateIds)
    } catch {
      // Deterministic language and novelty gates already passed. A critic outage
      // should not make the whole feature unavailable.
      return softPickRanked(candidates, candidates.map((candidate) => candidate.candidateId))
    }
  }

  const firstGenerated = await generateSceneEncounters(input)
  const firstCandidates = filterNovelEncounters(firstGenerated, input.history)
  const firstChoice = await selectApproved(firstCandidates)
  if (firstChoice) return firstChoice

  const retryAvoid = [
    ...input.history.map((item) => ({ dynamicSummary: item.dynamicSummary, openingLine: item.openingLine })),
    ...firstGenerated.map((item) => ({ dynamicSummary: item.dynamicSummary, openingLine: item.setup.openingLine })),
  ]
  let retryGenerated: SceneEncounterCandidate[] = []
  try {
    retryGenerated = await generateSceneEncounters({ ...input, retryAvoid })
  } catch {
    // The first answer still holds usable openings; a failed second ask must not lose them.
  }
  const retryCandidates = filterNovelEncounters(retryGenerated, input.history)
  const retryChoice = await selectApproved(retryCandidates)
  if (retryChoice) return retryChoice

  // Sensitive rehearsals keep the critic as a hard gate: an opening it rejected may overstep.
  if (input.background.safetyClass !== 'sensitive-expression-only') {
    // Freshness and polish are preferences. A plainer or more familiar opening is better
    // than no conversation, so take the best of what the model did produce.
    const fallback = retryCandidates[0] || firstCandidates[0] || retryGenerated[0] || firstGenerated[0]
    if (fallback) return fallback
  }
  throw Object.assign(new Error('No natural, sufficiently different scene passed the quality gate. Try once more.'), { statusCode: 502, code: 'SCENE_NOVELTY_FAILED' })
}

export async function prepareSceneConversation(input: {
  presetId: string
  anchorValue?: string
  interfaceLocale: string
  backgroundId?: string
  excludeBackgroundId?: string
  runMode?: 'new_encounter' | 'same_background'
  /** The difficulty the scene opens at: the learner's current difficulty in this language. */
  difficultyStep?: number
}): Promise<PreparedSceneConversation> {
  const preset = conversationPreset(input.presetId)
  if (!preset) throw Object.assign(new Error('Scene preset not found.'), { statusCode: 404 })
  const anchorValue = validateAnchor(preset, input.anchorValue)
  const config = await getConfig()
  const anchor = getOrCreateAnchor(preset, anchorValue, config.learning.targetLanguageCode, input.interfaceLocale)
  const available = await ensureBackgrounds({ anchor, preset, anchorValue, targetLanguageCode: config.learning.targetLanguageCode, interfaceLocale: input.interfaceLocale })
  const selectedRow = pickBackground(available, input.backgroundId, input.excludeBackgroundId)
  const background = decodeBackground(selectedRow)
  if (!background) throw Object.assign(new Error('Scene background is invalid.'), { statusCode: 500 })
  const encounter = await chooseEncounter({ preset, anchorValue, background, history: recentRunHistory(anchor.id), interfaceLocale: input.interfaceLocale, difficultyStep: input.difficultyStep })
  return {
    setup: encounter.setup,
    anchorId: anchor.id,
    backgroundId: selectedRow.id,
    presetId: preset.id,
    encounter,
    runMode: input.runMode || 'new_encounter',
    dynamicFingerprint: dynamicFingerprint(encounter),
    openingFingerprint: openingFingerprint(encounter.setup.openingLine),
  }
}

export function persistSceneRun(conversationId: string, prepared: PreparedSceneConversation) {
  const configTarget = row<{ targetLanguageCode: string }>('SELECT target_language_code AS targetLanguageCode FROM scene_anchors WHERE id = ?', prepared.anchorId)
  const now = new Date().toISOString()
  db.prepare(`INSERT INTO scene_runs
    (id, conversation_id, anchor_id, background_id, preset_id, target_language_code, run_mode, dynamic_fingerprint, opening_fingerprint, encounter_json, opening_line, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nanoid(), conversationId, prepared.anchorId, prepared.backgroundId, prepared.presetId, configTarget?.targetLanguageCode || '',
    prepared.runMode, prepared.dynamicFingerprint, prepared.openingFingerprint, JSON.stringify(prepared.encounter), prepared.setup.openingLine, now,
  )
  db.prepare('UPDATE scene_backgrounds SET use_count = use_count + 1, last_used_at = ?, updated_at = ? WHERE id = ?').run(now, now, prepared.backgroundId)
}

export function sceneOriginForConversation(conversationId: string): SceneOrigin | null {
  const found = row<Record<string, unknown>>(`SELECT sr.id AS runId, sr.preset_id AS presetId, sa.raw_value AS anchorValue,
    sr.background_id AS backgroundId, sr.run_mode AS mode, COALESCE(sb.saved, 0) AS saved
    FROM scene_runs sr JOIN scene_anchors sa ON sa.id = sr.anchor_id
    LEFT JOIN scene_backgrounds sb ON sb.id = sr.background_id WHERE sr.conversation_id = ?`, conversationId)
  if (!found) return null
  return {
    runId: String(found.runId), presetId: String(found.presetId), anchorValue: String(found.anchorValue || ''),
    backgroundId: String(found.backgroundId || ''), mode: found.mode === 'same_background' ? 'same_background' : 'new_encounter', saved: Boolean(found.saved),
  }
}

export function setConversationBackgroundSaved(conversationId: string, saved: boolean) {
  const result = db.prepare(`UPDATE scene_backgrounds SET saved = ?, updated_at = ? WHERE id =
    (SELECT background_id FROM scene_runs WHERE conversation_id = ?)`).run(saved ? 1 : 0, new Date().toISOString(), conversationId)
  if (!result.changes) throw Object.assign(new Error('This conversation has no reusable background.'), { statusCode: 404 })
}
